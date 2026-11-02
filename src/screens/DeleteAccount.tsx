/*
 * Deleting an account, from inside the app.
 *
 * Apple requires this of anything that can create an account (guideline 5.1.1(v)) and will
 * reject a build without it, but the requirement is also just right: an account somebody
 * can only get rid of by writing to us is one they cannot get rid of.
 *
 * The interesting part is what it must not delete. A card is a row behind a URL printed on
 * a piece of plastic, and the plastic does not know the account is gone — so the row stays,
 * emptied and unclaimed, and the chip keeps opening the holding page it opened on the day
 * it was written. See release() in src/cards.ts.
 *
 * The order is load-bearing, the same way it is at the bench: let go of the cards first,
 * while a token the Firestore rules accept still exists, and delete the account last.
 */

import {useCallback, useState} from 'react';
import {ActivityIndicator, Pressable, Text, TextInput, View} from 'react-native';

import {authErrorKey, erase, prove} from '../account';
import {release, type Card} from '../cards';
import type {Key} from '../i18n';
import {C, s} from '../theme';

type T = (k: Key, v?: Record<string, string | number>) => string;

export function DeleteAccount({
  uid,
  email,
  cards,
  t,
}: {
  uid: string;
  email: string;
  cards?: Card[];
  t: T;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      // The password again, which is both what Firebase demands for a delete and the only
      // confirmation step there is — a deliberate act, unlike pressing "yes" in a dialog.
      await prove(password);

      // Cards still waiting for this address are not ours to touch: nobody has claimed
      // them, and releasing one would mean editing a card this account does not own.
      for (const card of (cards ?? []).filter(c => c.ownerUid === uid)) {
        await release(card);
      }

      // Last. After this there is no token, and nothing above could run.
      await erase();
      // No success state: the account is gone, the auth listener fires with null, and the
      // app is already back on the sign-in screen by the time this would have rendered.
    } catch (e) {
      const code = String((e as {code?: string})?.code ?? '');
      setError(
        code.startsWith('auth/') ? t(authErrorKey(e)) : e instanceof Error ? e.message : String(e),
      );
      setBusy(false);
    }
  }, [cards, password, t, uid]);

  if (!open) {
    return (
      <Pressable style={s.spaced} onPress={() => setOpen(true)} hitSlop={8}>
        <Text style={[s.link, {color: C.bad, textAlign: 'center'}]}>{t('dangerTitle')}</Text>
      </Pressable>
    );
  }

  return (
    <View style={[s.verdict, s.spaced, {borderColor: C.bad}]}>
      <Text style={[s.blockLabel, {color: C.bad}]}>{t('dangerTitle')}</Text>
      <Text style={[s.blockText, s.spacedSmall]}>{t('dangerWhy')}</Text>
      <Text style={[s.blockText, s.spacedSmall]}>{t('dangerCard', {email})}</Text>

      <Text style={s.label}>{t('dangerPassword')}</Text>
      <TextInput
        style={s.input}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="password"
      />

      {busy ? (
        <ActivityIndicator color={C.bad} style={s.spin} />
      ) : (
        <>
          <Pressable
            style={[s.primary, {backgroundColor: C.bad}, password ? null : s.disabled]}
            disabled={!password}
            onPress={run}>
            <Text style={[s.primaryText, {color: C.bg}]}>{t('dangerConfirm')}</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setOpen(false);
              setPassword('');
              setError(null);
            }}
            hitSlop={8}>
            <Text style={[s.link, s.linkCentered]}>{t('dangerCancel')}</Text>
          </Pressable>
        </>
      )}

      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}
