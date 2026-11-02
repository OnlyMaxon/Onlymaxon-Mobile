/*
 * Cards in Firestore.
 *
 * A card is created at the bench with a client's email on it and `ownerUid: null`. The
 * client registers afterwards, confirms that address, and claims it. Everything that
 * enforces this lives in firestore.rules — the functions here are the client half of rules
 * the server applies anyway, so a tampered app gets refusals rather than somebody else's
 * data.
 */

import {getApp} from '@react-native-firebase/app';
import {
  collection,
  doc,
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

export const db = getFirestore(getApp());

/** The same rule the slug input enforces, and the one the public URL depends on. */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}$/;

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
};

export const ACCENTS = ['studio', 'amber', 'rose', 'cyan'] as const;
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
    .map(x => ({label: str(x.label, LIMITS.linkLabel), url: url(x.url, LIMITS.linkUrl)}))
    .filter(x => x.label && /^https?:\/\/.+\..+/i.test(x.url))
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
export type ChipRecord = {
  cardId: string;
  slug: string;
  uid: string;
  batchHex: string;
  writtenAt: number;
};

export async function recordChip(r: Omit<ChipRecord, 'writtenAt'>): Promise<void> {
  await setDoc(doc(db, 'chips', r.cardId), {...r, writtenAt: Date.now()}, {merge: true});
}

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
