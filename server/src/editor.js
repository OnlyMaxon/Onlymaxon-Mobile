/*
 * The screens behind sign-in: ask for a link, the list of your cards, and the form that
 * edits one.
 *
 * The form posts as a normal <form>, and every field it submits is read on the server.
 * There is no API and no JSON: the only JavaScript on the page adds and removes rows in
 * the two repeating lists, and with it switched off the form still saves — it just cannot
 * grow a sixth service. For a page whose whole job is to let a non-technical owner change
 * a phone number from a bus, that is the right trade.
 */

import { esc, escAttr, shell, ACCENTS, LANGS } from './html.js';

const LIMITS = {
  name: 60, role: 70, location: 70, bio: 240,
  phone: 30, email: 180, website: 200,
  srvName: 48, srvPrice: 24, linkLabel: 40, linkUrl: 200,
  services: 8, links: 6,
};
export { LIMITS };

const nav = (signedIn) => signedIn
  ? '<a class="btn btn2" href="/card/logout" style="padding:8px 14px;font-size:14px">Sign out</a>'
  : '';

// ── sign in ─────────────────────────────────────────────────────────────────

export function signInPage({ sent = false, error = '', email = '' } = {}) {
  const msg = sent
    ? `<p class="ok">Check your inbox — the link works once and expires in 15 minutes.</p>`
    : error ? `<p class="bad">${esc(error)}</p>` : '';

  return shell('Your card', `
<h1>Edit your card</h1>
<p class="lede">Type the email address your card is registered to. We send you a link —
no password to invent and none to forget.</p>
<form method="post" action="/card/login">
  <div class="row">
    <label for="email">Email</label>
    <input id="email" name="email" type="email" autocomplete="email" required
           inputmode="email" value="${escAttr(email)}" placeholder="you@example.com">
  </div>
  <button class="btn" type="submit">Send me the link</button>
  ${msg}
</form>
<p class="note">Bought a card and never set it up? Use the address you ordered with —
the first sign-in creates the account.</p>
`, { nav: nav(false) });
}

export function linkSentPage() {
  return shell('Check your email', `
<h1>Check your email</h1>
<p class="lede">We sent a sign-in link. It works once and expires in 15 minutes.</p>
<p class="note">Nothing arrived? Look in spam, then
<a href="/card/">ask for another one</a>. If the address has no card yet, the link still
works — signing in creates the account.</p>
`, { nav: nav(false) });
}

// ── the list ────────────────────────────────────────────────────────────────

export function listPage(account, cards, stats) {
  const rows = cards.length ? cards.map(c => {
    const s = stats[c.id] || { total: 0, this_month: 0 };
    const state = c.published
      ? `<span style="color:var(--ok)">live</span>`
      : `<span style="color:var(--mut)">not published</span>`;
    return `
<div class="card">
  <h3>${esc(c.name)}</h3>
  <p class="muted">onlymaxon.com/u/${esc(c.slug)} · ${state}</p>
  <p class="muted" style="margin-top:6px">${s.this_month} taps this month · ${s.total} all time</p>
  <div class="bar" style="margin-top:14px">
    <a class="btn" href="/card/edit/${escAttr(c.id)}" style="padding:9px 16px;font-size:14px">Edit</a>
    <a class="btn btn2" href="/u/${escAttr(c.slug)}" style="padding:9px 16px;font-size:14px"
       target="_blank" rel="noopener">Open card</a>
  </div>
</div>`;
  }).join('') : `
<div class="card">
  <p class="muted">No cards on this account yet. When we write your chip we add it here —
  or ask us and we will attach an existing one.</p>
</div>`;

  return shell('Your cards', `
<h1>Your cards</h1>
<p class="lede">Signed in as ${esc(account.email)}.</p>
${rows}
`, { nav: nav(true) });
}

// ── the editor ──────────────────────────────────────────────────────────────

const field = (id, label, value, { type = 'text', hint = '', max = 120, ...a } = {}) => `
<div class="row">
  <label for="${id}">${esc(label)}</label>
  <input id="${id}" name="${id}" type="${type}" maxlength="${max}" value="${escAttr(value)}"
         ${Object.entries(a).map(([k, v]) => `${k}="${escAttr(v)}"`).join(' ')}>
  ${hint ? `<p class="note">${esc(hint)}</p>` : ''}
</div>`;

export function editPage(card, services, links, stats, { saved = false, error = '' } = {}) {
  const accentChips = Object.entries(ACCENTS).map(([key, c]) => `
      <label class="chip">
        <input type="radio" name="accent" value="${key}"${card.accent === key ? ' checked' : ''}>
        <span><i class="sw" style="background:linear-gradient(135deg,${c.a},${c.d})"></i>${key}</span>
      </label>`).join('');

  const langChips = LANGS.map(l => `
      <label class="chip">
        <input type="radio" name="lang" value="${l}"${card.lang === l ? ' checked' : ''}>
        <span>${l.toUpperCase()}</span>
      </label>`).join('');

  const srvRows = (services.length ? services : [{ name: '', price: '' }]).map(s => `
      <div class="pair">
        <input name="srv_name" maxlength="${LIMITS.srvName}" value="${escAttr(s.name)}" placeholder="Service">
        <input name="srv_price" maxlength="${LIMITS.srvPrice}" value="${escAttr(s.price)}" placeholder="€90">
        <button class="x" type="button" data-drop aria-label="Remove">×</button>
      </div>`).join('');

  const lnkRows = (links.length ? links : [{ label: '', url: '' }]).map(l => `
      <div class="pair">
        <input name="link_label" maxlength="${LIMITS.linkLabel}" value="${escAttr(l.label)}" placeholder="Instagram">
        <input name="link_url" maxlength="${LIMITS.linkUrl}" value="${escAttr(l.url)}" placeholder="https://…" inputmode="url">
        <button class="x" type="button" data-drop aria-label="Remove">×</button>
      </div>`).join('');

  const msg = saved ? `<p class="ok">Saved. The next tap shows it.</p>`
            : error ? `<p class="bad">${esc(error)}</p>` : '';

  const photo = card.photo_key
    ? `<img src="/u/${escAttr(card.slug)}/photo" alt="" width="64" height="64"
            style="width:64px;height:64px;border-radius:50%;object-fit:cover;border:1px solid var(--line)">`
    : `<span class="muted">No photo — the card shows the first letter of the name, which
         is a finished look, not a placeholder.</span>`;

  return shell(card.name || 'Card', `
<h1>${esc(card.name || 'Your card')}</h1>
<p class="lede">onlymaxon.com/u/${esc(card.slug)} ·
  ${stats.this_month} taps this month ·
  <a href="/u/${escAttr(card.slug)}" target="_blank" rel="noopener">open it</a></p>
${msg}

<form method="post" action="/card/edit/${escAttr(card.id)}">
  ${field('name', 'Name', card.name, { max: LIMITS.name, required: 'required' })}
  ${field('role', 'What you do', card.role, { max: LIMITS.role, placeholder: 'Photographer · London' })}
  ${field('location', 'Where', card.location || '', { max: LIMITS.location })}

  <div class="row">
    <label for="bio">About</label>
    <textarea id="bio" name="bio" maxlength="${LIMITS.bio}"
      placeholder="One or two sentences. Longer than that stops being a card.">${esc(card.bio || '')}</textarea>
  </div>

  <div class="two">
    ${field('phone', 'Phone', card.phone || '', { type: 'tel', max: LIMITS.phone, placeholder: '+48 576 925 110', hint: 'International, starting with +' })}
    ${field('email', 'Email', card.email || '', { type: 'email', max: LIMITS.email })}
  </div>
  ${field('website', 'Website', card.website || '', { type: 'url', max: LIMITS.website, placeholder: 'https://…' })}

  <h2>Services</h2>
  <div class="rows" data-list data-max="${LIMITS.services}">${srvRows}</div>
  <button class="btn btn2" type="button" data-add style="margin-top:10px;padding:9px 15px;font-size:14px">Add a service</button>

  <h2>Links</h2>
  <div class="rows" data-list data-max="${LIMITS.links}">${lnkRows}</div>
  <button class="btn btn2" type="button" data-add style="margin-top:10px;padding:9px 15px;font-size:14px">Add a link</button>

  <h2>Colour</h2>
  <div class="chips">${accentChips}</div>

  <h2>Button language</h2>
  <div class="chips">${langChips}</div>
  <p class="note">Only the three buttons are translated — everything you type above shows
  exactly as you wrote it.</p>

  <h2>Published</h2>
  <label class="chip" style="display:inline-block">
    <input type="checkbox" name="published" value="1"${card.published ? ' checked' : ''}>
    <span>Card is live</span>
  </label>
  <p class="note">Switch this off and a tap shows a short holding page instead of a
  half-filled card.</p>

  <div class="bar">
    <button class="btn" type="submit">Save</button>
    <a class="btn btn2" href="/card/">Back</a>
  </div>
</form>

<h2>Photo</h2>
<div class="card">
  <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">${photo}</div>
  <form method="post" action="/card/photo/${escAttr(card.id)}" enctype="multipart/form-data"
        style="margin-top:14px">
    <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" required>
    <div class="two" style="margin-top:12px">
      <div><label for="photo_scale">Zoom</label>
        <input id="photo_scale" name="photo_scale" type="number" step="0.1" min="1" max="4"
               value="${escAttr(card.photo_scale)}"></div>
      <div><label for="photo_x">Centre X / Y %</label>
        <div class="two">
          <input id="photo_x" name="photo_x" type="number" step="0.1" min="0" max="100" value="${escAttr(card.photo_x)}">
          <input id="photo_y" name="photo_y" type="number" step="0.1" min="0" max="100" value="${escAttr(card.photo_y)}">
        </div></div>
    </div>
    <p class="note">Square, under 2 MB. A logo usually sits in its own padding and wants a
    zoom of around 2; a face wants 1.</p>
    <button class="btn btn2" type="submit" style="margin-top:12px">Upload photo</button>
  </form>
</div>

<script>
// The only script on this page: add and remove rows. Everything else is a plain form post,
// so with JS off the card still saves — it just cannot grow a new row.
document.querySelectorAll('[data-add]').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var list = btn.previousElementSibling;
    var max = +list.dataset.max;
    if (list.children.length >= max) { btn.disabled = true; return; }
    var row = list.children[0].cloneNode(true);
    row.querySelectorAll('input').forEach(function (i) { i.value = ''; });
    list.appendChild(row);
    if (list.children.length >= max) btn.disabled = true;
  });
});
document.addEventListener('click', function (e) {
  var x = e.target.closest('[data-drop]');
  if (!x) return;
  var list = x.closest('[data-list]');
  // Never remove the last row: an empty list has nothing to clone when Add is pressed,
  // and a blank row is dropped on save anyway.
  if (list.children.length > 1) x.closest('.pair').remove();
  else x.closest('.pair').querySelectorAll('input').forEach(function (i) { i.value = ''; });
  var add = list.nextElementSibling;
  if (add && add.hasAttribute('data-add')) add.disabled = false;
});
</script>
`, { nav: nav(true) });
}
