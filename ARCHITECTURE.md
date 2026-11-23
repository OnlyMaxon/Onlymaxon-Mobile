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
        cards.onlymaxon.com/<slug>                   OnlyMaxon (Expo)      
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

**The two platforms do not share an identifier.** iOS is `com.onlymaxon.cards`; Android is
`com.onlymaxon.nfc`. The Play record for the original name had an upload key registered that
exists in no keystore we hold, and Play will accept nothing else for it — so Android moved to
a name with no history. Nothing in the product depends on the two matching, and the Firebase
project holds an app for each.

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

## The five flows

### 1. Issuing a card

Two ways, and both end with an address on a piece of plastic.

**At the bench, by us**, with the client standing there. One tap does both halves:

```
app: slug + client's email
  │
  ├─▶ Firestore: create card { slug, ownerEmail, ownerUid: null, published: false }
  │      in a transaction with slugs/<slug>, so two people can never get the same address
  │
  └─▶ chip:  NDEF url → read it back → PWD → PACK → prove it → ACCESS → AUTH0
         then Firestore: chips/<chipUid>            = the state of that piece of plastic
                         chips/<chipUid>/writes/... = its history, appended, never edited
```

**By the person themselves**, from `src/screens/TakeCard.tsx`, which is what an order for
three hundred cards made necessary. Registration asks for a name and for what the card
should be called; the card screen then creates the row and writes the chip in one tap.

The chip gets **no password** on that path and no counter. The password belongs to a batch:
to put one on from somebody's own phone the app would have to be holding it, which means
shipping it to every phone, which means anybody could rewrite anybody's chip. A card is
twelve złoty and carries one public address, so the honest trade is to leave it rewritable —
`AUTH0` is written as `0xFF` rather than `0x04`, explicitly, so a rewrite cannot inherit
protection from whatever wrote the chip before.

Blank cards therefore exist, and are meant to: fifty of them can be put on the tables at a
conference and claimed by whoever picks one up. Until somebody activates one, it is a piece
of plastic with nothing on it.

**Database first, chip second, always.** If Firestore refuses, the chip is untouched and the
whole thing is one retry away. Reversed, a failed write leaves a protected card in somebody's
hand pointing at an address that does not exist — and nothing about holding it would tell
you.

A chip write that fails *after* the row exists is not a failure of the whole act: the page
is already there, and the card screen offers "rewrite" (`src/screens/ChipActions.tsx`) for
the second half. That screen can also wipe a card — the row, the slug and everything typed
into the editor stay, which is what makes it safe to offer to its owner at all.

The chip record is written **after** the chip accepts, because it is a claim about a physical
object and only becomes true then.

### 2. The client claims it

Only for a card issued at the bench. A card somebody made for themselves is theirs from the
first moment: `ownerUid` is set at creation, there is no claim step, and no window in which a
row belongs to an address rather than to an account. Every card issued before TakeCard
existed is one of these, which is why this path must keep working.

```
registers (email + password) → Firebase sends a confirmation email
clicks the link → cards.onlymaxon.com/__/auth/action
opens the app → "This card is waiting for you" → Claim
```

The confirmed address is the whole mechanism, not a formality. The Firestore rule reads
`email_verified` straight out of the token, so nothing in the app can skip it. Until an
address is confirmed, a card waiting for it cannot be taken.

**The app reads that same claim, and must.** `reload()` refreshes the user natively but
emits no auth state change, so the JS user keeps the `emailVerified` it was built with —
pressing "I have confirmed" reported nothing while the click had in fact landed, and only
signing out and back in, which builds a new user, revealed it. `refresh()` now forces a
token and reads `email_verified` from it: the same value the rules trust.

### 3. Editing

The client edits in the app; `updateDoc` writes to Firestore; the next tap shows it. The
chip is never touched, never rewritten, never even read.

A newly created card is **hidden**. Otherwise the first person handed a card would show
strangers an empty page. The editor says so at the top, in yellow, with a button — a card
nobody can see is the one failure that looks like success.

### 4. Deleting an account

```
password again -> release every card this account owns -> delete the Auth user
```

Apple requires this of anything that can create an account (5.1.1(v)), and the requirement
is right: an account you can only get rid of by writing to us is one you cannot get rid of.

**The card is not deleted.** Its address is printed on plastic in somebody's pocket, so the
row stays, emptied and unclaimed, and the chip keeps opening the holding page it opened the
day it was written. `ownerEmail` stays too — it is the issuance record, and it is the way
back: registering again on that address finds the card waiting.

Cards first, account last, for the same reason the database comes before the chip: the
Firestore writes need a token the rules will accept, and after the delete there is none.

### 5. A stranger taps

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
| `cards` | the owner, the address it waits for, admins | the owner (slug and ownerEmail frozen; ownerUid only to null, which is the release); admins create any; a confirmed address creates exactly one, whose document id must be its own uid |
| `slugs` | one document by name: admins and anybody confirmed; the list: admins | admins, and a confirmed address taking the one slug for its own card. Create-only — this is the uniqueness lock |
| `chips` | admins | admins |
| `chips/<uid>/writes` | admins | admins — create only, no update, no delete |
| `batches` | admins | admins |
| `activity/<uid>/events` | admins | nobody — the `activity` function writes it with admin rights |
| everything else | nobody | nobody |

### What is in the database, and nothing else is

Five collections. Anything not in this list does not exist, and a sixth one appearing is a
bug or a leftover, not a feature.

| | id | what it is | who reads it in the console |
|---|---|---|---|
| `cards` | random | the card itself: slug, owner, and everything a visitor sees | the renderer, through the Admin SDK |
| `slugs` | the slug | the uniqueness lock, one empty-ish document per address ever issued. Never deleted — a slug is printed on plastic and must never be handed out twice | nobody, ever |
| `chips` | the chip's factory UID | the current state of one piece of plastic: which card, which batch password, how it was configured, who wrote it and with which build. Its `writes` subcollection is that chip's whole history, failures included | us, when a chip misbehaves |
| `batches` | the password's own hex | every batch password ever used, so a chip from an older batch is never a guessing game | us, when a chip asks for a password we do not have in hand |
| `activity` | the account's uid | what that account did to its chip — activated, rewrote, wiped — with the app, its version, the platform and whether it worked. Written only by the `activity` function, because a log a client can append to is a log that can be made to say the write went fine | us, when a card misbehaves in somebody's pocket |

**No public read on cards, even published ones.** A document holds `ownerEmail` and
`ownerUid` next to the public fields, and a rule cannot hand over half a document. The page
a stranger sees is rendered by the Cloud Function through the Admin SDK, which these rules
do not govern — so the public half costs nothing here.

**Admins are listed in the rules, not in a collection.** A document can be created by
anything that gets hold of a write; a rule changes only by deploying rules.

**Nothing deletes a card** — not even deleting the account that owns it. The URL is on a
physical object: deleting the row would turn a card in somebody's pocket into a 404, with no
way to tell from looking at it. The owner may only let go of one, which empties it and hands
it back to the address it was issued to.

### The chip

Two writes turn a blank chip into a product. Steps 3 to 5 happen only when there is a
password to protect it with — our own writes from the bench. A card activated by its owner
stops after step 2 and ends with `AUTH0 = 0xFF`, open to be rewritten. See flow 1.

| | what | why |
|---|---|---|
| 1 | NDEF URL record | ~40 of the 504 usable bytes |
| 2 | read the URL back and compare | an ACK is not a commit — see below |
| 3 | `PWD` + `PACK` | |
| 4 | `PWD_AUTH` with the same password, and compare the returned `PACK` | the only way to know the password is really on the chip |
| 5 | `ACCESS`, then `AUTH0 = 0x04` | writes need the password; reads stay open |

**Steps 2 and 4 are not belt-and-braces, they are the whole safety of the operation.** A
chip acknowledges `WRITE` before it has committed the page to EEPROM, so an ACK proves the
command arrived, not that the bytes are there. A field that drops in that instant leaves a
page unwritten and says nothing about it. While `AUTH0` is still off, that costs one retry.
Once `AUTH0` lands on a chip whose `PWD` page did not take, the chip is armed with a
password nobody holds and can never be written again by anyone, including us.

That is not a hypothesis. It happened on 2026-11-03 to the chip for `rick`, found on
2026-11-17: `AUTH0 = 4` (so our own code armed it, successfully), and neither the batch
password the records named nor the factory `FFFFFFFF` authenticates. The card still works —
reads are open — but that piece of plastic can never be rewritten. The password pages cannot
be read back (`READ` returns zeros there, by design), so `PWD_AUTH` before arming is the
only check that exists.

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

**Why photographs go through a function instead of straight into Storage.** The obvious
shape is the phone uploading with the Storage client SDK and then writing `photoPath` onto
its own card. Both halves are wrong in the same way: a client that picks its own storage
path can upload one picture and point a *different* card at it, and a client that can write
`photoPath` can aim its card at any object in the bucket — somebody else's face, served
under its own name, by our own renderer. So the phone posts the bytes to
`functions/photo.js` with its ID token and nothing more; the function decides the path,
names it after a hash of the contents, and writes the field with admin rights.
`firestore.rules` backs this up by refusing any client write that *changes* `photoPath`,
with one exception: letting go of a card may set it to empty, because deleting an account
has to take the face off the card even if deleting the file itself failed.

Naming the object after its hash is also what earns the year-long `immutable` on
`/<slug>/photo`: the hash rides in the query string, so a replacement is a new address
rather than new bytes behind an old one. Without that, anybody who had loaded the previous
picture would keep being shown it by their own browser for a year.

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
    MyCard.tsx       what the client opens: the card, and the form behind a button
    MagicCard.tsx    the card face, drawn and dealt once per launch
    DeleteAccount.tsx  getting rid of an account without killing the card behind it
    ChipTools.tsx    the bench: read, write, erase (admins only)

functions/           Cloud Function `card` — renders the public page
  index.js           routing, Firestore read, photo streaming
  photo.js           the authenticated other half: setting and removing that photo
  render.js          the card and the holding page, five languages
  html.js            escaping and the accent palettes

edge/worker.js       Cloudflare: Host rewrite, /u/ redirect, /__/ passthrough
firestore.rules      who may touch what — the real enforcement
public/robots.txt    cards are handed to people, not found in search

store/               what the two stores are fed: store.config.js is pushed with
                     eas metadata:push; store/ holds the icon, feature graphics,
                     screenshots and listing copy
```

**Legal documents live in the site repository, not here**: `build/src/apps/cards/{privacy,
terms,delete-account}.html`, generated by `build/apps.js` to `onlymaxon.com/apps/cards/*`.
The privacy URL is a required field in both stores, and the deletion page is required by
Google separately from the in-app button. `src/screens/SignIn.tsx` links the first two.

---

## Not done yet

- **Page view counts.** The chip counts its own reads; the page counts nothing.
- **vCard.** "Save contact" existed on the old Worker; deliberately deferred.
- **Android has never been run.** It builds and the bundle is signed, but no one has opened
  it on a handset, and the Android NFC path — `nfcAHandler.transceive`, a different call
  from the iOS one — has never been exercised at all.
- **Nothing here has been tested beyond reading it.** Types, unit tests on the NDEF encoder
  and expo-doctor all pass; the flows were checked by review and by Max using the app. There
  are no tests over `firestore.rules`, and account deletion has never been run end to end.
