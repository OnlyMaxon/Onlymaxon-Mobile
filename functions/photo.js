/*
 * Setting and removing the picture on a card.
 *
 * The phone never writes to Storage and never writes `photoPath`. It sends the bytes here,
 * with its own sign-in token, and this decides where they go — which is the only way the
 * path can be trusted. A client that could choose its own `photoPath` could point a card at
 * any object in the bucket, including somebody else's face, and the rules in
 * `firestore.rules` therefore refuse a write that changes that field at all.
 *
 * The name of the object is the hash of its contents. That is what lets `/<slug>/photo` be
 * served `immutable` for a year: a different picture is a different URL, so no cache
 * anywhere in the world has to be told that anything changed.
 *
 * Everything under the card's prefix that is not the picture just written is deleted, so
 * replacing a photo does not quietly accumulate the old ones, and removing one leaves the
 * bucket with nothing of that person in it.
 */

import {createHash} from 'node:crypto';
import {getAuth} from 'firebase-admin/auth';
import {FieldValue, getFirestore} from 'firebase-admin/firestore';
import {getStorage} from 'firebase-admin/storage';
import {onRequest} from 'firebase-functions/v2/https';

/* The phone sends a 512px JPEG, which is some 40-60 KB. This is the ceiling for a picture
 * that arrived some other way — large enough never to reject honest input, small enough
 * that nobody fills the bucket through this door. */
const MAX_BYTES = 400 * 1024;

const fail = (res, status, why) =>
  res.status(status).set('cache-control', 'no-store').json({error: why});

/** The caller, or null. A token that is merely *valid* is not enough: an unconfirmed
 *  address is exactly the case the whole product is built to refuse. */
async function caller(req) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  try {
    const decoded = await getAuth().verifyIdToken(token);
    return decoded.email_verified === true ? decoded : null;
  } catch {
    return null;
  }
}

/*
 * Trusting the declared type of an upload is how a bucket ends up serving something other
 * than an image from an image URL. The start-of-image marker is checked and the end is not:
 * encoders differ about trailing bytes, and a rule that occasionally rejects a real
 * photograph would be a bug nobody could reproduce. What the marker buys is enough, because
 * the content type is set here rather than taken from the request.
 */
const looksLikeJpeg = buf =>
  buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;

async function clearPrefix(bucket, prefix, keep) {
  const [files] = await bucket.getFiles({prefix});
  await Promise.all(files.filter(f => f.name !== keep).map(f => f.delete().catch(() => {})));
}

export const photo = onRequest({region: 'europe-west1', maxInstances: 10}, async (req, res) => {
  try {
    if (req.method !== 'POST') return fail(res, 405, 'method');

    const who = await caller(req);
    if (!who) return fail(res, 401, 'auth');

    const {cardId, image} = req.body || {};
    if (typeof cardId !== 'string' || !cardId) return fail(res, 400, 'card');

    const db = getFirestore();
    const ref = db.collection('cards').doc(cardId);
    const snap = await ref.get();
    if (!snap.exists || snap.data().ownerUid !== who.uid) return fail(res, 403, 'owner');

    const bucket = getStorage().bucket();
    const prefix = `cards/${cardId}/`;

    // No image means: take the picture off this card, and leave nothing behind.
    if (image == null) {
      await clearPrefix(bucket, prefix, null);
      await ref.update({photoPath: '', updatedAt: FieldValue.serverTimestamp()});
      return res.set('cache-control', 'no-store').json({photoPath: ''});
    }

    if (typeof image !== 'string') return fail(res, 400, 'image');
    const bytes = Buffer.from(image, 'base64');
    if (bytes.length > MAX_BYTES) return fail(res, 413, 'size');
    if (!looksLikeJpeg(bytes)) return fail(res, 415, 'format');

    const name = createHash('sha256').update(bytes).digest('hex').slice(0, 32);
    const path = `${prefix}${name}.jpg`;

    await bucket.file(path).save(bytes, {
      contentType: 'image/jpeg',
      resumable: false,
      metadata: {cacheControl: 'public, max-age=31536000, immutable'},
    });

    /*
     * The document is written before the old objects are swept, and the sweep keeps the one
     * just uploaded. The other order would leave a window in which the card points at a
     * file that has already been deleted, and a visitor in that window gets a 404 where a
     * face should be.
     */
    await ref.update({
      photoPath: path,
      photoScale: 1,
      photoX: 50,
      photoY: 50,
      updatedAt: FieldValue.serverTimestamp(),
    });
    await clearPrefix(bucket, prefix, path);

    return res.set('cache-control', 'no-store').json({photoPath: path});
  } catch (e) {
    console.error('photo', e && (e.stack || e.message));
    return fail(res, 500, 'server');
  }
});
