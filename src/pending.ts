/*
 * What was typed at registration, kept until the card exists.
 *
 * Registration asks for a name and for what the card should be called, and then the person
 * leaves the app entirely: the address has to be confirmed, and that happens in a browser,
 * in their mail, possibly minutes later on a phone that killed this process while they were
 * gone. Keeping those answers in component state would mean asking for them twice, and the
 * second asking is the one where somebody types a different name and wonders why.
 *
 * So they are written down, and read back by the screen that creates the card. Not secret —
 * a first name and a word that is about to be printed on plastic — but SecureStore is
 * already where this app keeps the one other thing it remembers between launches, and a
 * second storage library for three strings would be a worse trade than this one.
 *
 * Cleared the moment the card is created. A leftover here is a name from somebody else's
 * registration on a shared phone.
 */

import * as SecureStore from 'expo-secure-store';

const KEY = 'pending_card';

export type Pending = {name: string; slug: string};

export async function savePending(p: Pending): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(p));
  } catch {
    // Not worth failing a registration over. The next screen asks for the name again.
  }
}

export async function readPending(): Promise<Pending | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) {
      return null;
    }
    const v = JSON.parse(raw) as Partial<Pending>;
    return typeof v?.slug === 'string' ? {name: String(v.name ?? ''), slug: v.slug} : null;
  } catch {
    return null;
  }
}

export async function clearPending(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // Nothing here is worth an error on screen.
  }
}
