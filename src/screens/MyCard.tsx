/*
 * What the client opens: their own card, and the form that changes it.
 *
 * This is the whole product from their side. They never see a slug, never type a URL, and
 * never touch the chip — the card in their pocket is unchanged, and the next person who
 * taps it sees what was saved here.
 */

import {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Pressable, Switch, Text, TextInput, View} from 'react-native';

import type {Account} from '../account';
import {
  ACCENTS,
  LANGS,
  LIMITS,
  claim,
  myCards,
  save,
  type Card,
  type Link,
  type Service,
} from '../cards';
import type {Key} from '../i18n';
import {C, s} from '../theme';

type T = (k: Key, v?: Record<string, string | number>) => string;

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
          <Pressable onPress={() => onChange(rows.filter((_, j) => j !== i))} hitSlop={8}>
            <Text style={[s.link, {marginTop: 6, fontSize: 13}]}>{t('remove')}</Text>
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

export function MyCard({account, t}: {account: Account; t: T}) {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [draft, setDraft] = useState<Card | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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
      setBusy(true);
      setError(null);
      setSaved(false);
      try {
        await save(next.id, next);
        setDraft(next);
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [draft],
  );

  if (cards === null) {
    return <ActivityIndicator color={C.dim} style={s.spin} />;
  }

  if (!draft) {
    return (
      <View>
        <Text style={s.blockLabel}>{t('noCard')}</Text>
        <Text style={[s.blockText, s.spacedSmall]}>{t('noCardWhy')}</Text>
        <Pressable style={[s.secondary, s.spaced]} onPress={load}>
          <Text style={s.secondaryText}>{t('checkAgain')}</Text>
        </Pressable>
        {error ? <Text style={s.error}>{error}</Text> : null}
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
      </View>
    );
  }

  const set = <K extends keyof Card>(k: K, v: Card[K]) => {
    setDraft({...draft, [k]: v});
    setSaved(false);
  };

  return (
    <View>
      <View style={s.passwordRow}>
        <Text style={s.blockLabel}>{t('myCard')}</Text>
        <Text style={[s.rowValue, {fontSize: 13, color: C.dim}]}>cards/{draft.slug}</Text>
      </View>

      {/* A card nobody can see is the one failure that looks like success: everything was
          typed, everything was saved, and the chip still opens a holding page. The switch
          for it sits at the bottom of a long form, so the state is said at the top. */}
      {!draft.published ? (
        <View style={[s.verdict, {borderColor: C.warn}]}>
          <Text style={[s.verdictText, {color: C.warn}]}>{t('hiddenBanner')}</Text>
          {busy ? null : (
            <Pressable style={[s.primary, s.spacedSmall]} onPress={() => store(true)}>
              <Text style={s.primaryText}>{t('publishAndSave')}</Text>
            </Pressable>
          )}
        </View>
      ) : null}

      <Field label={t('fName')} value={draft.name} onChange={v => set('name', v)} max={LIMITS.name} placeholder="Anna Kowalska" />
      <Field label={t('fRole')} value={draft.role} onChange={v => set('role', v)} max={LIMITS.role} placeholder="Hair stylist · Mokotów" />
      <Field label={t('fCity')} value={draft.location} onChange={v => set('location', v)} max={LIMITS.location} placeholder="Warszawa" />
      <Field label={t('fBio')} value={draft.bio} onChange={v => set('bio', v)} max={LIMITS.bio} multiline placeholder={t('bioHint')} />

      <Field label={t('fPhone')} value={draft.phone} onChange={v => set('phone', v)} max={LIMITS.phone} keyboardType="phone-pad" placeholder="+48 ..." />
      <Field label={t('fEmail')} value={draft.email} onChange={v => set('email', v)} max={LIMITS.email} keyboardType="email-address" placeholder="anna@salon.pl" />
      <Field label={t('fSite')} value={draft.website} onChange={v => set('website', v)} max={LIMITS.website} keyboardType="url" placeholder="https://..." />

      <Rows
        title={t('services')}
        hint={t('servicesHint')}
        rows={draft.services}
        onChange={r => set('services', r as Service[])}
        max={LIMITS.services}
        aKey="name"
        bKey="price"
        aLabel="Strzyżenie"
        bLabel="od 120 zł"
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
        aLabel="Instagram"
        bLabel="https://..."
        t={t}
      />

      <Text style={[s.blockLabel, s.spaced]}>{t('buttonLang')}</Text>
      <Text style={s.blockText}>{t('buttonLangHint')}</Text>
      <Chips options={LANGS} value={draft.lang} onChange={v => set('lang', v)} />

      <Text style={[s.blockLabel, s.spaced]}>{t('colour')}</Text>
      <Chips
        options={ACCENTS}
        value={draft.accent}
        onChange={v => set('accent', v)}
        labels={{studio: 'cyan', amber: 'amber', rose: 'rose', cyan: 'sky'}}
      />

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
    </View>
  );
}
