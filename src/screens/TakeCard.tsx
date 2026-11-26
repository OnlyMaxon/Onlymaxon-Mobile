/*
 * Taking the card: the one screen where a person turns plastic into their own.
 *
 * It replaces a bench. Until now a card was created by us, with a slug and an email typed
 * in by hand while the client stood there, and the client turned up afterwards to claim it.
 * That does not survive an order for three hundred cards, so this screen does both halves
 * in one tap: the row is created, and then the chip is written with its address.
 *
 * Database first, chip second, always — the same order the bench uses, for the same reason.
 * If Firestore refuses, the chip is untouched and the whole thing is one retry away.
 * Reversed, a failed write leaves an address on a card in somebody's hand pointing at a row
 * that does not exist, and nothing about holding it would tell you.
 *
 * No password goes onto the chip here, and no tap counter is switched on. The password
 * belongs to a batch: to put one on from this screen the app would have to be holding it,
 * which means shipping it to every phone, which means anybody could rewrite anybody's
 * chip. A card is twelve złoty and carries one public address, so the honest trade is to
 * leave it rewritable. See writeCard in src/ntag.ts.
 */

import {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Pressable, Text, TextInput, View} from 'react-native';

import type {Account} from '../account';
import {report} from '../activity';
import {BASE_URL, SLUG_RE, SlugTaken, createMyCard, toSlug} from '../cards';
import type {Key} from '../i18n';
import {CardError, writeCard} from '../ntag';
import {clearPending, readPending} from '../pending';
import {C, s} from '../theme';
import {MagicCard} from './MagicCard';

type T = (k: Key, v?: Record<string, string | number>) => string;

const HOST = BASE_URL.replace(/^https?:\/\//, '');

export function TakeCard({
  account,
  nfcReady,
  onTaken,
  t,
}: {
  account: Account;
  nfcReady: boolean;
  /* The card now exists, so the screen above this one has to look again. Called after a
     failed chip write too: the row is already there, and leaving somebody on a screen that
     offers to create it a second time is how one person ends up with two addresses. */
  onTaken: () => void;
  t: T;
}) {
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  /*
   * What was typed at registration, which happened before the trip to the mail client and
   * possibly before this process was killed. Absent only if that trip outlived the storage
   * or if the account was made on another device — in which case the field below is empty
   * and the person names the card here instead.
   */
  useEffect(() => {
    let alive = true;
    readPending()
      .then(p => {
        if (alive && p) {
          setSlug(p.slug);
          setName(p.name);
        }
      })
      .finally(() => {
        if (alive) {
          setLoaded(true);
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  const clean = slug.trim().toLowerCase();
  const ready = SLUG_RE.test(clean);
  const url = `${BASE_URL}${clean}`;

  /* The row, which is also everything a person needs to have a page. The chip is the
     second half and can be done again; this half happens once. */
  const create = useCallback(async () => {
    if (!SLUG_RE.test(clean)) {
      setError(t('cardNameBad'));
      return null;
    }
    try {
      const cardId = await createMyCard({
        uid: account.uid,
        email: account.email,
        slug: clean,
        name,
      });
      await clearPending();
      return cardId;
    } catch (e) {
      if (e instanceof SlugTaken) {
        setError(t('cardNameTaken', {slug: e.slug}));
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
      return null;
    }
  }, [account.uid, account.email, clean, name, t]);

  const take = useCallback(async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    const cardId = await create();
    if (!cardId) {
      setBusy(false);
      return;
    }

    try {
      const chip = await writeCard({
        url,
        password: null,
        enableCounter: false,
        prompt: t('holdNow'),
      });
      await report({kind: 'activate', outcome: 'ok', cardId, chipUid: chip.uid, url});
      setDone(t('takeDone'));
    } catch (e) {
      /*
       * The card exists either way, so this is not a failure of the whole act — it is a
       * chip that has to be held against the phone again, which the card screen offers.
       * Reported as a failure, because an attempt that refused is the part of a chip's
       * history worth having.
       */
      await report({
        kind: 'activate',
        outcome: 'failed',
        cardId,
        url,
        error: e instanceof CardError ? e.code : String(e),
      });
    } finally {
      setBusy(false);
      onTaken();
    }
  }, [create, url, onTaken, t]);

  /* No NFC, no tap — and no dead end either. The page is the product; the chip is how
     somebody reaches it, and one can exist for a while without the other. */
  const createOnly = useCallback(async () => {
    setBusy(true);
    setError(null);
    const cardId = await create();
    setBusy(false);
    if (cardId) {
      onTaken();
    }
  }, [create, onTaken]);

  if (!loaded) {
    return <ActivityIndicator color={C.dim} style={s.spin} />;
  }

  return (
    <View>
      <MagicCard card={null} t={t} />

      <Text style={[s.blockLabel, s.spaced]}>{t('takeTitle')}</Text>
      <Text style={s.blockText}>{t('takeWhy')}</Text>

      {/* Shown rather than hidden: this is about to go onto plastic, and the slug cannot be
          changed afterwards because the plastic cannot be reprinted. */}
      <Text style={[s.label, s.spaced]}>{t('cardName')}</Text>
      <TextInput
        style={s.input}
        value={slug}
        onChangeText={v => setSlug(toSlug(v))}
        placeholder="anna-kowalska"
        placeholderTextColor={C.dim}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Text style={s.hint}>{ready ? `${HOST}${clean}` : t('cardNameHint')}</Text>

      {busy ? (
        <ActivityIndicator color={C.accent} style={s.spin} />
      ) : nfcReady ? (
        <Pressable
          style={[s.primary, s.spaced, !ready ? s.disabled : null]}
          disabled={!ready}
          onPress={take}>
          <Text style={s.primaryText}>{t('takeNow')}</Text>
        </Pressable>
      ) : (
        <View>
          <Text style={[s.error, s.spaced]}>{t('errNoNfc')}</Text>
          <Pressable
            style={[s.secondary, s.spacedSmall, !ready ? s.disabled : null]}
            disabled={!ready}
            onPress={createOnly}>
            <Text style={s.secondaryText}>{t('createAccount')}</Text>
          </Pressable>
        </View>
      )}

      {error ? <Text style={s.error}>{error}</Text> : null}
      {done ? <Text style={s.done}>{done}</Text> : null}
    </View>
  );
}
