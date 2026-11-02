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
 * The four colourways a card can wear, lifted from build/profiles.js so a card rendered by
 * this Worker is pixel-identical to one the static generator used to write. "studio" is the
 * site's own palette; the other three exist because a barber's card should be able to carry
 * the barber's colour rather than ours.
 */
export const ACCENTS = {
  studio: { a: '#22D3EE', d: '#2C8A9C', on: '#04141A', s1: '#06080C', s2: '#0B0F16', ink: '#EAF2F6', mut: '#93A6B2' },
  amber:  { a: '#E7B45A', d: '#C8922F', on: '#1a1509', s1: '#100E0A', s2: '#1A150E', ink: '#F4EEE4', mut: '#B0A493' },
  rose:   { a: '#E9A5BC', d: '#C0687F', on: '#1e0d13', s1: '#120A0E', s2: '#1C1016', ink: '#F6EAEF', mut: '#B39AA3' },
  cyan:   { a: '#7FE9F0', d: '#2C8A9C', on: '#04141A', s1: '#08111A', s2: '#0D1A24', ink: '#E6F4F7', mut: '#93AAB3' },
};

export const LANGS = ['en', 'pl', 'ru', 'tr', 'es'];
