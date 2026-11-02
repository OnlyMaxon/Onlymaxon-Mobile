/*
 * The batch password.
 *
 * One password for a whole batch of cards, not one per card. A password per card is a
 * spreadsheet nobody maintains, and the day it is lost the cards are unwritable; one for
 * every card ever made is one leak away from all of them. A batch is the size where both
 * failures stay small.
 *
 * It lives in the device keychain and in whatever password manager you put it in — never
 * in the repository, never on a server. Nothing here can recover it: a chip never gives
 * its password back, it only says yes or no to one you offer.
 */

import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import type {BatchPassword} from './ntag';

const KEY = 'ntag_batch_password';

const toHex = (b: number[]) =>
  b.map(x => x.toString(16).toUpperCase().padStart(2, '0')).join('');

/** The six bytes as twelve hex characters: four for PWD, two for PACK. */
export const passwordHex = (p: BatchPassword) => toHex([...p.pwd, ...p.pack]);

function fromBytes(bytes: number[]): BatchPassword {
  return {pwd: bytes.slice(0, 4), pack: bytes.slice(4, 6)};
}

export async function loadPassword(): Promise<BatchPassword | null> {
  const stored = await SecureStore.getItemAsync(KEY);
  if (!stored) {
    return null;
  }
  const bytes = stored.match(/../g)?.map(h => parseInt(h, 16)) ?? [];
  return bytes.length === 6 ? fromBytes(bytes) : null;
}

async function store(p: BatchPassword): Promise<BatchPassword> {
  await SecureStore.setItemAsync(KEY, passwordHex(p), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return p;
}

export async function createPassword(): Promise<BatchPassword> {
  let bytes = [...(await Crypto.getRandomBytesAsync(6))];
  // FF FF FF FF is what the chip ships with, so a card carrying it is indistinguishable
  // from an unconfigured one. Astronomically unlikely, free to rule out.
  while (bytes.slice(0, 4).every(b => b === 0xff)) {
    bytes = [...(await Crypto.getRandomBytesAsync(6))];
  }
  return store(fromBytes(bytes));
}

/** For moving a batch to a second phone, or restoring after a reinstall. */
export async function importPassword(input: string): Promise<BatchPassword> {
  const clean = input.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  if (clean.length !== 12) {
    throw new Error('bad-batch-password');
  }
  const bytes = (clean.match(/../g) as string[]).map(h => parseInt(h, 16));
  return store(fromBytes(bytes));
}
