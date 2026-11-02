# Architecture

An NFC card is a piece of plastic with a URL printed into it, and that URL can never be
changed once the card is in somebody's pocket. Everything below follows from that one fact.

The chip holds an address and nothing else. What a visitor sees lives in a database, so the
owner can change their phone number at eleven at night and the card in their wallet is
correct the moment somebody taps it. There is no build, no deploy, no waiting — and nothing
printed on plastic ever has to be reprinted.

---

## The map

```
            somebody taps a card                    the owner edits it
                     │                                      │
                     ▼                                      ▼
        cards.onlymaxon.com/<slug>                   Maxon Cards (Expo)
                     │                                      │
        ┌────────────┴───────────┐                          │
        │  Cloudflare Worker     │  forwards, rewrites Host │
        │  (edge/worker.js)      │  — holds no data         │
        └────────────┬───────────┘                          │
                     ▼                                      ▼
        ┌────────────────────────┐              ┌───────────────────────┐
        │  Cloud Function `card` │─────────────▶│  Firestore            │
        │  (functions/)          │   reads      │  cards · batches      │
        │  renders finished HTML │              │  chips · slugs        │
        └────────────────────────┘              └───────────▲───────────┘
                                                            │ writes
                                                 Firebase Auth decides who
```

Three hosts, each doing one thing:

| | what runs there | why there |
|---|---|---|
| **Firebase** | Firestore, Auth, the renderer | the data and the people who own it |
| **Cloudflare** | DNS, one forwarder | the domain was already there; the forwarder exists only because Google routes by Host header |
| **GitHub Pages** | onlymaxon.com, the site | unchanged, untouched, knows nothing about cards |

The site and the cards share exactly one thing: the domain. Nothing else.

---

## Three things that are not the same

Most confusion about this product comes from collapsing these into one.

**A chip** is a physical NTAG 215. It has a factory UID that cannot be changed, about 504
writable bytes, and a password that guards writing. It is dumb: it holds an address and
answers reads. It does not know about accounts, cards, or Firebase.

**A card** is a row in Firestore. It has a slug (`max`), the content a visitor sees, and an
owner. It exists before its owner does: we create it at the bench with the client's email on
it and `ownerUid: null`.

**An account** is an email address in Firebase Auth, confirmed by clicking a link. It is how
a person proves they are the one the card was made for.

A chip points at a card. A card is claimed by an account. Neither link is permanent in the
same way: a card can outlive its chip (we rewrite another one), and a chip can outlive its
card's content (edited daily). Only the slug is fixed, because it is printed.

---

## The four flows

### 1. Issuing a card

At the bench, with the client standing there. One tap does both halves:

```
app: slug + client's email
  │
  ├─▶ Firestore: create card { slug, ownerEmail, ownerUid: null, published: false }
  │      in a transaction with slugs/<slug>, so two people can never get the same address
  │
  └─▶ chip:  NDEF url → PWD → PACK → ACCESS → AUTH0
         then Firestore: chips/<cardId> = { uid, batchHex, writtenAt }
```

**Database first, chip second, always.** If Firestore refuses, the chip is untouched and the
whole thing is one retry away. Reversed, a failed write leaves a protected card in somebody's
hand pointing at an address that does not exist — and nothing about holding it would tell
you.

The chip record is written **after** the chip accepts, because it is a claim about a physical
object and only becomes true then.

### 2. The client claims it

```
registers (email + password) → Firebase sends a confirmation email
clicks the link → cards.onlymaxon.com/__/auth/action
opens the app → "This card is waiting for you" → Claim
```

The confirmed address is the whole mechanism, not a formality. The Firestore rule reads
`email_verified` straight out of the token, so nothing in the app can skip it. Until an
address is confirmed, a card waiting for it cannot be taken.

### 3. Editing

The client edits in the app; `updateDoc` writes to Firestore; the next tap shows it. The
chip is never touched, never rewritten, never even read.

A newly created card is **hidden**. Otherwise the first person handed a card would show
strangers an empty page. The editor says so at the top, in yellow, with a button — a card
nobody can see is the one failure that looks like success.

### 4. A stranger taps

```
chip → cards.onlymaxon.com/anna → Worker → Function → one Firestore read → finished HTML
```

No client-side fetch. The product is the second and a half after somebody touches a card to
a phone, usually outdoors, on mobile data, holding somebody else's handset. A page that
loads and *then* asks a database what to draw spends that second and a half showing nothing.

`cache-control: no-store`, deliberately. An owner edits and immediately taps their own card
to check; a CDN holding yesterday's copy for even a minute would destroy trust in the whole
thing.

---

## Security

### Who can do what

Everything is in `firestore.rules`, enforced by the server. The app's checks are a courtesy
to whoever is typing; these are the rule.

| collection | read | write |
|---|---|---|
| `cards` | the owner, the address it waits for, admins | the owner (slug, ownerUid, ownerEmail frozen); admins create |
| `slugs` | admins | admins, create-only — this is the uniqueness lock |
| `chips` | admins | admins |
| `batches` | admins | admins |
| everything else | nobody | nobody |

**No public read on cards, even published ones.** A document holds `ownerEmail` and
`ownerUid` next to the public fields, and a rule cannot hand over half a document. The page
a stranger sees is rendered by the Cloud Function through the Admin SDK, which these rules
do not govern — so the public half costs nothing here.

**Admins are listed in the rules, not in a collection.** A document can be created by
anything that gets hold of a write; a rule changes only by deploying rules.

**Nothing deletes a card.** The URL is on a physical object: deleting the row would turn a
card in somebody's pocket into a 404, with no way to tell from looking at it.

### The chip

Two writes turn a blank chip into a product:

| | what | why |
|---|---|---|
| 1 | NDEF URL record | ~40 of the 504 usable bytes |
| 2 | `PWD` + `PACK`, then `ACCESS`, then `AUTH0 = 0x04` | writes need the password; reads stay open |

`AUTH0` goes **last**. Protection applies from that page upwards, and the configuration
pages sit above any value we set — so the moment `AUTH0` lands, nothing else can be written
without the password. Any other order locks the chip halfway through.

`PROT` stays **0**. `PROT = 1` protects reads as well, and a card whose NDEF cannot be read
without a password is a card no phone will ever open — which is the entire product.

`CFGLCK` stays **off**, and so do the static lock bits. Both are irreversible, and `AUTH0`
already protects the configuration pages, so they buy nothing and can only destroy stock.

`AUTHLIM` stays **0** — unlimited password attempts. A limit bricks a chip with a forgotten
password forever; against that, a 32-bit password guessed over NFC at a few milliseconds per
try is centuries of somebody standing next to the card, and the worst case if they succeed
is a rewritten URL, not a leak.

### Batch passwords

One password per batch, not per card: a password per card is a spreadsheet nobody
maintains, and one password for every card ever made is one leak away from all of them.

It lives in **two** places — the device keychain and `batches` in Firestore. It used to live
only in the keychain, and a reinstall took the only copy with it, leaving a chip that could
be read forever and written never. A password that exists in exactly one place is not a
secret, it is a single point of failure.

Every password ever used is kept. A chip protected two batches ago still needs the password
it was protected with, and that is the only way back into it.

---

## Decisions worth knowing

**Why a subdomain for cards.** The site is a static build on GitHub Pages; a card is a row
in a database. One domain serving both means one of them bends. `cards.onlymaxon.com` is one
DNS record, and the site's pipeline never learns that cards exist.

**Why a Cloudflare Worker is still in the path.** Firebase Hosting refuses to verify a TXT
record that demonstrably exists and is served by the zone's own nameservers. The function
has its own Google address, but Google routes by `Host` header — a proxied request carrying
our domain never reaches it. The worker rewrites the Host and the path, and nothing else. It
holds no data and makes no decisions; if Hosting ever starts cooperating, it can be deleted
and the DNS pointed there instead.

**Why `/u/*` is still claimed.** Chips written before the move carry
`onlymaxon.com/u/<slug>`. They cannot be rewritten — that is what the password is for — so
the address has to keep working. One permanent redirect, and those chips are alive.

**Why the editor is in the app and not on the web.** It was a web page first. Moving it into
the app removed an entire sign-in mechanism (one-time emailed links), an email provider, and
the DNS work behind it. The client already has the app to tap their card; asking them to
also keep a browser session was a second thing to lose.

**Why NDEF is written by hand.** `src/ndef.ts` builds and parses the format directly rather
than through the library's helper, so it can be tested on a laptop. Writing a chip cannot be
undone, and a URL encoded wrongly is a card that no phone opens and that, once protected,
cannot be fixed. `npm test` checks that our encoder agrees byte-for-byte with a chip written
by an unrelated tool.

**Why raw chip commands instead of the NDEF API.** The helpers can read and write a URL, but
they cannot answer the two questions that matter at the bench — is this chip protected, and
how many times has it been tapped — nor set the password. All of that lives in the
configuration pages, which no NDEF API exposes.

---

## Layout

```
App.tsx              who is signed in, and which of the two halves they see
src/
  account.ts         Firebase Auth: register, sign in, confirm, reset
  cards.ts           every Firestore read and write in the product
  ntag.ts            the chip: read, write, erase — raw commands
  ndef.ts            the URL format, pure functions, no radio
  ndef.test.ts       npm test — the part that can be checked on a laptop
  secrets.ts         the batch password in the device keychain
  i18n.ts            every string in the app, ru + en
  theme.ts           the studio's colour tokens, lifted from the site
  screens/
    SignIn.tsx       register or sign in — one screen, because it is one act
    Verify.tsx       waiting for a confirmed address
    MyCard.tsx       what the client opens: their card and the form
    ChipTools.tsx    the bench: read, write, erase (admins only)

functions/           Cloud Function `card` — renders the public page
  index.js           routing, Firestore read, photo streaming
  render.js          the card and the holding page, five languages
  html.js            escaping and the accent palettes

edge/worker.js       Cloudflare: Host rewrite, /u/ redirect, /__/ passthrough
firestore.rules      who may touch what — the real enforcement
public/robots.txt    cards are handed to people, not found in search

server/              DEAD. The Cloudflare Worker this replaced. Keep until the first
                     commit, then delete — the renderer was ported to functions/.
```

---

## Not done yet

- **Photos.** The function streams them from Storage and the renderer draws them, but the
  app has no upload screen and the fields are not in the database. Cards show an initial.
- **A demo account for Apple.** Sign-in needs a confirmed email; a reviewer will not receive
  one. This is the most common 2.1 rejection and has to exist before the first submission.
- **Page view counts.** The chip counts its own reads; the page counts nothing.
- **vCard.** "Save contact" existed on the old Worker; deliberately deferred.
- **Android.** Configured, never built.
