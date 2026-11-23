/*
 * Escaping, and the shell every editor page is poured into.
 *
 * The public card page does NOT use this shell — it has its own, in render.js, because the
 * two have opposite jobs: the card is opened by a stranger on mobile data and must be as
 * small as it can be, the editor is opened by somebody who has already signed in and can
 * afford a layout.
 */

export const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const escAttr = s => esc(s).replace(/"/g, '&quot;');

// tel: wants no spaces. Everywhere a human reads the number it keeps them.
export const dial = s => String(s || '').replace(/[^\d+]/g, '');

export const initials = name =>
  String(name).trim().split(/\s+/).slice(0, 2).map(w => [...w][0] || '').join('').toUpperCase();

// #22D3EE → "34,211,238", so one accent can also be used at low opacity without a second
// colour having to be picked and kept in step with it.
export const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(',');

/*
 * The colourways a card can wear. The first four were lifted from build/profiles.js so a
 * card rendered here is pixel-identical to one the static generator used to write;
 * "studio" is the site's own palette, and the rest exist because a barber's card should be
 * able to carry the barber's colour rather than ours.
 *
 * `graphite` is the one that is not a colour. People who have held the plastic say the same
 * thing about it — that it is black and says nothing, and that this is the point — so there
 * is a page to match: near-white on near-black, no tint anywhere.
 *
 * The app offers this list in src/cards.ts and saves nothing that is not in it; a name
 * added on one side and not the other falls back to studio rather than rendering blank.
 */
export const ACCENTS = {
  studio: { a: '#22D3EE', d: '#2C8A9C', on: '#04141A', s1: '#06080C', s2: '#0B0F16', ink: '#EAF2F6', mut: '#93A6B2' },
  amber:  { a: '#E7B45A', d: '#C8922F', on: '#1a1509', s1: '#100E0A', s2: '#1A150E', ink: '#F4EEE4', mut: '#B0A493' },
  rose:   { a: '#E9A5BC', d: '#C0687F', on: '#1e0d13', s1: '#120A0E', s2: '#1C1016', ink: '#F6EAEF', mut: '#B39AA3' },
  cyan:   { a: '#7FE9F0', d: '#2C8A9C', on: '#04141A', s1: '#08111A', s2: '#0D1A24', ink: '#E6F4F7', mut: '#93AAB3' },
  emerald:  { a: '#6EE7B7', d: '#2F8F6B', on: '#04170F', s1: '#06100C', s2: '#0B1A14', ink: '#E6F6EF', mut: '#93B3A5' },
  violet:   { a: '#C4A7FF', d: '#6D4FB8', on: '#130A24', s1: '#0A0812', s2: '#13101E', ink: '#EFEAF8', mut: '#A79BB8' },
  coral:    { a: '#FF9E7A', d: '#C9693F', on: '#1C0D06', s1: '#120A08', s2: '#1C110D', ink: '#F7EBE6', mut: '#B59C92' },
  graphite: { a: '#D7E0E6', d: '#8A9AA5', on: '#0A0E12', s1: '#07090B', s2: '#0F1216', ink: '#ECF1F4', mut: '#9AA7B0' },
};

export const LANGS = ['en', 'pl', 'ru', 'tr', 'es'];
