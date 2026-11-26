/*
 * Run with:  npm test
 *
 * The address goes onto plastic and cannot be reprinted, so what the field does with what
 * somebody types is checked here rather than on a phone. Every case below is a name a real
 * client could type into the registration form.
 */

import {strict as assert} from 'node:assert';
import {test} from 'node:test';

import {SLUG_RE, toSlug} from './slug.ts';

test('turns a Russian name into an address', () => {
  assert.equal(toSlug('Анна Иванова'), 'anna-ivanova');
  assert.equal(toSlug('Максим'), 'maksim');
  assert.equal(toSlug('Щербаков'), 'scherbakov');
  assert.equal(toSlug('Юлия Объедкова'), 'yuliya-obedkova');
  assert.equal(toSlug('ЖЁЛТЫЙ'), 'zheltyy');
});

test('keeps Polish and other diacritics readable', () => {
  assert.equal(toSlug('Łukasz Wójcik'), 'lukasz-wojcik');
  assert.equal(toSlug('Anna Kowalska'), 'anna-kowalska');
  assert.equal(toSlug('Zażółć gęślą'), 'zazolc-gesla');
  assert.equal(toSlug('Müller'), 'muller');
});

test('what it returns passes the rule the chip depends on', () => {
  for (const typed of [
    'Анна Иванова',
    'Łukasz',
    '  Максим  ',
    '@anna.kowalska',
    'Салон «Красота» №1',
    'a'.repeat(60),
    'Щщ',
  ]) {
    const slug = toSlug(typed);
    assert.ok(SLUG_RE.test(slug), `${typed} -> ${slug} is not a valid address`);
  }
});

test('never produces something the rule forbids', () => {
  // Punctuation at the front cannot become a leading hyphen: the rule refuses one.
  assert.equal(toSlug('- анна'), 'anna');
  assert.equal(toSlug('...'), '');
  // One boundary, one hyphen, however it was typed.
  assert.equal(toSlug('anna   _  kowalska'), 'anna-kowalska');
  // Emoji and anything else unknown are boundaries, not characters.
  assert.equal(toSlug('анна 🙂 стилист'), 'anna-stilist');
  // Thirty-nine characters at most, because that is what the address allows.
  assert.equal(toSlug('ш'.repeat(30)).length, 39);
});

test('lets somebody type their way to a second word', () => {
  // Mid-word hyphen survives: "anna-" is on the way to "anna-k", and the rule allows it.
  assert.equal(toSlug('Анна '), 'anna-');
  assert.ok(SLUG_RE.test(toSlug('Анна ')));
});
