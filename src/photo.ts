/*
 * The picture on a card.
 *
 * The phone picks it, squares it, shrinks it, and posts the bytes to the `photo` function.
 * It does not touch Storage and it does not write `photoPath` — that is the function's job,
 * and firestore.rules refuses a client write that changes the field. The reason is blunt:
 * a path the client chooses is a path the client can point at somebody else's face.
 *
 * Why it is shrunk here rather than there: the picture ends up 82 pixels wide on a page
 * somebody opens outdoors on mobile data while holding a stranger's phone. Sending the
 * 12-megapixel original would cost that person several seconds and us the bandwidth, for a
 * thumbnail. 512 is four times what the page can show and lands around 50 KB.
 *
 * The crop is the centre square. There is no zoom-and-drag screen on purpose: it is a face
 * in a small circle, and a control nobody needs is a control that can go wrong.
 */

import {getApp} from '@react-native-firebase/app';
import * as ImagePicker from 'expo-image-picker';
import {ImageManipulator, SaveFormat} from 'expo-image-manipulator';

import {auth} from './account';
import type {Key} from './i18n';

/** Four times the 82 CSS pixels the page draws, which covers every phone's pixel ratio. */
const SIDE = 512;

/* Decoding a modern phone photo at full size is tens of megabytes of bitmap and the usual
 * way an image feature crashes on an older handset. The decoder is told a ceiling instead,
 * and everything after it works on something already small. */
const DECODE_MAX = 1600;

/** A refusal the editor can show a sentence for, rather than a stack trace. */
export class PhotoRefused extends Error {
  constructor(readonly key: Key) {
    super(key);
  }
}

const endpoint = () =>
  `https://europe-west1-${getApp().options.projectId}.cloudfunctions.net/photo`;

/**
 * Ask for a picture and hand back the JPEG bytes, base64, already square and small.
 * Null means the person backed out, which is not an error and must not read like one.
 */
export async function choosePhoto(from: 'library' | 'camera'): Promise<string | null> {
  const permission =
    from === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new PhotoRefused(from === 'camera' ? 'photoDeniedCamera' : 'photoDeniedLibrary');
  }

  const options: ImagePicker.ImagePickerOptions = {mediaTypes: ['images'], quality: 1};
  const picked =
    from === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (picked.canceled || !picked.assets?.length) return null;

  /*
   * The dimensions come from the decoded image, not from the picker. The picker documents
   * width and height as possibly 0 when the system did not supply them, and a crop computed
   * from a zero is a crop of nothing.
   */
  const loaded = await ImageManipulator.manipulate(picked.assets[0].uri, {
    maxWidth: DECODE_MAX,
    maxHeight: DECODE_MAX,
  }).renderAsync();

  const side = Math.min(loaded.width, loaded.height);
  const square = await ImageManipulator.manipulate(loaded)
    .crop({
      originX: Math.round((loaded.width - side) / 2),
      originY: Math.round((loaded.height - side) / 2),
      width: side,
      height: side,
    })
    .resize({width: SIDE, height: SIDE})
    .renderAsync();

  const out = await square.saveAsync({compress: 0.82, format: SaveFormat.JPEG, base64: true});
  if (!out.base64) throw new PhotoRefused('photoFailed');
  return out.base64;
}

async function post(body: Record<string, unknown>): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new PhotoRefused('photoFailed');

  const res = await fetch(endpoint(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // Forced fresh. The picture is set from the same screen that just confirmed an
      // address, and a token minted before that confirmation still says email_verified
      // false — which the function reads, and refuses.
      authorization: `Bearer ${await user.getIdToken(true)}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new PhotoRefused('photoFailed');
  const out = (await res.json()) as {photoPath?: string};
  return typeof out.photoPath === 'string' ? out.photoPath : '';
}

/** Returns the new photoPath, which the editor needs: the preview URL carries the hash so
 *  that replacing a picture is a different address rather than the same one with new
 *  bytes behind it. */
export async function setPhoto(cardId: string, image: string): Promise<string> {
  return post({cardId, image});
}

/** Takes the picture off the card and deletes the file. Used by the editor, and by account
 *  deletion before it lets go of the card. */
export async function removePhoto(cardId: string): Promise<void> {
  await post({cardId, image: null});
}

/** Where the page shows this card's picture. The hash is in the query so a replacement is
 *  a new address — see the note beside `avatar()` in functions/render.js. */
export function photoUrl(slug: string, photoPath: string): string {
  const v = photoPath.split('/').pop()?.replace(/\.[a-z]+$/i, '') ?? '';
  return `https://cards.onlymaxon.com/${slug}/photo?v=${v}`;
}
