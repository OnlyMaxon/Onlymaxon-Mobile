/*
 * The card itself, on screen, as the piece of plastic it actually is.
 *
 * The card we hand out is black and matte: no gloss, no gradient, nothing printed in
 * colour. So the face drawn here is near-black too, and the owner's accent appears only as
 * a hairline and in the fallback letter — the way foil sits on black plastic. Drawing the
 * public page's tinted background here would look richer and would be a different object
 * than the one in the client's pocket.
 *
 * It deals itself once per launch. A card that re-deals every time the editor is closed
 * stops being an arrival and becomes a wait, so the flag below sits at module scope: it
 * survives a remount and dies with the process, which is exactly "once per launch".
 *
 * `card={null}` draws the plastic with nothing on it, which is what the first screen shows
 * somebody who has not signed in yet. That is not a placeholder for a missing card — it is
 * the object as it arrives in the envelope, and what people who have held one say they like
 * about it is exactly that it is black and says nothing.
 */

import {useEffect, useRef, useState} from 'react';
import {AccessibilityInfo, Animated, Easing, Image, Text, View} from 'react-native';

import {accentInk, type Card} from '../cards';
import type {Key} from '../i18n';
import {photoUrl} from '../photo';
import {s} from '../theme';

let dealt = false;

export function MagicCard({card, t}: {card: Card | null; t: (k: Key) => string}) {
  const enter = useRef(new Animated.Value(dealt ? 1 : 0)).current;
  const sheen = useRef(new Animated.Value(dealt ? 1 : 0)).current;
  // The sweep is a band moved by a pixel distance, so it cannot be laid out until the card
  // has a width. Measured rather than derived from the window: the padding around it is the
  // scroll view's business, not this component's.
  const [width, setWidth] = useState(0);

  useEffect(() => {
    // Both branches of this must leave the card visible. An early return that only skips
    // the animation would leave opacity at 0 on the second mount, and the card would be a
    // black rectangle on a black screen.
    if (dealt) {
      enter.setValue(1);
      sheen.setValue(1);
      return;
    }
    dealt = true;

    let gone = false;
    const show = () => {
      enter.setValue(1);
      sheen.setValue(1);
    };

    AccessibilityInfo.isReduceMotionEnabled()
      .then(reduce => {
        if (gone) {
          return;
        }
        if (reduce) {
          show();
          return;
        }
        Animated.sequence([
          Animated.timing(enter, {
            toValue: 1,
            duration: 760,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(sheen, {
            toValue: 1,
            duration: 820,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]).start();
      })
      .catch(() => {
        if (!gone) {
          show();
        }
      });

    return () => {
      gone = true;
    };
  }, [enter, sheen]);

  const ink = accentInk(card?.accent ?? 'studio');
  const name = card ? card.name.trim() : '';
  const under = card ? [card.role.trim(), card.location.trim()].filter(Boolean).join(' · ') : '';

  return (
    <View>
      <Animated.View
        onLayout={e => setWidth(e.nativeEvent.layout.width)}
        style={[
          s.magic,
          {
            opacity: enter,
            transform: [
              // Perspective first, or the tilt is a flat squash rather than a card coming
              // down onto a table.
              {perspective: 900},
              {translateY: enter.interpolate({inputRange: [0, 1], outputRange: [34, 0]})},
              {rotateX: enter.interpolate({inputRange: [0, 1], outputRange: ['14deg', '0deg']})},
              {scale: enter.interpolate({inputRange: [0, 1], outputRange: [0.94, 1]})},
            ],
          },
        ]}>
        {/* The one catch of light the plastic does have: the top edge. */}
        <View style={s.magicEdge} />

        <View style={s.magicHead}>
          {card?.photoPath ? (
            <Image source={{uri: photoUrl(card.slug, card.photoPath)}} style={s.magicPhoto} />
          ) : (
            <View style={[s.magicPhoto, s.magicPhotoEmpty]}>
              {/* An empty card has no letter: nothing is printed on the plastic either. */}
              <Text style={[s.magicLetter, {color: ink}]}>
                {card ? (name || card.slug).charAt(0).toUpperCase() : ''}
              </Text>
            </View>
          )}

          {card ? (
            <View style={s.magicWho}>
              <Text style={s.magicName} numberOfLines={1}>
                {name || card.slug}
              </Text>
              {under ? (
                <Text style={s.magicRole} numberOfLines={1}>
                  {under}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>

        <View style={s.magicFoot}>
          <View>
            <View style={[s.magicRule, {backgroundColor: ink}]} />
            {card ? <Text style={s.magicSlug}>cards/{card.slug}</Text> : null}
          </View>
          <Image source={require('../../assets/mark.png')} style={s.magicMark} />
        </View>

        {width > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              s.magicSheen,
              {
                height: width,
                top: -width * 0.3,
                opacity: sheen.interpolate({
                  inputRange: [0, 0.14, 0.86, 1],
                  outputRange: [0, 1, 1, 0],
                }),
                // Translate listed first, tilt second: the list applies as T·R, so the
                // band is tilted in its own space and then moved straight across. The
                // other order sweeps it diagonally and it slides off the bottom edge.
                transform: [
                  {
                    translateX: sheen.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-width * 0.45, width * 1.15],
                    }),
                  },
                  {rotate: '18deg'},
                ],
              },
            ]}
          />
        ) : null}
      </Animated.View>

      <Text style={s.magicCaption}>{t('magicCard')}</Text>
    </View>
  );
}
