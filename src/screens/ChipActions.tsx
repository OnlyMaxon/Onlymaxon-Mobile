/*
 * The physical card, from its owner's side.
 *
 * Two things somebody can do to the plastic in their pocket: write the address onto it
 * again, or take it off. Both without a password, because the card they activated
 * themselves was never locked — see writeCard in src/ntag.ts for why it is not.
 *
 * Neither touches the page. Rewriting puts the same address back, so a card that stopped
 * opening starts again; erasing leaves the row, the slug and everything typed into the
 * editor exactly where they were, which is what makes it safe to offer at all. The sentence
 * under each button says so, because "erase" next to a thing somebody spent an evening
 * filling in reads like a threat otherwise.
 *
 * Every attempt is reported, successes and failures alike. See src/activity.ts.
 */

import {useCallback, useState} from 'react';
import {ActivityIndicator, Pressable, Text, View} from 'react-native';

import {report} from '../activity';
import {BASE_URL, type Card} from '../cards';
import {CHIP_ERRORS} from '../chipErrors';
import type {Key} from '../i18n';
import {CardError, eraseCard, writeCard} from '../ntag';
import {C, s} from '../theme';

type T = (k: Key, v?: Record<string, string | number>) => string;

export function ChipActions({
  card,
  nfcReady,
  t,
}: {
  card: Card;
  nfcReady: boolean;
  t: T;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  /* Erasing asks twice. One stray tap must not be able to blank a card somebody is about to
     hand to a client — the same reason the password reset on the sign-in screen asks. */
  const [asking, setAsking] = useState(false);

  const url = `${BASE_URL}${card.slug}`;

  const run = useCallback(
    async (kind: 'rewrite' | 'erase') => {
      setBusy(true);
      setError(null);
      setDone(null);
      try {
        const chip =
          kind === 'rewrite'
            ? await writeCard({
                url,
                password: null,
                enableCounter: false,
                prompt: t('holdWriting'),
              })
            : await eraseCard(null, t('holdErasing'));
        await report({kind, outcome: 'ok', cardId: card.id, chipUid: chip.uid, url});
        setDone(t(kind === 'rewrite' ? 'chipRewritten' : 'chipCleared'));
      } catch (e) {
        setError(e instanceof CardError ? t(CHIP_ERRORS[e.code]) : String(e));
        await report({
          kind,
          outcome: 'failed',
          cardId: card.id,
          url,
          error: e instanceof CardError ? e.code : String(e),
        });
      } finally {
        setBusy(false);
        setAsking(false);
      }
    },
    [card.id, url, t],
  );

  const erase = useCallback(() => {
    if (!asking) {
      setAsking(true);
      return;
    }
    void run('erase');
  }, [asking, run]);

  if (!nfcReady) {
    return null;
  }

  return (
    <View style={s.spaced}>
      <Text style={s.blockLabel}>{t('chipTitle')}</Text>

      {busy ? (
        <ActivityIndicator color={C.accent} style={s.spin} />
      ) : (
        <View>
          <Pressable style={[s.secondary, s.spacedSmall]} onPress={() => run('rewrite')}>
            <Text style={s.secondaryText}>{t('rewriteChip')}</Text>
          </Pressable>
          <Text style={s.blockText}>{t('rewriteWhy')}</Text>

          {/* The margin is on the Pressable rather than on the text inside it, so a low tap
              on the button above cannot land here. */}
          <Pressable style={[s.secondary, s.spaced]} onPress={erase}>
            <Text style={s.secondaryText}>{asking ? t('eraseAsk') : t('eraseChip')}</Text>
          </Pressable>
          <Text style={s.blockText}>{t('eraseWhy')}</Text>
        </View>
      )}

      {error ? <Text style={s.error}>{error}</Text> : null}
      {done ? <Text style={s.done}>{done}</Text> : null}
    </View>
  );
}
