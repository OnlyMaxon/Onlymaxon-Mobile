/*
 * The App Store listing. Pushed with: npx eas-cli metadata:push
 *
 * A .js file rather than .json for one reason: the account Apple reviews with has a
 * password, and a password does not belong in a repository. It comes from the environment
 * instead, and without it the review block is left out altogether rather than written
 * half-filled:
 *
 *   $env:ASC_DEMO_PASSWORD = "..."   # PowerShell
 *   npx eas-cli metadata:push
 *
 * Two things are deliberately not here, because the API refuses them:
 *
 *   - The age rating. Apple now requires a `socialMedia` attribute that the eas-cli schema
 *     does not allow, so that questionnaire is filled in the console. Every answer for this
 *     app is negative, which comes out as 4+.
 *   - Screenshots and the 1024 icon. The icon is taken from the binary and needs no upload;
 *     screenshots are photographs of the app running and cannot come from an API at all.
 */

const demoPassword = process.env.ASC_DEMO_PASSWORD;

const review = demoPassword ? {
  "firstName": "Jalil",
  "lastName": "Orujli",
  "email": "hello@onlymaxon.com",
  "phone": "+48 576 925 110",
  "demoRequired": true,
  "demoUsername": "rickomaral@gmail.com",
  "notes": "NFC is not needed to review this app. Reading and writing the chip inside a card is the studio's own bench tooling and is shown only to administrator accounts. A client signs in, finds the card that was issued to them, and edits what a visitor sees when they tap it — the demo account is a client account, so every screen you can reach needs no hardware at all.\n\nSigning in requires a confirmed email address. That is not a formality: a card is created before its owner has an account, with the client's email written on it, and confirming that address is the only thing that stops somebody else from claiming their card. The demo account is already confirmed, so it signs straight in.\n\nDeleting an account is at the bottom of the card screen (guideline 5.1.1(v)). It asks for the password again and then removes the account and everything typed into it. The card itself is not deleted, because its address is printed on a piece of plastic in somebody's pocket — it goes back to an empty, hidden state instead.\n\nA finished card can be seen without the app at https://cards.onlymaxon.com/max",
  demoPassword,
} : undefined;

const config = {
  "configVersion": 0,
  "apple": {
    "version": "1.0",
    "copyright": "2026 OnlyMaxon Studio",
    "release": {
      "automaticRelease": true
    },
    "categories": [
      "BUSINESS",
      "UTILITIES"
    ],
    "info": {
      "en-US": {
        "title": "OnlyMaxon",
        "subtitle": "Your NFC card, always current",
        "privacyPolicyUrl": "https://onlymaxon.com/apps/cards/privacy/",
        "supportUrl": "https://onlymaxon.com/",
        "marketingUrl": "https://onlymaxon.com/",
        "keywords": [
          "nfc",
          "business card",
          "contact card",
          "vcard",
          "networking",
          "digital card",
          "tap to share",
          "profile"
        ],
        "promoText": "Change your phone number tonight and the card already in somebody's wallet is right the moment they tap it.",
        "description": "An OnlyMaxon card is a piece of plastic with a chip inside it. Tap it to a phone and your page opens — your name, what you do, your number, your prices, your links.\n\nThe chip holds one web address and nothing else. Everything a visitor sees lives in this app, which is the whole point: change your phone number tonight and the card already in a client's wallet is correct the moment they tap it. No reprinting, no new cards, no waiting.\n\nWHAT YOU CAN DO\n\n• Edit your card and see it live on the next tap\n• Phone, email, website, and links to wherever else you are\n• A list of what you do and what it costs\n• Choose the language your card opens in — English, Polish, Russian, Turkish or Spanish\n• Four colours\n• Hide the card with one switch whenever you want\n\nHOW IT WORKS\n\nYour card is made for you, with your email address on it. You register here with that address, confirm it, and the card becomes yours. That confirmation is the only thing that stops anyone else from claiming it.\n\nNobody needs an app to read your card. A tap opens a normal web page on any phone.\n\nWHAT IT DOES NOT DO\n\nNo location. No contacts. No photo library. No analytics, no advertising identifiers, no tracking. Nothing is sold to anybody — there is nothing here to sell. You can delete your account, and everything on it, from inside the app in about thirty seconds.\n\nCards are made in Warsaw by OnlyMaxon Studio."
      },
      "pl": {
        "title": "OnlyMaxon",
        "subtitle": "Karta NFC, zawsze aktualna",
        "privacyPolicyUrl": "https://onlymaxon.com/apps/cards/privacy/",
        "supportUrl": "https://onlymaxon.com/pl/",
        "marketingUrl": "https://onlymaxon.com/pl/",
        "keywords": [
          "nfc",
          "wizytówka",
          "karta kontaktowa",
          "vcard",
          "networking",
          "wizytówka cyfrowa",
          "profil"
        ],
        "promoText": "Zmień numer telefonu dziś wieczorem, a karta, którą ktoś ma już w portfelu, pokaże nowy przy następnym zbliżeniu.",
        "description": "Karta OnlyMaxon to kawałek plastiku z chipem w środku. Zbliż ją do telefonu i otworzy się Twoja strona — imię, czym się zajmujesz, numer, ceny, linki.\n\nChip przechowuje jeden adres internetowy i nic więcej. Wszystko, co widzi odwiedzający, mieszka w tej aplikacji, i to jest cały sens: zmień numer telefonu dziś wieczorem, a karta, którą klient ma już w portfelu, będzie poprawna przy następnym zbliżeniu. Bez druku, bez nowych kart, bez czekania.\n\nCO MOŻESZ ZROBIĆ\n\n• Edytować kartę i widzieć zmianę przy następnym zbliżeniu\n• Telefon, e-mail, stronę i linki do innych miejsc\n• Listę tego, co robisz, i ile to kosztuje\n• Wybrać język, w którym otwiera się karta — angielski, polski, rosyjski, turecki lub hiszpański\n• Cztery kolory\n• Ukryć kartę jednym przełącznikiem, kiedy chcesz\n\nJAK TO DZIAŁA\n\nKarta jest robiona dla Ciebie, z Twoim adresem e-mail. Rejestrujesz się tutaj tym adresem, potwierdzasz go, i karta staje się Twoja. To potwierdzenie jest jedyną rzeczą, która nie pozwala przejąć jej komuś innemu.\n\nNikt nie potrzebuje aplikacji, żeby przeczytać Twoją kartę. Zbliżenie otwiera zwykłą stronę na każdym telefonie.\n\nCZEGO NIE ROBI\n\nŻadnej lokalizacji. Żadnych kontaktów. Żadnego dostępu do zdjęć. Żadnej analityki, żadnych identyfikatorów reklamowych, żadnego śledzenia. Nic nie jest nikomu sprzedawane — nie ma tu czego sprzedawać. Konto i wszystko na nim możesz usunąć z wnętrza aplikacji w około trzydzieści sekund.\n\nKarty powstają w Warszawie, w studiu OnlyMaxon."
      },
      "ru": {
        "title": "OnlyMaxon",
        "subtitle": "NFC-карта, всегда актуальная",
        "privacyPolicyUrl": "https://onlymaxon.com/apps/cards/privacy/",
        "supportUrl": "https://onlymaxon.com/ru/",
        "marketingUrl": "https://onlymaxon.com/ru/",
        "keywords": [
          "nfc",
          "визитка",
          "визитная карточка",
          "vcard",
          "контакты",
          "цифровая визитка",
          "профиль"
        ],
        "promoText": "Поменяйте номер телефона вечером — и карта, которая уже лежит у кого-то в кошельке, покажет новый при первом касании.",
        "description": "Карта OnlyMaxon — это кусок пластика с чипом внутри. Приложите её к телефону, и откроется ваша страница: имя, чем вы занимаетесь, номер, цены, ссылки.\n\nЧип хранит один веб-адрес и больше ничего. Всё, что видит посетитель, живёт в этом приложении, и в этом весь смысл: поменяйте номер телефона вечером, и карта, которая уже лежит у клиента в кошельке, будет правильной при первом касании. Без печати, без новых карт, без ожидания.\n\nЧТО МОЖНО\n\n• Менять карточку и видеть результат при следующем касании\n• Телефон, почта, сайт и ссылки на всё остальное\n• Список того, что вы делаете, и сколько это стоит\n• Выбрать язык, на котором открывается карта — английский, польский, русский, турецкий или испанский\n• Четыре цвета\n• Спрятать карту одним переключателем в любой момент\n\nКАК ЭТО РАБОТАЕТ\n\nКарту делают для вас, с вашим адресом почты на ней. Вы регистрируетесь здесь этим адресом, подтверждаете его, и карта становится вашей. Это подтверждение — единственное, что не даёт забрать её чужому человеку.\n\nЧтобы прочитать вашу карту, приложение не нужно никому. Касание открывает обычную веб-страницу на любом телефоне.\n\nЧЕГО ЗДЕСЬ НЕТ\n\nНикакой геолокации. Никаких контактов. Никакого доступа к фотографиям. Никакой аналитики, никаких рекламных идентификаторов, никакой слежки. Ничего никому не продаётся — здесь нечего продавать. Аккаунт и всё, что в нём, удаляется из самого приложения за полминуты.\n\nКарты делают в Варшаве, в студии OnlyMaxon."
      }
    },
    "advisory": {
      "ageRatingOverride": "NONE",
      "alcoholTobaccoOrDrugUseOrReferences": "NONE",
      "contests": "NONE",
      "gambling": false,
      "gamblingSimulated": "NONE",
      "horrorOrFearThemes": "NONE",
      "kidsAgeBand": null,
      "koreaAgeRatingOverride": "NONE",
      "lootBox": false,
      "matureOrSuggestiveThemes": "NONE",
      "medicalOrTreatmentInformation": "NONE",
      "profanityOrCrudeHumor": "NONE",
      "sexualContentGraphicAndNudity": "NONE",
      "sexualContentOrNudity": "NONE",
      "unrestrictedWebAccess": false,
      "violenceCartoonOrFantasy": "NONE",
      "violenceRealistic": "NONE",
      "violenceRealisticProlongedGraphicOrSadistic": "NONE",
      "advertising": false,
      "ageAssurance": false,
      "ageRatingOverrideV2": "NONE",
      "developerAgeRatingInfoUrl": null,
      "gunsOrOtherWeapons": "NONE",
      "healthOrWellnessTopics": false,
      "messagingAndChat": false,
      "parentalControls": false,
      "userGeneratedContent": false
    }
  }
};

if (review) {
  config.apple.review = review;
}

module.exports = config;
