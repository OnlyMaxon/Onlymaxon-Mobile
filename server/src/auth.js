/*
 * Sign-in: one link, by email, valid once, for fifteen minutes.
 *
 * WHY NO PASSWORD. The person signing in here sells haircuts or takes photographs. The
 * only thing behind this door is their own phone number — which is printed on the card in
 * their pocket and which they hand to strangers on purpose. Making them invent, remember
 * and reset a password protects nothing and loses people at every one of those three
 * steps. A one-time link also means this service stores no secret of theirs that could
 * leak: see login_tokens in schema.sql, which holds a hash and never the token.
 *
 * WHAT A STOLEN LINK GETS YOU. Fifteen minutes, one use, and only if the mailbox it was
 * sent to is already compromised — at which point a password would have been resettable
 * through that same mailbox anyway.
 */

import {
  accountGetOrCreate, tokenStore, tokenConsume, tokensRecently,
  sessionCreate, sessionAccount, sessionDestroy, normEmail, sweep,
} from './db.js';

const TOKEN_TTL   = 15 * 60;          // long enough to walk to a laptop, short enough to matter
const SESSION_TTL = 30 * 24 * 3600;   // a month: this is a tool people touch rarely
const COOKIE      = 'om_card';

// Per address, per hour. Generous for a human, useless as a way to send mail through us.
const MAX_LINKS_PER_HOUR = 5;

// Deliberately strict rather than RFC-complete: a regex that accepts every legal address
// also accepts a great deal that is not one, and the only consequence of being strict here
// is a client writing to hello@ instead.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export const isEmail = e => EMAIL_RE.test(normEmail(e)) && normEmail(e).length <= 180;

const randomToken = () => {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
};

export function sessionCookie(sid, { clear = false } = {}) {
  // HttpOnly: no script on this origin has any reason to read it, and that includes a
  // script that got here by accident. SameSite=Lax rather than Strict so that following
  // the sign-in link out of a mail client still arrives signed in.
  const base = `${COOKIE}=${clear ? '' : sid}; Path=/card; HttpOnly; Secure; SameSite=Lax`;
  return clear ? `${base}; Max-Age=0` : `${base}; Max-Age=${SESSION_TTL}`;
}

export function cookieValue(request) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return v.join('=');
  }
  return null;
}

export const currentAccount = (env, request) => sessionAccount(env.DB, cookieValue(request));

export async function signOut(env, request) {
  await sessionDestroy(env.DB, cookieValue(request));
}

/*
 * Ask for a link.
 *
 * Returns the same shape whatever happens, because the one thing this endpoint must never
 * do is tell a stranger whether an address has an account here. "We sent a link if that
 * address has a card" is the only honest answer that does not turn the form into a way of
 * testing whether somebody is a client of ours.
 */
export async function requestLink(env, email, origin) {
  const addr = normEmail(email);
  if (!isEmail(addr)) return { ok: false, reason: 'bad-email' };

  if (await tokensRecently(env.DB, addr, 3600) >= MAX_LINKS_PER_HOUR)
    return { ok: false, reason: 'too-many' };

  const token = randomToken();
  await tokenStore(env.DB, token, addr, TOKEN_TTL);
  const link = `${origin}/card/auth?t=${token}`;

  const sent = await sendLink(env, addr, link);
  // A form that silently drops what somebody typed is worse than a form that says no —
  // the same call build/event.js makes about the sign-up page.
  if (!sent.ok) return { ok: false, reason: 'mail-failed', detail: sent.detail };
  return { ok: true };
}

/*
 * Mail goes through Resend. One HTTP call, no SDK, no dependency in this Worker at all.
 *
 * Without RESEND_KEY the link is written to the Worker's log instead of being sent and the
 * caller is told it failed. That is on purpose: during setup you can read the log and get
 * in, and in production a missing key is loud rather than a sign-in form that appears to
 * work and sends nothing.
 */
async function sendLink(env, to, link) {
  if (!env.RESEND_KEY) {
    console.log(`[no RESEND_KEY] sign-in link for ${to}: ${link}`);
    return { ok: false, detail: 'no-key' };
  }
  const body = {
    from: env.MAIL_FROM || 'OnlyMaxon <hello@onlymaxon.com>',
    to: [to],
    subject: 'Your sign-in link',
    // Both parts, always. A text/plain alternative is most of what keeps a transactional
    // message out of a spam folder, and it costs four lines.
    text: `Open this link to edit your card:\n\n${link}\n\n`
        + `It works once and expires in 15 minutes.\n`
        + `If you did not ask for it, nothing has happened — ignore this message.\n`,
    html: `<p style="font:15px -apple-system,Segoe UI,Roboto,sans-serif">`
        + `Open this link to edit your card:</p>`
        + `<p><a href="${link}" style="font:15px -apple-system,Segoe UI,Roboto,sans-serif">${link}</a></p>`
        + `<p style="font:13px -apple-system,Segoe UI,Roboto,sans-serif;color:#667">`
        + `It works once and expires in 15 minutes. If you did not ask for it, nothing has `
        + `happened — ignore this message.</p>`,
  };
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.ok) return { ok: true };
    console.log('resend failed', r.status, await r.text());
    return { ok: false, detail: `resend-${r.status}` };
  } catch (e) {
    console.log('resend threw', e && e.message);
    return { ok: false, detail: 'network' };
  }
}

/*
 * Spend a link. The token is claimed by the UPDATE inside tokenConsume, so a second click
 * — or a mail client that prefetched the URL before the human saw it — finds nothing left
 * to spend and is sent back to the sign-in page rather than into somebody's account.
 */
export async function completeLink(env, token) {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const email = await tokenConsume(env.DB, token);
  if (!email) return null;

  const account = await accountGetOrCreate(env.DB, email);
  const sid = await sessionCreate(env.DB, account.id, SESSION_TTL);
  // Cheap, and only ever on a real sign-in. See the note on sweep() in db.js.
  await sweep(env.DB);
  return { account, sid };
}
