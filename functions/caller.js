/*
 * Who is asking, for the two functions a signed-in phone talks to.
 *
 * A token that is merely *valid* is not enough. A card is claimed by a confirmed address
 * and the Firestore rules read `email_verified` straight out of the token, so a function
 * that accepted an unconfirmed one would be a second door into the thing the rules exist to
 * refuse. This lived inside photo.js until `activity.js` needed the same check: a security
 * check written twice is one that drifts, and the half that drifts is the one nobody reads.
 */

import {getAuth} from 'firebase-admin/auth';

/** The decoded token of a signed-in, address-confirmed caller, or null. */
export async function caller(req) {
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
