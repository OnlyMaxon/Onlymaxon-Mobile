/*
 * cards.onlymaxon.com → the Cloud Function that renders a card.
 *
 * Ten lines of plumbing, and only because of one detail: Google routes by the Host header,
 * so a proxied request carrying `cards.onlymaxon.com` never reaches the function at all —
 * it answers 404 before our code runs. This rewrites the Host, and the path, and gets out
 * of the way. No data, no logic, no state: all of that is in Firebase.
 *
 * The alternative was Firebase Hosting with a custom domain, which refuses to verify a TXT
 * record that demonstrably exists and is served by the zone's own nameservers.
 */

const UPSTREAM = 'https://europe-west1-onlymaxon-b4c02.cloudfunctions.net';
const FUNCTION = 'card';

/*
 * Firebase serves its own pages under /__/ — among them /__/auth/action, which is where the
 * link in a confirmation or password-reset email lands. Passing those straight through is
 * what lets those emails say cards.onlymaxon.com instead of onlymaxon-b4c02.firebaseapp.com.
 * Without it the link would reach the card renderer, 404, and nobody could confirm an
 * address at all.
 */
const AUTH_UPSTREAM = 'https://onlymaxon-b4c02.firebaseapp.com';

/*
 * Chips written before the move carry onlymaxon.com/u/<slug>. That address belonged to a
 * Worker that no longer exists, and the static copy is gone from the site repository — so
 * those cards now point at a 404. They cannot be rewritten (that is the whole point of the password),
 * so the address has to keep working instead. One redirect, permanent, and the chip is
 * alive again.
 */
const OLD_PATH = /^\/u\/([a-z0-9][a-z0-9-]{1,38})\/?$/i;

export default {
  async fetch(request) {
    const url = new URL(request.url);

    const old = url.pathname.match(OLD_PATH);
    if (old) {
      return Response.redirect(`https://cards.onlymaxon.com/${old[1].toLowerCase()}`, 301);
    }

    if (url.pathname.startsWith('/__/')) {
      const auth = new URL(`${AUTH_UPSTREAM}${url.pathname}${url.search}`);
      const passed = new Request(auth, request);
      passed.headers.set('host', auth.host);
      return fetch(passed);
    }

    // The function lives under its own name on cloudfunctions.net; visitors do not.
    const target = new URL(`${UPSTREAM}/${FUNCTION}${url.pathname}${url.search}`);

    // Host has to be the upstream's, or Google will not route the request. Everything else
    // about the request — method, headers, body — goes through untouched.
    const forwarded = new Request(target, request);
    forwarded.headers.set('host', target.host);
    // Kept so the function can tell who actually asked, if that is ever needed.
    forwarded.headers.set('x-forwarded-host', url.host);

    return fetch(forwarded);
  },
};
