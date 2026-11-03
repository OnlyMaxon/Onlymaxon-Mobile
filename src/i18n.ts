/*
 * Two languages, one dictionary.
 *
 * Russian first because that is who is holding the phone today, English second because the
 * clients are in Warsaw and half of them do not read Russian. The chosen language is kept
 * on the device, so the app opens in it next time rather than asking again.
 *
 * Every string lives here rather than inline in a screen: a sentence that exists in one
 * place is a sentence that cannot drift out of sync with its translation, and the missing
 * ones are visible at a glance when a key has only one of the two.
 */

import {useCallback, useEffect, useState} from 'react';
import * as SecureStore from 'expo-secure-store';

export const LANGS = ['ru', 'en'] as const;
export type Lang = (typeof LANGS)[number];

const KEY = 'ui_lang';

const DICT = {
  // ── shell ──
  signOut: {ru: 'выйти', en: 'sign out'},
  tabCard: {ru: 'Карточка', en: 'My card'},
  tabChips: {ru: 'Карты', en: 'Chips'},

  // ── sign in ──
  signIn: {ru: 'Вход', en: 'Sign in'},
  signUp: {ru: 'Регистрация', en: 'Register'},
  email: {ru: 'Почта', en: 'Email'},
  password: {ru: 'Пароль', en: 'Password'},
  passwordHint: {ru: 'не короче шести символов', en: 'at least six characters'},
  createAccount: {ru: 'Создать аккаунт', en: 'Create account'},
  doSignIn: {ru: 'Войти', en: 'Sign in'},
  forgot: {ru: 'забыли пароль?', en: 'forgot your password?'},
  forgotConfirm: {
    ru: 'Отправить письмо для смены пароля на {email}? Нажмите ещё раз',
    en: 'Send a password reset email to {email}? Tap again',
  },
  resetSent: {
    ru: 'Если на этот адрес есть аккаунт, письмо для смены пароля уже в пути.',
    en: 'If there is an account on that address, a reset email is on its way.',
  },
  signUpNote: {
    ru: 'На этот адрес придёт письмо с подтверждением. Пока адрес не подтверждён, карточку редактировать нельзя — это то, что защищает её от чужих.',
    en: 'A confirmation email goes to that address. Until it is confirmed the card cannot be edited — that is what keeps it out of other people’s hands.',
  },

  legalPrivacy: {ru: 'Политика', en: 'Privacy'},
  legalTerms: {ru: 'Условия', en: 'Terms'},

  // ── verify ──
  verifyTitle: {ru: 'Подтвердите почту', en: 'Confirm your email'},
  verifySent: {
    ru: 'Мы отправили письмо на {email}. Откройте ссылку в нём и вернитесь сюда.',
    en: 'We sent an email to {email}. Open the link in it and come back here.',
  },
  verifyWhy: {
    ru: 'Это не формальность: карточку выдают на конкретный адрес, и подтверждение — то единственное, что не даёт чужому человеку забрать её себе.',
    en: 'This is not a formality: a card is issued to one address, and this confirmation is the only thing stopping somebody else from claiming it.',
  },
  verifyDone: {ru: 'Я подтвердил', en: 'I have confirmed'},
  verifyAgain: {ru: 'Отправить письмо ещё раз', en: 'Send the email again'},
  verifyNotYet: {
    ru: 'Пока не видим подтверждения. Откройте ссылку в письме и нажмите ещё раз.',
    en: 'No confirmation yet. Open the link in the email and press again.',
  },
  verifyResent: {
    ru: 'Отправили ещё раз. Проверьте и папку со спамом.',
    en: 'Sent again. Check the spam folder too.',
  },

  // ── my card ──
  noCard: {ru: 'Карточки пока нет', en: 'No card yet'},
  noCardWhy: {
    ru: 'Карточка заводится вместе с картой — на тот адрес, который вы назвали, когда её получали. Если карта у вас на руках, а здесь пусто, значит она записана на другую почту. Напишите нам.',
    en: 'A card is created together with the chip, on the address you gave when you received it. If you are holding the card and this is empty, it was issued to a different address. Write to us.',
  },
  checkAgain: {ru: 'Проверить ещё раз', en: 'Check again'},
  waitingTitle: {ru: 'Эта карточка ждёт вас', en: 'This card is waiting for you'},
  waitingWhy: {
    ru: 'Она выдана на {email}, а этот адрес вы только что подтвердили.',
    en: 'It was issued to {email}, and you have just confirmed that address.',
  },
  takeCard: {ru: 'Забрать карточку', en: 'Claim this card'},
  myCard: {ru: 'Моя карточка', en: 'My card'},
  fName: {ru: 'Имя', en: 'Name'},
  fRole: {ru: 'Чем занимаетесь', en: 'What you do'},
  fCity: {ru: 'Город', en: 'City'},
  fBio: {ru: 'О себе', en: 'About you'},
  fPhone: {ru: 'Телефон', en: 'Phone'},
  fEmail: {ru: 'Почта на карточке', en: 'Email on the card'},
  fSite: {ru: 'Сайт', en: 'Website'},
  bioHint: {
    ru: 'Пара строк, которые прочитают за три секунды.',
    en: 'Two lines somebody reads in three seconds.',
  },
  services: {ru: 'Услуги и цены', en: 'Services and prices'},
  servicesHint: {
    ru: 'То, за чем к вам приходят. Коротко — это визитка, а не прайс-лист.',
    en: 'What people come to you for. Keep it short — this is a card, not a price list.',
  },
  links: {ru: 'Ссылки', en: 'Links'},
  linksHint: {
    ru: 'Instagram, сайт, запись. Адрес должен начинаться с https://',
    en: 'Instagram, website, booking. The address has to start with https://',
  },
  add: {ru: 'Добавить', en: 'Add'},
  remove: {ru: 'убрать', en: 'remove'},
  tooMany: {ru: 'больше {n} не поместится на карточку', en: 'more than {n} will not fit'},
  buttonLang: {ru: 'Язык кнопок', en: 'Language of the buttons'},
  buttonLangHint: {
    ru: '«Позвонить», «Написать», «Сохранить контакт».',
    en: '“Call”, “Message”, “Save contact”.',
  },
  colour: {ru: 'Цвет', en: 'Colour'},
  showCard: {ru: 'Показывать карточку', en: 'Show the card'},
  showCardHint: {
    ru: 'Пока выключено, тот кто приложит карту увидит заглушку, а не пустую страницу.',
    en: 'While this is off, anyone who taps the card sees a holding page rather than an empty one.',
  },
  save: {ru: 'Сохранить', en: 'Save'},
  hiddenBanner: {
    ru: 'Карточка скрыта. Тот, кто приложит карту, видит заглушку, а не вас.',
    en: 'This card is hidden. Anyone who taps it sees a holding page, not you.',
  },
  publishAndSave: {ru: 'Показать и сохранить', en: 'Publish and save'},
  savedHidden: {
    ru: 'Сохранено, но карточка всё ещё скрыта.',
    en: 'Saved — but the card is still hidden.',
  },
  savedNote: {
    ru: 'Сохранено. Следующий, кто приложит карту, увидит это.',
    en: 'Saved. The next person who taps the card sees this.',
  },
  otherCards: {ru: 'Другие ваши карточки:', en: 'Your other cards:'},

  // ── deleting an account ──
  dangerTitle: {ru: 'Удалить аккаунт', en: 'Delete account'},
  dangerWhy: {
    ru: 'Аккаунт и всё, что вы в нём заполнили, удаляются навсегда. Отменить это нельзя.',
    en: 'The account and everything you filled in are deleted for good. This cannot be undone.',
  },
  dangerCard: {
    ru: 'Сама карта останется — её адрес напечатан на пластике, и чип продолжит работать. Она вернётся к состоянию «ещё не настроена», как в день выдачи. Если зарегистрируетесь снова на {email}, карта будет ждать вас.',
    en: 'The card itself stays — its address is printed on plastic and the chip keeps working. It goes back to "not set up yet", as it was the day it was issued. Register again on {email} and the card will be waiting.',
  },
  dangerPassword: {ru: 'Введите пароль, чтобы подтвердить', en: 'Enter your password to confirm'},
  dangerConfirm: {ru: 'Удалить навсегда', en: 'Delete permanently'},
  dangerCancel: {ru: 'Отмена', en: 'Cancel'},

  // ── chips ──
  tabRead: {ru: 'Чтение', en: 'Read'},
  tabWrite: {ru: 'Запись', en: 'Write'},
  tabErase: {ru: 'Очистка', en: 'Erase'},
  readCard: {ru: 'Прочитать карту', en: 'Read a chip'},
  readAnother: {ru: 'Прочитать ещё карту', en: 'Read another chip'},
  holdNow: {ru: 'Поднесите карту', en: 'Hold the chip to the phone'},
  holdWriting: {ru: 'Держите карту — идёт запись', en: 'Hold still — writing'},
  holdErasing: {ru: 'Держите карту — идёт очистка', en: 'Hold still — erasing'},
  cancel: {ru: 'Отмена', en: 'Cancel'},
  chip: {ru: 'Чип', en: 'Chip'},
  content: {ru: 'Содержимое', en: 'Content'},
  contentEmpty: {
    ru: 'пусто — на чип ещё ничего не записано',
    en: 'empty — nothing has been written to this chip',
  },
  linkRow: {ru: 'Ссылка', en: 'Link'},
  tapToOpen: {ru: 'нажмите, чтобы открыть', en: 'tap to open'},
  used: {ru: 'Занято', en: 'Used'},
  usedOf: {ru: '{a} из {b} байт', en: '{a} of {b} bytes'},
  chipCounter: {ru: 'Счётчик чипа', en: 'Chip counter'},
  counterOff: {ru: 'выключен', en: 'off'},
  reads: {ru: '{n} чтений', en: '{n} reads'},
  readsOne: {ru: '1 чтение', en: '1 read'},
  registeredTo: {ru: 'Зарегистрирована на', en: 'Registered to'},
  cardStatus: {ru: 'Статус карточки', en: 'Card status'},
  statusTaken: {ru: 'забрана владельцем', en: 'claimed by its owner'},
  statusWaiting: {ru: 'ждёт, владелец ещё не вошёл', en: 'waiting — the owner has not signed in'},
  statusShown: {ru: 'показывается', en: 'visible'},
  statusHidden: {ru: 'скрыта владельцем', en: 'hidden by its owner'},
  notInBase: {ru: 'этого адреса нет в базе', en: 'this address is not in the database'},
  batchOfChip: {ru: 'Пароль этой карты', en: 'Password guarding this chip'},
  uidMismatch: {
    ru: 'UID не совпадает с записанным при выдаче. Возможно, это копия карты.',
    en: 'The UID does not match the one recorded when this card was issued — possibly a copy.',
  },

  // ── write ──
  cardAddress: {ru: 'Адрес карты', en: 'Card address'},
  addressHint: {ru: 'эта ссылка попадёт на чип', en: 'this link goes onto the chip'},
  slugBad: {
    ru: 'Только строчные латинские буквы, цифры и дефис; от 2 до 39 символов, первый — не дефис.',
    en: 'Lowercase letters, digits and hyphens only; 2 to 39 characters, and not starting with a hyphen.',
  },
  clientEmail: {ru: 'Почта клиента', en: 'Client email'},
  clientEmailHint: {
    ru: 'по этому адресу клиент заберёт карточку в приложении',
    en: 'the client claims the card in the app with this address',
  },
  clientEmailEmpty: {
    ru: 'пусто — карточка не создаётся, только запись чипа',
    en: 'empty — no card is created, the chip is only written',
  },
  checkAddress: {ru: 'Проверьте адрес.', en: 'Check that address.'},
  chipCounterLabel: {ru: 'Счётчик чипа', en: 'Chip counter'},
  chipCounterHint: {
    ru: 'Чип сам считает, сколько раз его прочитали. Включается только здесь — потом придётся собирать карты заново.',
    en: 'The chip counts its own reads. It can only be switched on here — afterwards you would have to collect the cards back.',
  },
  writeCard: {ru: 'Записать карту', en: 'Write the chip'},
  cardOnly: {ru: 'Создать карточку без чипа', en: 'Create the card without a chip'},
  cardOnlyHint: {
    ru: 'Для чипа, который уже записан — например, со старым адресом или защищённого потерянным паролем. Чип не трогается.',
    en: 'For a chip that is already written — an old address, or one guarded by a lost password. The chip is not touched.',
  },
  cardOnlyConfirm: {ru: 'Создать карточку?', en: 'Create the card?'},
  cardOnlyBody: {
    ru: 'Карточка {slug} заведётся на {email}. Ни один чип при этом не записывается — убедитесь, что чип уже ведёт на этот адрес.',
    en: 'Card {slug} will be created for {email}. No chip is written — make sure a chip already points at this address.',
  },
  cardOnlyDone: {
    ru: 'Карточка создана. Чип не трогали.',
    en: 'Card created. No chip was touched.',
  },
  writeConfirm: {ru: 'Записать карту?', en: 'Write this chip?'},
  writeWillCreate: {
    ru: 'Карточка заведётся на {email}, затем запишется чип.',
    en: 'A card will be created for {email}, then the chip is written.',
  },
  writeNoCard: {
    ru: 'Карточка не создаётся — только запись чипа.',
    en: 'No card is created — the chip is only written.',
  },
  writeWarn: {
    ru: 'После записи чип защищается паролем партии: перезаписать его без этого пароля станет невозможно.',
    en: 'After writing, the chip is protected with the batch password: without it the chip cannot be rewritten.',
  },
  wroteOk: {ru: 'Карта записана и защищена.', en: 'Chip written and protected.'},
  needPassword: {ru: 'сначала создайте пароль партии', en: 'create the batch password first'},

  // ── erase ──
  eraseTitle: {ru: 'Очистить чип', en: 'Erase the chip'},
  eraseWhat: {
    ru: 'Стирает всё: ссылку, пароль, защиту и счётчик. Чип становится таким, каким приехал с завода, и его можно записать заново.',
    en: 'Wipes everything: the link, the password, the protection and the counter. The chip goes back to how it arrived from the factory and can be written again.',
  },
  eraseNote: {
    ru: 'Карточка в базе не трогается — адрес /u/… остаётся занятым за тем же человеком.',
    en: 'The card in the database is untouched — the /u/… address stays reserved for the same person.',
  },
  eraseButton: {ru: 'Очистить карту', en: 'Erase this chip'},
  eraseConfirm: {ru: 'Очистить чип?', en: 'Erase this chip?'},
  eraseConfirmBody: {
    ru: 'Ссылка и защита будут стёрты. Держите карту у телефона — очистка занимает пару секунд.',
    en: 'The link and the protection will be wiped. Hold the chip to the phone — this takes a couple of seconds.',
  },
  erasedOk: {ru: 'Чип очищен. Теперь он пустой и незащищённый.', en: 'Chip erased. It is now blank and unprotected.'},

  // ── batch password ──
  batchPassword: {ru: 'Пароль партии', en: 'Batch password'},
  batchWhy: {
    ru: 'Нужен до первой записи: им защищаются все карты этой партии. Хранится в ключнице телефона и больше нигде.',
    en: 'Needed before the first write: it protects every chip in this batch. Kept in the phone keychain and nowhere else.',
  },
  batchSaved: {ru: 'Пароль партии сохранён', en: 'Batch password saved'},
  batchChange: {ru: 'сменить', en: 'change'},
  batchKnown: {ru: 'Пароли прошлых партий', en: 'Passwords of earlier batches'},
  batchKnownHint: {
    ru: 'Хранятся в базе и видны только админу. Чип из старой партии открывается своим паролем — нажмите на него.',
    en: 'Kept in the database, visible to admins only. A chip from an earlier batch opens with its own password — tap it.',
  },
  batchRestored: {
    ru: 'Пароль партии восстановлен из базы.',
    en: 'Batch password restored from the database.',
  },
  batchChangeWarn: {
    ru: 'Старый пароль будет стёрт из телефона. Карты, защищённые им, перестанут перезаписываться — сохраните его, если он ещё нужен.',
    en: 'The old password is erased from this phone. Chips protected with it can no longer be rewritten — save it first if it is still needed.',
  },
  batchKeepOld: {ru: 'Отмена', en: 'Cancel'},
  show: {ru: 'показать', en: 'show'},
  batchKeep: {
    ru: 'Сохраните его в менеджер паролей прямо сейчас. Чип пароль не отдаёт — если эта копия потеряется, защищённые карты больше нельзя будет перезаписать.',
    en: 'Put it in a password manager now. The chip never gives it back — lose this copy and protected chips can never be rewritten.',
  },
  kept: {ru: 'Сохранил', en: 'Saved it'},
  batchCreate: {ru: 'Создать пароль', en: 'Create a password'},
  batchEnter: {ru: 'ввести пароль существующей партии', en: 'enter an existing batch password'},
  batchSave: {ru: 'Сохранить пароль', en: 'Save password'},
  batchFormat: {ru: '12 символов 0-9 A-F', en: '12 characters, 0-9 A-F'},

  // ── protection verdicts ──
  protReadLocked: {
    ru: 'PROT = 1 — чтение тоже под паролем. Ни один телефон эту карту не откроет.',
    en: 'PROT = 1 — reads need the password too. No phone will ever open this card.',
  },
  protNone: {
    ru: 'Не защищена. Любой может перезаписать карту на свою ссылку.',
    en: 'Not protected. Anybody can rewrite this chip to their own link.',
  },
  protOk: {
    ru: 'Защищена со страницы {page}: запись только с паролем, чтение открыто.',
    en: 'Protected from page {page}: writing needs the password, reading stays open.',
  },
  protLocked: {
    ru: 'CFGLCK установлен — настройки этого чипа больше нельзя изменить, никогда.',
    en: 'CFGLCK is set — this chip’s configuration can never be changed again.',
  },

  // ── sign-in refusals, from Firebase error codes ──
  authBadEmail: {ru: 'Адрес выглядит неправильно.', en: 'That address does not look right.'},
  authNoPassword: {ru: 'Введите пароль.', en: 'Enter a password.'},
  authWeak: {
    ru: 'Пароль слишком короткий — нужно не меньше шести символов.',
    en: 'That password is too short — six characters at least.',
  },
  authTaken: {
    ru: 'На этот адрес уже есть аккаунт. Войдите или восстановите пароль.',
    en: 'There is already an account on that address. Sign in, or reset the password.',
  },
  authWrong: {ru: 'Адрес или пароль не подошли.', en: 'That address or password did not work.'},
  authDisabled: {ru: 'Этот аккаунт отключён. Напишите нам.', en: 'This account is disabled. Write to us.'},
  authTooMany: {
    ru: 'Слишком много попыток. Подождите пару минут.',
    en: 'Too many attempts. Wait a couple of minutes.',
  },
  authOffline: {
    ru: 'Нет связи с сервером. Проверьте интернет.',
    en: 'No connection to the server. Check the internet.',
  },
  authStale: {
    ru: 'Войдите заново и повторите — для удаления нужен свежий вход.',
    en: 'Sign in again and retry — deleting an account needs a fresh sign-in.',
  },
  authUnknown: {ru: 'Что-то пошло не так.', en: 'Something went wrong.'},

  // ── card refusals ──
  slugBadValue: {ru: 'Адрес карты не подходит.', en: 'That card address is not valid.'},
  slugTaken: {
    ru: 'Адрес {slug} уже занят другой картой.',
    en: 'The address {slug} already belongs to another card.',
  },

  // ── chip refusals, raised as codes by src/ntag.ts ──
  errConfigLocked: {
    ru: 'У этой карты залочена конфигурация (CFGLCK). Изменить её настройки уже нельзя.',
    en: 'This chip’s configuration is locked (CFGLCK). Its settings can no longer be changed.',
  },
  errWrongPassword: {
    ru: 'Чип защищён другим паролем. Если он из прежней партии — нажмите «сменить» у пароля партии и введите тот, которым его защищали.',
    en: 'This chip is protected with a different password. If it is from an earlier batch, press “change” on the batch password and enter the one it was protected with.',
  },
  errTooBig: {
    ru: 'Ссылка не помещается на этот чип.',
    en: 'The link does not fit on this chip.',
  },
  errPastEnd: {
    ru: 'Ссылка вышла за пределы памяти чипа.',
    en: 'The link ran past the end of the chip’s memory.',
  },
  errBatchFormat: {
    ru: 'Пароль партии — 12 символов (0-9, A-F).',
    en: 'A batch password is 12 characters (0-9, A-F).',
  },
  unknownChip: {ru: 'неизвестный чип', en: 'unknown chip'},

  // ── errors ──
  errNoNfc: {
    ru: 'NFC недоступен: либо его нет на устройстве, либо он выключен в настройках.',
    en: 'NFC is unavailable: either this device has none, or it is switched off in settings.',
  },
  errMoved: {
    ru: 'Карта отошла слишком рано. Держите её неподвижно до конца операции.',
    en: 'The chip moved too soon. Hold it still until the operation finishes.',
  },
  errNotAdmin: {
    ru: 'Сервер не дал создать карточку — этот аккаунт не админ. Чип не тронут.',
    en: 'The server refused to create the card — this account is not an admin. The chip is untouched.',
  },
  errOffline: {
    ru: 'Нет связи с базой. Чип не тронут — попробуйте снова.',
    en: 'No connection to the database. The chip is untouched — try again.',
  },
} as const;

export type Key = keyof typeof DICT;

function translate(lang: Lang, key: Key, vars?: Record<string, string | number>): string {
  let out: string = DICT[key][lang];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.replace(`{${k}}`, String(v));
    }
  }
  return out;
}

/*
 * One piece of state, read once at start-up and written when it changes. There is no
 * context provider: the language lives at the top of App and is passed down, which is five
 * props in a five-screen app and no machinery at all.
 */
export function useLang(): {lang: Lang; setLang: (l: Lang) => void; t: (k: Key, v?: Record<string, string | number>) => string} {
  const [lang, setLangState] = useState<Lang>('ru');

  useEffect(() => {
    SecureStore.getItemAsync(KEY)
      .then(v => {
        if (v === 'ru' || v === 'en') {
          setLangState(v);
        }
      })
      .catch(() => {});
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    SecureStore.setItemAsync(KEY, l).catch(() => {});
  }, []);

  const t = useCallback(
    (k: Key, v?: Record<string, string | number>) => translate(lang, k, v),
    [lang],
  );

  return {lang, setLang, t};
}
