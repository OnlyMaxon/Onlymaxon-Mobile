/*
 * The studio's own site, which is a website and not a screen in here.
 *
 * An "about us" page inside the app would be a second place for the studio's story to
 * live, and the one on onlymaxon.com is already in five languages — two copies drift apart
 * inside a month. So both the header link and the order button open a browser.
 *
 * In the language the app is in, which is the same rule the credit at the bottom of a card
 * page follows: English at the root, every other language under its own prefix. A person
 * reading the app in Polish should not land on an English page.
 */

const STUDIO = 'https://onlymaxon.com';

export const studioUrl = (lang: string) => (lang === 'en' ? `${STUDIO}/` : `${STUDIO}/${lang}/`);
