/*
 * Accounts: an email address, a password, and a confirmation that the address is real.
 *
 * The confirmation is not a formality here — it is the mechanism. A card is created at the
 * bench with a client's email on it and nobody's account attached. The client turns up
 * afterwards, and the only thing that lets them take their own card and nobody else's is
 * Firebase saying this person controls that address. The Firestore rules read that claim
 * straight out of the token, so nothing in this file can be talked into skipping it.
 */

import {getApp} from '@react-native-firebase/app';

import type {Key} from './i18n';
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from '@react-native-firebase/auth';

export type Account = {
  uid: string;
  email: string;
  verified: boolean;
};

export const auth = getAuth(getApp());

function toAccount(u: User | null): Account | null {
  return u && u.email ? {uid: u.uid, email: u.email, verified: u.emailVerified} : null;
}

export function watchAccount(fn: (a: Account | null) => void): () => void {
  return onAuthStateChanged(auth, u => fn(toAccount(u)));
}

/*
 * Firebase hands back error codes; this turns them into dictionary keys. "Wrong password"
 * and "no such account" deliberately map to the same line — telling a stranger which
 * addresses exist is how somebody builds a list of our clients.
 */
export function authErrorKey(e: unknown): Key {
  switch (String((e as {code?: string})?.code ?? '')) {
    case 'auth/invalid-email':
      return 'authBadEmail';
    case 'auth/missing-password':
      return 'authNoPassword';
    case 'auth/weak-password':
      return 'authWeak';
    case 'auth/email-already-in-use':
      return 'authTaken';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'authWrong';
    case 'auth/user-disabled':
      return 'authDisabled';
    case 'auth/too-many-requests':
      return 'authTooMany';
    case 'auth/network-request-failed':
      return 'authOffline';
    default:
      return 'authUnknown';
  }
}

export async function register(email: string, password: string): Promise<void> {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  // Sent immediately, while the person is still looking at the screen that asked for the
  // address. A confirmation that arrives after they have put the phone away is one nobody
  // ever clicks.
  await sendEmailVerification(cred.user);
}

export async function signIn(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function resendVerification(): Promise<void> {
  if (auth.currentUser) {
    await sendEmailVerification(auth.currentUser);
  }
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

export async function leave(): Promise<void> {
  await signOut(auth);
}

/*
 * Verification happens in a browser, in another app, outside this one — so nothing tells us
 * it happened. The screen that waits for it calls this when the person comes back and says
 * they are done.
 */
export async function refresh(): Promise<Account | null> {
  if (!auth.currentUser) {
    return null;
  }
  await reload(auth.currentUser);
  // The verified flag also lives inside the ID token, which the Firestore rules read. A
  // token minted before the click still says false, so it has to be replaced or the rules
  // keep refusing a user who has already confirmed.
  await auth.currentUser.getIdToken(true);
  return toAccount(auth.currentUser);
}
