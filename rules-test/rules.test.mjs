/*
 * What firestore.rules actually allows, run against the emulator rather than read by eye.
 *
 * This file exists because of 2026-11-23. The rules were reviewed carefully, deployed, and
 * the first client to press "hold the card to the phone" got `permission denied`: creating
 * a card reads `cards/<uid>` first, and on a document that does not exist `resource` is
 * null — so `owns(resource.data)` is not false but an *error*, which denies the read and
 * fails the whole transaction. Twenty minutes with the emulator found that and a second
 * one nobody would have hit until a client registered with a capital letter in their
 * address. Neither is visible by reading. Rules belong with chip writes, in the category
 * of things that are only "certain" once something has executed them.
 *
 *   npm run test:rules        (needs Java, for the emulator)
 *
 * The checks follow the journey rather than the file: the transaction TakeCard.tsx runs,
 * the two queries myCards() runs, saving, publishing, letting go — and then every refusal
 * that has to stay a refusal, including the batch passwords and the activity log.
 */

import {readFileSync} from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

const UID = 'uid-anna';
const EMAIL = 'anna@salon.pl';
/* Must match the port in firebase.json, which is what `emulators:exec` starts. */
const PORT = 8183;

const env = await initializeTestEnvironment({
  projectId: 'demo-rules',
  firestore: {
    host: '127.0.0.1',
    port: PORT,
    rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
  },
});

const as = (uid, email, confirmed = true) =>
  env.authenticatedContext(uid, {email, email_verified: confirmed}).firestore();

const verified = as(UID, EMAIL);
const unverified = as('uid-bob', 'bob@x.pl', false);
const stranger = as('uid-eve', 'eve@x.pl');
/* Us, at the bench. The address is the one listed in admin() in firestore.rules. */
const bench = as('uid-max', 'calilorucli42@gmail.com');

/** A card document shaped the way createMyCard writes one. */
const card = (over = {}) => ({
  slug: 'anna',
  ownerUid: UID,
  ownerEmail: EMAIL,
  name: 'Anna',
  role: '',
  location: '',
  bio: '',
  phone: '',
  email: '',
  website: '',
  accent: 'studio',
  lang: 'ru',
  services: [],
  links: [],
  published: true,
  ...over,
});

/** Writes past the rules, the way the bench or a function does. */
const seed = fn => env.withSecurityRulesDisabled(ctx => fn(ctx.firestore()));

let failures = 0;
const check = async (name, fn) => {
  try {
    await fn();
    console.log('  ok    ' + name);
  } catch (e) {
    failures++;
    console.log('  FAIL  ' + name + ' -- ' + String(e.message || e).slice(0, 110));
  }
};

console.log('\nthe transaction TakeCard runs');
await env.clearFirestore();
await check('read slugs/<slug> before it exists', () =>
  assertSucceeds(getDoc(doc(verified, 'slugs/anna'))));
await check('read cards/<my uid> before it exists', () =>
  assertSucceeds(getDoc(doc(verified, 'cards', UID))));
await check('read both and write both, in one transaction', () =>
  assertSucceeds(
    runTransaction(verified, async tx => {
      await tx.get(doc(verified, 'slugs/anna'));
      await tx.get(doc(verified, 'cards', UID));
      tx.set(doc(verified, 'slugs/anna'), {cardId: UID});
      tx.set(doc(verified, 'cards', UID), card());
    }),
  ));

/*
 * Both shapes, because two versions of the app are in the world at once. The one in the
 * stores sends published false and the one replacing it sends true; the rule takes either,
 * so nobody registering on an old install is refused while the new one is in review.
 */
console.log('\na card made by its owner, hidden or visible');
await env.clearFirestore();
await check('visible from the first moment, as the app now makes it', () =>
  assertSucceeds(setDoc(doc(verified, 'cards', UID), card())));
await env.clearFirestore();
await check('hidden at birth, as the version in the stores makes it', () =>
  assertSucceeds(setDoc(doc(verified, 'cards', UID), card({published: false}))));

console.log('\nwhat the app does next');
await check('myCards: the cards I own', () =>
  assertSucceeds(getDocs(query(collection(verified, 'cards'), where('ownerUid', '==', UID)))));
await check('myCards: a card waiting for my address', () =>
  assertSucceeds(
    getDocs(
      query(
        collection(verified, 'cards'),
        where('ownerEmail', '==', EMAIL),
        where('ownerUid', '==', null),
      ),
    ),
  ));
await check('save an edit', () =>
  assertSucceeds(updateDoc(doc(verified, 'cards', UID), {name: 'Anna K', bio: 'hello'})));
await check('publish it', () =>
  assertSucceeds(updateDoc(doc(verified, 'cards', UID), {published: true})));
await check('hide it again', () =>
  assertSucceeds(updateDoc(doc(verified, 'cards', UID), {published: false})));
await check('let go of it, as deleting an account does', () =>
  assertSucceeds(
    updateDoc(doc(verified, 'cards', UID), {ownerUid: null, published: false, photoPath: ''}),
  ));

console.log('\nthe address, as Firebase actually spells it');
await env.clearFirestore();
const mixed = as('uid-max', 'Calil@Gmail.com');
await check('registered with capitals, creates a lowercased card', () =>
  assertSucceeds(
    setDoc(
      doc(mixed, 'cards/uid-max'),
      card({slug: 'max', ownerUid: 'uid-max', ownerEmail: 'calil@gmail.com'}),
    ),
  ));
await seed(db =>
  setDoc(
    doc(db, 'cards/bench-made'),
    card({slug: 'maxim', ownerUid: null, ownerEmail: 'calil@gmail.com'}),
  ),
);
await check('registered with capitals, claims a card made at the bench', () =>
  assertSucceeds(updateDoc(doc(mixed, 'cards/bench-made'), {ownerUid: 'uid-max'})));

console.log('\nwhat must stay refused');
await env.clearFirestore();
await check('a card at an id that is not my uid', () =>
  assertFails(setDoc(doc(verified, 'cards/some-other-id'), card())));
await check('a card owned by somebody else', () =>
  assertFails(setDoc(doc(verified, 'cards', UID), card({ownerUid: 'uid-bob'}))));
await check('a card on an address that is not mine', () =>
  assertFails(setDoc(doc(verified, 'cards', UID), card({ownerEmail: 'someone@else.pl'}))));
/*
 * A card made at the bench still may not arrive visible, and this is the half of that
 * change worth guarding. Nobody owns such a card and nothing is written on it: published
 * from the start, it would be a stranger's name-less page on a slug we are about to print,
 * instead of the holding page that says what the plastic is and who to ask about it.
 */
await check('the bench creating a card already visible', () =>
  assertFails(
    setDoc(
      doc(bench, 'cards/bench-visible'),
      card({slug: 'olga', ownerUid: null, ownerEmail: 'olga@salon.pl', published: true}),
    ),
  ));
await check('a slug that is not a slug', () =>
  assertFails(setDoc(doc(verified, 'cards', UID), card({slug: 'Anna Kowalska!'}))));
await check('a card arriving with a photo path', () =>
  assertFails(setDoc(doc(verified, 'cards', UID), card({photoPath: 'cards/someone/face.jpg'}))));
await check('a slug lock pointing at somebody else', () =>
  assertFails(setDoc(doc(verified, 'slugs/anna'), {cardId: 'uid-bob'})));
await check('an unconfirmed address creating a card', () =>
  assertFails(
    setDoc(
      doc(unverified, 'cards/uid-bob'),
      card({ownerUid: 'uid-bob', ownerEmail: 'bob@x.pl', slug: 'bob'}),
    ),
  ));
await check('the list of every slug', () =>
  assertFails(getDocs(collection(verified, 'slugs'))));
await check('a stranger reading my card', async () => {
  await seed(db => setDoc(doc(db, 'cards', UID), card()));
  await assertFails(getDoc(doc(stranger, 'cards', UID)));
});
await check('a stranger changing my slug', () =>
  assertFails(updateDoc(doc(stranger, 'cards', UID), {slug: 'eve'})));
await check('the owner changing their own slug', () =>
  assertFails(updateDoc(doc(verified, 'cards', UID), {slug: 'anna2'})));
await check('the owner setting their own photo path', () =>
  assertFails(updateDoc(doc(verified, 'cards', UID), {photoPath: 'cards/other/face.jpg'})));
await check('deleting a card', () => assertFails(deleteDoc(doc(verified, 'cards', UID))));
await check('writing my own activity log', () =>
  assertFails(setDoc(doc(verified, 'activity', UID, 'events', 'made-up'), {kind: 'activate'})));
await check('reading a chip record', () =>
  assertFails(getDoc(doc(verified, 'chips/04112233445566'))));
await check('reading a batch password', () =>
  assertFails(getDoc(doc(verified, 'batches/DEADBEEF'))));

await env.cleanup();
console.log(
  '\n' + (failures === 0 ? 'every check behaved as intended' : failures + ' CHECK(S) DISAGREE') + '\n',
);
process.exit(failures === 0 ? 0 : 1);
