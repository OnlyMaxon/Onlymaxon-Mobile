/*
 * The NTAG 215 chip inside our cards, talked to directly.
 *
 * Everything here goes through raw commands rather than the library's NDEF helpers. The
 * helpers can read and write a URL, but they cannot answer the two questions that matter
 * when a card is at the bench — is this chip protected, and how many times has it been
 * tapped — nor set the password, because all of that lives in the configuration pages,
 * which no NDEF API exposes. One raw session does all of it.
 *
 * Commands and the memory map are from the NXP data sheet NTAG213/215/216 (NT2H13/15/16).
 * Page numbers are chip pages of 4 bytes, not byte offsets.
 */

import {Platform} from 'react-native';
import NfcManager, {NfcTech} from 'react-native-nfc-manager';

import {buildNdef, parseNdef, type Decoded} from './ndef';

const CMD = {
  GET_VERSION: 0x60,
  READ: 0x30,
  FAST_READ: 0x3a,
  WRITE: 0xa2,
  READ_CNT: 0x39,
  PWD_AUTH: 0x1b,
} as const;

export const PAGE = {
  CC: 3, // capability container
  USER_FIRST: 4,
  USER_LAST: 129, // 126 pages x 4 = the 504 user bytes of a 215
  CFG0: 131,
  CFG1: 132,
  PWD: 133,
  PACK: 134,
} as const;

/** Not a name but a marker: the screen turns it into a sentence in the right language. */
export const UNKNOWN_CHIP = 'unknown-chip';

/*
 * Storage-size byte 6 of GET_VERSION. This is the only honest way to tell the three NTAGs
 * apart: they answer the same commands and differ only in how much memory they have, so a
 * card sold to us as a 215 that answers 0x0F is a 213 — worth knowing before 500 arrive.
 */
const CHIPS: Record<number, {name: string; userBytes: number; lastUserPage: number}> = {
  0x0f: {name: 'NTAG 213', userBytes: 144, lastUserPage: 39},
  0x11: {name: 'NTAG 215', userBytes: 504, lastUserPage: 129},
  0x13: {name: 'NTAG 216', userBytes: 888, lastUserPage: 225},
};

export type Protection = {
  /** First page the password guards. 255 (0xFF) means nothing is guarded. */
  auth0: number;
  /** false = writes need the password, reads stay open. This is what our cards must be. */
  readsAlsoProtected: boolean;
  /** Irreversible once set. Should always be false on our stock. */
  configLocked: boolean;
  counterEnabled: boolean;
  counterNeedsPassword: boolean;
  /** Wrong-password attempts allowed before the chip stops answering. 0 = unlimited. */
  authLimit: number;
  mirror: 'off' | 'uid' | 'counter' | 'uid+counter';
};

export type CardRead = {
  uid: string;
  chip: string;
  /** null when GET_VERSION goes unanswered — not an NXP NTAG, or a clone. */
  userBytes: number | null;
  lastUserPage: number;
  url: string | null;
  /** The payload as text, when the record is not a URI. */
  text: string | null;
  /** Bytes the NDEF message occupies, so "how much room is left" is answerable. */
  usedBytes: number | null;
  /** The chip's own one-way tap counter, or null when it is switched off. */
  taps: number | null;
  protection: Protection | null;
};

export type BatchPassword = {
  /** Four bytes. */
  pwd: number[];
  /** Two bytes the chip echoes back on a correct password. */
  pack: number[];
};

const hex = (b: number[]) =>
  b.map(x => x.toString(16).toUpperCase().padStart(2, '0')).join('');

async function send(bytes: number[]): Promise<number[]> {
  return Platform.OS === 'ios'
    ? NfcManager.sendMifareCommandIOS(bytes)
    : NfcManager.nfcAHandler.transceive(bytes);
}

/*
 * A chip that will not answer a command answers with a NAK, which arrives here as a
 * rejected promise. Every optional read is wrapped: a card with its counter switched off
 * should show "counter: off", not an error screen.
 */
async function trySend(bytes: number[]): Promise<number[] | null> {
  try {
    return await send(bytes);
  } catch {
    return null;
  }
}

/*
 * CFG0 is [MIRROR, RFUI, MIRROR_PAGE, AUTH0] and CFG1 is [ACCESS, RFUI, RFUI, RFUI].
 * Every flag this product cares about is a bit of that one ACCESS byte.
 */
function parseConfig(cfg0: number[], cfg1: number[]): Protection {
  const access = cfg1[0];
  const mirrorConf = (cfg0[0] >> 6) & 0x03;
  return {
    auth0: cfg0[3],
    readsAlsoProtected: (access & 0x80) !== 0, // PROT
    configLocked: (access & 0x40) !== 0, // CFGLCK
    counterEnabled: (access & 0x10) !== 0, // NFC_CNT_EN
    counterNeedsPassword: (access & 0x08) !== 0,
    authLimit: access & 0x07,
    mirror: (['off', 'uid', 'counter', 'uid+counter'] as const)[mirrorConf],
  };
}

/* Everything readable about the card, inside a session somebody else opened. */
async function inspect(): Promise<CardRead> {
  // Pages 0-3 in one read: the UID spans pages 0 and 1, byte 3 of page 0 being a checksum
  // rather than UID, then the capability container on page 3.
  const head = await send([CMD.READ, 0x00]);
  const uid = hex([head[0], head[1], head[2], head[4], head[5], head[6], head[7]]);

  const version = await trySend([CMD.GET_VERSION]);
  const chip = version && version.length >= 7 ? CHIPS[version[6]] : undefined;
  const lastUserPage = chip?.lastUserPage ?? PAGE.USER_LAST;

  // Only as far as an NDEF URL can reach. Reading all 504 bytes would be four more round
  // trips for data that is empty on every card we write.
  const user = await trySend([
    CMD.FAST_READ,
    PAGE.USER_FIRST,
    Math.min(PAGE.USER_FIRST + 41, lastUserPage),
  ]);
  const ndef: Decoded = user ? parseNdef(user) : {url: null, text: null, usedBytes: null};

  // One READ returns 16 bytes, so this is CFG0 and CFG1 together.
  const cfg = await trySend([CMD.READ, PAGE.CFG0]);
  const protection =
    cfg && cfg.length >= 8 ? parseConfig(cfg.slice(0, 4), cfg.slice(4, 8)) : null;

  // Three bytes, least significant first. Answered only when NFC_CNT_EN is set.
  const cnt = protection?.counterEnabled ? await trySend([CMD.READ_CNT, 0x00]) : null;
  const taps = cnt && cnt.length >= 3 ? cnt[0] | (cnt[1] << 8) | (cnt[2] << 16) : null;

  return {
    uid,
    chip: chip?.name ?? UNKNOWN_CHIP,
    userBytes: chip?.userBytes ?? null,
    lastUserPage,
    url: ndef.url,
    text: ndef.text,
    usedBytes: ndef.usedBytes,
    taps,
    protection,
  };
}

/*
 * The session is opened and closed inside each exported call rather than held open across
 * screens: on iOS the system sheet lives exactly as long as the session does, and a sheet
 * still up after the card has been taken away is the single thing that makes an NFC app
 * feel broken.
 */
async function withCard<T>(alert: string, fn: () => Promise<T>): Promise<T> {
  await NfcManager.requestTechnology(
    Platform.OS === 'ios' ? NfcTech.MifareIOS : NfcTech.NfcA,
    {alertMessage: alert},
  );
  try {
    return await fn();
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

/* `prompt` is what iOS puts on its system sheet while the session is open. Android has no
 * such sheet, so there it is unused — the screen draws its own. */
export async function readCard(prompt: string): Promise<CardRead> {
  return withCard(prompt, inspect);
}

/*
 * A refusal the person can act on, carried as a code rather than a sentence. This module
 * talks to a radio and has no idea which language the phone is in; the screen that shows
 * the message does.
 */
export type CardErrorCode =
  | 'config-locked'
  | 'wrong-password'
  | 'too-big'
  | 'past-end';

export class CardError extends Error {
  readonly code: CardErrorCode;
  constructor(code: CardErrorCode) {
    super(code);
    this.code = code;
  }
}

/*
 * Write a card and protect it, in one tap.
 *
 * Order is not a style choice here. AUTH0 protects every page from itself upwards, and the
 * configuration pages sit above any value we would set — so the moment AUTH0 lands, nothing
 * else can be written without the password. It therefore goes last, after the URL, after
 * PWD and PACK, after the ACCESS byte. Get that order wrong and the card locks itself out
 * halfway through, holding a URL but no password anybody knows.
 */
export async function writeCard(opts: {
  url: string;
  password: BatchPassword;
  enableCounter: boolean;
  prompt: string;
}): Promise<CardRead> {
  const {url, password, enableCounter} = opts;

  return withCard(opts.prompt, async () => {
    const before = await inspect();

    if (before.protection?.configLocked) {
      throw new CardError('config-locked');
    }

    // A card that is already protected has to be unlocked first, and the only password we
    // can offer is our own. One that refuses it is somebody else's card, not ours.
    const alreadyProtected =
      !!before.protection && before.protection.auth0 <= before.lastUserPage;
    if (alreadyProtected) {
      try {
        await send([CMD.PWD_AUTH, ...password.pwd]);
      } catch {
        throw new CardError('wrong-password');
      }
    }

    const data = buildNdef(url);
    if (before.userBytes !== null && data.length > before.userBytes) {
      throw new CardError('too-big');
    }

    // User memory, one page at a time — the chip has no bulk write.
    for (let i = 0; i < data.length; i += 4) {
      const page = PAGE.USER_FIRST + i / 4;
      if (page > before.lastUserPage) {
        throw new CardError('past-end');
      }
      await send([CMD.WRITE, page, data[i], data[i + 1], data[i + 2], data[i + 3]]);
    }

    // Re-read rather than trusting `before`: this is the last chance to see the real bytes
    // before the password goes on.
    const cfg = await send([CMD.READ, PAGE.CFG0]);
    const cfg0 = cfg.slice(0, 4);
    const cfg1 = cfg.slice(4, 8);

    await send([CMD.WRITE, PAGE.PWD, ...password.pwd]);
    await send([CMD.WRITE, PAGE.PACK, password.pack[0], password.pack[1], 0x00, 0x00]);

    let access = cfg1[0];
    access &= ~0x80; // PROT = 0: writes need the password, reads stay open to every phone
    access &= ~0x40; // CFGLCK stays off: it is irreversible and AUTH0 already covers this
    access = enableCounter ? access | 0x10 : access & ~0x10; // NFC_CNT_EN
    access &= ~0x08; // the counter stays readable without the password
    access &= ~0x07; // AUTHLIM = 0, see below
    await send([CMD.WRITE, PAGE.CFG1, access & 0xff, cfg1[1], cfg1[2], cfg1[3]]);

    // AUTH0 last. 0x04 means "from the first user page upwards", which also covers pages
    // 131-134 — so the password protects PWD, PACK, AUTH0 and PROT themselves.
    await send([CMD.WRITE, PAGE.CFG0, cfg0[0], cfg0[1], cfg0[2], 0x04]);

    return inspect();
  });
}

/*
 * Back to factory, in one tap.
 *
 * The order mirrors writing, for the same reason. Protection comes off last: every write
 * before it still needs the password, and this session already has it. Taking AUTH0 away
 * first would work too — but then a wipe interrupted halfway leaves an unprotected card
 * still carrying somebody's URL, which is the worst of both states. This way an interrupted
 * wipe leaves a protected card, and a second tap finishes the job.
 */
export async function eraseCard(password: BatchPassword, prompt: string): Promise<CardRead> {
  return withCard(prompt, async () => {
    const before = await inspect();

    if (before.protection?.configLocked) {
      throw new CardError('config-locked');
    }

    const protectedNow = !!before.protection && before.protection.auth0 <= before.lastUserPage;
    if (protectedNow) {
      try {
        await send([CMD.PWD_AUTH, ...password.pwd]);
      } catch {
        throw new CardError('wrong-password');
      }
    }

    // Every user page back to zero, not only the part the URL occupied: "clean" has to mean
    // the same thing every time, whatever was on the chip before and whoever put it there.
    for (let page = PAGE.USER_FIRST; page <= before.lastUserPage; page++) {
      await send([CMD.WRITE, page, 0x00, 0x00, 0x00, 0x00]);
    }
    // An empty NDEF message, which is what a factory chip carries: a zero-length TLV and the
    // terminator. A phone reads that as "nothing here" rather than as a damaged tag.
    await send([CMD.WRITE, PAGE.USER_FIRST, 0x03, 0x00, 0xfe, 0x00]);

    const cfg = await send([CMD.READ, PAGE.CFG0]);
    const cfg0 = cfg.slice(0, 4);
    const cfg1 = cfg.slice(4, 8);

    // ACCESS cleared whole: no PROT, no CFGLCK, counter off, no attempt limit.
    await send([CMD.WRITE, PAGE.CFG1, 0x00, cfg1[1], cfg1[2], cfg1[3]]);
    await send([CMD.WRITE, PAGE.PWD, 0xff, 0xff, 0xff, 0xff]);
    await send([CMD.WRITE, PAGE.PACK, 0x00, 0x00, 0x00, 0x00]);

    // AUTH0 = 0xFF means "nothing is protected" — the factory value, and the last write
    // that still requires the password. Mirroring goes off with it.
    await send([CMD.WRITE, PAGE.CFG0, 0x00, cfg0[1], 0x00, 0xff]);

    return inspect();
  });
}

/*
 * AUTHLIM is left at 0, meaning unlimited password attempts, and that is deliberate. The
 * alternative bricks cards: a chip that has used up its attempts can never be written
 * again, by anyone, including us. Against that, a 32-bit password guessed over NFC at a
 * few milliseconds per try is centuries of somebody standing next to the card — and the
 * worst case if they succeed is a rewritten URL, not a leak. The irreversible risk is the
 * bigger one.
 */
