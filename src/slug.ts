/*
 * The card's address, from whatever somebody actually types.
 *
 * The field asks "what should the card be called", and a person in Warsaw or Moscow
 * answers in their own alphabet — "Анна Иванова", "Łukasz Wójcik". The address cannot
 * hold that: it is printed into a chip and read by every phone, so it is lowercase
 * Latin, digits and hyphens, and nothing else.
 *
 * The field used to take the Cyrillic happily, show it back, and then quietly refuse to
 * go on: the rule below said no, so the button stayed grey with nothing said about why.
 * A dead button is not an answer to a reasonable thing to type. So we transliterate as
 * they type instead — "Анна Иванова" becomes "anna-ivanova" in the field, under the
 * hint that spells out the full address, and the decision stays visible and theirs.
 *
 * This module has no imports on purpose. src/cards.ts, which re-exports SLUG_RE, pulls
 * in Firebase; the rule and this function are testable on a laptop and are tested there
 * (src/slug.test.ts), which is the point of keeping them apart.
 */

/** The rule the address obeys, in the app, in functions/index.js and in firestore.rules. */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}$/;

/** The longest address the rule allows, and the rule the chip's URL length assumes. */
const MAX = 39;

/*
 * Russian first, because that is what our clients write. Ukrainian and Belarusian letters
 * cost one line each and a card is sold to whoever buys one.
 *
 * The scheme is the one people recognise from their own passports and street signs — ж as
 * "zh", я as "ya" — rather than a standard nobody reads. ъ and ь map to nothing, which is
 * what they sound like.
 */
const CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  і: 'i', ї: 'yi', є: 'ye', ґ: 'g', ў: 'u',
};

/*
 * Polish in full, since half our clients are here, plus the diacritics a European name
 * arrives with. ß is "ss" because that is how it is spelled out when it cannot be written.
 */
const LATIN: Record<string, string> = {
  ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z',
  ä: 'a', ö: 'o', ü: 'u', ß: 'ss', å: 'a', æ: 'ae', ø: 'o',
  á: 'a', à: 'a', â: 'a', ã: 'a', é: 'e', è: 'e', ê: 'e', ë: 'e',
  í: 'i', ì: 'i', î: 'i', ï: 'i', ò: 'o', ô: 'o', õ: 'o',
  ú: 'u', ù: 'u', û: 'u', ý: 'y', ÿ: 'y', ñ: 'n', ç: 'c',
  č: 'c', š: 's', ž: 'z', ř: 'r', ť: 't', ď: 'd', ě: 'e', ů: 'u', ň: 'n',
  ğ: 'g', ı: 'i', ş: 's', ő: 'o', ű: 'u', ē: 'e', ī: 'i', ū: 'u',
};

/**
 * What somebody typed, as an address: transliterated, lowercased, spaces and punctuation
 * turned into single hyphens, everything else dropped, 39 characters at most.
 *
 * Safe to run on every keystroke, and run there: the field shows its own result, so what
 * is in the box is always what will be printed. A trailing hyphen survives — somebody
 * typing "anna-" is on their way to "anna-k" and must not have the keyboard fight them —
 * but a leading one cannot, because the rule above forbids it.
 */
export function toSlug(input: string): string {
  let out = '';
  for (const ch of input.toLowerCase()) {
    const mapped = CYRILLIC[ch] ?? LATIN[ch];
    if (mapped !== undefined) {
      out += mapped;
    } else if (/[a-z0-9]/.test(ch)) {
      out += ch;
    } else if (out !== '' && !out.endsWith('-')) {
      // Space, underscore, dot, apostrophe, an emoji: all of it is a word boundary, and
      // one hyphen is what a boundary looks like in an address.
      out += '-';
    }
  }
  return out.slice(0, MAX);
}
