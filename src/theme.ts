/*
 * The studio's own tokens, lifted from the site's build/src/index.html so the app and
 * onlymaxon.com are the same object rather than two things that look similar. Only `line`
 * and the three status colours are new — the site has no borders this quiet, and nothing
 * on it has to say "this card is unprotected".
 */

import {Platform, StyleSheet} from 'react-native';

export const C = {
  bg: '#06080C', // --bg
  card: '#0E131A',
  line: '#1B242E',
  text: '#E6F4F7', // --ink
  dim: '#93AAB3', // --mut
  accent: '#7FE9F0', // --cyan
  onAccent: '#04141A', // --on-acc
  ok: '#6FD9A6',
  warn: '#E7B45A', // --acc
  bad: '#E8736B',
};

const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

export const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: C.bg},
  scroll: {paddingHorizontal: 22, paddingBottom: 60},

  header: {flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24},
  mark: {width: 30, height: 22},
  headerRight: {marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 12},
  langCode: {color: C.dim, fontSize: 13, fontWeight: '600', letterSpacing: 0.5},
  langActive: {color: C.accent},

  /* The language control. A row of codes fitted while there were two languages; at three it
   * crowds the sign-out link, so it is one button that opens a list instead. */
  langButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: C.line,
  },
  langCaret: {color: C.dim, fontSize: 9, marginTop: 1},
  sheetBack: {flex: 1},
  sheet: {
    position: 'absolute',
    right: 22,
    minWidth: 160,
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    paddingVertical: 6,
  },
  sheetRow: {paddingVertical: 11, paddingHorizontal: 16},
  sheetText: {color: C.text, fontSize: 15},

  /* The photo block. The preview is the same circle the public page draws, at the size it
   * is actually looked at, so what is chosen here is what gets seen. */
  photoRow: {flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 14},
  photoPreview: {width: 72, height: 72, borderRadius: 36, backgroundColor: C.card},
  photoEmpty: {alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line},
  photoLetter: {color: C.dim, fontSize: 28, fontWeight: '600'},
  photoButtons: {flex: 1, gap: 8},

  title: {color: C.text, fontSize: 26, fontWeight: '600', letterSpacing: -0.4},
  spin: {marginTop: 24},

  tabs: {flexDirection: 'row', gap: 8, marginBottom: 24},
  tab: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: C.line,
  },
  tabActive: {backgroundColor: C.card, borderColor: C.accent},
  tabText: {color: C.dim, fontSize: 15},
  tabTextActive: {color: C.text},

  notice: {color: C.dim, fontSize: 15, lineHeight: 22},

  primary: {
    backgroundColor: C.accent,
    borderRadius: 12,
    paddingVertical: 17,
    alignItems: 'center',
  },
  primaryText: {color: C.onAccent, fontSize: 16, fontWeight: '600'},
  disabled: {opacity: 0.35},

  secondary: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 16,
  },
  secondaryText: {color: C.text, fontSize: 15},

  scanBox: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    paddingVertical: 28,
    alignItems: 'center',
    gap: 14,
  },
  scanText: {color: C.text, fontSize: 16},
  cancelText: {color: C.dim, fontSize: 15},

  error: {color: C.bad, fontSize: 14, lineHeight: 20, marginTop: 14},
  done: {color: C.ok, fontSize: 15, marginTop: 20},

  block: {borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 16, gap: 12},
  blockLabel: {color: C.text, fontSize: 15, fontWeight: '600'},
  blockText: {color: C.dim, fontSize: 13, lineHeight: 19},
  spaced: {marginTop: 26},
  spacedSmall: {marginTop: 14},

  passwordRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  passwordOk: {color: C.ok, fontSize: 14},
  password: {color: C.text, fontSize: 24, fontFamily: mono, letterSpacing: 2, marginVertical: 10},
  link: {color: C.accent, fontSize: 14, textDecorationLine: 'underline'},
  linkCentered: {textAlign: 'center', marginTop: 14},

  input: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: C.text,
    fontSize: 16,
    marginBottom: 12,
  },
  inputMono: {fontFamily: mono},
  label: {color: C.dim, fontSize: 13, marginBottom: 6, marginTop: 10},

  slugRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    paddingHorizontal: 14,
    marginTop: 10,
  },
  slugPrefix: {color: C.dim, fontSize: 16, fontFamily: mono},
  slugInput: {flex: 1, color: C.text, fontSize: 16, fontFamily: mono, paddingVertical: 13},

  switchRow: {flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 24},
  switchText: {flex: 1, gap: 4},
  switchLabel: {color: C.text, fontSize: 15},

  result: {marginTop: 28, gap: 2},
  row: {borderTopWidth: 1, borderTopColor: C.line, paddingVertical: 13},
  rowLabel: {color: C.dim, fontSize: 13, marginBottom: 4},
  rowValue: {color: C.text, fontSize: 15, fontFamily: mono},

  hint: {color: C.dim, fontSize: 12, marginTop: 6, paddingBottom: 4},

  verdict: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginTop: 18,
    backgroundColor: C.card,
  },
  verdictText: {fontSize: 14, lineHeight: 20},

  /*
   * The card face — MagicCard.
   *
   * The plastic is 85.6 × 54 mm and matte black, so the face is that ratio and these
   * near-blacks rather than C.card: a surface meant to read as the object in the client's
   * pocket, not as another panel of the app. The only light on it is one hairline along the
   * top edge and the sweep, which is clipped by `overflow` here.
   */
  magic: {
    /*
     * The width has to be stated. With `aspectRatio` alone Yoga stops stretching the box to
     * the container and derives its width from its height instead — which came out narrower
     * than the buttons below it and sat against the left edge, because a box that is not
     * stretched starts at the beginning of the line.
     */
    width: '100%',
    aspectRatio: 1.585,
    marginTop: 20,
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#15191D',
    backgroundColor: '#0A0C0E',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  magicEdge: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  magicSheen: {position: 'absolute', left: 0, width: 64, backgroundColor: 'rgba(255,255,255,0.05)'},

  magicHead: {flexDirection: 'row', alignItems: 'center', gap: 14},
  magicPhoto: {width: 52, height: 52, borderRadius: 26, backgroundColor: '#101418'},
  magicPhotoEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1C2228',
  },
  magicLetter: {fontSize: 22, fontWeight: '600'},
  magicWho: {flex: 1, gap: 3},
  magicName: {color: '#F1F7F9', fontSize: 20, fontWeight: '600', letterSpacing: -0.3},
  magicRole: {color: '#8296A0', fontSize: 13},

  magicFoot: {flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between'},
  magicRule: {width: 26, height: 2, borderRadius: 2, marginBottom: 8},
  magicSlug: {color: '#6D7C84', fontSize: 11, fontFamily: mono, letterSpacing: 0.4},
  magicMark: {width: 26, height: 19, opacity: 0.45},

  magicCaption: {
    color: C.dim,
    fontSize: 12,
    letterSpacing: 0.6,
    textAlign: 'center',
    marginTop: 12,
  },

  /*
   * A tappable link under something else tappable.
   *
   * The margin belongs on the pressable, not on the text inside it: with it on the text,
   * the touch target begins at the bottom edge of whatever sits above, and any hitSlop
   * pushes it further in. That is how a low press on "Sign in" came to send a password
   * reset email, and how a low press on "Save" came to cancel a batch password instead.
   * Use this instead of a bare Pressable with a margin on its Text.
   */
  linkRow: {marginTop: 22, paddingVertical: 6},

  legalRow: {flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 34},
  legalLink: {color: C.dim, fontSize: 13, textDecorationLine: 'underline'},
});
