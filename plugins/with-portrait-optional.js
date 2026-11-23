/*
 * Portrait is how this app is laid out, not a machine it requires.
 *
 * `"orientation": "portrait"` in app.json does two things, and only one of them was wanted.
 * It locks the screen, which is right — every layout here is a single column meant for a
 * phone held upright. It also writes
 *
 *     <uses-feature android:name="android.hardware.screen.portrait" android:required="true"/>
 *
 * into the manifest, which tells Google Play that a device unable to be held in portrait
 * cannot run this app at all. Play believes it and takes the app off tablets, Desktop and
 * Android XR, and then reports that as a problem on every single release — the warning Max
 * has now asked about twice.
 *
 * It is not true. The app works on a tablet exactly as it works on a phone: one column,
 * locked upright. So the feature is declared optional here, which changes who may install
 * and changes nothing about how it behaves.
 *
 * Written as a plugin rather than by hand in a native folder because /android is generated
 * and gitignored: a manifest edited there survives until the next prebuild and no longer.
 */

const {withAndroidManifest} = require('expo/config-plugins');

const FEATURE = 'android.hardware.screen.portrait';

module.exports = function withPortraitOptional(config) {
  return withAndroidManifest(config, cfg => {
    const {manifest} = cfg.modResults;
    manifest['uses-feature'] = manifest['uses-feature'] || [];

    const declared = manifest['uses-feature'].find(
      f => f && f.$ && f.$['android:name'] === FEATURE,
    );

    if (declared) {
      declared.$['android:required'] = 'false';
    } else {
      /*
       * Added rather than skipped when Expo has not written it. Declaring a feature
       * optional is also how an app says "I use this where it exists", and a future Expo
       * that stops emitting the line should not quietly change what Play is told.
       */
      manifest['uses-feature'].push({
        $: {'android:name': FEATURE, 'android:required': 'false'},
      });
    }

    return cfg;
  });
};
