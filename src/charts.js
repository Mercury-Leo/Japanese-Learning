import { romaji } from "./engine.js";

/* The data behind the Charts view: closed sets you look up rather than drill.
   Kept out of the component so the shape can be checked by the test suite —
   a matrix row one cell short, or a kanji typed into a reading slot, is a
   silent visual bug otherwise.

   A reading is written "kana", or "kanji|kana" where the kanji matters. A
   leading "*" marks a reading that breaks the pattern its own chart otherwise
   follows: those irregulars are the only reason these charts exist, so the flag
   lives in the data rather than in a footnote. Romaji is never written down —
   it is derived from the kana by the same transliterator the deck uses, so a
   chart cannot drift from a card.

   A chart with `cols` renders as a matrix; everything else renders as a list of
   [kanji, reading, gloss]. */

const DOW = {
  group: "Time", title: "Days of the week", jp: "曜日",
  rows: [
    ["日曜日", "にちようび", "Sunday"],
    ["月曜日", "げつようび", "Monday"],
    ["火曜日", "かようび", "Tuesday"],
    ["水曜日", "すいようび", "Wednesday"],
    ["木曜日", "もくようび", "Thursday"],
    ["金曜日", "きんようび", "Friday"],
    ["土曜日", "どようび", "Saturday"],
  ],
  note: "Every day ends in 曜日 (ようび). The first kanji is the element or body it is named for — 日 sun, 月 moon, then fire, water, wood, metal, earth.",
};

const DIGITS = {
  group: "Counting", title: "Counting 1–10", jp: "数字",
  rows: [
    ["一", "いち", "1"],
    ["二", "に", "2"],
    ["三", "さん", "3"],
    ["四", "よん・し", "4"],
    ["五", "ご", "5"],
    ["六", "ろく", "6"],
    ["七", "なな・しち", "7"],
    ["八", "はち", "8"],
    ["九", "きゅう・く", "9"],
    ["十", "じゅう", "10"],
  ],
  note: "4, 7 and 9 have two readings. よん・なな・きゅう are the safe default when counting aloud; し・しち・く turn up in fixed compounds — しがつ for April, しちじ for 7 o'clock.",
};

const MONTHS = {
  group: "Time", title: "Months", jp: "月",
  rows: [
    ["一月", "いちがつ", "January"],
    ["二月", "にがつ", "February"],
    ["三月", "さんがつ", "March"],
    ["四月", "*しがつ", "April"],
    ["五月", "ごがつ", "May"],
    ["六月", "ろくがつ", "June"],
    ["七月", "*しちがつ", "July"],
    ["八月", "はちがつ", "August"],
    ["九月", "*くがつ", "September"],
    ["十月", "じゅうがつ", "October"],
    ["十一月", "じゅういちがつ", "November"],
    ["十二月", "じゅうにがつ", "December"],
  ],
  note: "Number + 月 (がつ), so counting gets you nine of them. April, July and September take the other reading only — しがつ, しちがつ, くがつ, never よんがつ, なながつ or きゅうがつ.",
};

/* Two counting systems collide here: the native series (ひとつ・ふたつ…) survives
   in the first ten days plus the 14th, 20th and 24th, and Sino-Japanese
   number+にち covers the rest. Both are in daily use, which is why the whole
   month is listed rather than the first ten and a rule. */
const DATES = {
  group: "Time", title: "Days of the month", jp: "日付",
  rows: [
    ["一日", "*ついたち", "1st"],
    ["二日", "*ふつか", "2nd"],
    ["三日", "*みっか", "3rd"],
    ["四日", "*よっか", "4th"],
    ["五日", "*いつか", "5th"],
    ["六日", "*むいか", "6th"],
    ["七日", "*なのか", "7th"],
    ["八日", "*ようか", "8th"],
    ["九日", "*ここのか", "9th"],
    ["十日", "*とおか", "10th"],
    ["十一日", "じゅういちにち", "11th"],
    ["十二日", "じゅうににち", "12th"],
    ["十三日", "じゅうさんにち", "13th"],
    ["十四日", "*じゅうよっか", "14th"],
    ["十五日", "じゅうごにち", "15th"],
    ["十六日", "じゅうろくにち", "16th"],
    ["十七日", "じゅうしちにち", "17th"],
    ["十八日", "じゅうはちにち", "18th"],
    ["十九日", "じゅうくにち", "19th"],
    ["二十日", "*はつか", "20th"],
    ["二十一日", "にじゅういちにち", "21st"],
    ["二十二日", "にじゅうににち", "22nd"],
    ["二十三日", "にじゅうさんにち", "23rd"],
    ["二十四日", "*にじゅうよっか", "24th"],
    ["二十五日", "にじゅうごにち", "25th"],
    ["二十六日", "にじゅうろくにち", "26th"],
    ["二十七日", "にじゅうしちにち", "27th"],
    ["二十八日", "にじゅうはちにち", "28th"],
    ["二十九日", "にじゅうくにち", "29th"],
    ["三十日", "さんじゅうにち", "30th"],
    ["三十一日", "さんじゅういちにち", "31st"],
  ],
  note: "The 1st to the 10th, plus the 14th, 20th and 24th, use the native series — relatives of ひとつ・ふたつ in the generic counter under Counting, not of いち・に. Everything else is number + にち, taking しち for 7 and く for 9: じゅうしちにち, じゅうくにち. 一日 is ついたち as a date but いちにち as a duration.",
};

const RELTIME = {
  group: "Time", title: "This week, last year", jp: "時を表す語",
  cols: ["before last", "last", "this", "next", "after next"],
  rows: [
    { k: "日", gloss: "day", cells: ["*一昨日|おととい", "*昨日|きのう", "*今日|きょう", "*明日|あした", "*明後日|あさって"] },
    { k: "週", gloss: "week", cells: ["先々週|せんせんしゅう", "先週|せんしゅう", "今週|こんしゅう", "来週|らいしゅう", "再来週|さらいしゅう"] },
    { k: "月", gloss: "month", cells: ["先々月|せんせんげつ", "先月|せんげつ", "今月|こんげつ", "来月|らいげつ", "再来月|さらいげつ"] },
    { k: "年", gloss: "year", cells: ["*一昨年|おととし", "*去年|きょねん", "*今年|ことし", "来年|らいねん", "再来年|さらいねん"] },
  ],
  note: "週 and 月 are the pattern: 先・今・来, with 再来 for the far end. The 日 row abandons it — every one of those is a native word wearing kanji, so きょう and あした, never こんにち or めいじつ. 年 breaks three times: おととし, きょねん, ことし. Formal alternates exist for the front row — あす for あした, 昨年 (さくねん) for 去年.",
};

const HOURS = {
  group: "Time", title: "Telling the time", jp: "時刻",
  rows: [
    ["一時", "いちじ", "1:00"],
    ["二時", "にじ", "2:00"],
    ["三時", "さんじ", "3:00"],
    ["四時", "*よじ", "4:00"],
    ["五時", "ごじ", "5:00"],
    ["六時", "ろくじ", "6:00"],
    ["七時", "*しちじ", "7:00"],
    ["八時", "はちじ", "8:00"],
    ["九時", "*くじ", "9:00"],
    ["十時", "じゅうじ", "10:00"],
    ["十一時", "じゅういちじ", "11:00"],
    ["十二時", "じゅうにじ", "12:00"],
  ],
  note: "Number + 時 (じ), except 4, which is よじ and never しじ or よんじ. 7 and 9 take the compound readings: しちじ, くじ. Minutes ride the 分 counter, the noisiest row in the counter table under Counting — 四時十五分 is よじじゅうごふん. Half past is 半 (はん); 午前 and 午後 mark am and pm.",
};

/* 間 (かん) is the whole chart: it turns a point on the clock into a stretch of
   time, and every unit takes it differently — or, for 日, abandons the
   Sino-Japanese numbers altogether and borrows the date readings. */
const DURATION = {
  group: "Time", title: "How long, not when", jp: "期間",
  cols: ["1", "2", "4", "6", "8", "10"],
  rows: [
    { k: "時間", gloss: "hours", cells: ["一時間|いちじかん", "二時間|にじかん", "*四時間|よじかん", "六時間|ろくじかん", "八時間|はちじかん", "十時間|じゅうじかん"] },
    { k: "日間", gloss: "days", cells: ["*一日|いちにち", "*二日間|ふつかかん", "*四日間|よっかかん", "*六日間|むいかかん", "*八日間|ようかかん", "*十日間|とおかかん"] },
    { k: "週間", gloss: "weeks", cells: ["*一週間|いっしゅうかん", "二週間|にしゅうかん", "四週間|よんしゅうかん", "六週間|ろくしゅうかん", "*八週間|はっしゅうかん", "*十週間|じゅっしゅうかん"] },
    { k: "か月", gloss: "months", cells: ["*一か月|いっかげつ", "二か月|にかげつ", "四か月|よんかげつ", "*六か月|ろっかげつ", "八か月|はちかげつ", "*十か月|じゅっかげつ"] },
    { k: "年間", gloss: "years", cells: ["一年間|いちねんかん", "二年間|にねんかん", "*四年間|よねんかん", "六年間|ろくねんかん", "八年間|はちねんかん", "十年間|じゅうねんかん"] },
  ],
  note: "二時 is 2 o'clock, 二時間 is two hours — 間 is what makes it a span, and leaving it off changes the meaning rather than the register. Days are the odd row: they borrow the date readings from the chart above, so two days is ふつかかん and one day is simply いちにち, no 間 at all. 4 keeps よ in 時間 and 年間 — よじかん, よねんかん — and takes よん everywhere else. か月 doubles up at 1, 6 and 10; 八か月 is usually はちかげつ, though はっかげつ is heard too.",
};

const COUNTERS = {
  group: "Counting", title: "Counters", jp: "助数詞",
  /* 4 earns a column of its own: it is よん nearly everywhere, and the four
     places it is not are all in daily use. */
  cols: ["1", "2", "3", "4", "6", "8", "10", "何"],
  rows: [
    { k: "つ", gloss: "generic", cells: ["*ひとつ", "*ふたつ", "*みっつ", "*よっつ", "*むっつ", "*やっつ", "*とお", "*いくつ"] },
    { k: "人", gloss: "people", cells: ["*ひとり", "*ふたり", "さんにん", "*よにん", "ろくにん", "はちにん", "じゅうにん", "なんにん"] },
    { k: "枚", gloss: "flat things", cells: ["いちまい", "にまい", "さんまい", "よんまい", "ろくまい", "はちまい", "じゅうまい", "なんまい"] },
    { k: "個", gloss: "small objects", cells: ["*いっこ", "にこ", "さんこ", "よんこ", "*ろっこ", "*はっこ", "*じゅっこ", "なんこ"] },
    { k: "本", gloss: "long things", cells: ["*いっぽん", "にほん", "*さんぼん", "よんほん", "*ろっぽん", "*はっぽん", "*じゅっぽん", "*なんぼん"] },
    { k: "匹", gloss: "small animals", cells: ["*いっぴき", "にひき", "*さんびき", "よんひき", "*ろっぴき", "*はっぴき", "*じゅっぴき", "*なんびき"] },
    { k: "分", gloss: "minutes", cells: ["*いっぷん", "にふん", "*さんぷん", "*よんぷん", "*ろっぷん", "*はっぷん", "*じゅっぷん", "*なんぷん"] },
    { k: "歳", gloss: "years of age", cells: ["*いっさい", "にさい", "さんさい", "よんさい", "ろくさい", "*はっさい", "*じゅっさい", "なんさい"] },
    { k: "階", gloss: "floors", cells: ["*いっかい", "にかい", "*さんがい", "よんかい", "*ろっかい", "*はっかい", "*じゅっかい", "*なんがい"] },
    { k: "杯", gloss: "cups, glasses", cells: ["*いっぱい", "にはい", "*さんばい", "よんはい", "*ろっぱい", "*はっぱい", "*じゅっぱい", "*なんばい"] },
    { k: "回", gloss: "times, occasions", cells: ["*いっかい", "にかい", "さんかい", "よんかい", "*ろっかい", "*はっかい", "*じゅっかい", "なんかい"] },
    { k: "冊", gloss: "books", cells: ["*いっさつ", "にさつ", "さんさつ", "よんさつ", "ろくさつ", "*はっさつ", "*じゅっさつ", "なんさつ"] },
    { k: "台", gloss: "machines, vehicles", cells: ["いちだい", "にだい", "さんだい", "よんだい", "ろくだい", "はちだい", "じゅうだい", "なんだい"] },
    { k: "円", gloss: "yen", cells: ["いちえん", "にえん", "さんえん", "*よえん", "ろくえん", "はちえん", "じゅうえん", "なんえん"] },
  ],
  note: "The counter is not the hard part; 1, 6, 8 and 10 are, because the number doubles its consonant (いっ〜) and the counter answers by hardening it (ほん → ぽん). 3 and 何 soften it instead (さんぼん, なんぼん). 4 is よん everywhere except よっつ, よにん, よえん and よんぷん. 枚 and 台 sit here as the controls — they never change at all. Two loose ends: 二十歳 is はたち, and 三階 is さんがい or さんかい depending on who you ask.",
};

const BIG = {
  group: "Counting", title: "Hundreds and above", jp: "大数",
  rows: [
    ["百", "ひゃく", "100"],
    ["三百", "*さんびゃく", "300"],
    ["六百", "*ろっぴゃく", "600"],
    ["八百", "*はっぴゃく", "800"],
    ["千", "せん", "1,000"],
    ["三千", "*さんぜん", "3,000"],
    ["八千", "*はっせん", "8,000"],
    ["一万", "いちまん", "10,000"],
    ["十万", "じゅうまん", "100,000"],
    ["百万", "ひゃくまん", "1,000,000"],
    ["千万", "せんまん", "10,000,000"],
    ["一億", "いちおく", "100,000,000"],
  ],
  note: "The same 3-6-8 hardening as the counters below, one level up. The bigger trap is grouping: Japanese counts in ten-thousands, so 100,000 is 十万 — ten man, not a hundred thousand — and a written figure regroups every four digits, not every three. 万 and 億 always take 一 when they stand alone: 一万, 一億.",
};

/* こそあど. Four distances, six series — the one grid where the column, not the
   row, is the thing being learned. */
const KOSOADO = {
  group: "Asking", title: "This, that, that over there", jp: "こそあど",
  cols: ["こ · near me", "そ · near you", "あ · over there", "ど · which"],
  rows: [
    { k: "〜れ", gloss: "thing", cells: ["これ", "それ", "あれ", "どれ"] },
    { k: "〜の", gloss: "before a noun", cells: ["この", "その", "あの", "どの"] },
    { k: "〜こ", gloss: "place", cells: ["ここ", "そこ", "*あそこ", "どこ"] },
    { k: "〜ちら", gloss: "way, polite one", cells: ["こちら", "そちら", "あちら", "どちら"] },
    { k: "〜んな", gloss: "kind of", cells: ["こんな", "そんな", "あんな", "どんな"] },
    { k: "〜う", gloss: "manner", cells: ["こう", "そう", "*ああ", "どう"] },
  ],
  note: "これ stands alone, この needs a noun behind it — swapping them is the commonest mistake in the grid. そ is near the listener or already shared between you; あ is away from both of you. あそこ and ああ are the two cells that break their column's shape. こちら doubles as the polite \"this person\" and \"this way\".",
};

const QWORDS = {
  group: "Asking", title: "Question words", jp: "疑問詞",
  rows: [
    ["何", "*なに・なん", "what"],
    ["誰", "だれ", "who"],
    ["いつ", "いつ", "when"],
    ["何時", "*なんじ", "what time"],
    ["何人", "*なんにん", "how many people"],
    ["なぜ", "なぜ", "why — written, formal"],
    ["どうして", "どうして", "why — everyday"],
    ["いくら", "いくら", "how much it costs"],
    ["いくつ", "いくつ", "how many, how old"],
    ["どのくらい", "どのくらい", "how long, how far"],
  ],
  note: "何 is なに before most particles (何が, 何を) and なん before a counter, です or の — なんじ, なんにん, なんですか. なんで is the casual spoken why, below どうして. The ど- family (どこ, どれ, どう, どんな, どちら) sits in the grid above rather than being listed twice.",
};

const FAMILY = {
  group: "People", title: "Family", jp: "家族",
  cols: ["うち · your own", "そと · someone else's"],
  rows: [
    { k: "父", gloss: "father", cells: ["父|ちち", "お父さん|おとうさん"] },
    { k: "母", gloss: "mother", cells: ["母|はは", "お母さん|おかあさん"] },
    { k: "兄", gloss: "older brother", cells: ["兄|あに", "*お兄さん|おにいさん"] },
    { k: "姉", gloss: "older sister", cells: ["姉|あね", "*お姉さん|おねえさん"] },
    { k: "弟", gloss: "younger brother", cells: ["弟|おとうと", "弟さん|おとうとさん"] },
    { k: "妹", gloss: "younger sister", cells: ["妹|いもうと", "妹さん|いもうとさん"] },
    { k: "祖父", gloss: "grandfather", cells: ["祖父|そふ", "*おじいさん"] },
    { k: "祖母", gloss: "grandmother", cells: ["祖母|そぼ", "*おばあさん"] },
    { k: "夫", gloss: "husband", cells: ["夫|おっと", "*ご主人|ごしゅじん"] },
    { k: "妻", gloss: "wife", cells: ["妻|つま", "*奥さん|おくさん"] },
    { k: "子供", gloss: "child", cells: ["子供|こども", "お子さん|おこさん"] },
    { k: "両親", gloss: "parents", cells: ["両親|りょうしん", "*ご両親|ごりょうしん"] },
    { k: "家族", gloss: "family", cells: ["家族|かぞく", "*ご家族|ごかぞく"] },
  ],
  note: "Left column for your own family when talking to an outsider, right column for someone else's — and for addressing your own relatives face to face, which is why a child calls their father お父さん. The polite form is usually お〜さん, but the Sino-Japanese words take ご instead (ご両親, ご家族), 夫 and 妻 swap for different words entirely (ご主人, 奥さん), and 兄・姉 stretch their vowel on the way: あに → おにいさん, あね → おねえさん.",
};

/* Grouped by subject, and the Charts view derives its tab row from this order —
   so a chart moves tabs by editing its `group`, and the tabs stay in the order
   their first chart appears. Notes that say "above" or "below" only ever point
   inside their own group, because that is all one tab shows. */
export const CHARTS = [
  DOW, MONTHS, DATES, RELTIME, HOURS, DURATION,
  DIGITS, BIG, COUNTERS,
  KOSOADO, QWORDS,
  FAMILY,
];

export const GROUPS = [...new Set(CHARTS.map((c) => c.group))];

/** Split a reading cell into its parts. One parser, so the view and the test
 *  agree about what "*一昨日|おととい" means. */
export function cell(raw) {
  const irr = raw[0] === "*";
  const s = irr ? raw.slice(1) : raw;
  const i = s.indexOf("|");
  return { ja: i < 0 ? null : s.slice(0, i), kana: i < 0 ? s : s.slice(i + 1), irr };
}

/** Romaji for display: derived, with the reading separator given room to breathe. */
export const read = (kana) => romaji(kana).replace(/・/g, " · ");
