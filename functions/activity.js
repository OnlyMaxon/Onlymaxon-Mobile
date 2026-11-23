/*
 * What each account did with its card, kept where the client cannot write it.
 *
 * Every tap that writes, rewrites or wipes a chip is reported here: who, when, which card,
 * which chip, from which app on which phone, and whether it worked. Failures are recorded
 * too, and they are the entries that matter — the useful question after the fact is "what
 * happened to this chip", and an attempt that refused is part of that answer.
 *
 * It is a function rather than a write from the phone for one reason. The log is ours, not
 * theirs: a client who could append to their own history could also write a history that
 * never happened, and then it would be worth nothing the one time we need it. The Admin SDK
 * here is not governed by firestore.rules, which is why there is no write branch for
 * `activity` in that file at all.
 *
 * The caller cannot choose whose history it lands in. The uid comes out of the verified
 * token, never out of the body, and the card named in the body has to be one this account
 * actually owns.
 */

import {FieldValue, getFirestore} from 'firebase-admin/firestore';
import {onRequest} from 'firebase-functions/v2/https';

import {caller} from './caller.js';

const fail = (res, status, why) =>
  res.status(status).set('cache-control', 'no-store').json({error: why});

/* What a phone is allowed to say happened. Anything else is a bug or a forgery, and in
 * either case this is not the place to find out which. */
const KINDS = ['activate', 'rewrite', 'erase'];
const OUTCOMES = ['ok', 'failed'];

/* Enough for any honest value and short enough that nobody writes a novel into the log. */
const str = (v, max) => String(v ?? '').slice(0, max);

export const activity = onRequest(
  {region: 'europe-west1', maxInstances: 10},
  async (req, res) => {
    try {
      if (req.method !== 'POST') return fail(res, 405, 'method');

      const who = await caller(req);
      if (!who) return fail(res, 401, 'auth');

      const {kind, outcome, cardId} = req.body || {};
      if (!KINDS.includes(kind)) return fail(res, 400, 'kind');
      if (!OUTCOMES.includes(outcome)) return fail(res, 400, 'outcome');
      if (typeof cardId !== 'string' || !cardId) return fail(res, 400, 'card');

      const db = getFirestore();
      const card = await db.collection('cards').doc(cardId).get();
      if (!card.exists || card.data().ownerUid !== who.uid) return fail(res, 403, 'owner');

      const body = req.body;
      const chipUid = str(body.chipUid, 32);

      const entry = {
        kind,
        outcome,
        cardId,
        slug: card.data().slug ?? '',
        chipUid,
        url: str(body.url, 200),
        // The app's own account of itself: version, platform, OS. Taken as given, because
        // nothing else can know it — and worth having, because the first question about a
        // chip that misbehaved is which build wrote it.
        app: str(body.app, 40),
        platform: str(body.platform, 16),
        osVersion: str(body.osVersion, 24),
        error: str(body.error, 200),
        byUid: who.uid,
        byEmail: who.email ?? '',
        at: FieldValue.serverTimestamp(),
      };

      await db.collection('activity').doc(who.uid).collection('events').add(entry);

      /*
       * And the chip's own record, so the bench can answer "which card is this?" for a chip
       * a client wrote. Merged, and only these fields: the documents under `chips` also
       * carry batch passwords for chips we protected ourselves, and a write from here must
       * not be able to touch one.
       *
       * Only on success, and only when the chip actually gave its UID — a failed write may
       * never have reached a chip at all, and a record claiming otherwise is worse than no
       * record.
       */
      if (outcome === 'ok' && chipUid) {
        await db
          .collection('chips')
          .doc(chipUid)
          .set(
            {
              cardId: kind === 'erase' ? '' : cardId,
              slug: kind === 'erase' ? '' : (card.data().slug ?? ''),
              protectedByUs: false,
              lastBy: who.email ?? who.uid,
              lastApp: entry.app,
              writtenAt: FieldValue.serverTimestamp(),
            },
            {merge: true},
          );
      }

      return res.set('cache-control', 'no-store').json({ok: true});
    } catch (e) {
      console.error('activity', e && (e.stack || e.message));
      return fail(res, 500, 'server');
    }
  },
);
