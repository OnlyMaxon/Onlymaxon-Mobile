/*
 * Telling the server what just happened to a chip.
 *
 * Every write, rewrite and wipe a client makes is reported — successes and failures alike.
 * It goes through a function rather than straight into Firestore because the log is ours
 * rather than theirs: `activity` has no write branch in firestore.rules at all, so a phone
 * cannot write a history that never happened. See functions/activity.js.
 *
 * Nothing here is allowed to break a tap that worked. A report that fails is a report that
 * is lost, and that is the right trade: the person is standing there holding a card, and
 * "your card is ready, but we could not tell the server" is not a sentence worth showing
 * anybody. Failures are logged to the console and swallowed.
 */

import {getApp} from '@react-native-firebase/app';

import {auth} from './account';
import {ENV} from './cards';

export type ActivityKind = 'activate' | 'rewrite' | 'erase';

const endpoint = () =>
  `https://europe-west1-${getApp().options.projectId}.cloudfunctions.net/activity`;

export async function report(entry: {
  kind: ActivityKind;
  outcome: 'ok' | 'failed';
  cardId: string;
  chipUid?: string;
  url?: string;
  error?: string;
}): Promise<void> {
  try {
    const user = auth.currentUser;
    if (!user) {
      return;
    }
    const res = await fetch(endpoint(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${await user.getIdToken()}`,
      },
      body: JSON.stringify({...entry, ...ENV}),
    });
    if (!res.ok) {
      console.warn('activity', res.status);
    }
  } catch (e) {
    console.warn('activity', e);
  }
}
