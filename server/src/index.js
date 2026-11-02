/*
 * onlymaxon.com/u/*  and  onlymaxon.com/card/*
 *
 * Two halves of one product:
 *
 *   /u/<slug>    what a stranger sees when they tap the card. Rendered here, at the edge,
 *                from a row in D1 — so an owner's edit is live on the next tap and there
 *                is no build step between the two.
 *   /card/       where the owner signs in and edits it.
 *
 * Everything else on the domain is still the static site on Pages: this Worker is bound to
 * those two path prefixes and nothing else, so the fourteen-page × five-language site it
 * sits next to is not affected by anything in here.
 *
 * WHY A WORKER AND NOT A PAGE THAT FETCHES ITS DATA. The whole product is the second and a
 * half after somebody touches a card to a phone. A page that loads and then asks a database
 * what to draw spends that second and a half showing nothing, on the worst connection any
 * page of this site will ever see. Here the HTML arrives finished, from whichever
 * Cloudflare city the person is standing in.
 *
 * SET-UP, in full, is in card/README.md.
 */

import { html, redirect, escAttr, ACCENTS, LANGS } from './html.js';
import { cardPage, holdingPage, vcard } from './render.js';
import { signInPage, linkSentPage, listPage, editPage, LIMITS } from './editor.js';
import {
  accountGetOrCreate, cardBySlug, cardCreate, cardsOf, cardOwnedBy, cardSave, cardSetPhoto,
  servicesOf, linksOf, tapRecord, tapStats,
} from './db.js';
import {
  requestLink, completeLink, currentAccount, signOut, sessionCookie, isEmail,
} from './auth.js';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}$/;

const notFound = () => new Response('Not found', {
  status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
});

/*
 * A POST is only honoured if the browser says it came from this site. SameSite=Lax already
 * means the session cookie is not sent on a cross-site POST, so this is the second lock on
 * the same door — cheap, and it does not depend on a cookie attribute staying supported.
 */
function sameOrigin(request, url) {
  const origin = request.headers.get('origin');
  if (origin) return origin === url.origin;
  // Some browsers omit Origin on same-origin form posts; fall back to Referer.
  const ref = request.headers.get('referer');
  return !!ref && ref.startsWith(url.origin + '/');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/u' || path.startsWith('/u/')) return await publicCard(request, env, ctx, url);
      // Before editorRoutes, which rejects any POST without a same-origin header — this one
      // comes from a phone app, not a browser form, and carries a key instead.
      if (path === '/card/api/cards') return await apiCreateCard(request, env);
      if (path === '/card' || path.startsWith('/card/')) return await editorRoutes(request, env, url);
      return notFound();
    } catch (e) {
      // Never leak a stack to a visitor standing in the street holding somebody's card.
      console.log('unhandled', e && (e.stack || e.message));
      return new Response('Something went wrong.', {
        status: 500, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
      });
    }
  },
};

// ── provisioning ────────────────────────────────────────────────────────────

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

/*
 * Compared the slow way on purpose. A normal === returns the moment two strings differ,
 * and the time that takes is a measurement of how many leading characters were right —
 * enough, over many tries, to recover a key one character at a time.
 */
function keyMatches(given, expected) {
  if (typeof given !== 'string' || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/*
 * POST /card/api/cards — the only way a card comes into existence.
 *
 * Called by the phone app at the moment a chip is written, with the client's email, because
 * that is the one moment when the card is physically in somebody's hand and the person it
 * belongs to is standing there. The alternative — letting whoever taps an unclaimed card
 * first become its owner — hands the card to whoever picks it up off a table.
 *
 * The card is created unpublished. Its owner fills it in and publishes it themselves; until
 * then a tap shows the holding page, which is a finished thing to look at rather than a
 * half-empty profile.
 *
 * Authorised by a key rather than a session: there is no browser here to hold a cookie, and
 * no human to click a link in an inbox while standing at the bench. The key lives in the
 * phone keychain and in `wrangler secret`, nowhere else. It can create cards and do nothing
 * else — it cannot read one, edit one, or sign anybody in.
 */
async function apiCreateCard(request, env) {
  if (request.method !== 'POST') return json({ error: 'method-not-allowed' }, 405);
  // A missing key means the Worker was deployed without one. Refusing loudly beats
  // accepting every request from the open internet.
  if (!env.PROVISION_KEY) return json({ error: 'not-configured' }, 503);
  if (!keyMatches(request.headers.get('authorization') || '', `Bearer ${env.PROVISION_KEY}`))
    return json({ error: 'unauthorized' }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad-json' }, 400);
  }

  const slug = String(body?.slug ?? '').trim().toLowerCase();
  const email = String(body?.email ?? '').trim();
  const name = String(body?.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);

  // The same rule the app enforces before it writes a chip. Both have to agree, or a card
  // gets printed and posted carrying an address this server will never serve.
  if (!SLUG_RE.test(slug)) return json({ error: 'bad-slug' }, 400);
  if (!isEmail(email)) return json({ error: 'bad-email' }, 400);

  // A slug is printed on plastic and cannot be reissued, so handing the same one to two
  // people has no fix. Checked before the account is touched.
  if (await cardBySlug(env.DB, slug)) return json({ error: 'slug-taken' }, 409);

  const account = await accountGetOrCreate(env.DB, email);
  const id = await cardCreate(env.DB, account.id, slug, name || slug);

  return json({ ok: true, id, slug, url: `https://onlymaxon.com/u/${slug}` }, 201);
}

// ── /u/<slug> ───────────────────────────────────────────────────────────────

async function publicCard(request, env, ctx, url) {
  // /u/max, /u/max/, /u/max/contact.vcf, /u/max/photo — and nothing else.
  const parts = url.pathname.split('/').filter(Boolean);   // ['u', slug, tail?]
  const slug = (parts[1] || '').toLowerCase();
  const tail = parts[2] || '';
  if (!SLUG_RE.test(slug) || parts.length > 3) return notFound();

  const card = await cardBySlug(env.DB, slug);
  if (!card) return notFound();

  if (tail === 'photo') return photoResponse(env, card);

  if (tail === 'contact.vcf') {
    if (!card.published) return notFound();
    return new Response(vcard(card), {
      headers: {
        // The charset is the whole point of serving this from a Worker rather than as a
        // file: a text/* type with no charset is ASCII by the letter of the spec, which is
        // how a Polish ł or a Turkish ğ in somebody's NAME turns into rubbish on a phone.
        'content-type': 'text/vcard; charset=utf-8',
        'content-disposition': `attachment; filename="${slug}.vcf"`,
        'cache-control': 'no-store',
      },
    });
  }

  if (tail) return notFound();

  if (!card.published) return html(holdingPage(slug, card.lang));

  const [services, links] = await Promise.all([
    servicesOf(env.DB, card.id),
    linksOf(env.DB, card.id),
  ]);

  // After the response, never before it. Counting a tap is bookkeeping and must not sit
  // between the person and their page.
  ctx.waitUntil(tapRecord(env.DB, card.id).catch(e => console.log('tap', e && e.message)));

  return html(cardPage(card, services, links));
}

/*
 * The photo, streamed from a private R2 bucket. Private on purpose: a public bucket means
 * a second URL for the same image that nobody controls, outlives the card and cannot be
 * taken down when a client asks for their face to be removed.
 *
 * This is the one response here that may be cached — an image under a content-addressed
 * key never changes, and a new upload writes a new key.
 */
async function photoResponse(env, card) {
  if (!card.photo_key) return notFound();
  // The bucket binding is optional — see the note on it in wrangler.toml. A card without a
  // photo shows its owner's initial, which is a finished look rather than a hole, so the
  // whole product works with R2 switched off.
  if (!env.PHOTOS) return notFound();
  const obj = await env.PHOTOS.get(card.photo_key);
  if (!obj) return notFound();
  const h = new Headers();
  obj.writeHttpMetadata(h);
  h.set('cache-control', 'public, max-age=31536000, immutable');
  h.set('etag', obj.httpEtag);
  return new Response(obj.body, { headers: h });
}

// ── /card/* ─────────────────────────────────────────────────────────────────

async function editorRoutes(request, env, url) {
  const parts = url.pathname.split('/').filter(Boolean);   // ['card', ...]
  const section = parts[1] || '';
  const arg = parts[2] || '';
  const post = request.method === 'POST';

  if (post && !sameOrigin(request, url))
    return html(signInPage({ error: 'That request did not come from this site.' }), 403);

  // ── sign in ──
  if (section === 'login' && post) {
    const form = await request.formData();
    const email = String(form.get('email') || '');
    if (!isEmail(email)) return html(signInPage({ error: 'That does not look like an email address.', email }), 400);

    const r = await requestLink(env, email, url.origin);
    if (!r.ok && r.reason === 'too-many')
      return html(signInPage({ email, error: 'Too many links asked for in the last hour. Try again later.' }), 429);
    if (!r.ok)
      return html(signInPage({ email, error: 'We could not send the email just now. Write to hello@onlymaxon.com and we will sort it.' }), 502);
    return html(linkSentPage());
  }

  if (section === 'auth') {
    const r = await completeLink(env, url.searchParams.get('t'));
    if (!r) return html(signInPage({ error: 'That link has been used already, or it expired. Here is a fresh one.' }), 400);
    return redirect('/card/', { 'set-cookie': sessionCookie(r.sid) });
  }

  if (section === 'logout') {
    await signOut(env, request);
    return redirect('/card/', { 'set-cookie': sessionCookie('', { clear: true }) });
  }

  // ── everything below needs an account ──
  const account = await currentAccount(env, request);
  if (!account) {
    if (section === '' ) return html(signInPage());
    return redirect('/card/');
  }

  if (section === '') {
    const cards = await cardsOf(env.DB, account.id);
    const stats = {};
    for (const c of cards) stats[c.id] = await tapStats(env.DB, c.id);
    return html(listPage(account, cards, stats));
  }

  if (section === 'edit' && arg) {
    const card = await cardOwnedBy(env.DB, arg, account.id);
    // Same 404 whether the card does not exist or belongs to somebody else — the
    // difference between those two answers is itself information.
    if (!card) return notFound();

    if (post) return saveCard(request, env, card);

    const [services, links, stats] = await Promise.all([
      servicesOf(env.DB, card.id), linksOf(env.DB, card.id), tapStats(env.DB, card.id),
    ]);
    const saved = url.searchParams.get('saved') === '1';
    return html(editPage(card, services, links, stats, { saved }));
  }

  if (section === 'photo' && arg && post) {
    const card = await cardOwnedBy(env.DB, arg, account.id);
    if (!card) return notFound();
    return uploadPhoto(request, env, card);
  }

  return notFound();
}

// ── saving ──────────────────────────────────────────────────────────────────

const trim = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/*
 * Validation is here and nowhere else. The maxlength attributes in the form are a courtesy
 * to whoever is typing; this is the rule. Anything that arrives wrong is corrected rather
 * than rejected wherever correcting it is unambiguous — an owner editing their card on a
 * bus should not lose the paragraph they just wrote to a complaint about a trailing space.
 */
function readFields(form) {
  const lang = String(form.get('lang') || 'en');
  const accent = String(form.get('accent') || 'studio');
  const num = (key, dflt, lo, hi) => {
    const n = parseFloat(form.get(key));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
  };

  const f = {
    lang: LANGS.includes(lang) ? lang : 'en',
    accent: ACCENTS[accent] ? accent : 'studio',
    name: trim(form.get('name'), LIMITS.name),
    role: trim(form.get('role'), LIMITS.role),
    location: trim(form.get('location'), LIMITS.location) || null,
    // The one field where newlines survive: a bio is prose.
    bio: String(form.get('bio') ?? '').trim().slice(0, LIMITS.bio) || null,
    phone: trim(form.get('phone'), LIMITS.phone) || null,
    email: trim(form.get('email'), LIMITS.email).toLowerCase() || null,
    website: trim(form.get('website'), LIMITS.website) || null,
    published: form.get('published') === '1',
    photo_scale: num('photo_scale', 1, 1, 4),
    photo_x: num('photo_x', 50, 0, 100),
    photo_y: num('photo_y', 50, 0, 100),
  };

  const errors = [];
  if (!f.name) errors.push('A card needs a name.');
  // Not a full phone-number parser — just enough to catch the thing that actually breaks:
  // a number with no country code dials nothing from abroad, which is where half the
  // people tapping a card are.
  if (f.phone && !/^\+\d[\d ()-]{5,}$/.test(f.phone))
    errors.push('The phone number has to be international and start with + — for example +48 576 925 110.');
  if (f.email && !isEmail(f.email)) errors.push('That email address does not look right.');
  if (f.website) {
    if (!/^https?:\/\//i.test(f.website)) f.website = 'https://' + f.website;
    try { new URL(f.website); } catch { errors.push('That website address does not look right.'); }
  }
  // A card with neither a phone nor an email has two of its three buttons missing and
  // nothing for the vCard to carry — which is not an edit anybody meant to make.
  if (f.published && !f.phone && !f.email)
    errors.push('A published card needs at least a phone number or an email — otherwise there is nothing to tap.');

  return { f, errors };
}

function readPairs(form, aKey, bKey, aMax, bMax, max, validate) {
  const as = form.getAll(aKey), bs = form.getAll(bKey);
  const out = [];
  for (let i = 0; i < as.length && out.length < max; i++) {
    const a = trim(as[i], aMax), b = trim(bs[i], bMax);
    if (!a && !b) continue;             // a blank row is how the form says "nothing here"
    if (!a || !b) continue;             // half a row would render as a dangling label
    if (validate && !validate(a, b)) continue;
    out.push([a, b]);
  }
  return out;
}

async function saveCard(request, env, card) {
  const form = await request.formData();
  const { f, errors } = readFields(form);

  const services = readPairs(form, 'srv_name', 'srv_price',
    LIMITS.srvName, LIMITS.srvPrice, LIMITS.services)
    .map(([name, price]) => ({ name, price }));

  // A link row is dropped rather than rejected if its URL is not a URL: the alternative is
  // refusing to save a whole card because one of six links has a typo in it.
  const links = readPairs(form, 'link_label', 'link_url',
    LIMITS.linkLabel, LIMITS.linkUrl, LIMITS.links,
    (label, u) => { try { const x = new URL(/^https?:\/\//i.test(u) ? u : 'https://' + u);
                          return x.protocol === 'http:' || x.protocol === 'https:'; }
                    catch { return false; } })
    .map(([label, u]) => ({ label, url: /^https?:\/\//i.test(u) ? u : 'https://' + u }));

  if (errors.length) {
    const stats = await tapStats(env.DB, card.id);
    // Re-render with what they typed, not with what is in the database — losing an edit to
    // an error message is the fastest way to make somebody stop using a tool.
    const shown = { ...card, ...f, published: f.published ? 1 : 0 };
    return html(editPage(shown, services, links, stats, { error: errors.join(' ') }), 400);
  }

  await cardSave(env.DB, card.id, f, services, links);
  // Redirect after post, so a refresh does not save again.
  return redirect(`/card/edit/${card.id}?saved=1`);
}

// ── photo upload ────────────────────────────────────────────────────────────

const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_PHOTO = 2 * 1024 * 1024;

async function uploadPhoto(request, env, card) {
  const form = await request.formData();
  const file = form.get('photo');

  const reshow = async (error) => {
    const [services, links, stats] = await Promise.all([
      servicesOf(env.DB, card.id), linksOf(env.DB, card.id), tapStats(env.DB, card.id),
    ]);
    return html(editPage(card, services, links, stats, { error }), 400);
  };

  if (!env.PHOTOS)
    return reshow('Photos are not switched on yet. Everything else works — a card without one shows its initial.');
  if (!file || typeof file === 'string') return reshow('No file arrived — try again.');
  const ext = TYPES[file.type];
  if (!ext) return reshow('That has to be a JPEG, a PNG or a WebP.');
  if (file.size > MAX_PHOTO) return reshow('That photo is over 2 MB. A card avatar is 82 pixels across — anything bigger is bytes nobody sees.');

  const bytes = new Uint8Array(await file.arrayBuffer());

  /*
   * The key is the content's own hash. Two consequences, both wanted: re-uploading the same
   * image writes the same key instead of growing the bucket, and a new image is a new URL —
   * which is what lets the photo route set a one-year immutable cache without a client
   * wondering why their new face has not appeared.
   */
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = [...new Uint8Array(digest)].slice(0, 16)
    .map(b => b.toString(16).padStart(2, '0')).join('');
  const key = `cards/${card.id}/${hash}.${ext}`;

  await env.PHOTOS.put(key, bytes, { httpMetadata: { contentType: file.type } });

  // The old object is left where it is. Deleting it would be correct housekeeping and
  // wrong behaviour: an owner who swaps a photo and immediately wants the old one back has
  // no other copy, and a few kilobytes in R2 cost less than that phone call.
  await cardSetPhoto(env.DB, card.id, key);

  // The zoom and centring travel with the upload form, so one submit does both.
  const f = {
    ...card,
    photo_scale: Math.min(4, Math.max(1, parseFloat(form.get('photo_scale')) || 1)),
    photo_x: Math.min(100, Math.max(0, parseFloat(form.get('photo_x')) || 50)),
    photo_y: Math.min(100, Math.max(0, parseFloat(form.get('photo_y')) || 50)),
    published: !!card.published,
  };
  await cardSave(env.DB, card.id, f,
    await servicesOf(env.DB, card.id), await linksOf(env.DB, card.id));

  return redirect(`/card/edit/${card.id}?saved=1`);
}
