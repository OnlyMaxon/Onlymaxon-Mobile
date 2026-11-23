/*
 * Chip refusals, in words.
 *
 * src/ntag.ts raises codes rather than sentences, deliberately: it talks to a radio and has
 * no idea what language the phone is in. This is the one place those codes become something
 * a person reads, and it lives here rather than inside a screen because two screens now
 * show them — the bench, and the owner of a single card pressing "rewrite".
 *
 * Typed against CardErrorCode, so a new code added to the radio layer and forgotten here is
 * a type error rather than a blank message on somebody's phone.
 */

import type {Key} from './i18n';
import type {CardErrorCode} from './ntag';

export const CHIP_ERRORS: Record<CardErrorCode, Key> = {
  'config-locked': 'errConfigLocked',
  'wrong-password': 'errWrongPassword',
  'too-big': 'errTooBig',
  'past-end': 'errPastEnd',
  'url-not-stored': 'errUrlNotStored',
  'password-not-stored': 'errPasswordNotStored',
  'needs-password': 'errNeedsPassword',
};
