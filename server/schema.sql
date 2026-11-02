-- The NFC card product: one account owns many cards.
--
--   npx wrangler d1 execute onlymaxon-cards --file card/schema.sql --remote
--
-- Written to be run more than once: every statement is IF NOT EXISTS, so applying it to a
-- database that is already up to date is a no-op rather than an error. New columns go at
-- the bottom of this file as separate ALTER statements with a date, not edited into the
-- CREATE above — the CREATE only ever runs on an empty database, so a column added there
-- would silently never appear on the live one.

-- ── accounts ────────────────────────────────────────────────────────────────
-- An account is an email address and nothing else. There is no password column and there
-- never should be: sign-in is a one-time link, so there is no secret of the user's here to
-- leak, and a client who sells haircuts should not be made to invent a password to change
-- their own phone number.
--
-- There is no `plan` and no `stripe_id` either. The cards are given away, so there is no
-- tier to be on and nothing to charge for — and a column that exists "for later" is a
-- promise to the next reader that somewhere there is billing code to find. There is not.
-- If that ever changes it is one ALTER TABLE against a handful of rows.
CREATE TABLE IF NOT EXISTS accounts (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  created_at  INTEGER NOT NULL,
  last_seen   INTEGER
);

-- ── cards ───────────────────────────────────────────────────────────────────
-- One row is one physical card. The slug is the URL printed on it — onlymaxon.com/u/<slug>
-- — and a printed card cannot be reissued, so the slug is immutable once the card is
-- handed over. That is enforced in the editor, not here: the column has to stay writable
-- for the case where a card is prepared but not yet posted.
CREATE TABLE IF NOT EXISTS cards (
  id           TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  slug         TEXT NOT NULL UNIQUE,
  -- Which language the three buttons speak. Everything else on the card is typed by its
  -- owner in whatever language they please, which is why only the labels are translated.
  lang         TEXT NOT NULL DEFAULT 'en',

  name         TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT '',
  location     TEXT,
  bio          TEXT,

  -- R2 object key, not a URL. The bucket is private and the Worker streams the bytes, so
  -- storing a URL here would bake today's hostname into every row.
  photo_key    TEXT,
  photo_scale  REAL NOT NULL DEFAULT 1,
  photo_x      REAL NOT NULL DEFAULT 50,
  photo_y      REAL NOT NULL DEFAULT 50,

  phone        TEXT,
  email        TEXT,
  website      TEXT,
  accent       TEXT NOT NULL DEFAULT 'studio',

  -- A card that has been written to a chip but whose owner has not filled it in yet shows
  -- a holding page instead of a half-empty profile. Nothing is worse on a first tap than
  -- a page that looks broken.
  published    INTEGER NOT NULL DEFAULT 0,

  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS cards_account ON cards(account_id);

-- ── the two repeating blocks on a card ──────────────────────────────────────
-- Separate tables rather than a JSON column: the editor reorders these, and ordering rows
-- is what a database is for. `position` is rewritten from scratch on every save, so gaps
-- and duplicates cannot accumulate.
CREATE TABLE IF NOT EXISTS card_services (
  card_id   TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  position  INTEGER NOT NULL,
  name      TEXT NOT NULL,
  price     TEXT NOT NULL,
  PRIMARY KEY (card_id, position)
);

CREATE TABLE IF NOT EXISTS card_links (
  card_id   TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  position  INTEGER NOT NULL,
  label     TEXT NOT NULL,
  url       TEXT NOT NULL,
  PRIMARY KEY (card_id, position)
);

-- ── sign-in ─────────────────────────────────────────────────────────────────
-- The token itself is never stored. What is here is its SHA-256, the same way a password
-- would be — a link in an inbox is a bearer credential, and a leaked database should not
-- hand over working sign-in links for every account that asked for one that hour.
CREATE TABLE IF NOT EXISTS login_tokens (
  token_hash  TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  used_at     INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS login_tokens_email ON login_tokens(email, created_at);

-- Sessions live here rather than only in a signed cookie so that signing out actually
-- signs out: a self-contained cookie stays valid until it expires no matter what the
-- server thinks of it.
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_account ON sessions(account_id);

-- ── taps ────────────────────────────────────────────────────────────────────
-- Aggregated per card per day, not one row per tap. A row per tap would be a write on
-- every single read of every card — the one thing that turns a free database into a bill —
-- and nobody has ever wanted to know the second a card was tapped. One UPSERT a day per
-- card answers "how many times this month", which is the question people actually ask.
CREATE TABLE IF NOT EXISTS card_taps (
  card_id  TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  day      TEXT NOT NULL,            -- YYYY-MM-DD, UTC
  count    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (card_id, day)
);
