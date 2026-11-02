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

export const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

export const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: C.bg},
  scroll: {paddingHorizontal: 22, paddingBottom: 60},

  header: {flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24},
  mark: {width: 30, height: 22},
  headerRight: {marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 12},
  langCode: {color: C.dim, fontSize: 13, fontWeight: '600', letterSpacing: 0.5},
  langActive: {color: C.accent},
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
  keyValue: {color: C.text, fontSize: 13, fontFamily: mono, marginVertical: 10, lineHeight: 19},
  command: {
    color: C.text,
    fontSize: 12,
    fontFamily: mono,
    backgroundColor: C.bg,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 10,
  },
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
});
