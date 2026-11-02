/*
 * NDEF, the format the chip stores a URL in — encoding and decoding, and nothing else.
 *
 * Separate from ntag.ts because nothing in here touches a radio: it is bytes in, bytes out,
 * which is what makes src/ndef.test.ts able to run under plain node. Writing a chip is the
 * one operation in this app that cannot be undone, so the part of it that can be tested on
 * a laptop is kept where a laptop can reach it.
 */

export type Decoded = {url: string | null; text: string | null; usedBytes: number | null};

/*
 * The NFC Forum URI prefix table. The chip stores "https://" as a single byte, which is
 * most of the reason a full URL fits in about 40 of the 504 bytes.
 */
const URI_PREFIX = [
  '',
  'http://www.',
  'https://www.',
  'http://',
  'https://',
  'tel:',
  'mailto:',
  'ftp://anonymous:anonymous@',
  'ftp://ftp.',
  'ftps://',
  'sftp://',
  'smb://',
  'nfs://',
  'ftp://',
  'dav://',
  'news:',
  'telnet://',
  'imap:',
  'rtsp://',
  'urn:',
  'pop:',
  'sip:',
  'sips:',
  'tftp:',
  'btspp://',
  'btl2cap://',
  'btgoep://',
  'tcpobex://',
  'irdaobex://',
  'file://',
  'urn:epc:id:',
  'urn:epc:tag:',
  'urn:epc:pat:',
  'urn:epc:raw:',
  'urn:epc:',
  'urn:nfc:',
];

/*
 * UTF-8 by hand, in both directions, rather than through TextEncoder: a slug is ASCII, but
 * the decoder also runs over whatever a stranger's card happens to hold, and hand-rolling
 * it keeps both directions free of a global that Hermes is not obliged to provide.
 */
function utf8Bytes(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0) as number;
    if (c < 0x80) {
      out.push(c);
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c < 0x10000) {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    } else {
      out.push(
        0xf0 | (c >> 18),
        0x80 | ((c >> 12) & 0x3f),
        0x80 | ((c >> 6) & 0x3f),
        0x80 | (c & 0x3f),
      );
    }
  }
  return out;
}

function utf8(bytes: number[]): string {
  try {
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
  } catch {
    return bytes.map(c => String.fromCharCode(c)).join('');
  }
}

/*
 * Walk the TLV blocks in user memory and decode the first NDEF record.
 *
 * Written out by hand rather than handed to the library's helper because this is the one
 * place where a half-written card has to stay readable: a chip whose length byte claims
 * more than was actually written should report what is there, not throw. slice() past the
 * end of an array gives a short array rather than an error, which is what makes that work.
 */
export function parseNdef(bytes: number[]): Decoded {
  const nothing: Decoded = {url: null, text: null, usedBytes: null};
  let i = 0;

  while (i < bytes.length) {
    const tag = bytes[i];
    if (tag === 0x00) {
      i++; // NULL TLV: padding
      continue;
    }
    if (tag === 0xfe) {
      return nothing; // terminator reached with no message before it
    }
    if (i + 1 >= bytes.length) {
      return nothing;
    }

    let len = bytes[i + 1];
    let head = 2;
    if (len === 0xff) {
      // Three-byte length form, for messages over 254 bytes.
      if (i + 3 >= bytes.length) {
        return nothing;
      }
      len = (bytes[i + 2] << 8) | bytes[i + 3];
      head = 4;
    }

    if (tag === 0x03) {
      const rec = parseRecord(bytes.slice(i + head, i + head + len));
      return {...rec, usedBytes: head + len};
    }
    i += head + len; // a lock-control or memory-control TLV: step over it
  }
  return nothing;
}

function parseRecord(msg: number[]): {url: string | null; text: string | null} {
  const nothing = {url: null, text: null};
  if (msg.length < 3) {
    return nothing;
  }

  const header = msg[0];
  const shortRecord = (header & 0x10) !== 0;
  const hasId = (header & 0x08) !== 0;
  const tnf = header & 0x07;

  let p = 1;
  const typeLen = msg[p++];

  let payloadLen: number;
  if (shortRecord) {
    payloadLen = msg[p++];
  } else {
    payloadLen =
      ((msg[p] << 24) | (msg[p + 1] << 16) | (msg[p + 2] << 8) | msg[p + 3]) >>> 0;
    p += 4;
  }
  if (hasId) {
    p++;
  }

  const type = msg.slice(p, p + typeLen);
  p += typeLen;
  const payload = msg.slice(p, p + payloadLen);
  if (!payload.length) {
    return nothing;
  }

  // TNF 1 (well known) with type "U" is a URI: the first payload byte is the prefix code.
  if (tnf === 0x01 && typeLen === 1 && type[0] === 0x55) {
    const prefix = URI_PREFIX[payload[0]] ?? '';
    return {url: prefix + utf8(payload.slice(1)), text: null};
  }
  // TNF 1 with type "T" is Text: a status byte, an IANA language code, then the text.
  if (tnf === 0x01 && typeLen === 1 && type[0] === 0x54) {
    const langLen = payload[0] & 0x3f;
    return {url: null, text: utf8(payload.slice(1 + langLen))};
  }
  // Anything else: show it as text rather than claiming the card is empty.
  return {url: null, text: utf8(payload)};
}

/*
 * The inverse: one URI record, wrapped in an NDEF TLV, padded to whole pages because the
 * chip is only writable four bytes at a time.
 */
export function buildNdef(url: string): number[] {
  let code = 0;
  let rest = url;
  // The longest matching prefix wins, so "https://www." beats "https://".
  URI_PREFIX.forEach((p, i) => {
    if (i > 0 && url.startsWith(p) && p.length > URI_PREFIX[code].length) {
      code = i;
      rest = url.slice(p.length);
    }
  });

  const payload = [code, ...utf8Bytes(rest)];

  // The short form carries its payload length in one byte, so it stops at 255. Past that
  // the record has to drop the SR flag and spend four bytes on the length — 0xD1 becomes
  // 0xC1. Our own slugs never come close, but a card is a thing people type into, and a
  // length byte silently holding 317 writes a chip that nothing can read.
  const short = payload.length < 0x100;
  const record = [
    short ? 0xd1 : 0xc1, // first and last record of the message, well-known type
    0x01,
    ...(short
      ? [payload.length]
      : [
          (payload.length >>> 24) & 0xff,
          (payload.length >>> 16) & 0xff,
          (payload.length >>> 8) & 0xff,
          payload.length & 0xff,
        ]),
    0x55,
    ...payload,
  ];
  const tlv =
    record.length < 0xff
      ? [0x03, record.length, ...record, 0xfe]
      : [0x03, 0xff, record.length >> 8, record.length & 0xff, ...record, 0xfe];

  while (tlv.length % 4 !== 0) {
    tlv.push(0x00);
  }
  return tlv;
}

