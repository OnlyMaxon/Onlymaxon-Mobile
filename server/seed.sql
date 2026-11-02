-- The one card that already exists, moved out of build/profiles.json.
--
--   npx wrangler d1 execute onlymaxon-cards --file card/seed.sql --remote
--
-- Run this BEFORE pointing the route at the Worker. The moment /u/* is a route, the static
-- u/max/index.html on Pages stops being served — and if this row is not there yet, a card
-- that is already in somebody's pocket returns 404.
--
-- The timestamps are fixed rather than strftime('now') so that re-running this file is a
-- no-op instead of a silent edit: every statement is OR IGNORE, so a second run changes
-- nothing at all.

INSERT OR IGNORE INTO accounts (id, email, created_at) VALUES
  ('acc-onlymaxon-max', 'hello@onlymaxon.com', 1761000000);

INSERT OR IGNORE INTO cards
  (id, account_id, slug, lang, name, role, location, bio,
   photo_key, photo_scale, photo_x, photo_y,
   phone, email, website, accent, published, created_at, updated_at)
VALUES (
  'card-max', 'acc-onlymaxon-max', 'max', 'ru',
  'Max', 'OnlyMaxon · Product Studio',
  'Варшава · Работаем по всему миру',
  'Делаем сайты, приложения и выводим их в Google. Пишите — отвечу сам.',
  -- Null, not the old /images/logoW.jpg path: photos live in R2 now, and the editor's
  -- upload form is what puts one there. Until then the card shows the initial, which is a
  -- finished look rather than a placeholder.
  NULL, 2, 52.3, 43.6,
  '+48 576 925 110', 'hello@onlymaxon.com', 'https://onlymaxon.com',
  'studio', 1, 1761000000, 1761000000
);

-- Prices as they stand on the site. These were out of step with /product/ — the card said
-- an online shop was €690, which is the booking-site price — so they are written here from
-- build/translations.js rather than from the old profiles.json.
INSERT OR IGNORE INTO card_services (card_id, position, name, price) VALUES
  ('card-max', 0, 'Сайт',                  'от €390'),
  ('card-max', 1, 'Сайт с онлайн-записью', 'от €690'),
  ('card-max', 2, 'Интернет-магазин',      'от €1090'),
  ('card-max', 3, 'Приложение',            'от €1400'),
  ('card-max', 4, 'SEO / ASO',             'от €200/мес');

INSERT OR IGNORE INTO card_links (card_id, position, label, url) VALUES
  ('card-max', 0, 'onlymaxon.com', 'https://onlymaxon.com');
