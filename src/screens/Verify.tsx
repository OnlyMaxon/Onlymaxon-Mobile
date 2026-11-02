/*
 * The wait for a confirmed address.
 *
 * Nothing tells the app when the link is clicked — it happens in a mail client, then a
 * browser, both outside this process. So the screen does not pretend to know: it gives the
 * person a button to press when they are back, and checks then.
 */

import {useCallback, useState} from 'react';
import {ActivityIndicator, Pressable, Text, View} from 'react-native';

import {leave, authErrorKey, refresh, resendVerification, type Account} from '../account';
import type {Key} from '../i18n';
import {C, s} from '../theme';
import {DeleteAccount} from './DeleteAccount';

type T = (k: Key, v?: Record<string, string | number>) => string;

export function Verify({account, onVerified, t}: {account: Account; onVerified: (a: Account) => void; t: T}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const check = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const fresh = await refresh();
      if (fresh?.verified) {
        onVerified(fresh);
      } else {
        setError(t('verifyNotYet'));
      }
    } catch (e) {
      setError(t(authErrorKey(e)));
    } finally {
      setBusy(false);
    }
  }, [onVerified, t]);

  const resend = useCallback(async () => {
    setError(null);
    setNote(null);
    try {
      await resendVerification();
      setNote(t('verifyResent'));
    } catch (e) {
      setError(t(authErrorKey(e)));
    }
  }, [t]);

  return (
    <View>
      <Text style={s.blockLabel}>{t('verifyTitle')}</Text>
      <Text style={[s.blockText, s.spacedSmall]}>{t('verifySent', {email: account.email})}</Text>
      <Text style={[s.blockText, s.spacedSmall]}>{t('verifyWhy')}</Text>

      {busy ? (
        <ActivityIndicator color={C.accent} style={s.spin} />
      ) : (
        <Pressable style={[s.primary, s.spaced]} onPress={check}>
          <Text style={s.primaryText}>{t('verifyDone')}</Text>
        </Pressable>
      )}

      <Pressable style={s.secondary} onPress={resend}>
        <Text style={s.secondaryText}>{t('verifyAgain')}</Text>
      </Pressable>

      <Pressable onPress={leave} hitSlop={10}>
        <Text style={[s.link, s.linkCentered]}>{t('signOut')}</Text>
      </Pressable>

      {error ? <Text style={s.error}>{error}</Text> : null}
      {note ? <Text style={s.done}>{note}</Text> : null}

      {/* Here too, and not only on the card screen: somebody who registered on the wrong
          address is stuck on this screen, and signing out does not get rid of the account
          that holds their typo. */}
      <DeleteAccount uid={account.uid} email={account.email} t={t} />
    </View>
  );
}
