/*
 * Cards in Firestore.
 *
 * A card is created at the bench with a client's email on it and `ownerUid: null`. The
 * client registers afterwards, confirms that address, and claims it. Everything that
 * enforces this lives in firestore.rules — the functions here are the client half of rules
 * the server applies anyway, so a tampered app gets refusals rather than somebody else's
 * data.
 */

import {Platform} from 'react-native';
import {getApp} from '@react-native-firebase/app';
import {
  addDoc,
  collection,
  doc,
  increment,
  getDoc,
  getDocs,
  setDoc,
  getFirestore,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from '@react-native-firebase/firestore';

import {auth} from './account';
// The app's own version, straight out of the config the build is made from, so a record
// says which build wrote it. No new dependency for one string.
import appConfig from '../app.json';

const db = getFirestore(getApp());

/*
 * Who is at the bench, with what, on what. Added by the writers below rather than passed
 * in: a caller that has to remember to include it is a caller that will one day forget,
 * and these three fields are exactly what was missing the day we needed to know which
 * build had written a chip.
 *
 * Exported because the activity log in src/activity.ts says the same three things about
 * the same phone, and two places deciding separately what "the app version" means is how
 * two records of one tap end up disagreeing.
 */
export const ENV = {
  app: `${appConfig.expo.version}+${
    Platform.OS === 'ios' ? appConfig.expo.ios.buildNumber : appConfig.expo.android.versionCode
  }`,
  platform: Platform.OS,
  osVersion: String(Platform.Version),
};

const who = () => ({
  byUid: auth.currentUser?.uid ?? '',
  byEmail: auth.currentUser?.email ?? '',
});

/** The same rule the slug input enforces, and the one the public URL depends on. */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}$/;

/*
 * Cards live on their own hostname. The site is a static build on GitHub Pages and a card
 * is a row in a database — one domain serving both means one of them has to bend. This is
 * also the address printed into the chip, so it cannot change once cards are handed out,
 * and it is why it is one constant rather than a string written out wherever it is needed.
 */
export const BASE_URL = 'https://cards.onlymaxon.com/';

export type Service = {name: string; price: string};
export type Link = {label: string; url: string};

export type Card = {
  id: string;
  slug: string;
  ownerUid: string | null;
  ownerEmail: string;
  name: string;
  role: string;
  location: string;
  bio: string;
  phone: string;
  email: string;
  website: string;
  accent: string;
  lang: string;
  services: Service[];
  links: Link[];
  published: boolean;
  /*
   * Where the picture lives in the bucket, or empty for none. Read here and never written:
   * the `photo` function owns this field, and firestore.rules refuses any client write that
   * changes it. The public page falls back to the first letter of the name when it is empty.
   */
  photoPath: string;
};

/*
 * The colourways a card can wear. The palettes themselves live in functions/html.js, which
 * is what renders the page; this is the list the editor offers and the rules the save
 * checks against, and the two have to name the same things.
 *
 * `graphite` is here because of what people actually said about the plastic: they like that
 * it is black and says nothing. It is the one accent that is not a colour.
 */
export const ACCENTS = [
  'studio',
  'cyan',
  'amber',
  'rose',
  'emerald',
  'violet',
  'coral',
  'graphite',
] as const;

/*
 * The `a` of each palette in functions/html.js — the only value of it the app needs, for
 * the swatch in the editor and the hairline on the card it draws. Kept beside the list
 * above so adding an accent is one edit here and one there, and a missing one is a type
 * error rather than a blank circle.
 */
const INK: Record<(typeof ACCENTS)[number], string> = {
  studio: '#22D3EE',
  cyan: '#7FE9F0',
  amber: '#E7B45A',
  rose: '#E9A5BC',
  emerald: '#6EE7B7',
  violet: '#C4A7FF',
  coral: '#FF9E7A',
  graphite: '#D7E0E6',
};

/* A saved card carries whatever accent was saved, which is a string; this is the lookup. */
export const accentInk = (accent: string) =>
  INK[accent as (typeof ACCENTS)[number]] ?? INK.studio;
export const LANGS = ['en', 'pl', 'ru', 'tr', 'es'] as const;

/* What the editor is allowed to write, and how long each field may be. The limits are here
 * rather than in the form so that one number governs both the input and the save. */
export const LIMITS = {
  name: 60,
  role: 70,
  location: 70,
  bio: 240,
  phone: 40,
  email: 120,
  website: 200,
  serviceName: 60,
  servicePrice: 30,
  linkLabel: 40,
  linkUrl: 200,
  services: 8,
  links: 6,
};

/*
 * "anna-salon.pl" is what people type; a browser needs "https://anna-salon.pl". Without
 * this the card renders href="anna-salon.pl", which the browser resolves against the card's
 * own address and lands on a 404 — on somebody else's phone, where nobody will report it.
 */
const url = (v: unknown, max: number) => {
  const raw = String(v ?? '').trim();
  if (!raw) {
    return '';
  }
  const full = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return full.slice(0, max);
};

/*
 * What a person types for a social account is a handle, not an address: "@onlymaxon" for
 * Telegram, a phone number for WhatsApp. url() turns the first into "https://@onlymaxon",
 * which has no dot, so LINK_OK below rejected it and save() dropped the whole row with
 * nothing on screen to say why — the one thing a card editor must never do.
 *
 * The label decides which service it is, because "@name" on its own could be Telegram or
 * Instagram and guessing wrong sends visitors to a stranger. Whatever the label says is
 * what the person typed as the name of the link, so it is the honest signal.
 */
const SOCIALS: ReadonlyArray<{match: RegExp; build: (handle: string) => string}> = [
  {match: /telegram|телеграм|tg/i, build: h => `https://t.me/${h}`},
  {match: /instagram|инстаграм/i, build: h => `https://instagram.com/${h}`},
  {match: /tiktok|тикток/i, build: h => `https://tiktok.com/@${h}`},
  {match: /whatsapp|ватсап|вотсап/i, build: h => `https://wa.me/${h.replace(/\D/g, '')}`},
];

/** An address a browser can actually open. The same test gates the save and the form. */
export const LINK_OK = /^https?:\/\/.+\..+/i;

/*
 * The address a row means. A full URL is taken as typed; a bare handle is turned into the
 * address of the service its label names; anything else falls back to url(), which is what
 * makes "anna-salon.pl" work.
 */
export function linkUrl(label: unknown, raw: unknown): string {
  const v = String(raw ?? '').trim();
  if (!v) {
    return '';
  }
  if (/^https?:\/\//i.test(v)) {
    return url(v, LIMITS.linkUrl);
  }
  const name = String(label ?? '');
  const handle = v.replace(/^@/, '');
  for (const sc of SOCIALS) {
    if (sc.match.test(name)) {
      return sc.build(handle).slice(0, LIMITS.linkUrl);
    }
  }
  return url(v, LIMITS.linkUrl);
}

/* A row nobody filled in. Dropping one needs no warning; dropping a half-filled one does. */
export const linkEmpty = (x: Link) => !String(x.label ?? '').trim() && !String(x.url ?? '').trim();
export const linkUsable = (x: Link) =>
  Boolean(String(x.label ?? '').trim()) && LINK_OK.test(linkUrl(x.label, x.url));

export const serviceEmpty = (x: Service) => !String(x.name ?? '').trim() && !String(x.price ?? '').trim();
export const serviceUsable = (x: Service) =>
  Boolean(String(x.name ?? '').trim()) && Boolean(String(x.price ?? '').trim());

const str = (v: unknown, max: number) =>
  String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

function fromDoc(id: string, d: Record<string, unknown>): Card {
  return {
    id,
    slug: String(d.slug ?? ''),
    ownerUid: (d.ownerUid as string | null) ?? null,
    ownerEmail: String(d.ownerEmail ?? ''),
    name: String(d.name ?? ''),
    role: String(d.role ?? ''),
    location: String(d.location ?? ''),
    bio: String(d.bio ?? ''),
    phone: String(d.phone ?? ''),
    email: String(d.email ?? ''),
    website: String(d.website ?? ''),
    accent: String(d.accent ?? 'studio'),
    lang: String(d.lang ?? 'en'),
    services: Array.isArray(d.services) ? (d.services as Service[]) : [],
    links: Array.isArray(d.links) ? (d.links as Link[]) : [],
    published: d.published === true,
    photoPath: String(d.photoPath ?? ''),
  };
}

/*
 * Who may create cards. This list has a twin in firestore.rules, and the one there is the
 * one that matters — this copy only decides whether the tab is drawn. Changing this file
 * alone grants nothing: every write still goes through the rules.
 */
const ADMINS = ['calilorucli42@gmail.com'];

export function isAdmin(email: string): boolean {
  return ADMINS.includes(email.trim().toLowerCase());
}

/*
 * Everything this person can edit: the cards they already own, plus any still waiting for
 * their address. Two queries rather than one because Firestore has no OR across fields
 * that the rules would also accept — and each has to be narrow enough that every document
 * it returns passes the rule, or the whole query fails rather than filtering.
 */
export async function myCards(uid: string, email: string): Promise<Card[]> {
  const cards = collection(db, 'cards');
  const [mine, waiting] = await Promise.all([
    getDocs(query(cards, where('ownerUid', '==', uid))),
    getDocs(query(cards, where('ownerEmail', '==', email), where('ownerUid', '==', null))),
  ]);

  const out = new Map<string, Card>();
  for (const snap of [...mine.docs, ...waiting.docs]) {
    out.set(snap.id, fromDoc(snap.id, snap.data() as Record<string, unknown>));
  }
  // Cards already claimed come first. Otherwise which one the editor opens depends on
  // which of the two queries answered first, and somebody with two cards would find a
  // different one waiting for them each time they opened the app.
  return [...out.values()].sort((a, b) => Number(!!b.ownerUid) - Number(!!a.ownerUid));
}

/*
 * The card behind a slug, for the bench: tapping a chip tells you the URL, and this turns
 * that URL back into "whose card is this, and has that person taken it yet". Admin-only by
 * the rules — nobody else may list cards they do not own.
 */
export async function findBySlug(slug: string): Promise<Card | null> {
  const r = await getDocs(query(collection(db, 'cards'), where('slug', '==', slug)));
  const d = r.docs[0];
  return d ? fromDoc(d.id, d.data() as Record<string, unknown>) : null;
}

/** Taking an unclaimed card. The rules check the verified address; this only asks. */
export async function claim(cardId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, 'cards', cardId), {ownerUid: uid, updatedAt: serverTimestamp()});
}

export async function save(cardId: string, c: Partial<Card>): Promise<void> {
  const services = (c.services ?? [])
    .map(x => ({name: str(x.name, LIMITS.serviceName), price: str(x.price, LIMITS.servicePrice)}))
    .filter(x => x.name && x.price)
    .slice(0, LIMITS.services);

  const links = (c.links ?? [])
    .map(x => ({label: str(x.label, LIMITS.linkLabel), url: linkUrl(x.label, x.url)}))
    .filter(x => x.label && LINK_OK.test(x.url))
    .slice(0, LIMITS.links);

  await updateDoc(doc(db, 'cards', cardId), {
    name: str(c.name, LIMITS.name),
    role: str(c.role, LIMITS.role),
    location: str(c.location, LIMITS.location),
    bio: str(c.bio, LIMITS.bio),
    phone: str(c.phone, LIMITS.phone),
    email: str(c.email, LIMITS.email),
    website: url(c.website, LIMITS.website),
    accent: ACCENTS.includes(c.accent as never) ? c.accent : 'studio',
    lang: LANGS.includes(c.lang as never) ? c.lang : 'en',
    services,
    links,
    published: c.published === true,
    updatedAt: serverTimestamp(),
  });
}

/*
 * Letting go of a card, which is what deleting an account does to one.
 *
 * The card is not deleted and must not be: the slug is printed on a piece of plastic in
 * somebody's pocket, and a deleted row turns that into a 404 with nothing about holding it
 * to say why. So the content goes, the card goes back to hidden and unclaimed, and the chip
 * keeps working — it opens the same holding page it opened the day it was written.
 *
 * `ownerEmail` stays. It is the record of who the card was issued to, which is ours rather
 * than theirs, and it is also the way back: registering again on that address finds the
 * card waiting. Someone who wants that line gone too has to ask us, and the privacy page
 * says so.
 */
export async function release(card: Card): Promise<void> {
  await updateDoc(doc(db, 'cards', card.id), {
    ownerUid: null,
    // The same state createCard() leaves behind, down to the name falling back to the slug.
    name: card.slug,
    role: '',
    location: '',
    bio: '',
    phone: '',
    email: '',
    website: '',
    accent: 'studio',
    services: [],
    links: [],
    published: false,
    /*
     * Written unconditionally, not only when there was a picture. The file itself is
     * deleted first, by the photo function; this is what makes the page stop pointing at a
     * face if that call did not get through. The rule for this branch requires it to be
     * empty, so a deletion that forgot it would be refused rather than half-done.
     */
    photoPath: '',
    updatedAt: serverTimestamp(),
  });
}

/** Carries the slug rather than a sentence; the screen writes the sentence. */
/*
 * Batch passwords, kept where a reinstall cannot reach them.
 *
 * The phone keychain holds the working copy; this is the backup that survives the device.
 * Readable only by admins, which is the same set of people who hold the chips — see the
 * note in firestore.rules. Every password ever used stays here: a chip protected two
 * batches ago still needs the password it was protected with, and that is the only way
 * back into it.
 */
export type Batch = {id: string; hex: string; createdAt: number};

export async function rememberBatch(hex: string): Promise<void> {
  // The hex itself is the id, so saving the same password twice is one document, not two.
  await setDoc(doc(db, 'batches', hex), {hex, createdAt: Date.now()}, {merge: true});
}

export async function knownBatches(): Promise<Batch[]> {
  const r = await getDocs(collection(db, 'batches'));
  return r.docs
    .map(d => ({id: d.id, ...(d.data() as {hex: string; createdAt: number})}))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/*
 * What was physically written onto a chip, and with which password.
 *
 * A card can be rewritten onto a different chip, and a chip can be wiped and reused, so
 * the two are not the same thing. This is the chip half: the UID that the factory burned
 * in and cannot be changed, and the batch password that now guards it — without which the
 * chip can never be written again.
 *
 * Admin-only by the rules, and separate from the card document on purpose: the client
 * reads their own card in full, and the batch password must never be in it.
 */
/*
 * Everything knowable about one physical chip at the moment it was written.
 *
 * The pages that matter cannot be read back — a chip answers READ on its password pages
 * with zeros, by design — so anything not written down here is a fact nobody can recover
 * afterwards. That is why this is long rather than tidy: the day it is needed, it is needed
 * whole.
 */
export type ChipWrite = {
  /** The factory UID, which is also this document's id. */
  uid: string;
  cardId: string;
  slug: string;
  /** The URL as it was actually read back off the chip, not as it was composed. */
  url: string;
  batchHex: string;
  chipModel: string;
  userBytes: number | null;
  usedBytes: number | null;
  /** The configuration as the chip reported it after the write, not as we intended it. */
  auth0: number;
  readsAlsoProtected: boolean;
  configLocked: boolean;
  counterEnabled: boolean;
  counterNeedsPassword: boolean;
  authLimit: number;
  taps: number | null;
  mirror: string;
};

export type ChipRecord = ChipWrite & {
  /** How many times this piece of plastic has been through the bench. */
  writes?: number;
  byUid?: string;
  byEmail?: string;
  app?: string;
  platform?: string;
  osVersion?: string;
  deviceWrittenAt?: number;
};

/*
 * The current state of one piece of plastic, keyed by the chip's own UID.
 *
 * Keyed by the chip and not by the card on purpose. A card can be written onto a second
 * chip, and a record keyed by the card quietly turns into a record of the most recent one —
 * which is how a chip already in somebody's pocket came to carry a password that the
 * database swore was its own. One document per chip, and the history below never loses a
 * line.
 */
export async function recordChip(w: ChipWrite): Promise<void> {
  await setDoc(
    doc(db, 'chips', w.uid),
    {
      ...w,
      ...who(),
      ...ENV,
      writes: increment(1),
      // The server's clock, because the phone's is a guess and two records an hour apart
      // by a wrong clock cannot be read in order. The phone's is kept beside it: the gap
      // between them is itself worth seeing.
      writtenAt: serverTimestamp(),
      deviceWrittenAt: Date.now(),
    },
    {merge: true},
  );
}

/*
 * Every attempt on every chip, in order, never overwritten and never deleted.
 *
 * Failures are in here too, which is the point: after the fact the useful question is "what
 * happened to this chip", and a write that refused the password is part of that answer. The
 * rules allow create and nothing else, so this cannot be edited into a different story.
 */
export async function logChip(
  entry: Partial<ChipWrite> & {
    uid: string;
    outcome: 'written' | 'erased' | 'failed';
    error?: string;
  },
): Promise<void> {
  /*
   * Under the chip, not beside it: `chips/<uid>/writes/...`. A sixth collection at the top
   * level is a thing somebody has to recognise before they can ignore it, and the console
   * is read by a person at a bench, not by a query planner. Here the history is where you
   * are already looking — open a chip, see everything that ever happened to it.
   *
   * A write that failed before the chip answered has no UID to file itself under, and those
   * are the ones worth keeping most. They go under `_unverified`, which is a chip id that
   * cannot exist: a UID is seven bytes of hex and never starts with an underscore.
   */
  await addDoc(collection(db, 'chips', entry.uid || '_unverified', 'writes'), {
    ...entry,
    ...who(),
    ...ENV,
    at: serverTimestamp(),
    deviceAt: Date.now(),
  });
}

/** By the chip in your hand, which is the only question worth asking at the bench. */
export async function chipByUid(uid: string): Promise<ChipRecord | null> {
  const snap = await getDoc(doc(db, 'chips', uid));
  return snap.exists() ? (snap.data() as ChipRecord) : null;
}

/*
 * Records written before this was keyed by UID: the id is the card, and the record
 * describes whichever chip was written last. Kept because those chips are in people's
 * pockets and their records are all we have — but read second, after the UID.
 */
export async function chipOf(cardId: string): Promise<ChipRecord | null> {
  const snap = await getDoc(doc(db, 'chips', cardId));
  return snap.exists() ? (snap.data() as ChipRecord) : null;
}

export class SlugTaken extends Error {
  readonly slug: string;
  constructor(slug: string) {
    super('slug-taken');
    this.slug = slug;
  }
}

/*
 * The card a client makes for themselves, at registration.
 *
 * Until now every card was created at the bench: we typed the slug and the client's email,
 * and the client turned up afterwards to claim it. That does not survive an order for three
 * hundred cards, so the person registering now picks their own address and owns the row
 * from the first moment — there is no claim step and no window where the card belongs to
 * an email rather than to an account.
 *
 * The document id is the account's uid, deliberately. Firestore rules cannot count
 * documents, so "one self-made card per account" has no expression as a condition — but an
 * id that must equal the uid says the same thing and is enforced by the create rule. A
 * second card for the same person is still possible; it is made at the bench, by us, with a
 * random id, the way every card was made before.
 */
export async function createMyCard(opts: {
  uid: string;
  email: string;
  slug: string;
  name: string;
}): Promise<string> {
  const slug = opts.slug.trim().toLowerCase();
  if (!SLUG_RE.test(slug)) {
    throw new Error('bad-slug');
  }

  const cardRef = doc(db, 'cards', opts.uid);
  const slugRef = doc(db, 'slugs', slug);

  await runTransaction(db, async tx => {
    const taken = await tx.get(slugRef);
    if (taken.exists()) {
      throw new SlugTaken(slug);
    }
    /*
     * The uid is one card, so a second pass here would overwrite the first — including its
     * slug, which is printed on plastic already in somebody's hand. The rules refuse this
     * too (create only, never update, on this branch); the check is here so the person sees
     * a sentence instead of "permission denied".
     */
    const mine = await tx.get(cardRef);
    if (mine.exists()) {
      throw new Error('already-have-card');
    }
    tx.set(slugRef, {cardId: opts.uid});
    tx.set(cardRef, {
      slug,
      ownerUid: opts.uid,
      ownerEmail: opts.email.trim().toLowerCase(),
      name: str(opts.name, LIMITS.name) || slug,
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
      published: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  return opts.uid;
}

/*
 * Creating a card, which only happens while a chip is being written.
 *
 * The slug is the URL printed on a physical object, so two people holding the same one has
 * no fix. Firestore has no unique index; a document whose id *is* the slug is the standard
 * way to buy one, and doing both writes in a transaction means the card and its claim on
 * the name succeed or fail together.
 */
export async function createCard(opts: {
  slug: string;
  email: string;
  name?: string;
}): Promise<string> {
  const slug = opts.slug.trim().toLowerCase();
  if (!SLUG_RE.test(slug)) {
    throw new Error('bad-slug');
  }

  const cardRef = doc(collection(db, 'cards'));
  const slugRef = doc(db, 'slugs', slug);

  await runTransaction(db, async tx => {
    const taken = await tx.get(slugRef);
    if (taken.exists()) {
      throw new SlugTaken(slug);
    }
    tx.set(slugRef, {cardId: cardRef.id});
    tx.set(cardRef, {
      slug,
      ownerUid: null,
      ownerEmail: opts.email.trim().toLowerCase(),
      name: str(opts.name ?? '', LIMITS.name) || slug,
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
      published: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  return cardRef.id;
}
