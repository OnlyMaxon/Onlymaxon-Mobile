/*
 * cards.onlymaxon.com — what a stranger sees when they tap a card.
 *
 * One request, one Firestore read, finished HTML. No client-side fetch: the product is the
 * second and a half after somebody touches a card to a phone, usually outdoors, on mobile
 * data, holding somebody else's handset. A page that loads and *then* asks a database what
 * to draw spends that second and a half showing nothing.
 *
 * Paths:
 *   /<slug>         the card
 *   /<slug>/photo   the avatar, streamed from Storage so the bucket can stay private
 */

import {onRequest} from 'firebase-functions/v2/https';
import {initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {getStorage} from 'firebase-admin/storage';

import {cardPage, holdingPage} from './render.js';

initializeApp();
const db = getFirestore();

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}$/;

const notFound = res =>
  res
    .status(404)
    .set('cache-control', 'no-store')
    .type('text/plain; charset=utf-8')
    .send('Not found');

/*
 * no-store, deliberately. An owner edits their page and taps their own card to check — a
 * CDN holding yesterday's copy for even a minute is the one bug that destroys trust in the
 * whole product. The page is small and the read is a single document.
 */
const page = (res, html, status = 200) =>
  res
    .status(status)
    .set('cache-control', 'no-store')
    .type('text/html; charset=utf-8')
    .send(html);

async function cardBySlug(slug) {
  const snap = await db.collection('cards').where('slug', '==', slug).limit(1).get();
  return snap.empty ? null : {id: snap.docs[0].id, ...snap.docs[0].data()};
}

export const card = onRequest({region: 'europe-west1', maxInstances: 10}, async (req, res) => {
  try {
    return await handle(req, res);
  } catch (e) {
    // Never a stack trace to somebody standing in the street holding a stranger's card.
    // The detail goes to the log, where it is useful, and they get a sentence.
    console.error('card', e && (e.stack || e.message));
    return res
      .status(500)
      .set('cache-control', 'no-store')
      .type('text/plain; charset=utf-8')
      .send('Something went wrong.');
  }
});

async function handle(req, res) {
  // Hosting rewrites send the original path through unchanged.
  const parts = req.path.split('/').filter(Boolean);
  const slug = (parts[0] || '').toLowerCase();
  const tail = parts[1] || '';

  if (!SLUG_RE.test(slug) || parts.length > 2) {
    return notFound(res);
  }

  const card = await cardBySlug(slug);
  if (!card) {
    return notFound(res);
  }

  if (tail === 'photo') {
    if (!card.photoPath) {
      return notFound(res);
    }
    const file = getStorage().bucket().file(card.photoPath);
    const [exists] = await file.exists();
    if (!exists) {
      return notFound(res);
    }
    const [meta] = await file.getMetadata();
    res.set('content-type', meta.contentType || 'image/jpeg');
    // The key is content-addressed, so a new photo is a new URL and this can be immutable.
    res.set('cache-control', 'public, max-age=31536000, immutable');
    return file.createReadStream().pipe(res);
  }

  if (tail) {
    return notFound(res);
  }

  /*
   * Two booleans about the card's own state, on the holding page only. No names, no
   * addresses, nothing about the person — just whether it has been claimed and whether it
   * is visible. Without this, "the card shows a holding page" has three possible causes
   * and no way to tell them apart from outside.
   */
  if (card.published !== true) {
    res.set('x-card-claimed', card.ownerUid ? 'yes' : 'no');
    res.set('x-card-published', 'no');
    return page(res, holdingPage(slug, card.lang));
  }

  return page(res, cardPage(card, card.services || [], card.links || []));
}
