/*
 * One screen for both signing in and registering, because from where the client is
 * standing those are the same act: they were handed a card, and now they are proving the
 * address written on it is theirs. Asking them to first work out which of two buttons
 * applies is a question only the database cares about.
 */

import {useCallback, useState} from 'react';
import {ActivityIndicator, Pressable, Text, TextInput, View} from 'react-native';

import {authErrorKey, register, resetPassword, signIn} from '../account';
import type {Key} from '../i18n';
import {C, s} from '../theme';

type T = (k: Key, v?: Record<string, string | number>) => string;

type Mode = 'in' | 'up';

export function SignIn({t}: {t: T}) {
  const [mode, setMode] = useState<Mode>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const ready = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email.trim()) && password.length >= 6;

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      // No navigation on success: the auth listener in App notices and swaps the screen.
      if (mode === 'up') {
        await register(email, password);
      } else {
        await signIn(email, password);
      }
    } catch (e) {
      setError(t(authErrorKey(e)));
    } finally {
      setBusy(false);
    }
  }, [mode, email, password, t]);

  const forgot = useCallback(async () => {
    setError(null);
    setNote(null);
    try {
      await resetPassword(email);
      // Said the same way whether or not the address exists — otherwise this form answers
      // the question "is this person a client of yours" for anybody who asks it.
      setNote(t('resetSent'));
    } catch (e) {
      setError(t(authErrorKey(e)));
    }
  }, [email, t]);

  return (
    <View>
      <View style={s.tabs}>
        {(['in', 'up'] as const).map(m => (
          <Pressable
            key={m}
            style={[s.tab, mode === m ? s.tabActive : null]}
            onPress={() => {
              setMode(m);
              setError(null);
              setNote(null);
            }}>
            <Text style={[s.tabText, mode === m ? s.tabTextActive : null]}>
              {t(m === 'in' ? 'signIn' : 'signUp')}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={s.label}>{t('email')}</Text>
      <TextInput
        style={s.input}
        value={email}
        onChangeText={setEmail}
        placeholder="anna@salon.pl"
        placeholderTextColor={C.dim}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
      />

      <Text style={s.label}>{t('password')}</Text>
      <TextInput
        style={s.input}
        value={password}
        onChangeText={setPassword}
        placeholder={t('passwordHint')}
        placeholderTextColor={C.dim}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        textContentType={mode === 'up' ? 'newPassword' : 'password'}
      />

      {busy ? (
        <ActivityIndicator color={C.accent} style={s.spin} />
      ) : (
        <Pressable
          style={[s.primary, s.spacedSmall, !ready ? s.disabled : null]}
          disabled={!ready}
          onPress={submit}>
          <Text style={s.primaryText}>{t(mode === 'up' ? 'createAccount' : 'doSignIn')}</Text>
        </Pressable>
      )}

      {mode === 'in' ? (
        <Pressable onPress={forgot} hitSlop={10}>
          <Text style={[s.link, s.linkCentered]}>{t('forgot')}</Text>
        </Pressable>
      ) : (
        <Text style={s.hint}>{t('signUpNote')}</Text>
      )}

      {error ? <Text style={s.error}>{error}</Text> : null}
      {note ? <Text style={s.done}>{note}</Text> : null}
    </View>
  );
}
