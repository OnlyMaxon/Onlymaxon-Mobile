/*
 * What storage.rules allows, run against the emulator rather than read by eye.
 *
 * The file says `false` and that is easy to believe, so these checks are not here to find
 * out whether it works today. They are here for the day somebody opens one path "just for
 * the avatar upload": the bucket holds photographs of our clients, and the failure mode of
 * a too-generous rule is silent — nobody notices they can read a stranger's face.
 *
 *   npm run test:storage      (needs Java, for the emulator)
 *
 * Every call below is the one the app would make if it talked to the bucket directly, and
 * every one of them has to be refused: for a stranger, for a confirmed client, for the
 * owner of the very card the object belongs to, and for us. Admins are not an exception —
 * the bench reads the bucket through the console and the functions through the Admin SDK,
 * neither of which this file governs.
 */

import {readFileSync} from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  deleteObject,
  getMetadata,
  listAll,
  ref,
  uploadBytes,
} from 'firebase/storage';

const UID = 'uid-anna';
/* Must match the port in firebase.json, which is what `emulators:exec` starts. */
const PORT = 9199;

const env = await initializeTestEnvironment({
  projectId: 'demo-rules',
  storage: {
    host: '127.0.0.1',
    port: PORT,
    rules: readFileSync(new URL('../storage.rules', import.meta.url), 'utf8'),
  },
});

const as = (uid, email, confirmed = true) =>
  env.authenticatedContext(uid, {email, email_verified: confirmed}).storage();

const owner = as(UID, 'anna@salon.pl');
const stranger = as('uid-eve', 'eve@x.pl');
/* The address listed in admin() in firestore.rules. No privilege here, on purpose. */
const bench = as('uid-max', 'calilorucli42@gmail.com');
const nobody = env.unauthenticatedContext().storage();

/* The path the `photo` function writes: cards/<cardId>/<sha256 of the bytes>.jpg */
const OBJECT = `cards/${UID}/0123456789abcdef0123456789abcdef.jpg`;
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x01]);

/* Put a photo there the way the function does — past the rules, with admin rights — so the
 * reads below are refused because of the rule and not because the object is missing. */
await env.withSecurityRulesDisabled(ctx =>
  uploadBytes(ref(ctx.storage(), OBJECT), JPEG, {contentType: 'image/jpeg'}),
);

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

console.log('\nreading a face that is not yours');
await check('a stranger reading the object', () =>
  assertFails(getMetadata(ref(stranger, OBJECT))));
await check("a stranger listing one card's folder", () =>
  assertFails(listAll(ref(stranger, `cards/${UID}/`))));
await check('a stranger listing the whole bucket', () =>
  assertFails(listAll(ref(stranger, 'cards/'))));
await check('nobody at all, with no token', () =>
  assertFails(getMetadata(ref(nobody, OBJECT))));

console.log('\nthe owner of the card, who still has no business here');
await check('reading the picture on their own card', () =>
  assertFails(getMetadata(ref(owner, OBJECT))));
await check('uploading one themselves', () =>
  assertFails(uploadBytes(ref(owner, `cards/${UID}/mine.jpg`), JPEG)));
await check('deleting the one that is there', () =>
  assertFails(deleteObject(ref(owner, OBJECT))));

console.log('\nus, equally refused from a client');
await check('the bench reading it', () =>
  assertFails(getMetadata(ref(bench, OBJECT))));
await check('the bench writing anywhere', () =>
  assertFails(uploadBytes(ref(bench, 'anything.jpg'), JPEG)));

console.log('\nand nothing outside the card prefix either');
await check('writing to the root of the bucket', () =>
  assertFails(uploadBytes(ref(stranger, 'free.html'), JPEG)));
await check('writing under a path that looks like ours', () =>
  assertFails(uploadBytes(ref(stranger, `cards/${UID}/../elsewhere.jpg`), JPEG)));

await env.cleanup();
console.log(
  '\n' + (failures === 0 ? 'every check behaved as intended' : failures + ' CHECK(S) DISAGREE') + '\n',
);
process.exit(failures === 0 ? 0 : 1);
