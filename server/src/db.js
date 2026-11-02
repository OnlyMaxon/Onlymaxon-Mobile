/*
 * Everything that touches D1. Nothing else in this Worker writes SQL, so the shape of the
 * database is described in exactly two places — here and schema.sql — and they are next to
 * each other.
 *
 * Every query is parameterised. Not one string in this file is built by concatenating a
 * value into it, and none ever should be: a slug and an email both arrive from the open
 * internet.
 */

export const now = () => Math.floor(Date.now() / 1000);

// crypto.randomUUID is available in Workers and is what IDs should be: no sequence to
// guess at, no counter leaking how many accounts exist.
export const id = () => crypto.randomUUID();

/*
 * Email is matched case-insensitively — Max@example.com and max@example.com are one
 * mailbox, and treating them as two accounts would mean a client signing in and finding
 * their card gone. Stored lowercased so the UNIQUE index enforces that rather than trusting
 * every caller to remember.
 */
export const normEmail = e => String(e || '').trim().toLowerCase();

export async function accountByEmail(db, email) {
  return db.prepare('SELECT * FROM accounts WHERE email = ?').bind(normEmail(email)).first();
}

export async function accountCreate(db, email) {
  const a = { id: id(), email: normEmail(email), created_at: now() };
  await db.prepare('INSERT INTO accounts (id, email, created_at) VALUES (?, ?, ?)')
          .bind(a.id, a.email, a.created_at).run();
  return a;
}

// Sign-in creates the account if it is the first time. There is no separate "register"
// step: for a product sold as a physical card, the card IS the registration, and a second
// screen asking somebody to choose between two buttons they do not understand is pure loss.
export async function accountGetOrCreate(db, email) {
  return (await accountByEmail(db, email)) || accountCreate(db, email);
}

// ── cards ───────────────────────────────────────────────────────────────────

export async function cardBySlug(db, slug) {
  return db.prepare('SELECT * FROM cards WHERE slug = ?').bind(slug).first();
}

export async function cardById(db, cardId) {
  return db.prepare('SELECT * FROM cards WHERE id = ?').bind(cardId).first();
}

// Always scoped by account_id, never by id alone. An editor URL carries a card id, and
// "fetch by id then check the owner" is the same query written in a way that fails open
// the one time somebody forgets the second half.
export async function cardOwnedBy(db, cardId, accountId) {
  return db.prepare('SELECT * FROM cards WHERE id = ? AND account_id = ?')
           .bind(cardId, accountId).first();
}

export async function cardsOf(db, accountId) {
  const r = await db.prepare('SELECT * FROM cards WHERE account_id = ? ORDER BY created_at')
                    .bind(accountId).all();
  return r.results || [];
}

export async function servicesOf(db, cardId) {
  const r = await db.prepare('SELECT name, price FROM card_services WHERE card_id = ? ORDER BY position')
                    .bind(cardId).all();
  return r.results || [];
}

export async function linksOf(db, cardId) {
  const r = await db.prepare('SELECT label, url FROM card_links WHERE card_id = ? ORDER BY position')
                    .bind(cardId).all();
  return r.results || [];
}

export async function cardCreate(db, accountId, slug, name) {
  const t = now();
  const cardId = id();
  await db.prepare(
    `INSERT INTO cards (id, account_id, slug, lang, name, role, accent, published, created_at, updated_at)
     VALUES (?, ?, ?, 'en', ?, '', 'studio', 0, ?, ?)`)
    .bind(cardId, accountId, slug, name, t, t).run();
  return cardId;
}

/*
 * One save is one batch. D1 runs a batch as a transaction, which matters here because a
 * save is four statements: update the card, clear its services and links, write them back.
 * Without the transaction a failure between the DELETE and the INSERT leaves a card whose
 * price list has silently vanished — and the owner finds out from a client.
 */
export async function cardSave(db, cardId, f, services, links) {
  const stmts = [
    db.prepare(
      `UPDATE cards SET lang=?, name=?, role=?, location=?, bio=?, phone=?, email=?,
         website=?, accent=?, published=?, photo_scale=?, photo_x=?, photo_y=?, updated_at=?
       WHERE id=?`)
      .bind(f.lang, f.name, f.role, f.location, f.bio, f.phone, f.email, f.website,
            f.accent, f.published ? 1 : 0, f.photo_scale, f.photo_x, f.photo_y, now(), cardId),
    db.prepare('DELETE FROM card_services WHERE card_id = ?').bind(cardId),
    db.prepare('DELETE FROM card_links WHERE card_id = ?').bind(cardId),
  ];
  services.forEach((s, i) => stmts.push(
    db.prepare('INSERT INTO card_services (card_id, position, name, price) VALUES (?, ?, ?, ?)')
      .bind(cardId, i, s.name, s.price)));
  links.forEach((l, i) => stmts.push(
    db.prepare('INSERT INTO card_links (card_id, position, label, url) VALUES (?, ?, ?, ?)')
      .bind(cardId, i, l.label, l.url)));
  await db.batch(stmts);
}

export async function cardSetPhoto(db, cardId, key) {
  await db.prepare('UPDATE cards SET photo_key = ?, updated_at = ? WHERE id = ?')
          .bind(key, now(), cardId).run();
}

export async function cardDelete(db, cardId, accountId) {
  // The account_id in the WHERE is the authorisation check, not a filter — an id alone
  // would let anybody with a card id delete anybody's card.
  await db.prepare('DELETE FROM cards WHERE id = ? AND account_id = ?').bind(cardId, accountId).run();
}

// ── sign-in ─────────────────────────────────────────────────────────────────

export const sha256 = async s => {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
};

export async function tokenStore(db, token, email, ttlSeconds) {
  const t = now();
  await db.prepare(
    'INSERT INTO login_tokens (token_hash, email, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), normEmail(email), t + ttlSeconds, t).run();
}

/*
 * Consume, not "check": the UPDATE is what claims the token, and it only matches a row that
 * has not been claimed already. Reading first and writing second would let two clicks of
 * the same link half a second apart both succeed, which is exactly what happens when a mail
 * client prefetches the link before the human gets to it.
 */
export async function tokenConsume(db, token) {
  const hash = await sha256(token);
  const r = await db.prepare(
    'UPDATE login_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING email')
    .bind(now(), hash, now()).first();
  return r ? r.email : null;
}

// How many links this address has asked for in the last hour. A sign-in form that posts an
// email to a stranger is a free way to send mail with our name on it; this is the brake.
export async function tokensRecently(db, email, seconds) {
  const r = await db.prepare(
    'SELECT COUNT(*) AS n FROM login_tokens WHERE email = ? AND created_at > ?')
    .bind(normEmail(email), now() - seconds).first();
  return r ? r.n : 0;
}

export async function sessionCreate(db, accountId, ttlSeconds) {
  const sid = id();
  const t = now();
  await db.prepare('INSERT INTO sessions (id, account_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
          .bind(sid, accountId, t + ttlSeconds, t).run();
  return sid;
}

export async function sessionAccount(db, sid) {
  if (!sid) return null;
  return db.prepare(
    `SELECT a.* FROM sessions s JOIN accounts a ON a.id = s.account_id
     WHERE s.id = ? AND s.expires_at > ?`).bind(sid, now()).first();
}

export async function sessionDestroy(db, sid) {
  if (sid) await db.prepare('DELETE FROM sessions WHERE id = ?').bind(sid).run();
}

/*
 * Expired rows are swept on sign-in rather than on a cron: the table only grows when
 * somebody signs in, so that is the moment it is worth a tidy, and it saves a scheduled
 * trigger whose only job would be a DELETE.
 */
export async function sweep(db) {
  const t = now();
  await db.batch([
    db.prepare('DELETE FROM login_tokens WHERE expires_at < ?').bind(t - 86400),
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(t),
  ]);
}

// ── taps ────────────────────────────────────────────────────────────────────

// One UPSERT per card per day. See the note on card_taps in schema.sql for why this is not
// a row per tap.
export async function tapRecord(db, cardId) {
  const day = new Date().toISOString().slice(0, 10);
  await db.prepare(
    `INSERT INTO card_taps (card_id, day, count) VALUES (?, ?, 1)
     ON CONFLICT (card_id, day) DO UPDATE SET count = count + 1`)
    .bind(cardId, day).run();
}

export async function tapStats(db, cardId) {
  const month = new Date().toISOString().slice(0, 7);
  const r = await db.prepare(
    `SELECT COALESCE(SUM(count), 0) AS total,
            COALESCE(SUM(CASE WHEN day LIKE ? THEN count ELSE 0 END), 0) AS this_month
       FROM card_taps WHERE card_id = ?`).bind(month + '%', cardId).first();
  return r || { total: 0, this_month: 0 };
}
