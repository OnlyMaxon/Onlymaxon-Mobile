/*
 * Three languages, one dictionary.
 *
 * Russian first because that is who is holding the phone today, English second because the
 * clients are in Warsaw and half of them do not read Russian, Polish third because the rest
 * of them do. The chosen language is kept on the device, so the app opens in it next time
 * rather than asking again.
 *
 * Every string lives here rather than inline in a screen: a sentence that exists in one
 * place is a sentence that cannot drift out of sync with its translations, and a key that
 * is missing one does not compile.
 *
 * The examples shown in the editor's empty fields are here for the same reason. They used
 * to be written into the form itself, in Polish, so a Russian client filling in their
 * services was shown "Strzyżenie" as the example of what to type.
 */

import {useCallback, useEffect, useState} from 'react';
import * as SecureStore from 'expo-secure-store';

export const LANGS = ['ru', 'en', 'pl'] as const;
export type Lang = (typeof LANGS)[number];

/** What the language button shows. Each language names itself, as it should. */
export const LANG_NAMES: Record<Lang, string> = {
  ru: 'Русский',
  en: 'English',
  pl: 'Polski',
};

const KEY = 'ui_lang';

const DICT = {
  // ── shell ──
  signOut: {ru: 'выйти', en: 'sign out', pl: 'wyloguj'},
  tabCard: {ru: 'Карточка', en: 'My card', pl: 'Moja wizytówka'},
  tabChips: {ru: 'Карты', en: 'Chips', pl: 'Karty'},

  // ── sign in ──
  signIn: {ru: 'Вход', en: 'Sign in', pl: 'Logowanie'},
  signUp: {ru: 'Регистрация', en: 'Register', pl: 'Rejestracja'},
  email: {ru: 'Почта', en: 'Email', pl: 'E-mail'},
  password: {ru: 'Пароль', en: 'Password', pl: 'Hasło'},
  passwordHint: {ru: 'не короче шести символов', en: 'at least six characters', pl: 'nie krócej niż sześć znaków'},
  createAccount: {ru: 'Создать аккаунт', en: 'Create account', pl: 'Załóż konto'},
  doSignIn: {ru: 'Войти', en: 'Sign in', pl: 'Zaloguj się'},
  forgot: {ru: 'забыли пароль?', en: 'forgot your password?', pl: 'nie pamiętasz hasła?'},
  forgotConfirm: {
    ru: 'Отправить письмо для смены пароля на {email}? Нажмите ещё раз',
    en: 'Send a password reset email to {email}? Tap again',
    pl: 'Wysłać e-mail do zmiany hasła na {email}? Naciśnij jeszcze raz',
  },
  resetSent: {
    ru: 'Если на этот адрес есть аккаунт, письмо для смены пароля уже в пути.',
    en: 'If there is an account on that address, a reset email is on its way.',
    pl: 'Jeśli na ten adres jest konto, e-mail do zmiany hasła już jest w drodze.',
  },
  signUpNote: {
    ru: 'На этот адрес придёт письмо с подтверждением. Пока адрес не подтверждён, карточку редактировать нельзя — это то, что защищает её от чужих.',
    en: 'A confirmation email goes to that address. Until it is confirmed the card cannot be edited — that is what keeps it out of other people’s hands.',
    pl: 'Na ten adres przyjdzie e-mail z potwierdzeniem. Dopóki adres nie jest potwierdzony, wizytówki nie można edytować — to właśnie chroni ją przed obcymi.',
  },

  legalPrivacy: {ru: 'Политика', en: 'Privacy', pl: 'Prywatność'},
  legalTerms: {ru: 'Условия', en: 'Terms', pl: 'Warunki'},

  // ── verify ──
  verifyTitle: {ru: 'Подтвердите почту', en: 'Confirm your email', pl: 'Potwierdź adres e-mail'},
  verifySent: {
    ru: 'Мы отправили письмо на {email}. Откройте ссылку в нём и вернитесь сюда.',
    en: 'We sent an email to {email}. Open the link in it and come back here.',
    pl: 'Wysłaliśmy e-mail na {email}. Otwórz link w nim i wróć tutaj.',
  },
  verifyWhy: {
    ru: 'Это не формальность: карточку выдают на конкретный адрес, и подтверждение — то единственное, что не даёт чужому человеку забрать её себе.',
    en: 'This is not a formality: a card is issued to one address, and this confirmation is the only thing stopping somebody else from claiming it.',
    pl: 'To nie formalność: wizytówkę wydaje się na jeden adres, a to potwierdzenie jest jedyną rzeczą, która nie pozwala przejąć jej komuś obcemu.',
  },
  verifyDone: {ru: 'Я подтвердил', en: 'I have confirmed', pl: 'Potwierdziłem'},
  verifyAgain: {ru: 'Отправить письмо ещё раз', en: 'Send the email again', pl: 'Wyślij e-mail jeszcze raz'},
  verifyNotYet: {
    ru: 'Пока не видим подтверждения. Откройте ссылку в письме и нажмите ещё раз.',
    en: 'No confirmation yet. Open the link in the email and press again.',
    pl: 'Na razie nie widzimy potwierdzenia. Otwórz link w e-mailu i naciśnij jeszcze raz.',
  },
  verifyResent: {
    ru: 'Отправили ещё раз. Проверьте и папку со спамом.',
    en: 'Sent again. Check the spam folder too.',
    pl: 'Wysłaliśmy jeszcze raz. Sprawdź też folder ze spamem.',
  },

  // ── my card ──
  noCard: {ru: 'Карточки пока нет', en: 'No card yet', pl: 'Nie ma jeszcze wizytówki'},
  noCardWhy: {
    ru: 'Карточка заводится вместе с картой — на тот адрес, который вы назвали, когда её получали. Если карта у вас на руках, а здесь пусто, значит она записана на другую почту. Напишите нам.',
    en: 'A card is created together with the chip, on the address you gave when you received it. If you are holding the card and this is empty, it was issued to a different address. Write to us.',
    pl: 'Wizytówkę zakłada się razem z kartą — na adres, który podałeś przy jej odbiorze. Jeśli masz kartę w ręku, a tutaj jest pusto, znaczy że jest zapisana na inny e-mail. Napisz do nas.',
  },
  checkAgain: {ru: 'Проверить ещё раз', en: 'Check again', pl: 'Sprawdź jeszcze raz'},
  waitingTitle: {ru: 'Эта карточка ждёт вас', en: 'This card is waiting for you', pl: 'Ta wizytówka czeka na ciebie'},
  waitingWhy: {
    ru: 'Она выдана на {email}, а этот адрес вы только что подтвердили.',
    en: 'It was issued to {email}, and you have just confirmed that address.',
    pl: 'Została wydana na {email}, a ten adres właśnie potwierdziłeś.',
  },
  takeCard: {ru: 'Забрать карточку', en: 'Claim this card', pl: 'Odbierz wizytówkę'},
  myCard: {ru: 'Моя карточка', en: 'My card', pl: 'Moja wizytówka'},

  /* The name under the card. A product name, so it is the same in all three — it lives here
   * anyway, because a string that exists in one place cannot drift. */
  magicCard: {ru: 'MagicCard V1', en: 'MagicCard V1', pl: 'MagicCard V1'},
  viewCard: {ru: 'Просмотреть', en: 'View', pl: 'Podgląd'},
  editCard: {ru: 'Изменить', en: 'Edit', pl: 'Edytuj'},
  viewHint: {
    ru: 'Откроется та самая страница, которую видит человек, приложивший карту.',
    en: 'This opens the very page somebody sees when they tap the card.',
    pl: 'Otworzy się ta sama strona, którą widzi ktoś, kto zbliży kartę.',
  },
  backToCard: {ru: 'Назад к карточке', en: 'Back to the card', pl: 'Wróć do wizytówki'},

  // ── the photo ──
  photo: {ru: 'Фото', en: 'Photo', pl: 'Zdjęcie'},
  photoHint: {
    ru: 'Его видит каждый, кто приложит карту. Без фото на карточке стоит первая буква имени — это не заглушка, так и задумано.',
    en: 'Everybody who taps the card sees it. With no photo the card shows the first letter of your name — that is not a placeholder, it is how it is meant to look.',
    pl: 'Widzi je każdy, kto zbliży kartę. Bez zdjęcia na wizytówce zostaje pierwsza litera imienia — to nie tymczasowy zastępnik, tak ma wyglądać.',
  },
  photoAdd: {ru: 'Добавить фото', en: 'Add a photo', pl: 'Dodaj zdjęcie'},
  photoChange: {ru: 'Заменить', en: 'Replace', pl: 'Zmień'},
  photoRemove: {ru: 'Убрать', en: 'Remove', pl: 'Usuń'},
  photoFromLibrary: {ru: 'Выбрать из галереи', en: 'Choose from the library', pl: 'Wybierz z galerii'},
  photoFromCamera: {ru: 'Снять на камеру', en: 'Take a photo', pl: 'Zrób zdjęcie'},
  photoWorking: {ru: 'Загружаем…', en: 'Uploading…', pl: 'Wysyłanie…'},
  photoDeniedLibrary: {
    ru: 'Нет доступа к галерее. Разрешите его в настройках телефона.',
    en: 'No access to the photo library. Allow it in the phone settings.',
    pl: 'Brak dostępu do galerii. Zezwól na niego w ustawieniach telefonu.',
  },
  photoDeniedCamera: {
    ru: 'Нет доступа к камере. Разрешите его в настройках телефона.',
    en: 'No access to the camera. Allow it in the phone settings.',
    pl: 'Brak dostępu do aparatu. Zezwól na niego w ustawieniach telefonu.',
  },
  photoFailed: {
    ru: 'Фото не загрузилось. Попробуйте ещё раз.',
    en: 'The photo did not upload. Try again.',
    pl: 'Zdjęcie nie zostało wysłane. Spróbuj jeszcze raz.',
  },
  photoRemoveConfirm: {
    ru: 'Убрать фото? На карточке снова будет первая буква имени.',
    en: 'Remove the photo? The card goes back to the first letter of your name.',
    pl: 'Usunąć zdjęcie? Na wizytówce wróci pierwsza litera imienia.',
  },

  // ── the examples in empty fields ──
  phName: {ru: 'Анна Ковальская', en: 'Anna Kowalska', pl: 'Anna Kowalska'},
  phRole: {ru: 'Парикмахер · Мокотув', en: 'Hair stylist · Mokotów', pl: 'Fryzjerka · Mokotów'},
  phCity: {ru: 'Варшава', en: 'Warsaw', pl: 'Warszawa'},
  phPhone: {ru: '+48 ...', en: '+48 ...', pl: '+48 ...'},
  phEmail: {ru: 'anna@salon.pl', en: 'anna@salon.pl', pl: 'anna@salon.pl'},
  phService: {ru: 'Стрижка', en: 'Haircut', pl: 'Strzyżenie'},
  phPrice: {ru: 'от 120 zł', en: 'from 120 zł', pl: 'od 120 zł'},

  // ── the language button ──
  language: {ru: 'Язык', en: 'Language', pl: 'Język'},
  fName: {ru: 'Имя', en: 'Name', pl: 'Imię'},
  fRole: {ru: 'Чем занимаетесь', en: 'What you do', pl: 'Czym się zajmujesz'},
  fCity: {ru: 'Город', en: 'City', pl: 'Miasto'},
  fBio: {ru: 'О себе', en: 'About you', pl: 'O tobie'},
  fPhone: {ru: 'Телефон', en: 'Phone', pl: 'Telefon'},
  fEmail: {ru: 'Почта на карточке', en: 'Email on the card', pl: 'E-mail na wizytówce'},
  fSite: {ru: 'Сайт', en: 'Website', pl: 'Strona'},
  bioHint: {
    ru: 'Пара строк, которые прочитают за три секунды.',
    en: 'Two lines somebody reads in three seconds.',
    pl: 'Dwa zdania, które ktoś przeczyta w trzy sekundy.',
  },
  services: {ru: 'Услуги и цены', en: 'Services and prices', pl: 'Usługi i ceny'},
  servicesHint: {
    ru: 'То, за чем к вам приходят. Коротко — это визитка, а не прайс-лист.',
    en: 'What people come to you for. Keep it short — this is a card, not a price list.',
    pl: 'To, po co do ciebie przychodzą. Krótko — to wizytówka, nie cennik.',
  },
  links: {ru: 'Ссылки', en: 'Links', pl: 'Linki'},
  linksHint: {
    ru: 'Instagram, сайт, запись. Адрес должен начинаться с https://',
    en: 'Instagram, website, booking. The address has to start with https://',
    pl: 'Instagram, strona, zapisy. Adres musi zaczynać się od https://',
  },
  add: {ru: 'Добавить', en: 'Add', pl: 'Dodaj'},
  remove: {ru: 'убрать', en: 'remove', pl: 'usuń'},
  tooMany: {ru: 'больше {n} не поместится на карточку', en: 'more than {n} will not fit', pl: 'więcej niż {n} nie zmieści się na wizytówce'},
  buttonLang: {ru: 'Язык кнопок', en: 'Language of the buttons', pl: 'Język przycisków'},
  buttonLangHint: {
    ru: '«Позвонить», «Написать», «Сохранить контакт».',
    en: '“Call”, “Message”, “Save contact”.',
    pl: '„Zadzwoń”, „Napisz”, „Zapisz kontakt”.',
  },
  colour: {ru: 'Цвет', en: 'Colour', pl: 'Kolor'},
  showCard: {ru: 'Показывать карточку', en: 'Show the card', pl: 'Pokazuj wizytówkę'},
  showCardHint: {
    ru: 'Пока выключено, тот кто приложит карту увидит заглушку, а не пустую страницу.',
    en: 'While this is off, anyone who taps the card sees a holding page rather than an empty one.',
    pl: 'Dopóki jest wyłączone, kto zbliży kartę, zobaczy stronę zastępczą, a nie pustą.',
  },
  save: {ru: 'Сохранить', en: 'Save', pl: 'Zapisz'},
  hiddenBanner: {
    ru: 'Карточка скрыта. Тот, кто приложит карту, видит заглушку, а не вас.',
    en: 'This card is hidden. Anyone who taps it sees a holding page, not you.',
    pl: 'Ta wizytówka jest ukryta. Kto zbliży kartę, widzi stronę zastępczą, a nie ciebie.',
  },
  publishAndSave: {ru: 'Показать и сохранить', en: 'Publish and save', pl: 'Pokaż i zapisz'},
  savedHidden: {
    ru: 'Сохранено, но карточка всё ещё скрыта.',
    en: 'Saved — but the card is still hidden.',
    pl: 'Zapisano — ale wizytówka nadal jest ukryta.',
  },
  savedNote: {
    ru: 'Сохранено. Следующий, кто приложит карту, увидит это.',
    en: 'Saved. The next person who taps the card sees this.',
    pl: 'Zapisano. Następna osoba, która zbliży kartę, zobaczy to.',
  },
  otherCards: {ru: 'Другие ваши карточки:', en: 'Your other cards:', pl: 'Twoje pozostałe wizytówki:'},

  // ── deleting an account ──
  dangerTitle: {ru: 'Удалить аккаунт', en: 'Delete account', pl: 'Usuń konto'},
  dangerWhy: {
    ru: 'Аккаунт и всё, что вы в нём заполнили, удаляются навсегда. Отменить это нельзя.',
    en: 'The account and everything you filled in are deleted for good. This cannot be undone.',
    pl: 'Konto i wszystko, co w nim wypełniłeś, zostaną usunięte na zawsze. Tego nie da się cofnąć.',
  },
  dangerCard: {
    ru: 'Сама карта останется — её адрес напечатан на пластике, и чип продолжит работать. Она вернётся к состоянию «ещё не настроена», как в день выдачи. Если зарегистрируетесь снова на {email}, карта будет ждать вас.',
    en: 'The card itself stays — its address is printed on plastic and the chip keeps working. It goes back to "not set up yet", as it was the day it was issued. Register again on {email} and the card will be waiting.',
    pl: 'Sama karta zostanie — jej adres jest wydrukowany na plastiku i chip dalej działa. Wróci do stanu „jeszcze nieskonfigurowana”, jak w dniu wydania. Jeśli zarejestrujesz się ponownie na {email}, karta będzie na ciebie czekać.',
  },
  dangerPassword: {ru: 'Введите пароль, чтобы подтвердить', en: 'Enter your password to confirm', pl: 'Wpisz hasło, aby potwierdzić'},
  dangerConfirm: {ru: 'Удалить навсегда', en: 'Delete permanently', pl: 'Usuń na zawsze'},
  dangerCancel: {ru: 'Отмена', en: 'Cancel', pl: 'Anuluj'},

  // ── chips ──
  tabRead: {ru: 'Чтение', en: 'Read', pl: 'Odczyt'},
  tabWrite: {ru: 'Запись', en: 'Write', pl: 'Zapis'},
  tabErase: {ru: 'Очистка', en: 'Erase', pl: 'Czyszczenie'},
  readCard: {ru: 'Прочитать карту', en: 'Read a chip', pl: 'Odczytaj chip'},
  readAnother: {ru: 'Прочитать ещё карту', en: 'Read another chip', pl: 'Odczytaj kolejny chip'},
  holdNow: {ru: 'Поднесите карту', en: 'Hold the chip to the phone', pl: 'Zbliż kartę do telefonu'},
  holdWriting: {ru: 'Держите карту — идёт запись', en: 'Hold still — writing', pl: 'Trzymaj nieruchomo — trwa zapis'},
  holdErasing: {ru: 'Держите карту — идёт очистка', en: 'Hold still — erasing', pl: 'Trzymaj nieruchomo — trwa czyszczenie'},
  cancel: {ru: 'Отмена', en: 'Cancel', pl: 'Anuluj'},
  chip: {ru: 'Чип', en: 'Chip', pl: 'Chip'},
  content: {ru: 'Содержимое', en: 'Content', pl: 'Zawartość'},
  contentEmpty: {
    ru: 'пусто — на чип ещё ничего не записано',
    en: 'empty — nothing has been written to this chip',
    pl: 'pusto — na chip nic jeszcze nie zapisano',
  },
  linkRow: {ru: 'Ссылка', en: 'Link', pl: 'Link'},
  tapToOpen: {ru: 'нажмите, чтобы открыть', en: 'tap to open', pl: 'naciśnij, aby otworzyć'},
  used: {ru: 'Занято', en: 'Used', pl: 'Zajęte'},
  usedOf: {ru: '{a} из {b} байт', en: '{a} of {b} bytes', pl: '{a} z {b} bajtów'},
  chipCounter: {ru: 'Счётчик чипа', en: 'Chip counter', pl: 'Licznik chipa'},
  counterOff: {ru: 'выключен', en: 'off', pl: 'wyłączony'},
  reads: {ru: '{n} чтений', en: '{n} reads', pl: '{n} odczytów'},
  readsOne: {ru: '1 чтение', en: '1 read', pl: '1 odczyt'},
  registeredTo: {ru: 'Зарегистрирована на', en: 'Registered to', pl: 'Zarejestrowana na'},
  cardStatus: {ru: 'Статус карточки', en: 'Card status', pl: 'Status wizytówki'},
  statusTaken: {ru: 'забрана владельцем', en: 'claimed by its owner', pl: 'odebrana przez właściciela'},
  statusWaiting: {ru: 'ждёт, владелец ещё не вошёл', en: 'waiting — the owner has not signed in', pl: 'czeka — właściciel jeszcze się nie zalogował'},
  statusShown: {ru: 'показывается', en: 'visible', pl: 'widoczna'},
  statusHidden: {ru: 'скрыта владельцем', en: 'hidden by its owner', pl: 'ukryta przez właściciela'},
  notInBase: {ru: 'этого адреса нет в базе', en: 'this address is not in the database', pl: 'tego adresu nie ma w bazie'},
  batchOfChip: {ru: 'Пароль этой карты', en: 'Password guarding this chip', pl: 'Hasło chroniące ten chip'},
  uidMismatch: {
    ru: 'UID не совпадает с записанным при выдаче. Возможно, это копия карты.',
    en: 'The UID does not match the one recorded when this card was issued — possibly a copy.',
    pl: 'UID nie zgadza się z zapisanym przy wydaniu — możliwe, że to kopia karty.',
  },

  // ── write ──
  cardAddress: {ru: 'Адрес карты', en: 'Card address', pl: 'Adres karty'},
  addressHint: {ru: 'эта ссылка попадёт на чип', en: 'this link goes onto the chip', pl: 'ten link trafi na chip'},
  slugBad: {
    ru: 'Только строчные латинские буквы, цифры и дефис; от 2 до 39 символов, первый — не дефис.',
    en: 'Lowercase letters, digits and hyphens only; 2 to 39 characters, and not starting with a hyphen.',
    pl: 'Tylko małe litery łacińskie, cyfry i myślniki; od 2 do 39 znaków, pierwszy znak nie myślnik.',
  },
  clientEmail: {ru: 'Почта клиента', en: 'Client email', pl: 'E-mail klienta'},
  clientEmailHint: {
    ru: 'по этому адресу клиент заберёт карточку в приложении',
    en: 'the client claims the card in the app with this address',
    pl: 'tym adresem klient odbierze wizytówkę w aplikacji',
  },
  clientEmailEmpty: {
    ru: 'пусто — карточка не создаётся, только запись чипа',
    en: 'empty — no card is created, the chip is only written',
    pl: 'pusto — wizytówka nie powstaje, zapisywany jest tylko chip',
  },
  checkAddress: {ru: 'Проверьте адрес.', en: 'Check that address.', pl: 'Sprawdź ten adres.'},
  chipCounterLabel: {ru: 'Счётчик чипа', en: 'Chip counter', pl: 'Licznik chipa'},
  chipCounterHint: {
    ru: 'Чип сам считает, сколько раз его прочитали. Включается только здесь — потом придётся собирать карты заново.',
    en: 'The chip counts its own reads. It can only be switched on here — afterwards you would have to collect the cards back.',
    pl: 'Chip sam liczy, ile razy go odczytano. Włączyć można to tylko tutaj — potem trzeba by zbierać karty z powrotem.',
  },
  writeCard: {ru: 'Записать карту', en: 'Write the chip', pl: 'Zapisz chip'},
  cardOnly: {ru: 'Создать карточку без чипа', en: 'Create the card without a chip', pl: 'Utwórz wizytówkę bez chipa'},
  cardOnlyHint: {
    ru: 'Для чипа, который уже записан — например, со старым адресом или защищённого потерянным паролем. Чип не трогается.',
    en: 'For a chip that is already written — an old address, or one guarded by a lost password. The chip is not touched.',
    pl: 'Dla chipa, który już jest zapisany — ze starym adresem albo chroniony zgubionym hasłem. Chip nie jest ruszany.',
  },
  cardOnlyConfirm: {ru: 'Создать карточку?', en: 'Create the card?', pl: 'Utworzyć wizytówkę?'},
  cardOnlyBody: {
    ru: 'Карточка {slug} заведётся на {email}. Ни один чип при этом не записывается — убедитесь, что чип уже ведёт на этот адрес.',
    en: 'Card {slug} will be created for {email}. No chip is written — make sure a chip already points at this address.',
    pl: 'Wizytówka {slug} powstanie dla {email}. Żaden chip nie jest zapisywany — upewnij się, że chip już prowadzi pod ten adres.',
  },
  cardOnlyDone: {
    ru: 'Карточка создана. Чип не трогали.',
    en: 'Card created. No chip was touched.',
    pl: 'Wizytówka utworzona. Chip nie był ruszany.',
  },
  writeConfirm: {ru: 'Записать карту?', en: 'Write this chip?', pl: 'Zapisać ten chip?'},
  writeWillCreate: {
    ru: 'Карточка заведётся на {email}, затем запишется чип.',
    en: 'A card will be created for {email}, then the chip is written.',
    pl: 'Wizytówka powstanie dla {email}, potem zapisze się chip.',
  },
  writeNoCard: {
    ru: 'Карточка не создаётся — только запись чипа.',
    en: 'No card is created — the chip is only written.',
    pl: 'Wizytówka nie powstaje — zapisywany jest tylko chip.',
  },
  writeWarn: {
    ru: 'После записи чип защищается паролем партии: перезаписать его без этого пароля станет невозможно.',
    en: 'After writing, the chip is protected with the batch password: without it the chip cannot be rewritten.',
    pl: 'Po zapisie chip jest chroniony hasłem partii: bez niego nie da się go nadpisać.',
  },
  wroteOk: {ru: 'Карта записана и защищена.', en: 'Chip written and protected.', pl: 'Chip zapisany i zabezpieczony.'},
  needPassword: {ru: 'сначала создайте пароль партии', en: 'create the batch password first', pl: 'najpierw utwórz hasło partii'},

  // ── erase ──
  eraseTitle: {ru: 'Очистить чип', en: 'Erase the chip', pl: 'Wyczyść chip'},
  eraseWhat: {
    ru: 'Стирает всё: ссылку, пароль, защиту и счётчик. Чип становится таким, каким приехал с завода, и его можно записать заново.',
    en: 'Wipes everything: the link, the password, the protection and the counter. The chip goes back to how it arrived from the factory and can be written again.',
    pl: 'Kasuje wszystko: link, hasło, zabezpieczenie i licznik. Chip wraca do stanu fabrycznego i można go zapisać od nowa.',
  },
  eraseNote: {
    ru: 'Карточка в базе не трогается — адрес /u/… остаётся занятым за тем же человеком.',
    en: 'The card in the database is untouched — the /u/… address stays reserved for the same person.',
    pl: 'Wizytówka w bazie nie jest ruszana — adres /u/… zostaje zarezerwowany dla tej samej osoby.',
  },
  eraseButton: {ru: 'Очистить карту', en: 'Erase this chip', pl: 'Wyczyść ten chip'},
  eraseConfirm: {ru: 'Очистить чип?', en: 'Erase this chip?', pl: 'Wyczyścić ten chip?'},
  eraseConfirmBody: {
    ru: 'Ссылка и защита будут стёрты. Держите карту у телефона — очистка занимает пару секунд.',
    en: 'The link and the protection will be wiped. Hold the chip to the phone — this takes a couple of seconds.',
    pl: 'Link i zabezpieczenie zostaną skasowane. Trzymaj kartę przy telefonie — to zajmuje kilka sekund.',
  },
  erasedOk: {ru: 'Чип очищен. Теперь он пустой и незащищённый.', en: 'Chip erased. It is now blank and unprotected.', pl: 'Chip wyczyszczony. Jest teraz pusty i niezabezpieczony.'},

  // ── batch password ──
  batchPassword: {ru: 'Пароль партии', en: 'Batch password', pl: 'Hasło partii'},
  batchWhy: {
    ru: 'Нужен до первой записи: им защищаются все карты этой партии. Хранится в ключнице телефона и больше нигде.',
    en: 'Needed before the first write: it protects every chip in this batch. Kept in the phone keychain and nowhere else.',
    pl: 'Potrzebne przed pierwszym zapisem: chroni każdy chip w tej partii. Trzymane w kluczach telefonu i nigdzie indziej.',
  },
  batchSaved: {ru: 'Пароль партии сохранён', en: 'Batch password saved', pl: 'Hasło partii zapisane'},
  batchChange: {ru: 'сменить', en: 'change', pl: 'zmień'},
  batchKnown: {ru: 'Пароли прошлых партий', en: 'Passwords of earlier batches', pl: 'Hasła wcześniejszych partii'},
  batchKnownHint: {
    ru: 'Хранятся в базе и видны только админу. Чип из старой партии открывается своим паролем — нажмите на него.',
    en: 'Kept in the database, visible to admins only. A chip from an earlier batch opens with its own password — tap it.',
    pl: 'Trzymane w bazie, widoczne tylko dla administratorów. Chip z wcześniejszej partii otwiera się swoim hasłem — naciśnij je.',
  },
  batchRestored: {
    ru: 'Пароль партии восстановлен из базы.',
    en: 'Batch password restored from the database.',
    pl: 'Hasło partii odtworzone z bazy.',
  },
  batchChangeWarn: {
    ru: 'Старый пароль будет стёрт из телефона. Карты, защищённые им, перестанут перезаписываться — сохраните его, если он ещё нужен.',
    en: 'The old password is erased from this phone. Chips protected with it can no longer be rewritten — save it first if it is still needed.',
    pl: 'Stare hasło zostanie skasowane z tego telefonu. Chipów nim chronionych nie da się już nadpisać — zapisz je najpierw, jeśli jeszcze jest potrzebne.',
  },
  batchKeepOld: {ru: 'Отмена', en: 'Cancel', pl: 'Anuluj'},
  show: {ru: 'показать', en: 'show', pl: 'pokaż'},
  batchKeep: {
    ru: 'Сохраните его в менеджер паролей прямо сейчас. Чип пароль не отдаёт — если эта копия потеряется, защищённые карты больше нельзя будет перезаписать.',
    en: 'Put it in a password manager now. The chip never gives it back — lose this copy and protected chips can never be rewritten.',
    pl: 'Wpisz je teraz do menedżera haseł. Chip nigdy go nie oddaje — zgub tę kopię, a chronionych kart nie da się już nadpisać.',
  },
  kept: {ru: 'Сохранил', en: 'Saved it', pl: 'Zapisałem'},
  batchCreate: {ru: 'Создать пароль', en: 'Create a password', pl: 'Utwórz hasło'},
  batchEnter: {ru: 'ввести пароль существующей партии', en: 'enter an existing batch password', pl: 'wpisz hasło istniejącej partii'},
  batchSave: {ru: 'Сохранить пароль', en: 'Save password', pl: 'Zapisz hasło'},
  batchFormat: {ru: '12 символов 0-9 A-F', en: '12 characters, 0-9 A-F', pl: '12 znaków, 0-9 A-F'},

  // ── protection verdicts ──
  protReadLocked: {
    ru: 'PROT = 1 — чтение тоже под паролем. Ни один телефон эту карту не откроет.',
    en: 'PROT = 1 — reads need the password too. No phone will ever open this card.',
    pl: 'PROT = 1 — odczyt też wymaga hasła. Żaden telefon nie otworzy tej karty.',
  },
  protNone: {
    ru: 'Не защищена. Любой может перезаписать карту на свою ссылку.',
    en: 'Not protected. Anybody can rewrite this chip to their own link.',
    pl: 'Niezabezpieczona. Każdy może nadpisać ten chip własnym linkiem.',
  },
  protOk: {
    ru: 'Защищена со страницы {page}: запись только с паролем, чтение открыто.',
    en: 'Protected from page {page}: writing needs the password, reading stays open.',
    pl: 'Zabezpieczona od strony {page}: zapis wymaga hasła, odczyt pozostaje otwarty.',
  },
  protLocked: {
    ru: 'CFGLCK установлен — настройки этого чипа больше нельзя изменить, никогда.',
    en: 'CFGLCK is set — this chip’s configuration can never be changed again.',
    pl: 'CFGLCK jest ustawiony — konfiguracji tego chipa nie da się już nigdy zmienić.',
  },

  // ── sign-in refusals, from Firebase error codes ──
  authBadEmail: {ru: 'Адрес выглядит неправильно.', en: 'That address does not look right.', pl: 'Ten adres nie wygląda poprawnie.'},
  authNoPassword: {ru: 'Введите пароль.', en: 'Enter a password.', pl: 'Wpisz hasło.'},
  authWeak: {
    ru: 'Пароль слишком короткий — нужно не меньше шести символов.',
    en: 'That password is too short — six characters at least.',
    pl: 'To hasło jest za krótkie — co najmniej sześć znaków.',
  },
  authTaken: {
    ru: 'На этот адрес уже есть аккаунт. Войдите или восстановите пароль.',
    en: 'There is already an account on that address. Sign in, or reset the password.',
    pl: 'Na tym adresie już jest konto. Zaloguj się albo zresetuj hasło.',
  },
  authWrong: {ru: 'Адрес или пароль не подошли.', en: 'That address or password did not work.', pl: 'Ten adres albo hasło nie pasują.'},
  authDisabled: {ru: 'Этот аккаунт отключён. Напишите нам.', en: 'This account is disabled. Write to us.', pl: 'To konto jest wyłączone. Napisz do nas.'},
  authTooMany: {
    ru: 'Слишком много попыток. Подождите пару минут.',
    en: 'Too many attempts. Wait a couple of minutes.',
    pl: 'Za dużo prób. Poczekaj kilka minut.',
  },
  authOffline: {
    ru: 'Нет связи с сервером. Проверьте интернет.',
    en: 'No connection to the server. Check the internet.',
    pl: 'Brak połączenia z serwerem. Sprawdź internet.',
  },
  authStale: {
    ru: 'Войдите заново и повторите — для удаления нужен свежий вход.',
    en: 'Sign in again and retry — deleting an account needs a fresh sign-in.',
    pl: 'Zaloguj się ponownie i spróbuj jeszcze raz — usunięcie konta wymaga świeżego logowania.',
  },
  authUnknown: {ru: 'Что-то пошло не так.', en: 'Something went wrong.', pl: 'Coś poszło nie tak.'},

  // ── card refusals ──
  slugBadValue: {ru: 'Адрес карты не подходит.', en: 'That card address is not valid.', pl: 'Ten adres karty jest nieprawidłowy.'},
  slugTaken: {
    ru: 'Адрес {slug} уже занят другой картой.',
    en: 'The address {slug} already belongs to another card.',
    pl: 'Adres {slug} należy już do innej karty.',
  },

  // ── chip refusals, raised as codes by src/ntag.ts ──
  errConfigLocked: {
    ru: 'У этой карты залочена конфигурация (CFGLCK). Изменить её настройки уже нельзя.',
    en: 'This chip’s configuration is locked (CFGLCK). Its settings can no longer be changed.',
    pl: 'Konfiguracja tej karty jest zablokowana (CFGLCK). Jej ustawień nie da się już zmienić.',
  },
  errWrongPassword: {
    ru: 'Чип защищён другим паролем. Если он из прежней партии — нажмите «сменить» у пароля партии и введите тот, которым его защищали.',
    en: 'This chip is protected with a different password. If it is from an earlier batch, press “change” on the batch password and enter the one it was protected with.',
    pl: 'Ten chip jest chroniony innym hasłem. Jeśli pochodzi z wcześniejszej partii, naciśnij „zmień” przy haśle partii i wpisz to, którym był chroniony.',
  },
  errTooBig: {
    ru: 'Ссылка не помещается на этот чип.',
    en: 'The link does not fit on this chip.',
    pl: 'Link nie mieści się na tym chipie.',
  },
  errPastEnd: {
    ru: 'Ссылка вышла за пределы памяти чипа.',
    en: 'The link ran past the end of the chip’s memory.',
    pl: 'Link wyszedł poza pamięć chipa.',
  },
  errBatchFormat: {
    ru: 'Пароль партии — 12 символов (0-9, A-F).',
    en: 'A batch password is 12 characters (0-9, A-F).',
    pl: 'Hasło partii to 12 znaków (0-9, A-F).',
  },
  unknownChip: {ru: 'неизвестный чип', en: 'unknown chip', pl: 'nieznany chip'},

  // ── errors ──
  errNoNfc: {
    ru: 'NFC недоступен: либо его нет на устройстве, либо он выключен в настройках.',
    en: 'NFC is unavailable: either this device has none, or it is switched off in settings.',
    pl: 'NFC jest niedostępne: albo urządzenie go nie ma, albo jest wyłączone w ustawieniach.',
  },
  errMoved: {
    ru: 'Карта отошла слишком рано. Держите её неподвижно до конца операции.',
    en: 'The chip moved too soon. Hold it still until the operation finishes.',
    pl: 'Karta odsunęła się za wcześnie. Trzymaj ją nieruchomo do końca operacji.',
  },
  errNotAdmin: {
    ru: 'Сервер не дал создать карточку — этот аккаунт не админ. Чип не тронут.',
    en: 'The server refused to create the card — this account is not an admin. The chip is untouched.',
    pl: 'Serwer odmówił utworzenia wizytówki — to konto nie jest administratorem. Chip nie został ruszony.',
  },
  errOffline: {
    ru: 'Нет связи с базой. Чип не тронут — попробуйте снова.',
    en: 'No connection to the database. The chip is untouched — try again.',
    pl: 'Brak połączenia z bazą. Chip nie został ruszony — spróbuj ponownie.',
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
        // Checked against LANGS rather than against a list written out here, so adding a
        // language is one edit. The old spelling of this test knew only 'ru' and 'en', and
        // a fourth language would have been stored and then silently ignored on restart.
        if (LANGS.includes(v as Lang)) {
          setLangState(v as Lang);
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
