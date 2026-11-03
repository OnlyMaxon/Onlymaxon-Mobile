/*
 * The bench tools: read a chip, create a card and write one, or wipe one back to factory.
 *
 * Only an admin ever sees this. Reading changes nothing and comes first on purpose. Writing
 * and erasing both end in a chip that cannot be put back the way it was, so each sits
 * behind its own tab, its own confirmation, and a batch password that has to exist before
 * the button does anything.
 */

import {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import NfcManager from 'react-native-nfc-manager';

import {
  SLUG_RE,
  SlugTaken,
  chipOf,
  createCard,
  findBySlug,
  knownBatches,
  recordChip,
  rememberBatch,
  type Batch,
  type Card,
  type ChipRecord,
} from '../cards';
import type {Key} from '../i18n';
import {createPassword, importPassword, loadPassword, passwordHex} from '../secrets';
import {
  CardError,
  UNKNOWN_CHIP,
  eraseCard,
  readCard,
  writeCard,
  type BatchPassword,
  type CardErrorCode,
  type CardRead,
  type Protection,
} from '../ntag';
import {C, s} from '../theme';

type T = (k: Key, v?: Record<string, string | number>) => string;

/*
 * Cards live on their own hostname. The site is a static build on GitHub Pages and a card
 * is a row in a database — one domain serving both means one of them has to bend. This is
 * also the address printed into the chip, so it cannot change once cards are handed out.
 */
const BASE_URL = 'https://cards.onlymaxon.com/';

/* Pulls the slug back out of whatever the chip is carrying, so a tap can be turned into
 * "whose card is this". The old /u/ form is still recognised: chips written before the move
 * exist, and reading one should still say who it belongs to. */
const OUR_URL = /^https:\/\/(?:cards\.onlymaxon\.com|onlymaxon\.com\/u)\/([a-z0-9][a-z0-9-]{1,38})\/?$/i;

type Tab = 'read' | 'write' | 'erase';

/* The chip layer raises codes rather than sentences, because it has no idea what language
 * the phone is in. This is where they become words. */
const CHIP_ERRORS: Record<CardErrorCode, Key> = {
  'config-locked': 'errConfigLocked',
  'wrong-password': 'errWrongPassword',
  'too-big': 'errTooBig',
  'past-end': 'errPastEnd',
};

function Row({label, value, tone}: {label: string; value: string; tone?: string}) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowValue, tone ? {color: tone} : null]} selectable>
        {value}
      </Text>
    </View>
  );
}

/*
 * The protection summary is the one place this screen gives an opinion rather than a value.
 * An unprotected card is not a card yet — anyone with a phone rewrites it in ten seconds —
 * so the screen says so in words, instead of leaving it to be worked out from AUTH0 = 255.
 */
function protectionLine(p: Protection, lastUserPage: number, t: T): {text: string; tone: string} {
  if (p.readsAlsoProtected) {
    return {text: t('protReadLocked'), tone: C.bad};
  }
  if (p.auth0 > lastUserPage) {
    return {text: t('protNone'), tone: C.bad};
  }
  return {text: t('protOk', {page: p.auth0}), tone: C.ok};
}

function Result({
  card, owner, chip, t,
}: {
  card: CardRead;
  owner: Card | null | undefined;
  chip: ChipRecord | null;
  t: T;
}) {
  const prot = card.protection ? protectionLine(card.protection, card.lastUserPage, t) : null;
  const slug = card.url?.match(OUR_URL)?.[1];

  return (
    <View style={s.result}>
      <Row label={t('chip')} value={card.chip === UNKNOWN_CHIP ? t('unknownChip') : card.chip} />
      <Row label="UID" value={card.uid} />

      {card.url ? (
        <Pressable onPress={() => Linking.openURL(card.url as string)}>
          <Row label={t('linkRow')} value={card.url} />
          <Text style={s.hint}>{t('tapToOpen')}</Text>
        </Pressable>
      ) : card.text ? (
        <Row label={t('content')} value={card.text} />
      ) : (
        <Row label={t('content')} value={t('contentEmpty')} tone={C.dim} />
      )}

      {/* Who the chip belongs to, looked up from the slug it carries. Undefined means the
          lookup has not finished; null means we looked and there is no such card. */}
      {slug && owner !== undefined ? (
        owner ? (
          <>
            <Row label={t('registeredTo')} value={owner.ownerEmail} />
            <Row
              label={t('cardStatus')}
              value={`${owner.ownerUid ? t('statusTaken') : t('statusWaiting')} · ${
                owner.published ? t('statusShown') : t('statusHidden')
              }`}
              tone={owner.ownerUid && owner.published ? C.ok : C.warn}
            />
          </>
        ) : (
          <Row label={t('registeredTo')} value={t('notInBase')} tone={C.warn} />
        )
      ) : null}

      {chip ? <Row label={t('batchOfChip')} value={chip.batchHex} /> : null}
      {chip && chip.uid !== card.uid ? (
        <Text style={[s.hint, {color: C.bad}]}>{t('uidMismatch')}</Text>
      ) : null}

      {card.usedBytes !== null && card.userBytes !== null ? (
        <Row label={t('used')} value={t('usedOf', {a: card.usedBytes, b: card.userBytes})} />
      ) : null}

      <Row
        label={t('chipCounter')}
        value={
          card.taps === null
            ? t('counterOff')
            : card.taps === 1
              ? t('readsOne')
              : t('reads', {n: card.taps})
        }
        tone={card.taps !== null ? C.text : C.dim}
      />

      {prot ? (
        <View style={[s.verdict, {borderColor: prot.tone}]}>
          <Text style={[s.verdictText, {color: prot.tone}]}>{prot.text}</Text>
        </View>
      ) : null}

      {card.protection?.configLocked ? (
        <Text style={[s.hint, {color: C.bad}]}>{t('protLocked')}</Text>
      ) : null}

      {card.protection && card.protection.mirror !== 'off' ? (
        <Text style={s.hint}>mirror: {card.protection.mirror}</Text>
      ) : null}
    </View>
  );
}

/*
 * The batch password. Above the form rather than tucked into settings because the one
 * moment it matters is the moment it is created: those twelve characters are the only copy
 * that will ever exist, and the chip will not give them back.
 */
function PasswordBlock({
  password,
  onCreated,
  t,
}: {
  password: BatchPassword | null;
  onCreated: (p: BatchPassword) => void;
  t: T;
}) {
  const [shown, setShown] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [known, setKnown] = useState<Batch[]>([]);

  useEffect(() => {
    if (typing) {
      knownBatches().then(setKnown).catch(() => {});
    }
  }, [typing]);

  const create = useCallback(async () => {
    const p = await createPassword();
    onCreated(p);
    setShown(passwordHex(p));
    // Backed up before it is shown, so a phone that dies between the two does not take the
    // only copy with it.
    rememberBatch(passwordHex(p)).catch(() => {});
  }, [onCreated]);

  const store = useCallback(async () => {
    try {
      const p = await importPassword(draft);
      onCreated(p);
      rememberBatch(passwordHex(p)).catch(() => {});
      setTyping(false);
      setDraft('');
      setError(null);
    } catch (e) {
      const code = e instanceof Error ? e.message : String(e);
      setError(code === 'bad-batch-password' ? t('errBatchFormat') : code);
    }
  }, [draft, onCreated, t]);

  if (shown) {
    return (
      <View style={[s.verdict, {borderColor: C.warn}]}>
        <Text style={s.blockLabel}>{t('batchPassword')}</Text>
        <Text style={s.password} selectable>
          {shown}
        </Text>
        <Text style={[s.verdictText, {color: C.warn}]}>{t('batchKeep')}</Text>
        <Pressable style={s.secondary} onPress={() => setShown(null)}>
          <Text style={s.secondaryText}>{t('kept')}</Text>
        </Pressable>
      </View>
    );
  }

  /*
   * A stored password is not a dead end. A chip protected with an older batch refuses every
   * write until that batch's password is offered, so there has to be a way to type one in —
   * and a way to see the current one before replacing it, because the phone holds the only
   * copy.
   */
  if (password && !typing) {
    return (
      <View style={s.passwordRow}>
        <Text style={s.passwordOk}>{t('batchSaved')}</Text>
        <View style={{flexDirection: 'row', gap: 16}}>
          <Pressable onPress={() => setShown(passwordHex(password))} hitSlop={10}>
            <Text style={s.link}>{t('show')}</Text>
          </Pressable>
          <Pressable onPress={() => setTyping(true)} hitSlop={10}>
            <Text style={s.link}>{t('batchChange')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={s.block}>
      <Text style={s.blockLabel}>{t('batchPassword')}</Text>
      <Text style={s.blockText}>{t('batchWhy')}</Text>

      {typing ? (
        <View>
          {password ? <Text style={[s.blockText, {color: C.warn}]}>{t('batchChangeWarn')}</Text> : null}
          {known.length ? (
            <View style={{marginBottom: 12}}>
              <Text style={s.blockLabel}>{t('batchKnown')}</Text>
              <Text style={s.blockText}>{t('batchKnownHint')}</Text>
              {known.map(b => (
                <Pressable key={b.id} onPress={() => setDraft(b.hex)} hitSlop={6}>
                  <Text style={[s.rowValue, {color: C.accent, marginTop: 8}]}>{b.hex}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <TextInput
            style={[s.input, s.inputMono]}
            value={draft}
            onChangeText={setDraft}
            placeholder={t('batchFormat')}
            placeholderTextColor={C.dim}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          {error ? <Text style={s.error}>{error}</Text> : null}
          <Pressable style={s.primary} onPress={store}>
            <Text style={s.primaryText}>{t('batchSave')}</Text>
          </Pressable>
          {password ? (
            <Pressable
              style={s.linkRow}
              onPress={() => { setTyping(false); setDraft(''); setError(null); }}>
              <Text style={[s.link, {textAlign: 'center'}]}>{t('batchKeepOld')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View>
          <Pressable style={s.primary} onPress={create}>
            <Text style={s.primaryText}>{t('batchCreate')}</Text>
          </Pressable>
          <Pressable style={s.linkRow} onPress={() => setTyping(true)}>
            <Text style={[s.link, {textAlign: 'center'}]}>{t('batchEnter')}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function WriteTab({
  busy,
  password,
  onPassword,
  onWrite,
  onCardOnly,
  t,
}: {
  busy: boolean;
  password: BatchPassword | null;
  onPassword: (p: BatchPassword) => void;
  onWrite: (o: {url: string; slug: string; email: string; password: BatchPassword; counter: boolean}) => void;
  onCardOnly: (o: {slug: string; email: string}) => void;
  t: T;
}) {
  const [slug, setSlug] = useState('');
  const [email, setEmail] = useState('');
  const [counter, setCounter] = useState(true);

  const clean = slug.trim().toLowerCase();
  const valid = SLUG_RE.test(clean);
  const url = BASE_URL + clean;
  const client = email.trim();
  // Deliberately loose. Firebase is the authority on what an address is; this only catches
  // the empty field and the obvious typo before a round trip.
  const emailOk = client === '' || /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(client);
  const willCreate = client !== '';

  const confirm = useCallback(() => {
    if (!password || !valid || !emailOk) {
      return;
    }
    Alert.alert(
      t('writeConfirm'),
      `${url}\n\n${
        willCreate ? t('writeWillCreate', {email: client}) : t('writeNoCard')
      }\n\n${t('writeWarn')}`,
      [
        {text: t('cancel'), style: 'cancel'},
        {
          text: t('writeCard'),
          style: 'destructive',
          onPress: () => onWrite({url, slug: clean, email: client, password, counter}),
        },
      ],
    );
  }, [password, valid, emailOk, url, clean, client, willCreate, counter, onWrite, t]);

  /*
   * A card without a chip. Needed the moment a chip exists that cannot be rewritten — an
   * old address still in somebody's pocket, or one protected with a password that is gone.
   * The chip already points somewhere; this gives that address something to open.
   */
  const confirmCardOnly = useCallback(() => {
    if (!valid || !willCreate) {
      return;
    }
    Alert.alert(t('cardOnlyConfirm'), t('cardOnlyBody', {slug: clean, email: client}), [
      {text: t('cancel'), style: 'cancel'},
      {text: t('cardOnly'), onPress: () => onCardOnly({slug: clean, email: client})},
    ]);
  }, [valid, willCreate, clean, client, onCardOnly, t]);

  return (
    <View>
      <PasswordBlock password={password} onCreated={onPassword} t={t} />

      <Text style={[s.blockLabel, s.spaced]}>{t('cardAddress')}</Text>
      <View style={s.slugRow}>
        <Text style={s.slugPrefix}>cards/</Text>
        <TextInput
          style={s.slugInput}
          value={slug}
          onChangeText={setSlug}
          placeholder="anna"
          placeholderTextColor={C.dim}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      {clean && !valid ? (
        <Text style={s.error}>{t('slugBad')}</Text>
      ) : (
        <Text style={s.hint}>{valid ? url : t('addressHint')}</Text>
      )}

      <Text style={[s.blockLabel, s.spaced]}>{t('clientEmail')}</Text>
      <TextInput
        style={[s.input, s.spacedSmall]}
        value={email}
        onChangeText={setEmail}
        placeholder="anna@salon.pl"
        placeholderTextColor={C.dim}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
      />
      {!emailOk ? (
        <Text style={s.error}>{t('checkAddress')}</Text>
      ) : (
        <Text style={s.hint}>{willCreate ? t('clientEmailHint') : t('clientEmailEmpty')}</Text>
      )}

      <View style={s.switchRow}>
        <View style={s.switchText}>
          <Text style={s.switchLabel}>{t('chipCounterLabel')}</Text>
          <Text style={s.blockText}>{t('chipCounterHint')}</Text>
        </View>
        <Switch
          value={counter}
          onValueChange={setCounter}
          trackColor={{false: C.line, true: C.ok}}
          thumbColor={C.text}
        />
      </View>

      <Pressable
        style={[s.primary, s.spaced, !password || !valid || !emailOk || busy ? s.disabled : null]}
        disabled={!password || !valid || !emailOk || busy}
        onPress={confirm}>
        <Text style={s.primaryText}>{t('writeCard')}</Text>
      </Pressable>
      {!password ? <Text style={s.hint}>{t('needPassword')}</Text> : null}

      <Pressable
        style={[s.secondary, !valid || !willCreate || busy ? s.disabled : null]}
        disabled={!valid || !willCreate || busy}
        onPress={confirmCardOnly}>
        <Text style={s.secondaryText}>{t('cardOnly')}</Text>
      </Pressable>
      <Text style={s.hint}>{t('cardOnlyHint')}</Text>
    </View>
  );
}

function EraseTab({
  busy,
  password,
  onPassword,
  onErase,
  t,
}: {
  busy: boolean;
  password: BatchPassword | null;
  onPassword: (p: BatchPassword) => void;
  onErase: (p: BatchPassword) => void;
  t: T;
}) {
  const confirm = useCallback(() => {
    if (!password) {
      return;
    }
    Alert.alert(t('eraseConfirm'), t('eraseConfirmBody'), [
      {text: t('cancel'), style: 'cancel'},
      {text: t('eraseButton'), style: 'destructive', onPress: () => onErase(password)},
    ]);
  }, [password, onErase, t]);

  return (
    <View>
      <PasswordBlock password={password} onCreated={onPassword} t={t} />

      <Text style={[s.blockLabel, s.spaced]}>{t('eraseTitle')}</Text>
      <Text style={[s.blockText, s.spacedSmall]}>{t('eraseWhat')}</Text>
      <Text style={[s.blockText, s.spacedSmall]}>{t('eraseNote')}</Text>

      <Pressable
        style={[s.primary, s.spaced, !password || busy ? s.disabled : null]}
        disabled={!password || busy}
        onPress={confirm}>
        <Text style={s.primaryText}>{t('eraseButton')}</Text>
      </Pressable>
      {!password ? <Text style={s.hint}>{t('needPassword')}</Text> : null}
    </View>
  );
}

export function ChipTools({nfcReady, t}: {nfcReady: boolean; t: T}) {
  const [tab, setTab] = useState<Tab>('read');
  const [busy, setBusy] = useState(false);
  const [card, setCard] = useState<CardRead | null>(null);
  const [owner, setOwner] = useState<Card | null | undefined>(undefined);
  const [chip, setChip] = useState<ChipRecord | null>(null);
  const [password, setPassword] = useState<BatchPassword | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const local = await loadPassword();
      if (local) {
        if (alive) setPassword(local);
        return;
      }
      // Keychain empty — most likely a reinstall. The database remembers, so the phone
      // does not have to be the only copy.
      const [latest] = await knownBatches();
      if (latest && alive) {
        setPassword(await importPassword(latest.hex));
        setNote(t('batchRestored'));
      }
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, [t]);

  /* Every operation funnels through here, so cancelling, losing the chip mid-command and a
   * refused write all produce the same kind of message in the same place. */
  const run = useCallback(
    async (job: () => Promise<CardRead>, done: string | null) => {
      setError(null);
      setNote(null);
      setCard(null);
      setOwner(undefined);
      setChip(null);
      setBusy(true);
      try {
        const read = await job();
        setCard(read);
        setNote(done);

        // The chip only carries a URL. Turning that back into a person is a second trip,
        // to Firestore, and it must not be able to fail the operation that already worked.
        const slug = read.url?.match(OUR_URL)?.[1];
        if (slug) {
          findBySlug(slug.toLowerCase())
            .then(found => {
              setOwner(found);
              // Which batch password guards this chip. Without it, a chip from an older
              // batch is a guessing game; with it, the right password is one tap away.
              return found ? chipOf(found.id).then(setChip) : null;
            })
            .catch(() => setOwner(null));
        }
      } catch (e) {
        const msg = String(e instanceof Error ? e.message : e);
        if (e instanceof CardError) {
          setError(t(CHIP_ERRORS[e.code]));
        } else if (e instanceof SlugTaken) {
          setError(t('slugTaken', {slug: e.slug}));
        } else if (msg === 'bad-slug') {
          setError(t('slugBadValue'));
        } else if (/permission|insufficient/i.test(msg)) {
          setError(t('errNotAdmin'));
        } else if (/unavailable|network/i.test(msg)) {
          setError(t('errOffline'));
        } else if (!/cancel/i.test(msg)) {
          // Cancelling the system sheet on iOS, or our own Cancel button, both land here.
          setError(
            /tag was lost|connection lost|transceive|io ?error/i.test(msg) ? t('errMoved') : msg,
          );
        }
      } finally {
        setBusy(false);
      }
    },
    [t],
  );

  const scan = useCallback(() => run(() => readCard(t('holdNow')), null), [run, t]);

  /*
   * Card first, chip second, and never the other way round. If Firestore refuses, the chip
   * is untouched and the whole thing is one retry away; reversed, a failed write leaves a
   * protected card in somebody's hand pointing at an address that does not exist, and
   * nothing about holding it would tell you.
   */
  const write = useCallback(
    (o: {url: string; slug: string; email: string; password: BatchPassword; counter: boolean}) =>
      run(async () => {
        const cardId = o.email ? await createCard({slug: o.slug, email: o.email}) : null;
        const written = await writeCard({
          url: o.url,
          password: o.password,
          enableCounter: o.counter,
          prompt: t('holdWriting'),
        });
        // After the chip, not before: this records what actually happened to a physical
        // object, and it is only true once the chip has accepted the write. A failure here
        // costs a log line, not the operation — the chip is already correct.
        if (cardId) {
          recordChip({
            cardId,
            slug: o.slug,
            uid: written.uid,
            batchHex: passwordHex(o.password),
          }).catch(() => {});
        }
        return written;
      }, t('wroteOk')),
    [run, t],
  );

  const erase = useCallback(
    (p: BatchPassword) => run(() => eraseCard(p, t('holdErasing')), t('erasedOk')),
    [run, t],
  );

  /*
   * No NFC session here at all — nothing is read, nothing is written. `run` exists to drive
   * the chip, so this keeps its own small version of the same error handling.
   */
  const cardOnly = useCallback(
    async (o: {slug: string; email: string}) => {
      setError(null);
      setNote(null);
      setCard(null);
      setOwner(undefined);
      setChip(null);
      setBusy(true);
      try {
        await createCard({slug: o.slug, email: o.email});
        setNote(t('cardOnlyDone'));
      } catch (e) {
        const msg = String(e instanceof Error ? e.message : e);
        if (e instanceof SlugTaken) {
          setError(t('slugTaken', {slug: e.slug}));
        } else if (msg === 'bad-slug') {
          setError(t('slugBadValue'));
        } else if (/permission|insufficient/i.test(msg)) {
          setError(t('errNotAdmin'));
        } else {
          setError(t('errOffline'));
        }
      } finally {
        setBusy(false);
      }
    },
    [t],
  );

  const cancel = useCallback(() => {
    NfcManager.cancelTechnologyRequest().catch(() => {});
  }, []);

  if (!nfcReady) {
    return <Text style={s.notice}>{t('errNoNfc')}</Text>;
  }

  const holding =
    tab === 'read' ? t('holdNow') : tab === 'write' ? t('holdWriting') : t('holdErasing');

  return (
    <View>
      <View style={s.tabs}>
        {(['read', 'write', 'erase'] as const).map(x => (
          <Pressable
            key={x}
            style={[s.tab, tab === x ? s.tabActive : null]}
            onPress={() => {
              setTab(x);
              setCard(null);
              setOwner(undefined);
              setChip(null);
              setError(null);
              setNote(null);
            }}>
            <Text style={[s.tabText, tab === x ? s.tabTextActive : null]}>
              {t(x === 'read' ? 'tabRead' : x === 'write' ? 'tabWrite' : 'tabErase')}
            </Text>
          </Pressable>
        ))}
      </View>

      {busy ? (
        <View style={s.scanBox}>
          <ActivityIndicator color={C.accent} />
          <Text style={s.scanText}>{holding}</Text>
          <Pressable onPress={cancel} hitSlop={12}>
            <Text style={s.cancelText}>{t('cancel')}</Text>
          </Pressable>
        </View>
      ) : tab === 'read' ? (
        <Pressable style={s.primary} onPress={scan}>
          <Text style={s.primaryText}>{t(card ? 'readAnother' : 'readCard')}</Text>
        </Pressable>
      ) : tab === 'write' ? (
        <WriteTab
          busy={busy}
          password={password}
          onPassword={setPassword}
          onWrite={write}
          onCardOnly={cardOnly}
          t={t}
        />
      ) : (
        <EraseTab busy={busy} password={password} onPassword={setPassword} onErase={erase} t={t} />
      )}

      {error ? <Text style={s.error}>{error}</Text> : null}
      {note ? <Text style={s.done}>{note}</Text> : null}
      {card ? <Result card={card} owner={owner} chip={chip} t={t} /> : null}
    </View>
  );
}
