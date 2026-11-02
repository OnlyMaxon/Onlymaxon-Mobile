/*
 * Run with:  npm test
 *
 * Writing a chip is the one thing this app does that cannot be undone — a URL encoded
 * wrongly is a card that no phone opens and that, once protected, cannot be rewritten
 * without the batch password. So the encoder is exercised on a laptop before it is ever
 * pointed at plastic.
 *
 * The first case is the strongest one: Max's existing card reports "20 of 504 bytes" for
 * https://onlymaxon.com, written by some other tool entirely. Our encoder has to agree with
 * it byte for byte, or we are speaking a dialect of NDEF rather than NDEF.
 */

import {strict as assert} from 'node:assert';
import {test} from 'node:test';

import {buildNdef, parseNdef} from './ndef.ts';

test('agrees with the card that already exists', () => {
  const bytes = buildNdef('https://onlymaxon.com');
  const back = parseNdef(bytes);
  assert.equal(back.usedBytes, 20);
  assert.equal(back.url, 'https://onlymaxon.com');
});

test('round-trips the URLs this app writes', () => {
  for (const url of [
    'https://onlymaxon.com/u/max',
    'https://onlymaxon.com/u/anna-kowalska',
    `https://onlymaxon.com/u/${'a'.repeat(39)}`,
    'http://example.org/x',
    'https://www.example.com/y',
  ]) {
    const bytes = buildNdef(url);
    assert.equal(parseNdef(bytes).url, url, url);
    assert.equal(bytes.length % 4, 0, `${url} is not page-aligned`);
    assert.ok(bytes.length <= 504, `${url} does not fit a 215`);
  }
});

test('picks the longest prefix', () => {
  // Byte 6 is the prefix code: TLV tag, TLV length, record header, type length,
  // payload length, type "U", then the code itself.
  assert.equal(buildNdef('https://www.a.com')[6], 0x02);
  assert.equal(buildNdef('https://a.com')[6], 0x04);
  assert.equal(buildNdef('http://a.com')[6], 0x03);
});

test('short record layout', () => {
  const b = buildNdef('https://onlymaxon.com/u/max');
  assert.equal(b[0], 0x03, 'NDEF message TLV');
  assert.equal(b[2], 0xd1, 'MB|ME|SR, well-known type');
  assert.equal(b[5], 0x55, 'type U');
});

test('switches to the long form past 255 payload bytes', () => {
  const url = `https://onlymaxon.com/u/${'b'.repeat(300)}`;
  const b = buildNdef(url);
  assert.equal(b[1], 0xff, 'TLV takes its 3-byte length form');
  assert.equal(b[4], 0xc1, 'record drops SR');
  assert.equal(b[10], 0x55, 'type U sits after the 4-byte length');
  assert.equal(parseNdef(b).url, url);
});

test('UTF-8 survives both directions', () => {
  const url = 'https://example.com/ł-ą-ż-ğ-ş-я';
  assert.equal(parseNdef(buildNdef(url)).url, url);
});

test('a blank or broken chip reads as empty rather than throwing', () => {
  assert.equal(parseNdef(new Array(32).fill(0)).url, null, 'factory-blank pages');
  assert.equal(parseNdef([0x03, 0x00, 0xfe, 0x00]).url, null, 'empty TLV');
  assert.equal(parseNdef([0xfe, 0, 0, 0]).url, null, 'terminator first');
  assert.doesNotThrow(() => parseNdef(buildNdef('https://onlymaxon.com/u/max').slice(0, 7)));
});

test('steps over a lock-control TLV', () => {
  const bytes = [0x01, 0x03, 0xaa, 0xbb, 0xcc, ...buildNdef('https://onlymaxon.com/u/max')];
  assert.equal(parseNdef(bytes).url, 'https://onlymaxon.com/u/max');
});
