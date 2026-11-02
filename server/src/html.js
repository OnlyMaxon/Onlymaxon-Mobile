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

export const html = (body, status = 200, extra = {}) => new Response(body, {
  status,
  headers: {
    'content-type': 'text/html; charset=utf-8',
    // The editor holds somebody's contact details; no proxy or CDN should keep a copy.
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    ...extra,
  },
});

export const redirect = (to, extra = {}) =>
  new Response(null, { status: 302, headers: { location: to, 'cache-control': 'no-store', ...extra } });

/*
 * The editor's chrome. Dark, the studio's palette, no webfont — the system stack draws
 * instantly and this is a tool, not a showcase.
 */
export function shell(title, body, { nav = '' } = {}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · OnlyMaxon</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="/favicon.ico" sizes="any">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#06080C;--bg2:#0B0F16;--bg3:#121824;--line:rgba(255,255,255,.08);
      --a:#22D3EE;--ink:#EAF2F6;--mut:#93A6B2;--bad:#FF8A8A;--ok:#34D399}
html{color-scheme:dark;-webkit-text-size-adjust:100%;background:var(--bg)}
body{background:var(--bg);color:var(--ink);min-height:100vh;
     font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;
     font-size:15px;line-height:1.55}
a{color:var(--a)}
header{border-bottom:1px solid var(--line);padding:16px 0;position:sticky;top:0;
       background:rgba(6,8,12,.92);backdrop-filter:blur(8px);z-index:10}
.wrap{max-width:720px;margin:0 auto;padding:0 20px;width:100%}
.hd{display:flex;align-items:center;justify-content:space-between;gap:14px}
.brand{font-weight:700;font-size:17px;letter-spacing:-.3px;color:var(--ink);text-decoration:none}
.brand span{color:var(--a)}
main{padding:30px 0 70px}
h1{font-size:25px;font-weight:700;letter-spacing:-.4px;margin-bottom:6px}
h2{font-size:15px;font-weight:700;margin:26px 0 10px;letter-spacing:.2px}
.lede{color:var(--mut);margin-bottom:22px}
label{display:block;font-size:12px;font-weight:700;color:var(--mut);
      letter-spacing:.5px;text-transform:uppercase;margin:0 0 6px}
input,select,textarea{width:100%;background:var(--bg3);border:1px solid var(--line);
      border-radius:10px;color:var(--ink);font:inherit;padding:11px 13px}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--a)}
textarea{min-height:84px;resize:vertical}
.row{margin-bottom:15px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:13px}
@media(max-width:560px){.two{grid-template-columns:1fr}}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;
     padding:12px 20px;border:0;border-radius:11px;font:inherit;font-weight:700;
     background:linear-gradient(135deg,#22D3EE,#2C8A9C);color:#04141A;
     cursor:pointer;text-decoration:none}
.btn:disabled{opacity:.55;cursor:default}
.btn2{background:none;border:1px solid var(--line);color:var(--ink)}
.btn3{background:none;border:1px solid rgba(255,138,138,.35);color:var(--bad)}
.card{background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:13px}
.card h3{font-size:17px;font-weight:700;margin-bottom:2px}
.muted{color:var(--mut);font-size:13px}
.note{color:var(--mut);font-size:13px;margin-top:8px}
.bad{color:var(--bad);font-size:14px;margin-top:10px}
.ok{color:var(--ok);font-size:14px;margin-top:10px}
.rows{display:flex;flex-direction:column;gap:9px}
.pair{display:grid;grid-template-columns:1fr 150px 42px;gap:9px;align-items:center}
@media(max-width:560px){.pair{grid-template-columns:1fr 110px 42px}}
.x{background:none;border:1px solid var(--line);color:var(--mut);border-radius:9px;
   height:42px;cursor:pointer;font-size:17px;line-height:1}
.x:hover{color:var(--bad);border-color:rgba(255,138,138,.35)}
.bar{display:flex;gap:11px;align-items:center;flex-wrap:wrap;margin-top:24px}
.chips{display:flex;gap:9px;flex-wrap:wrap}
.chip{position:relative}
.chip input{position:absolute;opacity:0;width:0;height:0}
.chip span{display:block;padding:8px 14px;border:1px solid var(--line);border-radius:999px;
           font-size:13px;font-weight:600;cursor:pointer}
.chip input:checked+span{border-color:var(--a);color:var(--a)}
.chip input:focus-visible+span{outline:2px solid var(--a);outline-offset:2px}
.sw{display:inline-block;width:13px;height:13px;border-radius:50%;margin-right:7px;vertical-align:-1px}
</style>
</head>
<body>
<header><div class="wrap hd">
  <a class="brand" href="/card/">OnlyMaxon<span>.</span></a>
  <div>${nav}</div>
</div></header>
<main><div class="wrap">
${body}
</div></main>
</body>
</html>`;
}
