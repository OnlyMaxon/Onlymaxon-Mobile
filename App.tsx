/*
 * OnlyMaxon.
 *
 * Two people use this app and they see different halves of it. A client signs in, finds
 * the card that was handed to them, and edits what strangers see when they tap it — the
 * chip never changes, only the row behind it. We also read, write and wipe the chips
 * themselves, which is the half behind the admin check.
 *
 * Everything routes off one question: who is signed in, and have they confirmed their
 * address. That confirmation is not decoration — the Firestore rules read it out of the
 * token, and it is the only thing standing between a card and whoever else types its
 * owner's email.
 */

import {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import {SafeAreaProvider, useSafeAreaInsets} from 'react-native-safe-area-context';
import NfcManager from 'react-native-nfc-manager';

import {leave, watchAccount, type Account} from './src/account';
import {isAdmin} from './src/cards';
import {LANGS, useLang} from './src/i18n';
import {ChipTools} from './src/screens/ChipTools';
import {MyCard} from './src/screens/MyCard';
import {SignIn} from './src/screens/SignIn';
import {Verify} from './src/screens/Verify';
import {C, s} from './src/theme';

type Tab = 'card' | 'chips';

function Screen() {
  const insets = useSafeAreaInsets();
  const {lang, setLang, t} = useLang();
  const [account, setAccount] = useState<Account | null>(null);
  const [ready, setReady] = useState(false);
  const [nfcReady, setNfcReady] = useState(false);
  const [tab, setTab] = useState<Tab>('card');

  useEffect(() => {
    const stop = watchAccount(a => {
      setAccount(a);
      setReady(true);
    });
    return stop;
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const supported = await NfcManager.isSupported();
      if (!supported) {
        return;
      }
      await NfcManager.start();
      // isEnabled is an Android question: iOS has no NFC toggle to be off.
      const enabled = Platform.OS === 'android' ? await NfcManager.isEnabled() : true;
      if (alive) {
        setNfcReady(enabled);
      }
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  /*
   * Confirming an address does not fire onAuthStateChanged — that listener reports who is
   * signed in, not what changed about them. So the screen that waits for the confirmation
   * hands the refreshed user straight back, and it goes into state here. Without this the
   * app sits on the "confirm your email" screen forever, however many times the person
   * presses the button.
   */
  const verified = useCallback((fresh: Account) => setAccount(fresh), []);
  const admin = !!account?.verified && isAdmin(account.email);

  let body;
  if (!ready) {
    body = <ActivityIndicator color={C.dim} style={s.spin} />;
  } else if (!account) {
    body = <SignIn t={t} />;
  } else if (!account.verified) {
    body = <Verify account={account} onVerified={verified} t={t} />;
  } else if (admin) {
    body = (
      <View>
        <View style={s.tabs}>
          {(['card', 'chips'] as const).map(x => (
            <Pressable
              key={x}
              style={[s.tab, tab === x ? s.tabActive : null]}
              onPress={() => setTab(x)}>
              <Text style={[s.tabText, tab === x ? s.tabTextActive : null]}>
                {t(x === 'card' ? 'tabCard' : 'tabChips')}
              </Text>
            </Pressable>
          ))}
        </View>
        {tab === 'card' ? (
          <MyCard account={account} t={t} />
        ) : (
          <ChipTools nfcReady={nfcReady} t={t} />
        )}
      </View>
    );
  } else {
    body = <MyCard account={account} t={t} />;
  }

  return (
    <View style={[s.screen, {paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16}]}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <Image source={require('./assets/mark.png')} style={s.mark} resizeMode="contain" />
          <Text style={s.title}>OnlyMaxon</Text>

          <View style={s.headerRight}>
            {LANGS.map(l => (
              <Pressable key={l} onPress={() => setLang(l)} hitSlop={8}>
                <Text style={[s.langCode, lang === l ? s.langActive : null]}>
                  {l.toUpperCase()}
                </Text>
              </Pressable>
            ))}
            {account ? (
              <Pressable onPress={leave} hitSlop={10}>
                <Text style={s.link}>{t('signOut')}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {body}
      </ScrollView>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Screen />
    </SafeAreaProvider>
  );
}
