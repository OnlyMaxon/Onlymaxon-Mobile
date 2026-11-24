/*
 * What the client opens: their own card, and the form that changes it.
 *
 * This is the whole product from their side. They never see a slug, never type a URL, and
 * never touch the chip — the card in their pocket is unchanged, and the next person who
 * taps it sees what was saved here.
 */

import {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import type {Account} from '../account';
import {
  ACCENTS,
  BASE_URL,
  LANGS,
  LIMITS,
  accentInk,
  claim,
  linkEmpty,
  linkUsable,
  myCards,
  save,
  serviceEmpty,
  serviceUsable,
  type Card,
  type Link,
  type Service,
} from '../cards';
import type {Key} from '../i18n';
import {PhotoRefused, choosePhoto, photoUrl, removePhoto, setPhoto} from '../photo';
import {studioUrl} from '../studio';
import {C, s} from '../theme';
import {ChipActions} from './ChipActions';
import {DeleteAccount} from './DeleteAccount';
import {MagicCard} from './MagicCard';
import {TakeCard} from './TakeCard';

type T = (k: Key, v?: Record<string, string | number>) => string;

/*
 * The picture, or the letter that stands in for it.
 *
 * The letter is not an empty state asking to be filled: a card that never gets a photo is
 * finished, and saying "add a photo" twice as loudly would make it look broken. So the
 * preview is the same circle the page draws, and the buttons sit beside it quietly.
 *
 * This writes straight through rather than into the draft. Everything else on this screen
 * is edited and then saved together, but a photo is a file that has already been uploaded
 * by the time it can be shown — there is nothing left to hold back, and holding it back
 * would mean a "Save" that sometimes also uploads and sometimes does not.
 */
function Photo({
  card,
  onChange,
  t,
}: {
  card: Card;
  onChange: (photoPath: string) => void;
  t: T;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (job: () => Promise<string>) => {
      setAsking(false);
      setBusy(true);
      setError(null);
      try {
        onChange(await job());
      } catch (e) {
        setError(e instanceof PhotoRefused ? t(e.key) : t('photoFailed'));
      } finally {
        setBusy(false);
      }
    },
    [onChange, t],
  );

  const pick = (from: 'library' | 'camera') =>
    run(async () => {
      const image = await choosePhoto(from);
      // Backing out of the picker is not a change. Returning the path unchanged leaves the
      // card exactly as it was, with no error and no flicker.
      return image === null ? card.photoPath : setPhoto(card.id, image);
    });

  const drop = () =>
    run(async () => {
      await removePhoto(card.id);
      return '';
    });

  return (
    <View style={s.spaced}>
      <Text style={s.blockLabel}>{t('photo')}</Text>
      <Text style={s.blockText}>{t('photoHint')}</Text>

      <View style={s.photoRow}>
        {card.photoPath ? (
          <Image source={{uri: photoUrl(card.slug, card.photoPath)}} style={s.photoPreview} />
        ) : (
          <View style={[s.photoPreview, s.photoEmpty]}>
            <Text style={s.photoLetter}>
              {(card.name || card.slug).trim().charAt(0).toUpperCase()}
            </Text>
          </View>
        )}

        <View style={s.photoButtons}>
          {busy ? (
            <Text style={s.blockText}>{t('photoWorking')}</Text>
          ) : asking ? (
            <>
              <Pressable style={s.secondary} onPress={() => pick('library')}>
                <Text style={s.secondaryText}>{t('photoFromLibrary')}</Text>
              </Pressable>
              <Pressable style={s.secondary} onPress={() => pick('camera')}>
                <Text style={s.secondaryText}>{t('photoFromCamera')}</Text>
              </Pressable>
              <Pressable style={s.linkRow} onPress={() => setAsking(false)}>
                <Text style={s.link}>{t('dangerCancel')}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable style={s.secondary} onPress={() => setAsking(true)}>
                <Text style={s.secondaryText}>
                  {card.photoPath ? t('photoChange') : t('photoAdd')}
                </Text>
              </Pressable>
              {card.photoPath ? (
                <Pressable style={s.linkRow} onPress={drop}>
                  <Text style={[s.link, {color: C.bad}]}>{t('photoRemove')}</Text>
                </Pressable>
              ) : null}
            </>
          )}
        </View>
      </View>

      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

function Field({
  label, value, onChange, placeholder, max, multiline, keyboardType,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  max: number;
  multiline?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'url';
}) {
  return (
    <View>
      <Text style={s.label}>
        {label}
        {value.length > max * 0.8 ? `  ${value.length}/${max}` : ''}
      </Text>
      <TextInput
        style={[s.input, multiline ? {height: 96, textAlignVertical: 'top'} : null]}
        value={value}
        onChangeText={x => onChange(x.slice(0, max))}
        placeholder={placeholder}
        placeholderTextColor={C.dim}
        multiline={multiline}
        autoCapitalize={
          keyboardType === 'email-address' || keyboardType === 'url' ? 'none' : 'sentences'
        }
        autoCorrect={false}
        keyboardType={keyboardType ?? 'default'}
      />
    </View>
  );
}

/*
 * The colourways, as colours. Named options were fine while there were four of them and
 * their names were the colours; with eight, "sky" and "cyan" side by side is a riddle, and
 * `graphite` is not a colour name anybody would guess the look of.
 */
function Swatches({
  value,
  onChange,
  t,
}: {
  value: string;
  onChange: (v: (typeof ACCENTS)[number]) => void;
  t: T;
}) {
  return (
    <View style={s.swatchRow}>
      {ACCENTS.map(a => (
        <Pressable
          key={a}
          style={[s.swatch, value === a ? s.swatchOn : null]}
          onPress={() => onChange(a)}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={`${t('colour')}: ${a}`}
          accessibilityState={{selected: value === a}}>
          <View style={[s.swatchDot, {backgroundColor: accentInk(a)}]} />
        </Pressable>
      ))}
    </View>
  );
}

function Chips<V extends string>({
  options, value, onChange, labels,
}: {
  options: readonly V[];
  value: string;
  onChange: (v: V) => void;
  labels?: Record<string, string>;
}) {
  return (
    <View style={[s.tabs, {marginBottom: 6, flexWrap: 'wrap'}]}>
      {options.map(o => (
        <Pressable
          key={o}
          style={[s.tab, value === o ? s.tabActive : null]}
          onPress={() => onChange(o)}>
          <Text style={[s.tabText, value === o ? s.tabTextActive : null]}>
            {labels?.[o] ?? o}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/*
 * Services and links are the same shape of thing — a short list of two-field rows — so they
 * share one component. A half-typed row costs nothing: empty ones are dropped on save, so
 * no confirmation dialog is needed to get rid of one.
 */
function Rows<R extends Service | Link>({
  title, hint, rows, onChange, max, aKey, bKey, aLabel, bLabel, t,
}: {
  title: string;
  hint: string;
  rows: R[];
  onChange: (r: R[]) => void;
  max: number;
  aKey: keyof R;
  bKey: keyof R;
  aLabel: string;
  bLabel: string;
  t: T;
}) {
  const set = (i: number, k: keyof R, v: string) =>
    onChange(rows.map((r, j) => (i === j ? {...r, [k]: v} : r)));

  return (
    <View style={s.spaced}>
      <Text style={s.blockLabel}>{title}</Text>
      <Text style={s.blockText}>{hint}</Text>

      {rows.map((r, i) => (
        <View key={i} style={{marginTop: 12}}>
          <View style={{flexDirection: 'row', gap: 8}}>
            <TextInput
              style={[s.input, {flex: 2, marginBottom: 0}]}
              value={String(r[aKey] ?? '')}
              onChangeText={v => set(i, aKey, v)}
              placeholder={aLabel}
              placeholderTextColor={C.dim}
              autoCorrect={false}
            />
            <TextInput
              style={[s.input, {flex: 1, marginBottom: 0}]}
              value={String(r[bKey] ?? '')}
              onChangeText={v => set(i, bKey, v)}
              placeholder={bLabel}
              placeholderTextColor={C.dim}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          {/* Margin on the pressable: with it on the text, a low tap on the field above
              deleted the row. See s.linkRow. */}
          <Pressable
            style={{marginTop: 8, paddingVertical: 4, alignSelf: 'flex-start'}}
            onPress={() => onChange(rows.filter((_, j) => j !== i))}>
            <Text style={[s.link, {fontSize: 13}]}>{t('remove')}</Text>
          </Pressable>
        </View>
      ))}

      {rows.length < max ? (
        <Pressable
          style={s.secondary}
          onPress={() => onChange([...rows, {[aKey]: '', [bKey]: ''} as unknown as R])}>
          <Text style={s.secondaryText}>{t('add')}</Text>
        </Pressable>
      ) : (
        <Text style={s.hint}>{t('tooMany', {n: max})}</Text>
      )}
    </View>
  );
}

export function MyCard({
  account,
  nfcReady,
  lang,
  t,
}: {
  account: Account;
  nfcReady: boolean;
  lang: string;
  t: T;
}) {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [draft, setDraft] = useState<Card | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const found = await myCards(account.uid, account.email);
      setCards(found);
      setDraft(found[0] ?? null);
    } catch (e) {
      setCards([]);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [account.uid, account.email]);

  useEffect(() => {
    load();
  }, [load]);

  const take = useCallback(
    async (card: Card) => {
      setBusy(true);
      setError(null);
      try {
        await claim(card.id, account.uid);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [account.uid, load],
  );

  const store = useCallback(
    async (publish?: boolean) => {
      if (!draft) {
        return;
      }
      const next = publish ? {...draft, published: true} : draft;

      /*
       * Half-filled rows used to be dropped on the way out: save() kept only the rows that
       * had both fields and an openable address, so a Telegram handle typed as "@onlymaxon"
       * vanished the moment Save was pressed, with no error and no sign that anything had
       * happened. Whatever the person typed is now either saved or named here.
       */
      const badLink = next.links.findIndex(x => !linkEmpty(x) && !linkUsable(x));
      if (badLink >= 0) {
        setSaved(false);
        setError(t('linkBad', {n: badLink + 1}));
        return;
      }
      const badService = next.services.findIndex(x => !serviceEmpty(x) && !serviceUsable(x));
      if (badService >= 0) {
        setSaved(false);
        setError(t('serviceBad', {n: badService + 1}));
        return;
      }

      setBusy(true);
      setError(null);
      setSaved(false);
      try {
        await save(next.id, next);
        setDraft(next);
        // The card screen draws this list, not the draft, so it has to move with the save.
        setCards(cs => (cs ?? []).map(c => (c.id === next.id ? next : c)));
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [draft, t],
  );

  if (cards === null) {
    return <ActivityIndicator color={C.dim} style={s.spin} />;
  }

  /*
   * Nothing on this address at all — so this is a person who has just registered, and the
   * answer is to make them a card rather than to tell them there isn't one. A card we made
   * at the bench and that is still waiting for them is the branch below; that one is found
   * by their email and must keep working, because every card issued before this screen
   * existed is one of those.
   *
   * Deleting the account stays reachable from here. It is the one control Apple requires of
   * anything that can create an account (5.1.1(v)), and an account with no card is exactly
   * the state somebody who changed their mind is in.
   */
  if (!draft) {
    return (
      <View>
        <TakeCard account={account} nfcReady={nfcReady} onTaken={load} t={t} />
        <Pressable style={[s.secondary, s.spaced]} onPress={load}>
          <Text style={s.secondaryText}>{t('checkAgain')}</Text>
        </Pressable>
        {error ? <Text style={s.error}>{error}</Text> : null}
        <DeleteAccount uid={account.uid} email={account.email} cards={cards} t={t} />
      </View>
    );
  }

  // Handed out, but not yet taken by anybody. One button turns it into theirs.
  if (draft.ownerUid === null) {
    return (
      <View>
        <Text style={s.blockLabel}>{t('waitingTitle')}</Text>
        <Text style={[s.blockText, s.spacedSmall]}>
          {t('waitingWhy', {email: draft.ownerEmail})}
        </Text>
        {busy ? (
          <ActivityIndicator color={C.accent} style={s.spin} />
        ) : (
          <Pressable style={[s.primary, s.spaced]} onPress={() => take(draft)}>
            <Text style={s.primaryText}>{t('takeCard')}</Text>
          </Pressable>
        )}
        {error ? <Text style={s.error}>{error}</Text> : null}
        <DeleteAccount uid={account.uid} email={account.email} cards={cards} t={t} />
      </View>
    );
  }

  const set = <K extends keyof Card>(k: K, v: Card[K]) => {
    setDraft({...draft, [k]: v});
    setSaved(false);
  };

  /*
   * What the card screen draws: the saved card, never the draft.
   *
   * Typed-but-unsaved text stays in the editor where it was typed — the draft is not thrown
   * away by leaving — but the card beside a "View" button that opens the real page has to be
   * the same card that page shows. Drawing the draft here would put a name on the plastic
   * that nobody tapping the chip can see.
   */
  const live = cards.find(c => c.id === draft.id) ?? draft;

  // A photo is on the server by the time it can be shown, so both copies take it at once.
  const photoSaved = (photoPath: string) => {
    setDraft({...draft, photoPath});
    setCards(cs => (cs ?? []).map(c => (c.id === draft.id ? {...c, photoPath} : c)));
  };

  /*
   * The card, and the form behind a button.
   *
   * All of this used to open at once, so the first thing the owner of a card saw was seven
   * text fields. The card is the thing they came to look at; editing it is something they
   * do now and then.
   *
   * The hidden banner is on both screens. A card nobody can see is the one failure that
   * looks like success, and a warning one tap deep is a warning nobody reads.
   */
  const hidden = !live.published ? (
    <View style={[s.verdict, {borderColor: C.warn}]}>
      <Text style={[s.verdictText, {color: C.warn}]}>{t('hiddenBanner')}</Text>
      {busy ? null : (
        <Pressable style={[s.primary, s.spacedSmall]} onPress={() => store(true)}>
          <Text style={s.primaryText}>{t('publishAndSave')}</Text>
        </Pressable>
      )}
    </View>
  ) : null;

  if (!editing) {
    return (
      <View>
        {hidden}

        <MagicCard card={live} t={t} />

        {/* The system browser, on the real address, rather than a second drawing of the
            page inside the app: what opens here is what the next person to tap the chip
            gets, and it cannot drift away from it. */}
        <Pressable
          style={[s.primary, s.spaced]}
          onPress={() => Linking.openURL(`${BASE_URL}${live.slug}`)}>
          <Text style={s.primaryText}>{t('viewCard')}</Text>
        </Pressable>
        <Pressable style={s.secondary} onPress={() => setEditing(true)}>
          <Text style={s.secondaryText}>{t('editCard')}</Text>
        </Pressable>
        <Text style={[s.hint, {textAlign: 'center'}]}>{t('viewHint')}</Text>

        <ChipActions card={live} nfcReady={nfcReady} t={t} />

        {/* Ordering another one is a conversation with us, not a screen in here: it opens
            the site, where the card is the first thing on the page and the form knows what
            it is being asked for. */}
        <Pressable
          style={[s.secondary, s.spaced]}
          onPress={() => Linking.openURL(studioUrl(lang))}>
          <Text style={s.secondaryText}>{t('orderMore')}</Text>
        </Pressable>

        {error ? <Text style={s.error}>{error}</Text> : null}

        {cards.length > 1 ? (
          <View style={s.spaced}>
            <Text style={s.blockText}>{t('otherCards')}</Text>
            {cards
              .filter(c => c.id !== draft.id)
              .map(c => (
                <Pressable key={c.id} onPress={() => setDraft(c)} hitSlop={8}>
                  <Text style={[s.link, {marginTop: 8}]}>cards/{c.slug}</Text>
                </Pressable>
              ))}
          </View>
        ) : null}

        {/* Deleting an account stays on this screen instead of moving into the editor with
            the rest of the form: both stores want it findable, and one tap deeper is one
            tap less findable. */}
        <DeleteAccount uid={account.uid} email={account.email} cards={cards} t={t} />
      </View>
    );
  }

  return (
    <View>
      {/* Margin on the pressable, not on the text — see s.linkRow. */}
      <Pressable
        style={{paddingVertical: 6, alignSelf: 'flex-start'}}
        onPress={() => setEditing(false)}>
        <Text style={s.link}>← {t('backToCard')}</Text>
      </Pressable>

      <View style={[s.passwordRow, s.spacedSmall]}>
        <Text style={s.blockLabel}>{t('myCard')}</Text>
        <Text style={[s.rowValue, {fontSize: 13, color: C.dim}]}>cards/{draft.slug}</Text>
      </View>

      {hidden}

      {/* Above the name, because that is where it sits on the card itself. The letter the
          circle falls back to is the first letter of the name, so the two belong together. */}
      <Photo card={draft} onChange={photoSaved} t={t} />

      <Field label={t('fName')} value={draft.name} onChange={v => set('name', v)} max={LIMITS.name} placeholder={t('phName')} />
      <Field label={t('fRole')} value={draft.role} onChange={v => set('role', v)} max={LIMITS.role} placeholder={t('phRole')} />
      <Field label={t('fCity')} value={draft.location} onChange={v => set('location', v)} max={LIMITS.location} placeholder={t('phCity')} />
      <Field label={t('fBio')} value={draft.bio} onChange={v => set('bio', v)} max={LIMITS.bio} multiline placeholder={t('bioHint')} />

      <Field label={t('fPhone')} value={draft.phone} onChange={v => set('phone', v)} max={LIMITS.phone} keyboardType="phone-pad" placeholder={t('phPhone')} />
      <Field label={t('fEmail')} value={draft.email} onChange={v => set('email', v)} max={LIMITS.email} keyboardType="email-address" placeholder={t('phEmail')} />
      <Field label={t('fSite')} value={draft.website} onChange={v => set('website', v)} max={LIMITS.website} keyboardType="url" placeholder="https://..." />

      <Rows
        title={t('services')}
        hint={t('servicesHint')}
        rows={draft.services}
        onChange={r => set('services', r as Service[])}
        max={LIMITS.services}
        aKey="name"
        bKey="price"
        aLabel={t('phService')}
        bLabel={t('phPrice')}
        t={t}
      />

      <Rows
        title={t('links')}
        hint={t('linksHint')}
        rows={draft.links}
        onChange={r => set('links', r as Link[])}
        max={LIMITS.links}
        aKey="label"
        bKey="url"
        aLabel="Telegram"
        bLabel="@tag · https://…"
        t={t}
      />

      <Text style={[s.blockLabel, s.spaced]}>{t('buttonLang')}</Text>
      <Text style={s.blockText}>{t('buttonLangHint')}</Text>
      <Chips options={LANGS} value={draft.lang} onChange={v => set('lang', v)} />

      <Text style={[s.blockLabel, s.spaced]}>{t('colour')}</Text>
      <Swatches value={draft.accent} onChange={v => set('accent', v)} t={t} />

      <View style={s.switchRow}>
        <View style={s.switchText}>
          <Text style={s.switchLabel}>{t('showCard')}</Text>
          <Text style={s.blockText}>{t('showCardHint')}</Text>
        </View>
        <Switch
          value={draft.published}
          onValueChange={v => set('published', v)}
          trackColor={{false: C.line, true: C.ok}}
          thumbColor={C.text}
        />
      </View>

      {busy ? (
        <ActivityIndicator color={C.accent} style={s.spin} />
      ) : (
        <Pressable style={[s.primary, s.spaced]} onPress={() => store()}>
          <Text style={s.primaryText}>{t('save')}</Text>
        </Pressable>
      )}

      {saved ? (
        <Text style={[s.done, draft.published ? null : {color: C.warn}]}>
          {draft.published ? t('savedNote') : t('savedHidden')}
        </Text>
      ) : null}
      {error ? <Text style={s.error}>{error}</Text> : null}

      <Pressable style={s.linkRow} onPress={() => setEditing(false)}>
        <Text style={s.link}>← {t('backToCard')}</Text>
      </Pressable>
    </View>
  );
}
