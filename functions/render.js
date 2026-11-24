/*
 * The page an NFC card opens, and the vCard its "save contact" button hands to the phone.
 *
 * This is a port of build/profiles.js: same markup, same stylesheet, same decisions. The
 * difference is only where the data comes from — a row in D1 instead of a line in
 * profiles.json — so a card that moves from the static generator to this Worker does not
 * change by a pixel. Keep the two in step until the static one is retired.
 *
 * Three things about this page that look like omissions and are not:
 *
 *   NO WEBFONT, NO SCRIPT, NO COMMENT IN THE OUTPUT. It is opened by somebody standing
 *   outside, holding a stranger's phone, on mobile data — the worst connection any page of
 *   this site will ever see. The system font stack draws instantly at any speed.
 *
 *   NOINDEX, FOLLOW. A directory of one-screen pages carrying other people's phone numbers
 *   is the textbook shape of thin content and Google would take that out on the whole
 *   domain. `follow` rather than `nofollow` because the credit link at the bottom is meant
 *   to count.
 *
 *   NO CACHE. The point of the product is that the owner edits the card and the next tap
 *   shows the change. A CDN holding yesterday's copy would be the one bug that destroys
 *   the whole promise, so this is `no-store` and the speed comes from rendering at the
 *   edge instead.
 */

import { esc, escAttr, dial, initials, rgb, ACCENTS } from './html.js';

/*
 * The cards live on their own hostname rather than under the site. The site is a static
 * build on GitHub Pages and the cards are rows in a database — one domain serving both
 * would mean one of them has to bend. A subdomain is one DNS record and nothing else
 * changes.
 */
const SITE = 'https://cards.onlymaxon.com';

/*
 * The studio's own site, which is a different host from this one.
 *
 * The credit at the bottom used to be href="/" — correct while a card lived at
 * onlymaxon.com/u/<slug>, where "/" was the studio's home page. On cards.onlymaxon.com
 * "/" is this function with no slug, so the link answered 404 to every visitor who
 * tapped it. Absolute now, and it cannot break again by moving hostname.
 */
const STUDIO = 'https://onlymaxon.com';

// The only translated strings on a card: everything else is typed by its owner.
const LABELS = {
  call:   { en: 'Call',         pl: 'Zadzwoń',        ru: 'Позвонить',          tr: 'Ara',           es: 'Llamar' },
  write:  { en: 'Message',      pl: 'Napisz',         ru: 'Написать',           tr: 'Yaz',           es: 'Escribir' },
  save:   { en: 'Save contact', pl: 'Zapisz kontakt', ru: 'Сохранить контакт',  tr: 'Kişiyi kaydet', es: 'Guardar contacto' },
  /* A heading for the list. Without it the prices read as a stray table between a bio and
     a pair of buttons, and one word costs nothing on a page this small. */
  srv:    { en: 'Services', pl: 'Usługi', ru: 'Услуги', tr: 'Hizmetler', es: 'Servicios' },
  credit: { en: 'Made by OnlyMaxon', pl: 'Zrobione przez OnlyMaxon', ru: 'Сделано в OnlyMaxon',
            tr: 'OnlyMaxon yapımı', es: 'Hecho por OnlyMaxon' },
  /*
   * The line that turns somebody else's business card into our shop window. Every tap of
   * every card opens this page on a stranger's phone, and this is the only thing on it that
   * says where the card came from — so it asks a question instead of stating a credit.
   */
  want:   { en: 'Want a card like this?', pl: 'Chcesz taką wizytówkę?', ru: 'Хочешь такую же карточку?',
            tr: 'Böyle bir kart ister misin?', es: '¿Quieres una tarjeta así?' },
  soon:   { en: 'This card is not set up yet.', pl: 'Ta karta nie jest jeszcze skonfigurowana.',
            ru: 'Эта карта ещё не настроена.', tr: 'Bu kart henüz hazır değil.',
            es: 'Esta tarjeta aún no está configurada.' },
  // The holding page is seen by two different people: whoever was handed the card, and
  // whoever picked it up off a table. It therefore says what to do without saying whose
  // card it is or which address it is waiting for.
  claim:  { en: 'Is this your card? Open the OnlyMaxon app to fill it in.',
            pl: 'To Twoja karta? Otwórz aplikację OnlyMaxon, aby ją wypełnić.',
            ru: 'Это ваша карта? Откройте приложение OnlyMaxon, чтобы заполнить её.',
            tr: 'Bu kart sizin mi? Doldurmak için OnlyMaxon uygulamasını açın.',
            es: '¿Es tu tarjeta? Abre la app OnlyMaxon para completarla.' },
};

const LANGS = ['en', 'pl', 'ru', 'tr', 'es'];
const L = (k, lang) => LABELS[k][LANGS.includes(lang) ? lang : 'en'];

/*
 * And in the card's own language, because the site has all five: English at the root, the
 * other four behind their own prefix. Somebody who taps a Polish card and wants to know
 * who made it should not land in Russian.
 */
const home = lang => (LANGS.includes(lang) && lang !== 'en' ? `${STUDIO}/${lang}/` : `${STUDIO}/`);

function css(c) {
  return `
*{margin:0;padding:0;box-sizing:border-box}
:root{--a:${c.a};--d:${c.d};--on:${c.on};--ink:${c.ink};--mut:${c.mut}}
html{-webkit-text-size-adjust:100%;color-scheme:dark;
background:linear-gradient(180deg,${c.s1},${c.s2}) ${c.s1} fixed}
body{min-height:100vh;padding:34px 20px 26px;
background:radial-gradient(60% 42% at 50% 6%,rgba(${rgb(c.a)},.14),transparent 72%);
color:var(--ink);
font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;
font-size:15px;line-height:1.5;text-align:center;
display:flex;align-items:center;justify-content:center}
.card{width:100%;max-width:400px}
.ava{width:82px;height:82px;border-radius:50%;margin:0 auto 16px;overflow:hidden;
background:linear-gradient(140deg,var(--a),var(--d));color:var(--on);
display:flex;align-items:center;justify-content:center;
font-size:34px;font-weight:700;letter-spacing:-.5px;
box-shadow:0 10px 30px rgba(${rgb(c.a)},.22)}
.ava.pic{background:${c.s1};box-shadow:0 10px 30px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.07)}
.ava img{width:100%;height:100%;object-fit:cover;display:block}
h1{font-size:27px;font-weight:700;letter-spacing:-.4px;line-height:1.15}
.role{color:var(--a);font-size:12px;font-weight:600;letter-spacing:.7px;text-transform:uppercase;margin-top:6px}
.loc{color:var(--mut);font-size:13px;margin-top:8px}
.bio{color:var(--mut);font-size:14px;margin-top:14px}
.srv-h{margin-top:26px;margin-bottom:9px;text-align:left;color:var(--mut);
font-size:10.5px;font-weight:600;letter-spacing:1.3px;text-transform:uppercase}
.srv{list-style:none;border:1px solid rgba(255,255,255,.08);border-radius:14px;
background:rgba(255,255,255,.03);overflow:hidden}
.srv li{display:flex;justify-content:space-between;align-items:center;gap:14px;
padding:13px 16px;font-size:14.5px;text-align:left;
border-bottom:1px solid rgba(255,255,255,.06)}
.srv li:last-child{border-bottom:none}
.srv b{color:var(--a);white-space:nowrap;font-weight:600}
.btns{margin-top:26px;display:flex;gap:10px}
.btn{flex:1;display:flex;align-items:center;justify-content:center;min-height:48px;
padding:12px 14px;border-radius:13px;font-size:15px;font-weight:600;
text-decoration:none;background:linear-gradient(135deg,var(--a),var(--d));color:var(--on);
box-shadow:0 6px 18px rgba(${rgb(c.a)},.18);transition:transform .12s ease}
.btn2{background:none;border:1px solid var(--a);color:var(--a);box-shadow:none}
.btn3{background:none;border:1px solid rgba(255,255,255,.14);color:var(--ink);box-shadow:none}
.btn:active{transform:scale(.975)}
.lnk{list-style:none;margin-top:14px;display:flex;flex-wrap:wrap;gap:9px;justify-content:center}
.lnk a{display:inline-flex;align-items:center;min-height:44px;padding:0 17px;
border-radius:999px;border:1px solid rgba(255,255,255,.13);
color:var(--ink);font-size:14px;text-decoration:none;
transition:border-color .15s ease,color .15s ease}
.sig{display:inline-flex;flex-direction:column;align-items:center;gap:3px;margin-top:34px;
padding:11px 18px;border:1px solid rgba(255,255,255,.14);border-radius:12px;text-decoration:none}
.sig b{color:var(--ink);font-size:13px;font-weight:500}
.sig span{color:var(--mut);font-size:10px;letter-spacing:1.1px;text-transform:uppercase}
.sig:hover,.sig:active{border-color:var(--a)}
.sig:hover b,.sig:active b{color:var(--a)}
.lnk a:hover,.lnk a:active{color:var(--a);border-color:var(--a)}
.soft{margin-top:18px;font-size:13px;opacity:.75}
@keyframes in{from{opacity:0;transform:translateY(9px)}to{opacity:1;transform:none}}
.card>*{animation:in .45s cubic-bezier(.2,.7,.3,1) both}
.card>*:nth-child(2){animation-delay:.05s}
.card>*:nth-child(3){animation-delay:.09s}
.card>*:nth-child(4){animation-delay:.13s}
.card>*:nth-child(5){animation-delay:.17s}
.card>*:nth-child(6){animation-delay:.21s}
.card>*:nth-child(7){animation-delay:.25s}
.card>*:nth-child(n+8){animation-delay:.29s}
@media(prefers-reduced-motion:reduce){.card>*{animation:none}.btn{transition:none}}
@media(min-width:520px){body{padding:56px 20px}h1{font-size:30px}}
`.replace(/\n\s*/g, '\n').trim();
}

/*
 * A photo, or the initial. The initial is not a placeholder waiting to be replaced — it is
 * what a card with no usable picture should ship with, and it looks deliberate.
 *
 * object-position cannot help here: a square image in a square box under object-fit:cover
 * has no overflow to reposition. So the centring is done in the transform, and it has to
 * happen BEFORE the scale — the rightmost function applies first — or the zoom multiplies
 * the offset instead of leaving it alone.
 */
function avatar(c) {
  if (!c.photoPath) return `<div class="ava" aria-hidden="true">${esc(initials(c.name))}</div>`;
  // Defaulted rather than read straight off the document. A card whose picture was set
  // before these fields existed has no photoX, and `50 - undefined` is NaN, which reaches
  // the page as `translate(NaN%,NaN%)` and takes the whole photo down with it.
  const num = (v, fallback) => (typeof v === 'number' && isFinite(v) ? v : fallback);
  const scale = num(c.photoScale, 1);
  const x = num(c.photoX, 50);
  const y = num(c.photoY, 50);
  const moves = [];
  if (scale !== 1) moves.push(`scale(${scale})`);
  if (x !== 50 || y !== 50)
    moves.push(`translate(${(50 - x).toFixed(1)}%,${(50 - y).toFixed(1)}%)`);
  const zoom = moves.length ? ` style="transform:${moves.join(' ')}"` : '';
  /*
   * The hash of the file rides in the query string, and that is what earns the `immutable`
   * the route sends back. Storage is content-addressed, but /<slug>/photo is not: without
   * this the address of the picture never changes, so anybody who had loaded the old one
   * would keep being shown it by their own browser for a year after it was replaced.
   */
  const v = c.photoPath.split('/').pop().replace(/\.[a-z]+$/i, '');
  return `<div class="ava pic"><img src="/${escAttr(c.slug)}/photo?v=${escAttr(v)}" ` +
         `alt="${escAttr(c.name)}" width="82" height="82"${zoom}></div>`;
}

export function cardPage(c, services, links) {
  const lang = LANGS.includes(c.lang) ? c.lang : 'en';
  const title = c.role ? `${c.name} — ${c.role}` : c.name;
  const desc = c.bio || title;
  const here = `${SITE}/${c.slug}`;
  const accent = ACCENTS[c.accent] || ACCENTS.studio;

  const srv = services.length ? `
    <p class="srv-h">${esc(L('srv', lang))}</p>
    <ul class="srv">
${services.map(s => `      <li><span>${esc(s.name)}</span><b>${esc(s.price)}</b></li>`).join('\n')}
    </ul>` : '';

  // The website has its own field in the editor and belonged nowhere on the page — it was
  // being typed in and then silently dropped. It goes first in the same row as the rest,
  // shown without the scheme because nobody reads "https://" on a business card.
  const allLinks = [
    ...(c.website
      ? [{
          label: c.website.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, ''),
          url: /^https?:\/\//i.test(c.website) ? c.website : `https://${c.website}`,
        }]
      : []),
    ...links,
  ];
  const lnk = allLinks.length ? `
    <ul class="lnk">
${allLinks.map(l => `      <li><a href="${escAttr(l.url)}" rel="noopener nofollow">${esc(l.label)}</a></li>`).join('\n')}
    </ul>` : '';

  // Every button is conditional. A card with no phone number should not show a Call button
  // that dials nothing — on a phone that is a dead end with no way back.
  const buttons = [
    c.phone ? `      <a class="btn" href="tel:${escAttr(dial(c.phone))}">${esc(L('call', lang))}</a>` : '',
    c.email ? `      <a class="btn btn2" href="mailto:${escAttr(c.email)}">${esc(L('write', lang))}</a>` : '',
  ].filter(Boolean).join('\n');

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${escAttr(desc)}">
<meta name="robots" content="noindex, follow">
<link rel="canonical" href="${here}">
<meta property="og:type" content="profile">
<meta property="og:title" content="${escAttr(title)}">
<meta property="og:description" content="${escAttr(desc)}">
<meta property="og:url" content="${here}">
<link rel="icon" href="/favicon.ico" sizes="any">
<style>
${css(accent)}
</style>
</head>
<body>
  <main class="card">
    ${avatar(c)}
    <h1>${esc(c.name)}</h1>
${c.role ? `    <p class="role">${esc(c.role)}</p>\n` : ''}${c.location ? `    <p class="loc">${esc(c.location)}</p>\n` : ''}${c.bio ? `    <p class="bio">${esc(c.bio)}</p>\n` : ''}${srv}
    <div class="btns">
${buttons}
    </div>${lnk}
    <a class="sig" href="${escAttr(home(lang))}"><b>${esc(L('want', lang))}</b><span>${esc(L('credit', lang))}</span></a>
  </main>
</body>
</html>
`;
}

/*
 * The page a card shows between being written to a chip and being filled in by its owner.
 * Deliberately not a 404: the card is real and the URL is correct, and a person who has
 * just tapped a brand-new card should be told it is early, not that it is broken.
 */
export function holdingPage(slug, lang = 'en') {
  const c = ACCENTS.studio;
  return `<!DOCTYPE html>
<html lang="${LANGS.includes(lang) ? lang : 'en'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OnlyMaxon</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="/favicon.ico" sizes="any">
<style>
${css(c)}
</style>
</head>
<body>
  <main class="card">
    <div class="ava" aria-hidden="true">·</div>
    <p class="bio">${esc(L('soon', lang))}</p>
    <p class="bio soft">${esc(L('claim', lang))}</p>
    <a class="sig" href="${escAttr(home(lang))}"><b>${esc(L('want', lang))}</b><span>${esc(L('credit', lang))}</span></a>
  </main>
</body>
</html>
`;
}
