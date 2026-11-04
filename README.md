# OnlyMaxon

The phone side of the NFC card product. Two people use it and they see different halves: a
client signs in, finds the card that was handed to them, and edits what a visitor sees when
they tap it; we read, write and wipe the chips themselves, behind an admin check.

The chip holds a URL and nothing else. Everything a visitor sees comes out of a database, so
an edit is live on the next tap — no commit, no deploy, no reprinting.

`ARCHITECTURE.md` carries the reasoning. This file is how to run it.

## Why this is a separate project

The card pages used to be generated inside the OnlyMaxon site repository, where every file is
a public URL and CI fails if the committed output is stale. A client changing their phone
number cost a commit and a deploy of the whole site. Card data changes when a client edits
it, not when somebody pushes, and the two pipelines had no business being one.

The site and this project share nothing but the domain.

## Running it

NFC needs native code, so **Expo Go cannot run this app**, and NFC cannot be tested on an
emulator either — it has to be a real handset with a real card.

```bash
npm install

# Android, built on this machine. Fastest loop by far.
#
# JAVA_HOME has to be set for this one. The JDK on PATH here is 26, which Gradle and the
# Android plugin do not support; Android Studio ships a 21 that they do. In PowerShell:
#   $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
npx expo run:android

# Android or iOS, built in Expo's cloud. The only route to iOS from Windows.
npx eas-cli build --profile development --platform android
npx eas-cli build --profile development --platform ios
```

Once a development build is on the phone, the JavaScript reloads over the network like any
Expo project. A native rebuild is only needed when a native dependency or anything in
`app.json` changes:

```bash
npx expo start --dev-client
```

Checks, all of which should pass before anything is called done:

```bash
npx tsc --noEmit     # types
npm test             # the NDEF encoder, on a laptop, no chip required
npx expo-doctor      # dependency and config sanity
```

## What the client sees

One screen: their card, and the form that changes it. Name, what they do, city, a short
description, phone, email, website, a list of services with prices, links, the language the
card opens in, and its colour. A switch hides or publishes it.

A new card is **hidden** until they publish it, and the editor says so loudly at the top. A
card nobody can see is the one failure that looks like success.

Deleting an account is at the bottom of that screen, as Apple requires. It removes the
account and everything typed into it; the card itself survives, emptied and unclaimed,
because its address is printed on plastic in somebody's pocket.

## What the bench sees

Three tabs behind the admin check: **read**, **write**, **erase**.

| field | where it comes from |
|---|---|
| chip model | `GET_VERSION`, storage-size byte — tells a 213 sold as a 215 apart |
| UID | pages 0–1, factory-programmed and not writable |
| link | the NDEF URI record, decoded by hand in `src/ndef.ts` |
| bytes used | the length of the NDEF TLV, against the chip's capacity |
| tap counter | `READ_CNT` — the chip's own one-way counter, when `NFC_CNT_EN` is set |
| protection | `AUTH0`, `PROT`, `CFGLCK` out of the configuration pages |
| owner | the card behind that URL, and the email it was issued to |

The protection line is the one place the screen gives an opinion. An unprotected chip is not
a product: anyone with a phone rewrites it to their own URL in about ten seconds, and the
owner has no way to know. So the screen says that in words rather than printing
`AUTH0 = 255` and leaving it to be worked out.

### Writing

Slug, the client's email, and a switch for the chip counter. Then, in this order:

1. The card is created in Firestore — unpublished, with that email on it and no owner.
2. The NDEF URL goes onto the chip.
3. `PWD`, `PACK`, the `ACCESS` byte, and `AUTH0` last — after which nothing on the chip can
   be rewritten without the batch password.
4. What was physically written is recorded, after the chip accepted it and not before.

Database before chip, always. A failed write leaves the chip untouched and the whole thing
one retry away; the other order leaves a protected card in somebody's hand pointing at an
address that does not exist, and nothing about holding it would tell you.

Leave the email empty and step 1 is skipped — for a card whose row already exists. A slug
already held by a card issued to the same address is recognised as a previous attempt and
written anyway.

### The batch password

One password per batch, not per card, and never committed. It lives in the device keychain
**and** in Firestore, because it used to live only in the keychain and a reinstall took the
only copy with it, leaving a chip that can be read forever and written never.

## The rules writing follows

`PROT` stays **0**: 1 protects reads as well, and a card whose NDEF cannot be read without a
password is a card no phone will ever open. `AUTH0 = 0x04` already protects the configuration
pages themselves, so `CFGLCK` buys nothing and is irreversible — it stays off, as do the
static lock bits. `AUTHLIM` stays 0, because a limit bricks a chip with a forgotten password
forever.

## What is deliberately not here

- **No app links.** An `autoVerify` intent filter on the card URL would make this app
  intercept taps meant for the browser, so a client with the app installed would open the app
  instead of the card — the product failing. The app scans only when its button is pressed.
- **No photo upload.** The renderer draws one and the function serves it, but nothing in the
  app sends one yet. Cards show an initial.
- **No billing.** The app is free; the cards are sold once, outside it.

## Store notes

Both stores are fed from this repository: `store.config.js` is pushed with
`eas metadata:push`, and `store/` holds the icon, feature graphics, screenshots and listing
copy. Two things cannot go through that API and are filled in by hand — the age rating, which
Apple gates on an attribute the eas-cli schema rejects, and the data-safety questionnaires.

iOS is `com.onlymaxon.cards`; Android is `com.onlymaxon.nfc`. They differ for a reason worth
knowing before touching either — see `ARCHITECTURE.md`.
