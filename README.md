# Onlymaxon-mobile

The phone side of the NFC card product: tap a card to see what is on the chip, or create a
card for a client and write it.

The server lives in `server/`, in this same project. It used to sit inside the OnlyMaxon
site repository, where the card pages were generated at build time — which meant a client
changing their phone number cost a commit and a deploy of the whole site. That is the thing
this project exists to undo: the chip holds a URL, everything a visitor sees comes out of a
database, and an edit is live on the next tap.

The site and this project share nothing but the domain.

## Why this is a separate project

The OnlyMaxon repository has a `CNAME` and an `index.html` at its root: every file in it is
a public URL, and its CI regenerates the site and fails if the committed output is stale.
Card data has no business in that pipeline — it changes when a client edits it, not when
somebody pushes.

## Running it

NFC needs native code, so **Expo Go cannot run this app**. A development build is required,
and NFC cannot be tested on an emulator either — it has to be a real handset with a real
card.

```bash
npm install

# Android, built on this machine. Fastest loop by far.
#
# JAVA_HOME has to be set for this one. The JDK on PATH here is 26, which Gradle and the
# Android plugin do not support; Android Studio ships a 21 that they do. In PowerShell:
#   $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
npx expo run:android

# Android or iOS, built in Expo's cloud. The only route to iOS from Windows.
npx eas-cli@latest build --profile development --platform android
npx eas-cli@latest build --profile development --platform ios
```

Once a development build is installed on the phone, the JavaScript reloads over the network
like any Expo project — a native rebuild is only needed when a native dependency or anything
in `app.json` changes:

```bash
npx expo start --dev-client
```

## What the app does today

Two tabs. **Чтение** looks at a chip and changes nothing. **Запись** creates the card on
the server and then writes the chip.

| field | where it comes from |
|---|---|
| chip model | `GET_VERSION`, storage-size byte — tells a 213 sold as a 215 apart |
| UID | pages 0–1, factory-programmed and not writable |
| link | the NDEF URI record, decoded by hand in `src/ntag.ts` |
| bytes used | the length of the NDEF TLV, against the chip's capacity |
| tap counter | `READ_CNT` — the chip's own one-way counter, when `NFC_CNT_EN` is set |
| protection | `AUTH0`, `PROT`, `CFGLCK` out of the configuration pages |

The protection line is the one place the screen gives an opinion. An unprotected chip is not
a product: anyone with a phone rewrites it to their own URL in about ten seconds, and the
owner has no way to know. So the screen says that in words rather than printing
`AUTH0 = 255` and leaving it to be worked out.

### Writing

Slug, the client's email, and a switch for the chip counter. Then, in this order:

1. `POST /card/api/cards` creates the card on the server, unpublished, owned by that email.
2. The NDEF URL goes onto the chip.
3. `PWD`, `PACK`, the `ACCESS` byte, and `AUTH0` last — after which nothing on the chip can
   be rewritten without the batch password.

Server before chip, always. A failed server call leaves the chip untouched and the whole
thing one retry away; the other order leaves a protected card in somebody's hand pointing
at an address that does not exist, and nothing about holding it would tell you.

Leave the email empty and step 1 is skipped — for a card whose row already exists.

Two secrets live in the device keychain, and they are different in kind:

| | what it is | if it leaks | if it is lost |
|---|---|---|---|
| batch password | the only copy in existence | somebody can rewrite that batch | those cards can never be rewritten |
| server key | a copy of a `wrangler secret` | somebody can create cards, nothing more | one command to replace |

## What is deliberately not here

- **No app links.** An `autoVerify` intent filter on `onlymaxon.com/u/*` would make this app
  intercept taps meant for the browser — so a client with the app installed would open the
  app instead of the card, and that is the product failing. The app scans only when its
  button is pressed.
- **No sign-in and no editor.** The client edits their page at `onlymaxon.com/card/`, in a
  browser, signing in with a one-time emailed link. The app never shows anybody else's card
  and holds no session — it creates cards and writes chips, which is a bench tool, not a
  product the client installs.
- **No billing.** The cards are given away.

## The rules writing follows

`PROT` stays **0**: 1 protects reads as well, and a card whose NDEF cannot be read
without a password is a card no phone will ever open. `AUTH0 = 0x04` already protects the
configuration pages themselves, so `CFGLCK` buys nothing and is irreversible — it stays off,
as do the static lock bits. The password is **per batch, not per card**, and is never
committed. The long version of that reasoning is in `server/README.md`.

## Store submission, before it comes up

The editor signs in with a one-time emailed link, which means an App Store reviewer cannot
sign in — they will not receive the email. Guideline 2.1 rejections for exactly this are
routine. A demo account, or a reviewer-only bypass, has to exist before the first submission.
