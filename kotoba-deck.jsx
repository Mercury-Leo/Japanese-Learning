import { useState, useEffect, useMemo, useRef } from "react";
import { Plus, Trash2, X, Search, Volume2, Undo2, Download, Upload } from "lucide-react";

/* ============================================================
   PALETTE  — sage paper / sumi ink / seal vermilion / navy / olive
   Colour is not decoration here: it encodes morpheme class.
   ============================================================ */
const C = {
  ground: "#e6e9e3",
  panel: "#f5f6f2",
  panelAlt: "#eceee8",
  ink: "#161b19",
  muted: "#6d756f",
  rule: "#cbd1c7",
  ruleSoft: "#dbe0d6",
  root: "#161b19",   // unchanging part
  stem: "#b8342a",   // the kana that shifts  (朱 seal red)
  aux: "#2a4780",    // auxiliary / ending
  extra: "#7a6a1c",  // stacked suffix
};
const ROLE_COLOR = { root: C.root, stem: C.stem, aux: C.aux, extra: C.extra };

const MINCHO = '"Hiragino Mincho ProN","Yu Mincho","YuMincho","Noto Serif JP","Songti SC","MS Mincho",serif';
const SANS = '"Helvetica Neue",Inter,"Segoe UI",system-ui,sans-serif';
const MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,monospace';

/* ============================================================
   ROMAJI
   ============================================================ */
const R1 = {
  あ: "a", い: "i", う: "u", え: "e", お: "o",
  か: "ka", き: "ki", く: "ku", け: "ke", こ: "ko",
  が: "ga", ぎ: "gi", ぐ: "gu", げ: "ge", ご: "go",
  さ: "sa", し: "shi", す: "su", せ: "se", そ: "so",
  ざ: "za", じ: "ji", ず: "zu", ぜ: "ze", ぞ: "zo",
  た: "ta", ち: "chi", つ: "tsu", て: "te", と: "to",
  だ: "da", ぢ: "ji", づ: "zu", で: "de", ど: "do",
  な: "na", に: "ni", ぬ: "nu", ね: "ne", の: "no",
  は: "ha", ひ: "hi", ふ: "fu", へ: "he", ほ: "ho",
  ば: "ba", び: "bi", ぶ: "bu", べ: "be", ぼ: "bo",
  ぱ: "pa", ぴ: "pi", ぷ: "pu", ぺ: "pe", ぽ: "po",
  ま: "ma", み: "mi", む: "mu", め: "me", も: "mo",
  や: "ya", ゆ: "yu", よ: "yo",
  ら: "ra", り: "ri", る: "ru", れ: "re", ろ: "ro",
  わ: "wa", ゐ: "i", ゑ: "e", を: "o", ん: "n",
  ゃ: "ya", ゅ: "yu", ょ: "yo", ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o",
};
const R2 = {
  きゃ: "kya", きゅ: "kyu", きょ: "kyo", ぎゃ: "gya", ぎゅ: "gyu", ぎょ: "gyo",
  しゃ: "sha", しゅ: "shu", しょ: "sho", じゃ: "ja", じゅ: "ju", じょ: "jo",
  ちゃ: "cha", ちゅ: "chu", ちょ: "cho", にゃ: "nya", にゅ: "nyu", にょ: "nyo",
  ひゃ: "hya", ひゅ: "hyu", ひょ: "hyo", びゃ: "bya", びゅ: "byu", びょ: "byo",
  ぴゃ: "pya", ぴゅ: "pyu", ぴょ: "pyo", みゃ: "mya", みゅ: "myu", みょ: "myo",
  りゃ: "rya", りゅ: "ryu", りょ: "ryo", てぃ: "ti", でぃ: "di", ふぁ: "fa", ふぃ: "fi",
};

function romaji(kana) {
  if (!kana) return "";
  const h = kana.replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  let out = "";
  let i = 0;
  while (i < h.length) {
    const two = h.slice(i, i + 2);
    if (R2[two]) { out += R2[two]; i += 2; continue; }
    const c = h[i];
    if (c === "っ") {
      const nxt = R2[h.slice(i + 1, i + 3)] || R1[h[i + 1]] || "";
      out += nxt[0] || "t";
      i += 1; continue;
    }
    if (c === "ー") { i += 1; continue; }
    out += R1[c] ?? c;
    i += 1;
  }
  return out;
}

/* ============================================================
   MORPHEME GLOSSARY
   gloss = Leipzig-style interlinear tag shown under each tile
   ============================================================ */
const G = {
  root: { role: "root", gloss: "ROOT", title: "Root", body: "The part of the word that never changes. Everything after this point is grammar." },
  "ichidan-stem": { role: "root", gloss: "STEM", title: "Ichidan stem", body: "Ichidan (一段) verbs have one single stem: drop る and you are done. This same stem takes ます, て, た, ない — no row-shifting at all. This is why they are called the easy class." },
  "suru-base": { role: "root", gloss: "N", title: "Noun base", body: "する attaches to a noun to verbalise it. The noun itself never inflects — all the grammar happens inside する." },

  "stem-a": { role: "stem", gloss: "STEM.a", title: "あ-row stem (未然形)", body: "The final kana drops to the あ row. This stem exists to carry ない (negative), れる (passive) and せる (causative) — it never stands alone." },
  "stem-i": { role: "stem", gloss: "STEM.i", title: "い-row stem (連用形)", body: "The final kana shifts to the い row. This is the workhorse: ます, たい, ましょう, ながら and most compound verbs all hang off it. Textbooks call it the ます-stem." },
  "stem-e": { role: "stem", gloss: "STEM.e", title: "え-row stem (仮定形/命令形)", body: "The final kana shifts to the え row. Alone it is a blunt command; + る it becomes potential; + ば it becomes a conditional." },
  "stem-o": { role: "stem", gloss: "STEM.o", title: "お-row stem", body: "The final kana shifts to the お row. It has exactly one job: carry the volitional う." },

  "dict-u": { role: "stem", gloss: "NPST", title: "Dictionary ending", body: "A godan verb always ends in a kana from the う row. This is the plain non-past form — present or future depending on context — and the form you look up." },
  "ichidan-ru": { role: "aux", gloss: "NPST", title: "る", body: "Plain non-past ending for ichidan verbs. Strip it and the bare stem is left." },
  suru: { role: "aux", gloss: "do.NPST", title: "する", body: "The irregular verb する, 'to do'. It changes its own vowel per form: し-, さ-, す- — nothing else in the language does this." },
  kuru: { role: "aux", gloss: "come.NPST", title: "くる", body: "来る is irregular in the reading, not the kanji: 来 is read く / き / こ depending on the form." },
  "kuru-stem": { role: "stem", gloss: "STEM", title: "Irregular reading shift", body: "The kanji 来 stays put while its reading moves: き before ます・て・た, こ before ない・よう, く before る・れば. Watch the furigana, not the character." },

  masu: { role: "aux", gloss: "POL.NPST", title: "ます", body: "Polite non-past auxiliary. It adds politeness only — the tense is the same as the plain form. Never attach it to anything but the い-row stem." },
  masen: { role: "aux", gloss: "POL.NEG", title: "ません", body: "Polite negative. ます does not take ない; the whole auxiliary is replaced by ません." },
  mashita: { role: "aux", gloss: "POL.PST", title: "ました", body: "Polite past — ます fused with the past た." },
  masendeshita: { role: "aux", gloss: "POL.NEG.PST", title: "ませんでした", body: "Polite past negative: ません plus でした. The past is carried by でした, not by the verb." },
  mashou: { role: "aux", gloss: "POL.VOL", title: "ましょう", body: "Polite volitional — 'let's ...' or an offer. Built on the い-row stem like everything in the ます family." },
  tai: { role: "aux", gloss: "DESID", title: "たい", body: "'want to ...'. It behaves as an い-adjective from here: 行きたくない, 行きたかった. Only use it about yourself." },

  nai: { role: "aux", gloss: "NEG", title: "ない", body: "Plain negative auxiliary, attached to the あ-row stem. It inflects as an い-adjective, which is why the past is なかった and not *ないた." },
  "nakatta-stem": { role: "aux", gloss: "NEG", title: "なかっ", body: "ない conjugated as an い-adjective: い → かっ before the past た." },
  "ta-aux": { role: "extra", gloss: "PST", title: "た", body: "The plain past marker, sitting on top of whatever came before it." },
  "ta-plain": { role: "aux", gloss: "PST", title: "た", body: "Plain past. For ichidan verbs it attaches straight to the stem — same slot as て." },
  "te-plain": { role: "aux", gloss: "CONJ", title: "て", body: "The て-form is not a tense. It is a joint: it links clauses ('and then'), and it is the socket that ～ている, ～てください and ～てもいい plug into." },
  "ta-onbin": { role: "aux", gloss: "PST", title: "Past with sound change (音便)", body: "Godan verbs do not just add た — the stem itself contracts. The change is identical to the て-form, only voiced differently." },
  "te-onbin": { role: "aux", gloss: "CONJ", title: "て-form with sound change (音便)", body: "Godan verbs contract before て. Learn the て-form and you get the past た free: same shape, different final kana." },
  iru: { role: "extra", gloss: "PROG", title: "いる", body: "て + いる: an action in progress, or a state that resulted from it. 行っている is closer to 'is on the way / has gone' than 'is going'." },
  "iru-stem": { role: "extra", gloss: "PROG", title: "い", body: "The stem of いる, waiting for ます." },

  "pot-ru": { role: "aux", gloss: "POT", title: "る (potential)", body: "え-stem + る = 'can do'. The result is a brand-new ichidan verb, so it conjugates as 行けます, 行けない. Its object usually takes が, not を." },
  rareru: { role: "aux", gloss: "POT/PASS", title: "られる", body: "For ichidan verbs, potential and passive are the same shape — context separates them. Casual speech shortens the potential to れる (食べれる), which is common but still flagged in writing." },
  reru: { role: "aux", gloss: "PASS", title: "れる (passive)", body: "あ-stem + れる. The affected party becomes the subject and the agent takes に. Often used to mean something inconvenient happened to you." },
  seru: { role: "aux", gloss: "CAUS", title: "せる (causative)", body: "あ-stem + せる: make or let someone do it. The person made to act takes に or を." },
  saseru: { role: "aux", gloss: "CAUS", title: "させる", body: "Ichidan causative: stem + させる — make or let someone do it." },
  "vol-u": { role: "aux", gloss: "VOL", title: "う (volitional)", body: "Plain volitional: 'let's' or 'I think I'll'. Only ever after the お-row stem, and the pair is pronounced as one long vowel." },
  "vol-you": { role: "aux", gloss: "VOL", title: "よう", body: "Ichidan volitional — 'let's' or a decision about your own action." },
  "imp-bare": { role: "stem", gloss: "IMP", title: "Plain imperative", body: "The bare え-stem is an order. It is genuinely rough — signs, coaches, arguments. Use ～てください in normal speech." },
  "imp-ro": { role: "aux", gloss: "IMP", title: "ろ", body: "Ichidan plain imperative. Same bluntness warning applies." },
  "imp-i": { role: "aux", gloss: "IMP", title: "い", body: "来い is irregular: the こ-stem takes い, not ろ. It is the shape you hear shouted in sports and arguments." },
  ba: { role: "extra", gloss: "COND", title: "ば", body: "Conditional: 'if / when'. Attached to the え-stem. Focuses on the condition being met rather than the sequence of events." },
  reba: { role: "aux", gloss: "COND", title: "れば", body: "Ichidan conditional: 'if / when'." },

  /* adjectives */
  "iadj-i": { role: "stem", gloss: "NPST", title: "い ending", body: "い-adjectives carry their own tense. There is no だ in the plain form — 高い is already a complete predicate." },
  "iadj-ku": { role: "stem", gloss: "ADV", title: "く", body: "い → く. This one shift produces the adverb (高く = 'expensively'), the negative stem, and the て-form." },
  "iadj-katta": { role: "stem", gloss: "PST", title: "かっ", body: "い → かっ before た. The adjective inflects for tense by itself; だった is not used." },
  "iadj-kere": { role: "stem", gloss: "COND", title: "けれ", body: "い → けれ, then ば. 高ければ = 'if it is expensive'." },
  "nai-adj": { role: "aux", gloss: "NEG", title: "ない", body: "Negative for adjectives, on the く stem. Still an い-adjective, so it keeps going: 高くなかった." },
  sou: { role: "aux", gloss: "SEEM", title: "そう", body: "'looks / seems ...', based on what you can see. Drops the い first." },
  "desu-adj": { role: "extra", gloss: "POL", title: "です", body: "Politeness only. It adds no tense to an い-adjective, which is why 高いでした is wrong — the past has to go in the adjective: 高かったです." },
  da: { role: "aux", gloss: "COP", title: "だ", body: "The plain copula. Needed because な-adjectives and nouns cannot carry tense on their own." },
  desu: { role: "aux", gloss: "POL.COP", title: "です", body: "Polite copula — the polite counterpart of だ." },
  janai: { role: "aux", gloss: "NEG.COP", title: "じゃない", body: "Negative copula, contracted from ではない. Keep では in writing and speeches." },
  datta: { role: "aux", gloss: "PST.COP", title: "だった", body: "Past copula. The tense lives in the copula, not in the word before it." },
  deshita: { role: "aux", gloss: "POL.PST.COP", title: "でした", body: "Polite past copula." },
  "de-conj": { role: "aux", gloss: "CONJ", title: "で", body: "The て-form of the copula — links a な-adjective or noun to the next clause." },
  "na-attr": { role: "aux", gloss: "ATTR", title: "な", body: "The attributive form. This な, appearing only before a noun, is the whole reason this class is called な-adjective." },
  "no-attr": { role: "aux", gloss: "GEN", title: "の", body: "A noun modifying another noun links with の, never な." },
  nara: { role: "aux", gloss: "COND", title: "なら", body: "'if it is ...'. Conditional for nouns and な-adjectives." },
  "ja-arimasen": { role: "aux", gloss: "POL.NEG.COP", title: "じゃありません", body: "Polite negative copula. じゃないです is the softer, more spoken alternative." },
};

/* ============================================================
   CONJUGATION ENGINE
   ============================================================ */
const GODAN = {
  う: { a: "わ", i: "い", e: "え", o: "お", te: "って", ta: "った" },
  く: { a: "か", i: "き", e: "け", o: "こ", te: "いて", ta: "いた" },
  ぐ: { a: "が", i: "ぎ", e: "げ", o: "ご", te: "いで", ta: "いだ" },
  す: { a: "さ", i: "し", e: "せ", o: "そ", te: "して", ta: "した" },
  つ: { a: "た", i: "ち", e: "て", o: "と", te: "って", ta: "った" },
  ぬ: { a: "な", i: "に", e: "ね", o: "の", te: "んで", ta: "んだ" },
  ぶ: { a: "ば", i: "び", e: "べ", o: "ぼ", te: "んで", ta: "んだ" },
  む: { a: "ま", i: "み", e: "め", o: "も", te: "んで", ta: "んだ" },
  る: { a: "ら", i: "り", e: "れ", o: "ろ", te: "って", ta: "った" },
};
const ONBIN = {
  く: "く → い: 書く→書いて, 聞く→聞いて.",
  ぐ: "ぐ → い with a voiced で: 泳ぐ→泳いで.",
  す: "す → し, then て: 話す→話して.",
  つ: "つ・う・る all collapse to っ: 待つ→待って.",
  う: "つ・う・る all collapse to っ: 買う→買って.",
  る: "つ・う・る all collapse to っ: 帰る→帰って.",
  ぬ: "ぬ・ぶ・む become ん and voice the ending: 死ぬ→死んで.",
  ぶ: "ぬ・ぶ・む become ん and voice the ending: 遊ぶ→遊んで.",
  む: "ぬ・ぶ・む become ん and voice the ending: 飲む→飲んで.",
};
const GROUPS = ["Plain", "Polite", "Connective", "Derived"];

function seg(text, kana, key, extra) {
  const g = G[key] || G.root;
  return { text, kana: kana ?? text, role: g.role, gloss: g.gloss, title: g.title, body: extra ? g.body + " " + extra : g.body };
}
const F = (id, label, jp, group, segs, note) => ({ id, label, jp, group, segs, note });

function buildGodan(word, reading) {
  const last = reading.slice(-1);
  const g = GODAN[last];
  if (!g) return null;
  const rD = word.slice(0, -1);
  const rK = reading.slice(0, -1);
  const irr = /行く$/.test(word) || /いく$/.test(reading);
  const te = irr ? "って" : g.te;
  const ta = irr ? "った" : g.ta;
  const note = irr
    ? "行く is the one famous exception in this class. The く rule predicts 行いて / 行いた — but the real forms are 行って (itte) and 行った (itta). Everything else about 行く is regular."
    : ONBIN[last];

  const root = () => seg(rD, rK, "root");
  const A = () => seg(g.a, g.a, "stem-a");
  const I = () => seg(g.i, g.i, "stem-i");
  const E = () => seg(g.e, g.e, "stem-e");
  const O = () => seg(g.o, g.o, "stem-o");

  return [
    F("dict", "Dictionary", "辞書形", "Plain", [root(), seg(last, last, "dict-u")]),
    F("nai", "Negative", "ない形", "Plain", [root(), A(), seg("ない", "ない", "nai")]),
    F("ta", "Past", "た形", "Plain", [root(), seg(ta, ta, "ta-onbin", note)], irr ? note : null),
    F("nakatta", "Past negative", "なかった", "Plain", [root(), A(), seg("なかっ", "なかっ", "nakatta-stem"), seg("た", "た", "ta-aux")]),
    F("vol", "Volitional", "意向形", "Plain", [root(), O(), seg("う", "う", "vol-u")]),
    F("imp", "Imperative", "命令形", "Plain", [root(), seg(g.e, g.e, "imp-bare")]),

    F("masu", "Polite", "ます形", "Polite", [root(), I(), seg("ます", "ます", "masu")]),
    F("masen", "Polite negative", "ません", "Polite", [root(), I(), seg("ません", "ません", "masen")]),
    F("mashita", "Polite past", "ました", "Polite", [root(), I(), seg("ました", "ました", "mashita")]),
    F("masendeshita", "Polite past neg.", "ませんでした", "Polite", [root(), I(), seg("ませんでした", "ませんでした", "masendeshita")]),
    F("mashou", "Polite volitional", "ましょう", "Polite", [root(), I(), seg("ましょう", "ましょう", "mashou")]),

    F("te", "て-form", "て形", "Connective", [root(), seg(te, te, "te-onbin", note)], irr ? note : null),
    F("teiru", "Progressive", "ている", "Connective", [root(), seg(te, te, "te-onbin", note), seg("いる", "いる", "iru")]),
    F("teimasu", "Progressive polite", "ています", "Connective", [root(), seg(te, te, "te-onbin", note), seg("い", "い", "iru-stem"), seg("ます", "ます", "masu")]),
    F("ba", "Conditional", "ば形", "Connective", [root(), E(), seg("ば", "ば", "ba")]),

    F("pot", "Potential", "可能形", "Derived", [root(), E(), seg("る", "る", "pot-ru")]),
    F("pass", "Passive", "受身形", "Derived", [root(), A(), seg("れる", "れる", "reru")]),
    F("caus", "Causative", "使役形", "Derived", [root(), A(), seg("せる", "せる", "seru")]),
    F("tai", "Want to", "たい形", "Derived", [root(), I(), seg("たい", "たい", "tai")]),
  ];
}

function buildIchidan(word, reading) {
  const rD = word.slice(0, -1);
  const rK = reading.slice(0, -1);
  const root = () => seg(rD, rK, "ichidan-stem");
  return [
    F("dict", "Dictionary", "辞書形", "Plain", [root(), seg("る", "る", "ichidan-ru")]),
    F("nai", "Negative", "ない形", "Plain", [root(), seg("ない", "ない", "nai")]),
    F("ta", "Past", "た形", "Plain", [root(), seg("た", "た", "ta-plain")]),
    F("nakatta", "Past negative", "なかった", "Plain", [root(), seg("なかっ", "なかっ", "nakatta-stem"), seg("た", "た", "ta-aux")]),
    F("vol", "Volitional", "意向形", "Plain", [root(), seg("よう", "よう", "vol-you")]),
    F("imp", "Imperative", "命令形", "Plain", [root(), seg("ろ", "ろ", "imp-ro")]),

    F("masu", "Polite", "ます形", "Polite", [root(), seg("ます", "ます", "masu")]),
    F("masen", "Polite negative", "ません", "Polite", [root(), seg("ません", "ません", "masen")]),
    F("mashita", "Polite past", "ました", "Polite", [root(), seg("ました", "ました", "mashita")]),
    F("masendeshita", "Polite past neg.", "ませんでした", "Polite", [root(), seg("ませんでした", "ませんでした", "masendeshita")]),
    F("mashou", "Polite volitional", "ましょう", "Polite", [root(), seg("ましょう", "ましょう", "mashou")]),

    F("te", "て-form", "て形", "Connective", [root(), seg("て", "て", "te-plain")]),
    F("teiru", "Progressive", "ている", "Connective", [root(), seg("て", "て", "te-plain"), seg("いる", "いる", "iru")]),
    F("teimasu", "Progressive polite", "ています", "Connective", [root(), seg("て", "て", "te-plain"), seg("い", "い", "iru-stem"), seg("ます", "ます", "masu")]),
    F("ba", "Conditional", "ば形", "Connective", [root(), seg("れば", "れば", "reba")]),

    F("pot", "Potential", "可能形", "Derived", [root(), seg("られる", "られる", "rareru")]),
    F("pass", "Passive", "受身形", "Derived", [root(), seg("られる", "られる", "rareru")]),
    F("caus", "Causative", "使役形", "Derived", [root(), seg("させる", "させる", "saseru")]),
    F("tai", "Want to", "たい形", "Derived", [root(), seg("たい", "たい", "tai")]),
  ];
}

function buildSuru(word, reading) {
  const bD = word.slice(0, -2);
  const bK = reading.slice(0, -2);
  const base = () => (bD ? [seg(bD, bK, "suru-base")] : []);
  const S = (t, key) => seg(t, t, key || "suru");
  return [
    F("dict", "Dictionary", "辞書形", "Plain", [...base(), S("する")]),
    F("nai", "Negative", "ない形", "Plain", [...base(), S("し"), seg("ない", "ない", "nai")]),
    F("ta", "Past", "た形", "Plain", [...base(), S("し"), seg("た", "た", "ta-plain")]),
    F("nakatta", "Past negative", "なかった", "Plain", [...base(), S("し"), seg("なかっ", "なかっ", "nakatta-stem"), seg("た", "た", "ta-aux")]),
    F("vol", "Volitional", "意向形", "Plain", [...base(), S("し"), seg("よう", "よう", "vol-you")]),
    F("imp", "Imperative", "命令形", "Plain", [...base(), S("し"), seg("ろ", "ろ", "imp-ro")]),

    F("masu", "Polite", "ます形", "Polite", [...base(), S("し"), seg("ます", "ます", "masu")]),
    F("masen", "Polite negative", "ません", "Polite", [...base(), S("し"), seg("ません", "ません", "masen")]),
    F("mashita", "Polite past", "ました", "Polite", [...base(), S("し"), seg("ました", "ました", "mashita")]),
    F("masendeshita", "Polite past neg.", "ませんでした", "Polite", [...base(), S("し"), seg("ませんでした", "ませんでした", "masendeshita")]),
    F("mashou", "Polite volitional", "ましょう", "Polite", [...base(), S("し"), seg("ましょう", "ましょう", "mashou")]),

    F("te", "て-form", "て形", "Connective", [...base(), S("し"), seg("て", "て", "te-plain")]),
    F("teiru", "Progressive", "ている", "Connective", [...base(), S("し"), seg("て", "て", "te-plain"), seg("いる", "いる", "iru")]),
    F("ba", "Conditional", "ば形", "Connective", [...base(), S("すれ"), seg("ば", "ば", "ba")]),

    F("pot", "Potential", "可能形", "Derived", [...base(), seg("できる", "できる", "suru")], "する has no regular potential — it is replaced wholesale by できる. 勉強できる, never 勉強しれる."),
    F("pass", "Passive", "受身形", "Derived", [...base(), S("さ"), seg("れる", "れる", "reru")]),
    F("caus", "Causative", "使役形", "Derived", [...base(), seg("させる", "させる", "saseru")]),
    F("tai", "Want to", "たい形", "Derived", [...base(), S("し"), seg("たい", "たい", "tai")]),
  ];
}

function buildKuru(word, reading) {
  const kanaOnly = word === reading;
  const stem = (kana) => seg(kanaOnly ? kana : word.slice(0, -1), kana, "kuru-stem");
  return [
    F("dict", "Dictionary", "辞書形", "Plain", [stem("く"), seg("る", "る", "ichidan-ru")]),
    F("nai", "Negative", "ない形", "Plain", [stem("こ"), seg("ない", "ない", "nai")]),
    F("ta", "Past", "た形", "Plain", [stem("き"), seg("た", "た", "ta-plain")]),
    F("nakatta", "Past negative", "なかった", "Plain", [stem("こ"), seg("なかっ", "なかっ", "nakatta-stem"), seg("た", "た", "ta-aux")]),
    F("vol", "Volitional", "意向形", "Plain", [stem("こ"), seg("よう", "よう", "vol-you")]),
    F("imp", "Imperative", "命令形", "Plain", [stem("こ"), seg("い", "い", "imp-i")]),

    F("masu", "Polite", "ます形", "Polite", [stem("き"), seg("ます", "ます", "masu")]),
    F("masen", "Polite negative", "ません", "Polite", [stem("き"), seg("ません", "ません", "masen")]),
    F("mashita", "Polite past", "ました", "Polite", [stem("き"), seg("ました", "ました", "mashita")]),
    F("masendeshita", "Polite past neg.", "ませんでした", "Polite", [stem("き"), seg("ませんでした", "ませんでした", "masendeshita")]),
    F("mashou", "Polite volitional", "ましょう", "Polite", [stem("き"), seg("ましょう", "ましょう", "mashou")]),

    F("te", "て-form", "て形", "Connective", [stem("き"), seg("て", "て", "te-plain")]),
    F("teiru", "Progressive", "ている", "Connective", [stem("き"), seg("て", "て", "te-plain"), seg("いる", "いる", "iru")]),
    F("ba", "Conditional", "ば形", "Connective", [stem("く"), seg("れば", "れば", "reba")]),

    F("pot", "Potential", "可能形", "Derived", [stem("こ"), seg("られる", "られる", "rareru")]),
    F("pass", "Passive", "受身形", "Derived", [stem("こ"), seg("られる", "られる", "rareru")]),
    F("caus", "Causative", "使役形", "Derived", [stem("こ"), seg("させる", "させる", "saseru")]),
    F("tai", "Want to", "たい形", "Derived", [stem("き"), seg("たい", "たい", "tai")]),
  ];
}

function buildIAdj(word, reading) {
  const rD = word.slice(0, -1);
  const rK = reading.slice(0, -1);
  const yoi = reading === "いい" || reading === "よい";
  const iD = yoi ? (word === "いい" ? "よ" : rD) : rD;
  const iK = yoi ? "よ" : rK;
  const note = yoi ? "いい is irregular: it borrows 良い(よい) for everything except the plain non-past. よくない, よかった — never *いくない." : null;
  const root = () => seg(rD, rK, "root");
  const iroot = () => seg(iD, iK, "root");
  return [
    F("dict", "Dictionary", "辞書形", "Plain", [root(), seg("い", "い", "iadj-i")]),
    F("nai", "Negative", "くない", "Plain", [iroot(), seg("く", "く", "iadj-ku"), seg("ない", "ない", "nai-adj")], note),
    F("ta", "Past", "かった", "Plain", [iroot(), seg("かっ", "かっ", "iadj-katta"), seg("た", "た", "ta-aux")], note),
    F("nakatta", "Past negative", "くなかった", "Plain", [iroot(), seg("く", "く", "iadj-ku"), seg("なかっ", "なかっ", "nakatta-stem"), seg("た", "た", "ta-aux")]),

    F("desu", "Polite", "いです", "Polite", [root(), seg("い", "い", "iadj-i"), seg("です", "です", "desu-adj")]),
    F("kunaidesu", "Polite negative", "くないです", "Polite", [iroot(), seg("く", "く", "iadj-ku"), seg("ない", "ない", "nai-adj"), seg("です", "です", "desu-adj")]),
    F("kattadesu", "Polite past", "かったです", "Polite", [iroot(), seg("かっ", "かっ", "iadj-katta"), seg("た", "た", "ta-aux"), seg("です", "です", "desu-adj")]),

    F("te", "て-form", "くて", "Connective", [iroot(), seg("く", "く", "iadj-ku"), seg("て", "て", "te-plain")]),
    F("adv", "Adverb", "く", "Connective", [iroot(), seg("く", "く", "iadj-ku")]),
    F("ba", "Conditional", "ければ", "Connective", [iroot(), seg("けれ", "けれ", "iadj-kere"), seg("ば", "ば", "ba")]),
    F("sou", "Seems", "そう", "Derived", [iroot(), seg("そう", "そう", "sou")]),
  ];
}

function buildNaAdj(word, reading, isNoun) {
  const root = () => seg(word, reading, "root");
  return [
    F("dict", "Dictionary", "辞書形", "Plain", [root()], isNoun ? "A noun needs a copula to become a predicate — the word alone is not a sentence." : "な-adjectives are listed without the な. The な only appears when the word sits in front of a noun."),
    F("da", "Plain", "だ", "Plain", [root(), seg("だ", "だ", "da")]),
    F("janai", "Negative", "じゃない", "Plain", [root(), seg("じゃない", "じゃない", "janai")]),
    F("datta", "Past", "だった", "Plain", [root(), seg("だった", "だった", "datta")]),

    F("desu", "Polite", "です", "Polite", [root(), seg("です", "です", "desu")]),
    F("jaarimasen", "Polite negative", "じゃありません", "Polite", [root(), seg("じゃありません", "じゃありません", "ja-arimasen")]),
    F("deshita", "Polite past", "でした", "Polite", [root(), seg("でした", "でした", "deshita")]),

    F("te", "て-form", "で", "Connective", [root(), seg("で", "で", "de-conj")]),
    F("attr", isNoun ? "Before a noun" : "Before a noun", isNoun ? "の" : "な", "Connective", [root(), isNoun ? seg("の", "の", "no-attr") : seg("な", "な", "na-attr")]),
    F("nara", "Conditional", "なら", "Connective", [root(), seg("なら", "なら", "nara")]),
  ];
}

function conjugate(w) {
  if (!w) return [];
  const word = w.word.trim();
  const reading = (w.reading || w.word).trim();
  try {
    switch (w.type) {
      case "godan": return buildGodan(word, reading) || [];
      case "ichidan": return buildIchidan(word, reading);
      case "suru": return buildSuru(word, reading);
      case "kuru": return buildKuru(word, reading);
      case "i-adj": return buildIAdj(word, reading);
      case "na-adj": return buildNaAdj(word, reading, false);
      case "noun": return buildNaAdj(word, reading, true);
      default: return [];
    }
  } catch {
    return [];
  }
}

/* ---------- type detection ---------- */
const GODAN_RU = ["はいる", "はしる", "かえる", "きる", "しる", "いる", "かぎる", "へる", "ける", "しゃべる", "にぎる", "まじる", "あせる", "しめる", "すべる", "ちる", "ののしる", "うる", "とる", "のる", "こる", "ふる", "まいる", "みのる", "いじる", "ける"];
const GODAN_KANJI = ["帰る", "入る", "走る", "切る", "知る", "要る", "限る", "減る", "蹴る", "喋る", "握る", "混じる", "焦る", "滑る", "散る", "売る", "取る", "乗る", "降る", "参る", "実る", "弄る"];

function detectType(word, reading) {
  const w = (word || "").trim();
  const r = (reading || word || "").trim();
  if (!r) return "noun";
  if (/する$/.test(r) && r.length >= 2) return "suru";
  if (/来る$/.test(w) || /くる$/.test(r)) return "kuru";
  // A word that ends in a kanji cannot be carrying an inflecting kana ending:
  // 学生 is a noun, while 高い / 行く wear their ending in the open.
  if (w && !/[\u3040-\u30ff]$/.test(w)) return "noun";
  if (/る$/.test(r)) {
    if (GODAN_KANJI.some((k) => w.endsWith(k))) return "godan";
    if (GODAN_RU.includes(r)) return "godan";
    const pre = r.slice(-2, -1);
    return /[えけせてねへめれげぜでべぺいきしちにひみりぎじぢびぴ]/.test(pre) ? "ichidan" : "godan";
  }
  if (/[うくぐすつぬぶむ]$/.test(r)) return "godan";
  if (/い$/.test(r)) return "i-adj";
  return "na-adj";
}

const TYPES = [
  { id: "godan", label: "Godan", jp: "五段" },
  { id: "ichidan", label: "Ichidan", jp: "一段" },
  { id: "suru", label: "する verb", jp: "する" },
  { id: "kuru", label: "来る", jp: "来る" },
  { id: "i-adj", label: "い-adjective", jp: "い形" },
  { id: "na-adj", label: "な-adjective", jp: "な形" },
  { id: "noun", label: "Noun", jp: "名詞" },
];
const typeLabel = (id) => TYPES.find((t) => t.id === id)?.jp ?? "";

/* ============================================================
   STORAGE
   ============================================================ */
const KEY = "kotoba-deck-v1";
const SKEY = "kotoba-script-v1";
const SEED = [
  { word: "行く", reading: "いく", meaning: "to go", type: "godan" },
  { word: "食べる", reading: "たべる", meaning: "to eat", type: "ichidan" },
  { word: "飲む", reading: "のむ", meaning: "to drink", type: "godan" },
  { word: "勉強する", reading: "べんきょうする", meaning: "to study", type: "suru" },
  { word: "来る", reading: "くる", meaning: "to come", type: "kuru" },
  { word: "高い", reading: "たかい", meaning: "expensive; tall", type: "i-adj" },
  { word: "静か", reading: "しずか", meaning: "quiet", type: "na-adj" },
].map((w, i) => ({ ...w, id: "seed" + i, addedAt: Date.now() - (7 - i) * 86400000 }));

/* ============================================================
   ROMAJI → KANA  (the answer-field IME)
   Converts the whole accumulated string on every keystroke, so already
   converted kana passes straight through and only trailing latin is live.
   A lone trailing "n" is deliberately left as latin — committing it to ん
   too early would make "na" come out as んあ.
   ============================================================ */
const TO_KANA = {};
for (const [k, r] of Object.entries(R1)) if (!TO_KANA[r]) TO_KANA[r] = k;
for (const [k, r] of Object.entries(R2)) if (!TO_KANA[r]) TO_KANA[r] = k;
delete TO_KANA["n"];
Object.assign(TO_KANA, {
  "n'": "ん",
  si: "し", ti: "ち", tu: "つ", hu: "ふ", zi: "じ", di: "ぢ", du: "づ",
  sya: "しゃ", syu: "しゅ", syo: "しょ", tya: "ちゃ", tyu: "ちゅ", tyo: "ちょ",
  ja: "じゃ", ju: "じゅ", jo: "じょ", jya: "じゃ", jyu: "じゅ", jyo: "じょ",
  cya: "ちゃ", cyu: "ちゅ", cyo: "ちょ", cha: "ちゃ", chu: "ちゅ", cho: "ちょ",
  fa: "ふぁ", fi: "ふぃ", fe: "ふぇ", fo: "ふぉ", wo: "を",
  "-": "ー", tta: "った",
});
const IME_CONS = /[bcdfghjkmpqrstvwxyz]/; // 'n' and 'l' excluded on purpose

function toKana(input) {
  const s = input || "";
  let out = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (!/[a-zA-Z'\-]/.test(c)) { out += c; i += 1; continue; }
    let hit = false;
    for (let L = 3; L >= 1; L--) {
      if (i + L > s.length) continue;
      const chunk = s.slice(i, i + L).toLowerCase();
      if (TO_KANA[chunk]) { out += TO_KANA[chunk]; i += L; hit = true; break; }
    }
    if (hit) continue;
    const lc = c.toLowerCase();
    const nxt = s[i + 1] ? s[i + 1].toLowerCase() : "";
    if (lc === nxt && IME_CONS.test(lc)) { out += "っ"; i += 1; continue; }
    if (lc === "n" && (nxt === "n" || (nxt && IME_CONS.test(nxt) && nxt !== "y"))) { out += "ん"; i += 1; continue; }
    out += c;
    i += 1;
  }
  return out;
}
/** Final pass on submit: a trailing latin n becomes ん. */
const settleKana = (s) => toKana(s).replace(/んn$/i, "ん").replace(/n$/i, "ん");

/* ============================================================
   STACKED FORMS
   Each modifier takes a state and returns a new one, including the class
   of the result — a causative is a fresh ichidan verb, a たい-form is an
   い-adjective — which is what lets them chain the way real Japanese does.
   ============================================================ */
function stems(disp, kana, cls) {
  const rootD = disp.slice(0, -1), rootK = kana.slice(0, -1);
  const root = seg(rootD, rootK, cls === "ichidan" ? "ichidan-stem" : "root");
  if (cls === "godan") {
    const g = GODAN[kana.slice(-1)];
    if (!g) return null;
    const irr = /行く$/.test(disp) || /いく$/.test(kana);
    return { root, a: g.a, i: g.i, e: g.e, o: g.o, te: irr ? "って" : g.te, ta: irr ? "った" : g.ta };
  }
  if (cls === "ichidan") return { root, a: "", i: "", e: "", o: "", te: "て", ta: "た" };
  if (cls === "i-adj") {
    const yoi = kana === "いい" || kana === "よい";
    return { root: seg(yoi && disp === "いい" ? "よ" : rootD, yoi ? "よ" : rootK, "root"), plain: root };
  }
  if (cls === "suru") return { base: disp.length > 2 ? [seg(disp.slice(0, -2), kana.slice(0, -2), "suru-base")] : [] };
  if (cls === "kuru") return { kstem: (k) => seg(disp === kana ? k : disp.slice(0, -1), k, "kuru-stem") };
  return { whole: seg(disp, kana, "root") }; // na-adj / noun
}

const S = (t, key) => seg(t, t, key);

const MODS = [
  {
    id: "caus", label: "Causative", jp: "使役形", hint: "make or let someone do it",
    from: ["godan", "ichidan", "suru", "kuru"], to: "ichidan",
    build: (k, cls) => ({
      godan: () => [k.root, S(k.a, "stem-a"), S("せる", "seru")],
      ichidan: () => [k.root, S("させる", "saseru")],
      suru: () => [...k.base, S("させる", "saseru")],
      kuru: () => [k.kstem("こ"), S("させる", "saseru")],
    }[cls]()),
  },
  {
    id: "pass", label: "Passive", jp: "受身形", hint: "it was done to the subject",
    from: ["godan", "ichidan", "suru", "kuru"], to: "ichidan",
    build: (k, cls) => ({
      godan: () => [k.root, S(k.a, "stem-a"), S("れる", "reru")],
      ichidan: () => [k.root, S("られる", "rareru")],
      suru: () => [...k.base, S("さ", "suru"), S("れる", "reru")],
      kuru: () => [k.kstem("こ"), S("られる", "rareru")],
    }[cls]()),
  },
  {
    id: "pot", label: "Potential", jp: "可能形", hint: "can do it",
    from: ["godan", "ichidan", "suru", "kuru"], to: "ichidan",
    build: (k, cls) => ({
      godan: () => [k.root, S(k.e, "stem-e"), S("る", "pot-ru")],
      ichidan: () => [k.root, S("られる", "rareru")],
      suru: () => [...k.base, S("できる", "suru")],
      kuru: () => [k.kstem("こ"), S("られる", "rareru")],
    }[cls]()),
  },
  {
    id: "prog", label: "Progressive", jp: "ている", hint: "in progress, or the resulting state",
    from: ["godan", "ichidan", "suru", "kuru"], to: "ichidan",
    build: (k, cls) => ({
      godan: () => [k.root, S(k.te, "te-onbin"), S("いる", "iru")],
      ichidan: () => [k.root, S("て", "te-plain"), S("いる", "iru")],
      suru: () => [...k.base, S("し", "suru"), S("て", "te-plain"), S("いる", "iru")],
      kuru: () => [k.kstem("き"), S("て", "te-plain"), S("いる", "iru")],
    }[cls]()),
  },
  {
    id: "tai", label: "Want to", jp: "たい形", hint: "want to do it — becomes an い-adjective",
    from: ["godan", "ichidan", "suru", "kuru"], to: "i-adj",
    build: (k, cls) => ({
      godan: () => [k.root, S(k.i, "stem-i"), S("たい", "tai")],
      ichidan: () => [k.root, S("たい", "tai")],
      suru: () => [...k.base, S("し", "suru"), S("たい", "tai")],
      kuru: () => [k.kstem("き"), S("たい", "tai")],
    }[cls]()),
  },
  {
    id: "neg", label: "Negative", jp: "否定", hint: "not — the result inflects as an い-adjective",
    from: ["godan", "ichidan", "suru", "kuru", "i-adj", "na-adj", "noun"], to: "i-adj",
    build: (k, cls) => ({
      godan: () => [k.root, S(k.a, "stem-a"), S("ない", "nai")],
      ichidan: () => [k.root, S("ない", "nai")],
      suru: () => [...k.base, S("し", "suru"), S("ない", "nai")],
      kuru: () => [k.kstem("こ"), S("ない", "nai")],
      "i-adj": () => [k.root, S("く", "iadj-ku"), S("ない", "nai-adj")],
      "na-adj": () => [k.whole, S("じゃない", "janai")],
      noun: () => [k.whole, S("じゃない", "janai")],
    }[cls]()),
  },
  {
    id: "past", label: "Past", jp: "過去", hint: "completed",
    from: ["godan", "ichidan", "suru", "kuru", "i-adj", "na-adj", "noun"], to: "closed",
    build: (k, cls) => ({
      godan: () => [k.root, S(k.ta, "ta-onbin")],
      ichidan: () => [k.root, S("た", "ta-plain")],
      suru: () => [...k.base, S("し", "suru"), S("た", "ta-plain")],
      kuru: () => [k.kstem("き"), S("た", "ta-plain")],
      "i-adj": () => [k.root, S("かっ", "iadj-katta"), S("た", "ta-aux")],
      "na-adj": () => [k.whole, S("だった", "datta")],
      noun: () => [k.whole, S("だった", "datta")],
    }[cls]()),
  },
  {
    id: "polite", label: "Polite", jp: "丁寧", hint: "polite register — closes the chain",
    from: ["godan", "ichidan", "suru", "kuru", "i-adj", "na-adj", "noun"], to: "closed",
    build: (k, cls) => ({
      godan: () => [k.root, S(k.i, "stem-i"), S("ます", "masu")],
      ichidan: () => [k.root, S("ます", "masu")],
      suru: () => [...k.base, S("し", "suru"), S("ます", "masu")],
      kuru: () => [k.kstem("き"), S("ます", "masu")],
      "i-adj": () => [k.plain, S("い", "iadj-i"), S("です", "desu-adj")],
      "na-adj": () => [k.whole, S("です", "desu")],
      noun: () => [k.whole, S("です", "desu")],
    }[cls]()),
  },
  {
    id: "te", label: "て-form", jp: "て形", hint: "joins to the next clause",
    from: ["godan", "ichidan", "suru", "kuru", "i-adj", "na-adj", "noun"], to: "closed",
    build: (k, cls) => ({
      godan: () => [k.root, S(k.te, "te-onbin")],
      ichidan: () => [k.root, S("て", "te-plain")],
      suru: () => [...k.base, S("し", "suru"), S("て", "te-plain")],
      kuru: () => [k.kstem("き"), S("て", "te-plain")],
      "i-adj": () => [k.root, S("く", "iadj-ku"), S("て", "te-plain")],
      "na-adj": () => [k.whole, S("で", "de-conj")],
      noun: () => [k.whole, S("で", "de-conj")],
    }[cls]()),
  },
];

function stackInit(w) {
  const f = conjugate(w).find((x) => x.id === "dict");
  return { segs: f ? f.segs : [], cls: w.type, chain: [] };
}

/** How many trailing characters a modifier consumes from the current form. */
const STACK_DROP = { godan: 1, ichidan: 1, "i-adj": 1, suru: 2, kuru: 1, "na-adj": 0, noun: 0 };

/** Remove n trailing characters, dropping any segment that empties out. */
function trimSegs(segs, n) {
  const out = segs.map((s) => ({ ...s }));
  let left = n;
  while (left > 0 && out.length) {
    const last = out[out.length - 1];
    if (last.text.length <= left) { left -= last.text.length; out.pop(); }
    else {
      last.text = last.text.slice(0, -left);
      last.kana = last.kana.slice(0, -left);
      left = 0;
    }
  }
  return out;
}

function stackApply(state, modId) {
  const mod = MODS.find((m) => m.id === modId);
  if (!mod || !mod.from.includes(state.cls)) return state;
  const disp = state.segs.map((s) => s.text).join("");
  const kana = state.segs.map((s) => s.kana).join("");
  const k = stems(disp, kana, state.cls);
  if (!k) return state;
  let segs;
  try { segs = mod.build(k, state.cls); } catch { return state; }
  if (!segs || !segs.length || segs.some((s) => !s || !s.text)) return state;

  /* A modifier rebuilds the whole stem as its first segment. Splice the previous
     segments back in front of the new morphemes so earlier steps keep their own
     tiles and glosses — but only when the rebuilt stem actually matches. 来る and
     いい change their reading under inflection (く→こ, い→よ), so there the
     modifier's own output has to win. */
  const prev = trimSegs(state.segs, STACK_DROP[state.cls] ?? 0);
  const head = segs[0];
  const spliceable =
    head.text === prev.map((s) => s.text).join("") &&
    head.kana === prev.map((s) => s.kana).join("");

  return {
    segs: spliceable ? [...prev, ...segs.slice(1)] : segs,
    cls: mod.to,
    chain: [...state.chain, modId],
  };
}

/* ============================================================
   SCRIPT RENDERING — furigana / kanji / kana
   Furigana is aligned to the kanji only: 食べ reads た over 食,
   never たべ smeared across both characters.
   ============================================================ */
const isKana = (c) => /[\u3040-\u30ff]/.test(c);

function splitFurigana(text, kana) {
  if (!text || !kana || text === kana) return null;
  let t = text, k = kana, pre = "", post = "";
  while (t.length && k.length && isKana(t[t.length - 1]) && t[t.length - 1] === k[k.length - 1]) {
    post = t[t.length - 1] + post;
    t = t.slice(0, -1);
    k = k.slice(0, -1);
  }
  while (t.length && k.length && isKana(t[0]) && t[0] === k[0]) {
    pre += t[0];
    t = t.slice(1);
    k = k.slice(1);
  }
  if (!t || !k) return null;
  return { pre, core: t, coreKana: k, post };
}

function columns(text, kana, mode) {
  if (mode === "kana") return [{ base: kana, ruby: "" }];
  if (mode === "kanji") return [{ base: text, ruby: "" }];
  const p = splitFurigana(text, kana);
  if (!p) return [{ base: text, ruby: "" }];
  const out = [];
  if (p.pre) out.push({ base: p.pre, ruby: "" });
  out.push({ base: p.core, ruby: p.coreKana });
  if (p.post) out.push({ base: p.post, ruby: "" });
  return out;
}

/** Renders one morpheme in the current script mode. Inherits its base font size.
 *  `reserve` keeps the furigana line's height even when there is nothing to put
 *  in it, so a row of tiles keeps one shared baseline. */
function Word({ text, kana, mode, ruby = 11, rubyColor = C.muted, reserve = false }) {
  const cols = columns(text, kana, mode);
  const showRuby = mode === "furigana" && (reserve || cols.some((c) => c.ruby));
  return (
    <span style={{ display: "inline-flex", alignItems: "flex-end" }}>
      {cols.map((c, i) => (
        <span key={i} style={{ display: "inline-flex", flexDirection: "column", alignItems: "center" }}>
          {showRuby && (
            <span style={{ fontSize: ruby, lineHeight: 1.1, height: "1.25em", color: rubyColor, whiteSpace: "nowrap", letterSpacing: ".02em" }}>
              {c.ruby || "\u00a0"}
            </span>
          )}
          <span style={{ lineHeight: 1.2 }}>{c.base}</span>
        </span>
      ))}
    </span>
  );
}

const SCRIPTS = [
  { id: "furigana", label: "漢字＋かな" },
  { id: "kanji", label: "漢字" },
  { id: "kana", label: "かな" },
];

/* ============================================================
   LOOKUP — fills an entry from romaji, kana or kanji.
   Prototype path: asks Claude. For the shipping app this call gets
   swapped for a local JMdict query; the shape of the result is the
   same, so nothing downstream changes.
   ============================================================ */
const LOOKUP_PROMPT = `You are a Japanese dictionary lookup. The input may be romaji, kana, or kanji.
Reply with ONLY a JSON object. No markdown fences, no preamble:
{"candidates":[{"word":"行く","reading":"いく","meaning":"to go","type":"godan"}]}
Rules:
- word: the standard written form, in kanji if the word is normally written that way
- reading: hiragana only (katakana only for loanwords)
- meaning: short English gloss, under 60 characters, senses separated by semicolons
- type: exactly one of godan, ichidan, suru, kuru, i-adj, na-adj, noun
- If the input is ambiguous (romaji matching several words, e.g. "kaeru"), return up to 3 candidates, most common first
- If you cannot identify it, return {"candidates":[]}
Input: `;

async function lookupWord(query) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content: LOOKUP_PROMPT + query }],
    }),
  });
  if (!res.ok) throw new Error("status " + res.status);
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
  return (parsed.candidates || [])
    .filter((c) => c && c.word && c.reading && TYPES.some((t) => t.id === c.type))
    .slice(0, 3);
}

/* ============================================================
   五段 ladder — the literal "five rows" a godan stem walks through
   ============================================================ */
function Ladder({ row, active }) {
  const g = GODAN[row];
  if (!g) return null;
  const cells = [
    { k: g.a, tag: "a" },
    { k: g.i, tag: "i" },
    { k: row, tag: "u" },
    { k: g.e, tag: "e" },
    { k: g.o, tag: "o" },
  ];
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2 }}>
      {cells.map((c) => {
        const on = c.k === active;
        return (
          <div key={c.tag} style={{ textAlign: "center", width: 34 }}>
            <div
              style={{
                fontFamily: MINCHO, fontSize: 20, lineHeight: "34px", height: 34,
                color: on ? C.panel : C.muted,
                background: on ? C.stem : "transparent",
                border: "1px solid " + (on ? C.stem : C.ruleSoft),
                transition: "background .18s, color .18s",
              }}
            >{c.k}</div>
            <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: ".14em", color: on ? C.stem : C.muted, marginTop: 3 }}>{c.tag.toUpperCase()}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   AUDIO — Web Speech, no dependency. Reads the kana so the engine
   never has to guess a kanji reading.
   ============================================================ */
const SPEECH_OK = typeof window !== "undefined" && !!window.speechSynthesis;

/* A single subscriber, so a Say button in any panel can surface a failure
   without threading a callback through every component. */
let audioReporter = null;
const reportAudio = (msg) => { if (audioReporter) audioReporter(msg); };

const pickJa = (vs) =>
  vs.find((v) => /^ja[-_]?jp$/i.test(v.lang)) || vs.find((v) => /^ja/i.test(v.lang)) || null;

function speak(text) {
  if (!text) return;
  const synth = SPEECH_OK ? window.speechSynthesis : null;
  if (!synth) {
    reportAudio("This browser doesn't expose speech synthesis, so audio isn't available here.");
    return;
  }

  const go = () => {
    try {
      const voices = synth.getVoices() || [];
      const v = pickJa(voices);
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ja-JP";
      u.rate = 0.85;
      if (v) u.voice = v;

      let started = false;
      u.onstart = () => { started = true; };
      u.onerror = (e) => {
        const why = (e && e.error) || "unknown";
        reportAudio(why === "not-allowed"
          ? "Speech was blocked by the page — the artifact frame is disallowing audio."
          : "Speech failed (" + why + ").");
      };
      synth.speak(u);

      /* Nothing fires at all when a frame blocks speech, so check back. */
      setTimeout(() => {
        if (started || synth.speaking) return;
        if (voices.length === 0) {
          reportAudio("No voices are reachable from this frame, so nothing can be spoken. Opening the app in its own tab usually fixes it.");
        } else if (!v) {
          reportAudio("No Japanese voice on this device — found " + voices.length + " voices, none ja-JP. Add one in your OS speech settings.");
        } else {
          reportAudio("Using " + v.name + ", but no audio played. The artifact sandbox is most likely blocking speech.");
        }
      }, 1500);
    } catch (err) {
      reportAudio("Speech threw: " + ((err && err.message) || "unknown error"));
    }
  };

  /* Chrome drops an utterance queued in the same tick as cancel(), so only
     cancel when something is genuinely playing — and then defer. Staying
     synchronous otherwise keeps the user gesture intact, which iOS requires. */
  if (synth.speaking || synth.pending) { synth.cancel(); setTimeout(go, 90); }
  else go();
}

/** Voice list populates asynchronously, hence the listener and the late re-read. */
function useSpeechStatus() {
  const [st, setSt] = useState({ supported: SPEECH_OK, voices: 0, ja: 0 });
  useEffect(() => {
    if (!SPEECH_OK) return;
    const synth = window.speechSynthesis;
    const read = () => {
      const vs = synth.getVoices() || [];
      setSt({ supported: true, voices: vs.length, ja: vs.filter((v) => /^ja/i.test(v.lang)).length });
    };
    read();
    const t = setTimeout(read, 600);
    if (synth.addEventListener) synth.addEventListener("voiceschanged", read);
    return () => {
      clearTimeout(t);
      if (synth.removeEventListener) synth.removeEventListener("voiceschanged", read);
    };
  }, []);
  return st;
}

function Say({ text, size = 13, color = C.muted, label = "Play" }) {
  if (!text) return null;
  return (
    <button className="kd-btn" title={label} aria-label={label}
      onClick={(e) => { e.stopPropagation(); speak(text); }}
      style={{ color: SPEECH_OK ? color : C.rule, padding: 6, lineHeight: 0, flexShrink: 0 }}>
      <Volume2 size={size} />
    </button>
  );
}

/* ============================================================
   MORPHEME STRIP — shared by the study view, the stack builder
   and the quiz reveal.
   ============================================================ */
function Strip({ segs, script, size = "clamp(21px, 6.4vw, 32px)", ruby = "clamp(8px, 2.2vw, 11px)", onPick, activeIdx }) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "flex-end" }}>
      {segs.map((s, i) => {
        const col = ROLE_COLOR[s.role];
        const on = activeIdx === i;
        const Tag = onPick ? "button" : "div";
        return (
          <Tag key={i} className={onPick ? "kd-btn kd-tile" : undefined}
            onClick={onPick ? () => onPick(on ? null : i) : undefined}
            style={{ textAlign: "center", padding: 0 }}>
            <div style={{
              fontFamily: MINCHO, fontSize: size, color: col, padding: "0 5px 2px",
              borderBottom: "2px solid " + (on || !onPick ? col : "transparent"),
            }}>
              <Word text={s.text} kana={s.kana} mode={script} ruby={ruby} rubyColor={col} reserve />
            </div>
            <div style={{
              fontFamily: MONO, fontSize: 8, letterSpacing: ".1em", marginTop: 4,
              color: on ? C.panel : col, background: on ? col : "transparent",
              border: "1px solid " + col, padding: "1px 4px",
            }}>{s.gloss}</div>
          </Tag>
        );
      })}
    </div>
  );
}

/* ============================================================
   STACK BUILDER
   ============================================================ */
function applyChain(word, chain) {
  let st = stackInit(word);
  for (const id of chain) st = stackApply(st, id);
  return st;
}

function StackPanel({ word, script }) {
  const [chain, setChain] = useState([]);
  const [pick, setPick] = useState(null);
  const st = useMemo(() => applyChain(word, chain), [word, chain.join(",")]); // eslint-disable-line
  const avail = MODS.filter((m) => m.from.includes(st.cls));
  const kana = st.segs.map((s) => s.kana).join("");
  const active = pick != null ? st.segs[pick] : null;
  const micro = { fontFamily: MONO, fontSize: 9, letterSpacing: ".2em", textTransform: "uppercase", color: C.muted };

  return (
    <div style={{ marginTop: 20, border: "1px solid " + C.rule, background: C.panel, padding: "15px 15px 13px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <span style={micro}>Stack forms</span>
        <span style={{ fontFamily: MINCHO, fontSize: 12, color: C.muted }}>活用を重ねる</span>
        <span style={{ flex: 1, minWidth: 20, height: 1, background: C.ruleSoft }} />
        {chain.length > 0 && (
          <>
            <button className="kd-btn" onClick={() => { setChain(chain.slice(0, -1)); setPick(null); }}
              style={{ ...micro, letterSpacing: ".1em", color: C.aux, display: "flex", alignItems: "center", gap: 3 }}>
              <Undo2 size={11} /> Undo
            </button>
            <button className="kd-btn" onClick={() => { setChain([]); setPick(null); }}
              style={{ ...micro, letterSpacing: ".1em", color: C.aux }}>Reset</button>
          </>
        )}
      </div>

      {/* the chain so far */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center", marginBottom: 13, minHeight: 20 }}>
        <span style={{ fontFamily: MONO, fontSize: 9, color: C.muted }}>{word.word}</span>
        {chain.map((id, i) => {
          const m = MODS.find((x) => x.id === id);
          return (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ color: C.rule, fontSize: 11 }}>›</span>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: ".08em", color: C.panel, background: C.aux, padding: "2px 5px" }}>
                {m ? m.label.toUpperCase() : id}
              </span>
            </span>
          );
        })}
        {chain.length === 0 && <span style={{ fontSize: 11.5, color: C.muted, marginLeft: 4 }}>— add a modifier below and they compound</span>}
      </div>

      {/* result */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Strip segs={st.segs} script={script} onPick={setPick} activeIdx={pick} />
          <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.muted, marginTop: 7 }}>{romaji(kana)}</div>
        </div>
        <Say text={kana} size={15} label="Play this form" />
      </div>

      {active && (
        <div style={{ borderTop: "1px solid " + C.ruleSoft, paddingTop: 11, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 7, marginBottom: 4 }}>
            <span style={{ fontFamily: MINCHO, fontSize: 16, color: ROLE_COLOR[active.role] }}>{active.text}</span>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>{active.title}</span>
          </div>
          <div style={{ fontSize: 12.5, lineHeight: 1.6, color: "#3b433e" }}>{active.body}</div>
        </div>
      )}

      {/* what can still be applied */}
      <div style={{ borderTop: "1px solid " + C.ruleSoft, paddingTop: 11 }}>
        {avail.length === 0 ? (
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.55 }}>
            Nothing more attaches here — ます, た and て close a chain. Undo to branch off somewhere else.
          </div>
        ) : (
          <>
            <div style={{ ...micro, fontSize: 8.5, marginBottom: 7 }}>
              Add · currently {st.cls === "closed" ? "closed" : st.cls === "i-adj" ? "behaves as an い-adjective" : st.cls === "ichidan" ? "behaves as an ichidan verb" : st.cls}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {avail.map((m) => (
                <button key={m.id} className="kd-btn kd-form-chip" title={m.hint}
                  onClick={() => { setChain([...chain, m.id]); setPick(null); }}
                  style={{ border: "1px solid " + C.rule, background: C.panel, padding: "6px 9px", fontSize: 11.5, textAlign: "left" }}>
                  {m.label}
                  <span style={{ fontFamily: MINCHO, fontSize: 10, color: C.muted, marginLeft: 5 }}>{m.jp}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   EXAMPLE SENTENCES
   Prototype source is the model; a shipping build would pull these from
   Tatoeba or JMdict's examples file instead.
   ============================================================ */
async function fetchExamples(w) {
  const prompt = `Give 3 short natural Japanese example sentences using ${w.word} (${w.reading}), meaning "${w.meaning || "?"}".
Use a DIFFERENT conjugated form of the word in each one, varying tense and politeness.
Reply with ONLY a JSON object, no markdown fences:
{"examples":[{"ja":"明日学校に行きます。","kana":"あしたがっこうにいきます。","en":"I will go to school tomorrow."}]}
- ja: the sentence written normally, with kanji, under 12 words
- kana: the SAME sentence written entirely in hiragana/katakana
- en: a natural English translation`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error("status " + res.status);
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
  return (parsed.examples || []).filter((e) => e && e.ja && e.kana).slice(0, 3);
}

/** Which form the sentence actually uses — checked against our own engine
 *  rather than trusted from the model. Longest match wins so the dictionary
 *  form does not shadow a longer conjugation. */
function detectForm(sentence, forms) {
  let best = null;
  for (const f of forms) {
    const t = formText(f);
    if (t && sentence.includes(t) && (!best || t.length > formText(best).length)) best = f;
  }
  return best;
}

function ExamplesPanel({ word, script, onSave }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const forms = useMemo(() => conjugate(word), [word]);
  const list = word.examples || [];
  const micro = { fontFamily: MONO, fontSize: 9, letterSpacing: ".2em", textTransform: "uppercase", color: C.muted };

  async function run() {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const ex = await fetchExamples(word);
      if (!ex.length) setErr("Nothing came back for this word. Try again, or write your own sentences in later.");
      else onSave(word.id, ex);
    } catch {
      setErr("Couldn't reach the sentence generator. Check the connection and try again.");
    } finally { setBusy(false); }
  }

  return (
    <div style={{ marginTop: 20, border: "1px solid " + C.rule, background: C.panel, padding: "15px 15px 13px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <span style={micro}>In context</span>
        <span style={{ fontFamily: MINCHO, fontSize: 12, color: C.muted }}>例文</span>
        <span style={{ flex: 1, minWidth: 20, height: 1, background: C.ruleSoft }} />
        <button className="kd-btn" onClick={run} disabled={busy}
          style={{
            ...micro, letterSpacing: ".1em", color: busy ? C.rule : C.aux,
            cursor: busy ? "default" : "pointer",
          }}>
          {busy ? "Writing…" : list.length ? "Replace" : "Get sentences"}
        </button>
      </div>

      {err && <div style={{ borderLeft: "3px solid " + C.stem, background: C.panelAlt, padding: "8px 10px", fontSize: 11.5, lineHeight: 1.5, marginBottom: 10 }}>{err}</div>}

      {list.length === 0 && !err && (
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
          A conjugation table doesn't tell you when to use て over たら. Pull a few sentences and each form gets a situation attached to it.
        </div>
      )}

      <div style={{ display: "grid", gap: 14 }}>
        {list.map((e, i) => {
          const f = detectForm(e.ja, forms);
          return (
            <div key={i} style={{ borderLeft: "3px solid " + C.ruleSoft, paddingLeft: 10 }}>
              {f && (
                <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: ".14em", color: C.aux, marginBottom: 4 }}>
                  USES {f.label.toUpperCase()}
                </div>
              )}
              {script !== "kana" && (
                <div style={{ fontFamily: MINCHO, fontSize: 10.5, color: C.muted, letterSpacing: ".04em" }}>{e.kana}</div>
              )}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                <div style={{ fontFamily: MINCHO, fontSize: "clamp(15px, 4.4vw, 18px)", lineHeight: 1.5, flex: 1 }}>
                  {script === "kana" ? e.kana : e.ja}
                </div>
                <Say text={e.kana} label="Play sentence" />
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 3, lineHeight: 1.5 }}>{e.en}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   EXPORT / IMPORT
   ============================================================ */
function DeckTools({ words, onImport }) {
  const [note, setNote] = useState(null);
  const fileRef = useRef(null);

  function exportDeck() {
    const payload = JSON.stringify({ format: "kotoba-deck", version: 1, exportedAt: new Date().toISOString(), words }, null, 2);
    try {
      const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "kotoba-deck.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setNote({ kind: "ok", text: "Saved kotoba-deck.json with " + words.length + " entries." });
    } catch {
      setNote({ kind: "bad", text: "This browser blocked the download. Copy the JSON instead." });
    }
  }

  async function copyDeck() {
    const payload = JSON.stringify({ format: "kotoba-deck", version: 1, words }, null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      setNote({ kind: "ok", text: "Deck JSON copied to the clipboard." });
    } catch {
      setNote({ kind: "bad", text: "Clipboard access was refused. Use Export instead." });
    }
  }

  function readFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const incoming = Array.isArray(parsed) ? parsed : parsed.words;
        if (!Array.isArray(incoming)) throw new Error("shape");
        const clean = incoming
          .filter((w) => w && typeof w.word === "string" && w.word.trim())
          .map((w) => ({
            id: "i" + Math.random().toString(36).slice(2, 9),
            word: String(w.word).trim(),
            reading: String(w.reading || w.word).trim(),
            meaning: String(w.meaning || ""),
            type: TYPES.some((t) => t.id === w.type) ? w.type : detectType(w.word, w.reading || w.word),
            examples: Array.isArray(w.examples) ? w.examples.slice(0, 5) : undefined,
            addedAt: Number(w.addedAt) || Date.now(),
          }));
        if (!clean.length) throw new Error("empty");
        const added = onImport(clean);
        setNote({ kind: "ok", text: "Added " + added + " of " + clean.length + (clean.length - added > 0 ? " — the rest were already in the deck." : ".") });
      } catch {
        setNote({ kind: "bad", text: "That file is not a deck export — it needs a words array of entries." });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const link = { fontFamily: MONO, fontSize: 9, letterSpacing: ".14em", color: C.aux, display: "flex", alignItems: "center", gap: 4 };
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button className="kd-btn" onClick={exportDeck} style={link}><Download size={11} /> EXPORT</button>
        <button className="kd-btn" onClick={() => fileRef.current && fileRef.current.click()} style={link}><Upload size={11} /> IMPORT</button>
        <button className="kd-btn" onClick={copyDeck} style={link}>COPY JSON</button>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={readFile} style={{ display: "none" }} />
      </div>
      {note && (
        <div style={{
          marginTop: 7, fontSize: 11, lineHeight: 1.5, padding: "6px 8px",
          background: C.panelAlt, borderLeft: "3px solid " + (note.kind === "ok" ? C.aux : C.stem),
        }}>{note.text}</div>
      )}
    </div>
  );
}

/* ============================================================
   CONFIRM MODAL
   Used for interruptions that are not anchored to a spot on the page.
   Row-level actions keep their inline confirmations instead.
   ============================================================ */
function ConfirmModal({ eyebrow, stat, statLabel, body, confirmLabel, cancelLabel, onConfirm, onCancel }) {
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") cancelRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="kd-scrim" onClick={onCancel}>
      <div className="kd-modal" role="dialog" aria-modal="true" aria-label={body} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: ".2em", textTransform: "uppercase", color: C.stem }}>
          {eyebrow}
        </div>

        {stat && (
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 12 }}>
            <span style={{ fontFamily: MINCHO, fontSize: 40, lineHeight: 1, color: C.ink }}>{stat}</span>
            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: ".16em", textTransform: "uppercase", color: C.muted }}>{statLabel}</span>
          </div>
        )}

        <div style={{ fontSize: 13, lineHeight: 1.6, marginTop: stat ? 10 : 10, color: C.ink }}>{body}</div>

        <div style={{ display: "flex", gap: 7, marginTop: 18 }}>
          <button className="kd-btn" onClick={onConfirm}
            style={{ flex: 1, background: C.stem, color: C.panel, padding: "11px 0", fontSize: 13 }}>
            {confirmLabel}
          </button>
          <button className="kd-btn" onClick={onCancel} autoFocus
            style={{ flex: 1, border: "1px solid " + C.ink, background: C.panel, color: C.ink, padding: "11px 0", fontSize: 13 }}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   ANSWER MATCHING
   The point of the drill is morphology, not romanisation, so input is
   accepted as kanji, kana, or loose romaji. Both sides go through the
   same normaliser, so every rule below only ever adds leniency.
   ============================================================ */
function loose(str) {
  let s = (str || "").toLowerCase().trim();
  s = s.replace(/ā/g, "aa").replace(/ī/g, "ii").replace(/ū/g, "uu").replace(/ē/g, "ee").replace(/ō/g, "ou");
  s = s.replace(/[^a-z]/g, "");
  s = s.replace(/shi/g, "si").replace(/sh/g, "sy")
       .replace(/chi/g, "ti").replace(/ch/g, "ty")
       .replace(/tsu/g, "tu")
       .replace(/ji/g, "zi").replace(/j/g, "zy")
       .replace(/fu/g, "hu")
       .replace(/nb/g, "mb").replace(/np/g, "mp")
       .replace(/oo/g, "o").replace(/ou/g, "o").replace(/uu/g, "u").replace(/ee/g, "e").replace(/ii/g, "i");
  return s;
}
const formText = (f) => f.segs.map((s) => s.text).join("");
const formKana = (f) => f.segs.map((s) => s.kana).join("");

function answerMatches(input, form) {
  const raw = (input || "").trim();
  if (!raw) return false;
  if (raw === formText(form) || raw === formKana(form)) return true;
  const want = loose(romaji(formKana(form)));
  return want.length > 0 && loose(romaji(raw)) === want;
}

/** Deterministic order from a seed — options must not reshuffle on re-render. */
function shuffleStable(arr, seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0x7fffffff;
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    const j = h % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* Forms usable as the *prompt* when the dictionary form is the answer. */
const REVERSE_SOURCES = ["masu", "te", "ta", "nai", "mashita", "teiru", "pot", "nakatta", "ba"];

/* ============================================================
   QUIZ
   ============================================================ */
function Quiz({ words, script, onProgress }) {
  /* A conjugation drill should not double as a kanji-reading drill by accident,
     so the reading stays visible here even when the deck is set to 漢字 only. */
  const qMode = script === "kana" ? "kana" : "furigana";

  const [picked, setPicked] = useState(() => new Set(words.map((w) => w.id)));
  const [formIds, setFormIds] = useState(["masu", "te", "ta", "nai"]);
  const [len, setLen] = useState(20);
  const [dir, setDir] = useState("mixed");
  const [ime, setIme] = useState(true);
  const [stage, setStage] = useState("setup");
  const [queue, setQueue] = useState([]);
  const [idx, setIdx] = useState(0);
  const [right, setRight] = useState(0);
  const [misses, setMisses] = useState([]);
  const [input, setInput] = useState("");
  const [judged, setJudged] = useState(null);

  const pool = words.filter((w) => picked.has(w.id));
  const poolKey = pool.map((w) => w.id).join(",");

  /* Which forms the chosen words actually offer — a な-adjective has no て-form
     in the verb sense, so the options have to follow the selection. */
  const available = useMemo(() => {
    const m = new Map();
    for (const w of pool) {
      for (const f of conjugate(w)) {
        const prev = m.get(f.id);
        if (prev) prev.n += 1;
        else m.set(f.id, { id: f.id, label: f.label, jp: f.jp, group: f.group, n: 1 });
      }
    }
    return [...m.values()];
  }, [poolKey]); // eslint-disable-line

  const items = useMemo(() => {
    const out = [];
    for (const w of pool) {
      const fs = conjugate(w);
      /* Some forms are homographs — an ichidan potential and passive are both
         食べられる — so keep one question per distinct answer. */
      const taken = new Set();
      for (const f of fs) {
        if (!formIds.includes(f.id)) continue;
        const answer = formText(f);
        if (taken.has(answer)) continue;
        const kind = dir === "mixed" ? (Math.random() < 0.4 ? "recognise" : "produce") : dir;
        if (kind === "recognise") {
          /* Distractors are other forms of the same word, so the choice is
             about morphology rather than about which word it is. */
          const pool2 = fs.filter((x) => x.id !== f.id && formText(x) !== answer).map((x) => x.id);
          out.push({ wordId: w.id, formId: f.id, fromId: null, kind: "recognise", opts: shuffle(pool2).slice(0, 3) });
        } else if (f.id === "dict") {
          const src = fs.filter((x) => REVERSE_SOURCES.includes(x.id));
          if (!src.length) continue;
          out.push({ wordId: w.id, formId: f.id, fromId: src[Math.floor(Math.random() * src.length)].id, kind: "produce" });
        } else {
          out.push({ wordId: w.id, formId: f.id, fromId: null, kind: "produce" });
        }
        taken.add(answer);
      }
    }
    return out;
  }, [poolKey, formIds.join(","), dir]); // eslint-disable-line

  const total = items.length;

  function start(list, cap) {
    const c = cap === undefined ? len : cap;
    const q = shuffle([...(list || items)]);
    setQueue(c === 0 ? q : q.slice(0, c));
    setIdx(0);
    setRight(0);
    setMisses([]);
    setInput("");
    setJudged(null);
    setStage("run");
  }

  useEffect(() => {
    /* a judged-but-not-advanced question has still been answered */
    if (onProgress) onProgress({ running: stage === "run", done: idx + (judged ? 1 : 0), total: queue.length });
  }, [stage, idx, queue.length, judged]); // eslint-disable-line

  useEffect(() => () => { if (onProgress) onProgress({ running: false, done: 0, total: 0 }); }, []); // eslint-disable-line

  const current = queue[idx] || null;
  const cWord = current ? words.find((w) => w.id === current.wordId) : null;
  const cForms = useMemo(() => (cWord ? conjugate(cWord) : []), [cWord]);
  const target = current ? cForms.find((f) => f.id === current.formId) : null;
  const source = current && current.fromId ? cForms.find((f) => f.id === current.fromId) : null;

  function submit() {
    if (!current || !target) return;
    if (judged) return advance();
    if (!input.trim()) return;
    const settled = ime ? settleKana(input) : input;
    if (settled !== input) setInput(settled);
    const ok = answerMatches(settled, target);
    setJudged({ ok });
    if (ok) setRight((r) => r + 1);
    else setMisses((m) => [...m, current]);
  }

  function choose(id) {
    if (judged || !current) return;
    const ok = id === current.formId;
    setJudged({ ok, chose: id });
    if (ok) setRight((r) => r + 1);
    else setMisses((m) => [...m, current]);
  }

  function reveal() {
    if (judged || !target) return;
    setJudged({ ok: false });
    setMisses((m) => [...m, current]);
  }

  function advance() {
    setInput("");
    setJudged(null);
    if (idx + 1 >= queue.length) setStage("done");
    else setIdx((i) => i + 1);
  }

  const toggleWord = (id) => setPicked((s) => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const toggleForm = (id) => setFormIds((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));

  const box = { border: "1px solid " + C.rule, background: C.panel, padding: 14 };
  const micro = { fontFamily: MONO, fontSize: 9, letterSpacing: ".2em", textTransform: "uppercase", color: C.muted };

  if (!words.length) {
    return (
      <div style={{ ...box, padding: 40, textAlign: "center" }}>
        <div style={{ fontFamily: MINCHO, fontSize: 34, color: C.rule }}>空</div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 8 }}>Add a word to the deck first — the quiz builds its questions from it.</div>
      </div>
    );
  }

  /* ---------------- setup ---------------- */
  if (stage === "setup") {
    return (
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ ...box, flex: "1 1 260px", minWidth: 240 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={micro}>Words</span>
            <span style={{ flex: 1, height: 1, background: C.ruleSoft }} />
            <button className="kd-btn" onClick={() => setPicked(new Set(words.map((w) => w.id)))} style={{ ...micro, letterSpacing: ".1em", color: C.aux }}>All</button>
            <button className="kd-btn" onClick={() => setPicked(new Set())} style={{ ...micro, letterSpacing: ".1em", color: C.aux }}>None</button>
          </div>
          <div style={{ maxHeight: 300, overflowY: "auto", border: "1px solid " + C.ruleSoft }}>
            {words.map((w) => {
              const on = picked.has(w.id);
              return (
                <button key={w.id} className="kd-btn kd-row" onClick={() => toggleWord(w.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left",
                    padding: "8px 9px", borderBottom: "1px solid " + C.ruleSoft,
                    background: on ? C.panelAlt : "transparent",
                  }}>
                  <span style={{
                    width: 15, height: 15, flexShrink: 0, border: "1px solid " + (on ? C.aux : C.rule),
                    background: on ? C.aux : "transparent", color: C.panel,
                    fontSize: 10, lineHeight: "14px", textAlign: "center",
                  }}>{on ? "✓" : ""}</span>
                  <span style={{ fontFamily: MINCHO, fontSize: 17 }}>
                    <Word text={w.word} kana={w.reading} mode={qMode} ruby={8} />
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 9, color: C.muted, marginLeft: "auto" }}>{typeLabel(w.type)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ ...box, flex: "2 1 340px", minWidth: 260 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={micro}>Forms to drill</span>
            <span style={{ flex: 1, height: 1, background: C.ruleSoft }} />
          </div>
          {available.length === 0 ? (
            <div style={{ fontSize: 12, color: C.muted }}>Pick at least one word to see which forms are available.</div>
          ) : (
            GROUPS.map((grp) => {
              const gs = available.filter((f) => f.group === grp);
              if (!gs.length) return null;
              return (
                <div key={grp} style={{ marginBottom: 11 }}>
                  <div style={{ ...micro, fontSize: 8.5, marginBottom: 5 }}>{grp}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {gs.map((f) => {
                      const on = formIds.includes(f.id);
                      return (
                        <button key={f.id} className="kd-btn kd-form-chip" onClick={() => toggleForm(f.id)}
                          style={{
                            border: "1px solid " + (on ? C.aux : C.rule),
                            background: on ? C.aux : "transparent",
                            color: on ? C.panel : C.ink,
                            padding: "6px 9px", fontSize: 11.5, textAlign: "left",
                          }}>
                          {f.label}
                          <span style={{ fontFamily: MONO, fontSize: 8.5, marginLeft: 5, opacity: .7 }}>{f.n}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}

          <div style={{ borderTop: "1px solid " + C.ruleSoft, paddingTop: 12, marginTop: 4 }}>
            <div style={{ ...micro, fontSize: 8.5, marginBottom: 6 }}>Direction</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
              {[["produce", "Produce the form"], ["recognise", "Name the form"], ["mixed", "Mixed"]].map(([id, label]) => (
                <button key={id} className="kd-btn kd-form-chip" onClick={() => setDir(id)}
                  style={{
                    border: "1px solid " + (dir === id ? C.aux : C.rule),
                    background: dir === id ? C.aux : "transparent",
                    color: dir === id ? C.panel : C.ink, padding: "6px 9px", fontSize: 11.5,
                  }}>{label}</button>
              ))}
            </div>
            <div style={{ ...micro, fontSize: 8.5, marginBottom: 6 }}>Length</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
              {[10, 20, 0].map((n) => (
                <button key={n} className="kd-btn kd-form-chip" onClick={() => setLen(n)}
                  style={{
                    border: "1px solid " + (len === n ? C.ink : C.rule),
                    background: len === n ? C.ink : "transparent",
                    color: len === n ? C.panel : C.ink, padding: "6px 11px", fontSize: 11.5,
                  }}>{n === 0 ? "All" : n}</button>
              ))}
            </div>
            <button className="kd-btn" onClick={() => start()} disabled={total === 0}
              style={{
                width: "100%", background: total === 0 ? C.rule : C.stem, color: C.panel,
                padding: "11px 0", fontSize: 13, letterSpacing: ".04em",
                cursor: total === 0 ? "default" : "pointer",
              }}>
              {total === 0 ? "Pick words and forms to begin" : "Start · " + (len === 0 || len > total ? total : len) + " question" + ((len === 0 || len > total ? total : len) === 1 ? "" : "s")}
            </button>
            {total > 0 && (
              <div style={{ fontSize: 11, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>
                {total} available from {pool.length} word{pool.length === 1 ? "" : "s"}. Answer in kanji, kana, or romaji.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- results ---------------- */
  if (stage === "done") {
    const wrongN = queue.length - right;
    const pct = queue.length ? Math.round((right / queue.length) * 100) : 0;
    return (
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ ...box, flex: "1 1 240px", minWidth: 230 }}>
          <div style={{ ...micro, marginBottom: 14 }}>Result</div>
          <div style={{ display: "flex", gap: 20, marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: MINCHO, fontSize: 44, lineHeight: 1, color: C.aux }}>{right}</div>
              <div style={{ ...micro, fontSize: 9, marginTop: 4 }}>Right</div>
            </div>
            <div>
              <div style={{ fontFamily: MINCHO, fontSize: 44, lineHeight: 1, color: wrongN ? C.stem : C.rule }}>{wrongN}</div>
              <div style={{ ...micro, fontSize: 9, marginTop: 4 }}>Wrong</div>
            </div>
          </div>
          <div style={{ height: 6, background: C.panelAlt, border: "1px solid " + C.ruleSoft, display: "flex", marginBottom: 6 }}>
            <div style={{ width: pct + "%", background: C.aux }} />
          </div>
          <div style={{ fontSize: 11.5, color: C.muted }}>{pct}% of {queue.length}</div>

          <div style={{ display: "grid", gap: 6, marginTop: 18 }}>
            {misses.length > 0 && (
              <button className="kd-btn" onClick={() => start(misses, 0)}
                style={{ background: C.stem, color: C.panel, padding: "10px 0", fontSize: 12.5 }}>
                Drill the {misses.length} missed
              </button>
            )}
            <button className="kd-btn" onClick={() => start()}
              style={{ border: "1px solid " + C.ink, padding: "10px 0", fontSize: 12.5, background: C.panel }}>
              Same quiz again
            </button>
            <button className="kd-btn" onClick={() => setStage("setup")}
              style={{ border: "1px solid " + C.rule, color: C.muted, padding: "10px 0", fontSize: 12.5, background: C.panel }}>
              Change what's drilled
            </button>
          </div>
        </div>

        <div style={{ ...box, flex: "2 1 320px", minWidth: 260 }}>
          <div style={{ ...micro, marginBottom: 12 }}>{misses.length ? "Missed" : "Nothing missed"}</div>
          {misses.length === 0 ? (
            <div style={{ fontFamily: MINCHO, fontSize: 15, color: C.muted }}>全問正解 — clean sweep.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {misses.map((m, i) => {
                const w = words.find((x) => x.id === m.wordId);
                const f = w ? conjugate(w).find((x) => x.id === m.formId) : null;
                if (!f) return null;
                return (
                  <div key={i} style={{ borderLeft: "3px solid " + C.stem, paddingLeft: 9 }}>
                    <div style={{ ...micro, fontSize: 8.5, marginBottom: 2 }}>{w.word} · {f.label}</div>
                    <div style={{ fontFamily: MINCHO, fontSize: 20 }}>
                      <Word text={formText(f)} kana={formKana(f)} mode={qMode} ruby={9} />
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.muted, marginTop: 2 }}>{romaji(formKana(f))}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ---------------- question ---------------- */
  if (!current || !target) {
    return (
      <div style={box}>
        <div style={{ fontSize: 13, color: C.muted }}>That question no longer resolves — the word may have been deleted.</div>
        <button className="kd-btn" onClick={() => setStage("setup")} style={{ marginTop: 10, border: "1px solid " + C.ink, padding: "8px 14px", fontSize: 12.5 }}>Back to setup</button>
      </div>
    );
  }
  const isRecog = current.kind === "recognise";
  const options = isRecog
    ? shuffleStable([target, ...(current.opts || []).map((id) => cForms.find((f) => f.id === id)).filter(Boolean)], current.wordId + current.formId)
    : [];
  const wrongSoFar = idx + (judged ? 1 : 0) - right;
  const pctDone = Math.round((idx / queue.length) * 100);

  return (
    <div>
      {/* progress + live tally */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ ...micro }}>{idx + 1} / {queue.length}</span>
        <div style={{ flex: 1, minWidth: 80, height: 4, background: C.ruleSoft, display: "flex" }}>
          <div style={{ width: pctDone + "%", background: C.ink, transition: "width .25s" }} />
        </div>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".1em", color: C.aux }}>◯ {right}</span>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".1em", color: C.stem }}>✕ {wrongSoFar}</span>
      </div>

      <div style={{ ...box, borderTop: "3px solid " + C.ink, padding: "20px 16px" }}>
        {/* the ask */}
        <div style={{ ...micro, marginBottom: 12 }}>
          {isRecog
            ? "Which form is this?"
            : source
              ? "From this form, write the dictionary form"
              : "Write the " + target.label.toLowerCase()}
          {!isRecog && <span style={{ fontFamily: MINCHO, letterSpacing: 0, textTransform: "none", marginLeft: 6 }}>{target.jp}</span>}
        </div>

        <div style={{ display: "flex", alignItems: "flex-start", gap: 4, marginBottom: 4 }}>
          <div style={{ fontFamily: MINCHO, fontSize: "clamp(28px, 9vw, 44px)" }}>
            {isRecog
              ? <Word text={formText(target)} kana={formKana(target)} mode={qMode} ruby="clamp(10px, 3vw, 15px)" />
              : source
                ? <Word text={formText(source)} kana={formKana(source)} mode={qMode} ruby="clamp(10px, 3vw, 15px)" />
                : <Word text={cWord.word} kana={cWord.reading} mode={qMode} ruby="clamp(10px, 3vw, 15px)" />}
          </div>
          {(isRecog || judged) && <Say text={formKana(target)} size={15} />}
        </div>
        <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 16 }}>
          {cWord.meaning}
          <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: ".1em", marginLeft: 8 }}>{typeLabel(cWord.type)}</span>
          {source && <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: ".1em", marginLeft: 8 }}>{source.label.toUpperCase()}</span>}
        </div>

        {/* answer */}
        {isRecog ? (
          <div style={{ display: "grid", gap: 5 }}>
            {options.map((f) => {
              const chosen = judged && judged.chose === f.id;
              const isRight = judged && f.id === target.id;
              return (
                <button key={f.id} className="kd-btn kd-form-chip" onClick={() => choose(f.id)}
                  disabled={!!judged}
                  style={{
                    textAlign: "left", padding: "10px 12px", fontSize: 13,
                    border: "1px solid " + (isRight ? C.aux : chosen ? C.stem : C.rule),
                    background: isRight ? C.aux : chosen ? C.stem : C.panel,
                    color: isRight || chosen ? C.panel : C.ink,
                    cursor: judged ? "default" : "pointer",
                  }}>
                  {f.label}
                  <span style={{ fontFamily: MINCHO, fontSize: 11, marginLeft: 6, opacity: .75 }}>{f.jp}</span>
                </button>
              );
            })}
            {judged && (
              <button className="kd-btn" onClick={advance}
                style={{ background: C.ink, color: C.panel, padding: "10px 0", fontSize: 13, marginTop: 3 }}>
                {idx + 1 >= queue.length ? "See result" : "Next"}
              </button>
            )}
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <input key={idx} className="kd-in" style={{ flex: "1 1 160px", fontFamily: MINCHO, fontSize: 18 }}
                placeholder={ime ? "Type romaji — it becomes kana" : "Your answer"} value={input} autoFocus
                autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="go"
                inputMode="latin" readOnly={!!judged}
                onChange={(e) => setInput(ime ? toKana(e.target.value) : e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()} />
              <button className="kd-btn" onClick={submit}
                style={{ background: C.ink, color: C.panel, padding: "0 16px", fontSize: 13, minHeight: 42 }}>
                {judged ? (idx + 1 >= queue.length ? "See result" : "Next") : "Check"}
              </button>
              {!judged && (
                <button className="kd-btn" onClick={reveal}
                  style={{ border: "1px solid " + C.rule, color: C.muted, padding: "0 12px", fontSize: 12, minHeight: 42, background: C.panel }}>
                  Show me
                </button>
              )}
            </div>
            <button className="kd-btn" onClick={() => setIme(!ime)}
              style={{ fontFamily: MONO, fontSize: 9, letterSpacing: ".14em", color: C.aux, marginTop: 8 }}>
              かな IME {ime ? "ON" : "OFF"}
            </button>
          </>
        )}

        {/* verdict + breakdown */}
        {judged && (
          <div style={{ marginTop: 16, borderTop: "1px solid " + C.ruleSoft, paddingTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{
                fontFamily: MONO, fontSize: 9, letterSpacing: ".18em", padding: "3px 7px",
                background: judged.ok ? C.aux : C.stem, color: C.panel,
              }}>{judged.ok ? "CORRECT" : "NOT QUITE"}</span>
              {!judged.ok && input.trim() && (
                <span style={{ fontSize: 12, color: C.muted }}>you wrote <span style={{ fontFamily: MINCHO, fontSize: 15, color: C.ink }}>{input.trim()}</span></span>
              )}
            </div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "flex-end" }}>
              {target.segs.map((s, i) => (
                <div key={i} style={{ textAlign: "center" }}>
                  <div style={{
                    fontFamily: MINCHO, fontSize: "clamp(21px, 6.4vw, 32px)", color: ROLE_COLOR[s.role],
                    borderBottom: "2px solid " + ROLE_COLOR[s.role], padding: "0 5px 2px",
                  }}>
                    <Word text={s.text} kana={s.kana} mode={qMode} ruby="clamp(8px, 2.2vw, 11px)" rubyColor={ROLE_COLOR[s.role]} reserve />
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: ".1em", color: ROLE_COLOR[s.role], marginTop: 4 }}>{s.gloss}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8 }}>
              <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.muted }}>{romaji(formKana(target))}</span>
              <Say text={formKana(target)} label="Play the answer" />
            </div>
            {target.note && (
              <div style={{ marginTop: 11, borderLeft: "3px solid " + C.extra, background: C.panelAlt, padding: "8px 10px", fontSize: 12, lineHeight: 1.6 }}>
                {target.note}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   APP
   ============================================================ */
export default function App() {
  const [words, setWords] = useState([]);
  const [ready, setReady] = useState(false);
  const [selId, setSelId] = useState(null);
  const [query, setQuery] = useState("");
  const [formId, setFormId] = useState("masu");
  const [segIdx, setSegIdx] = useState(null);
  const [adding, setAdding] = useState(false);
  const [script, setScript] = useState("furigana");
  const [q2, setQ2] = useState("");
  const [looking, setLooking] = useState(false);
  const [hits, setHits] = useState(null);
  const [lookErr, setLookErr] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [view, setView] = useState("deck");
  const [audioNote, setAudioNote] = useState(null);
  const speech = useSpeechStatus();
  const [quizRun, setQuizRun] = useState({ running: false, done: 0, total: 0 });
  const [pendingLeave, setPendingLeave] = useState(false);
  const [draft, setDraft] = useState({ word: "", reading: "", meaning: "", type: "godan", typeTouched: false });

  useEffect(() => {
    let alive = true;
    (async () => {
      let loaded = null;
      try {
        const r = await window.storage.get(KEY);
        loaded = JSON.parse(r.value);
      } catch { loaded = null; }
      let pref = null;
      try {
        const p = await window.storage.get(SKEY);
        pref = JSON.parse(p.value);
      } catch { pref = null; }
      if (!alive) return;
      const list = Array.isArray(loaded) && loaded.length ? loaded : SEED;
      setWords(list);
      setSelId(list[0]?.id ?? null);
      if (SCRIPTS.some((s) => s.id === pref)) setScript(pref);
      setReady(true);
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try { await window.storage.set(KEY, JSON.stringify(words)); } catch { /* session-only */ }
    })();
  }, [words, ready]);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try { await window.storage.set(SKEY, JSON.stringify(script)); } catch { /* session-only */ }
    })();
  }, [script, ready]);

  useEffect(() => {
    audioReporter = setAudioNote;
    return () => { audioReporter = null; };
  }, []);

  useEffect(() => {
    if (!audioNote) return;
    const t = setTimeout(() => setAudioNote(null), 9000);
    return () => clearTimeout(t);
  }, [audioNote]);

  useEffect(() => {
    if (!pendingDelete) return;
    const onKey = (e) => { if (e.key === "Escape") setPendingDelete(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingDelete]);

  const selected = words.find((w) => w.id === selId) || null;
  const forms = useMemo(() => conjugate(selected), [selected]);

  useEffect(() => {
    setSegIdx(null);
    if (forms.length && !forms.some((f) => f.id === formId)) setFormId(forms[0].id);
  }, [selId, forms.length]); // eslint-disable-line

  const form = forms.find((f) => f.id === formId) || forms[0] || null;
  const display = form ? form.segs.map((s) => s.text).join("") : "";
  const readingOut = form ? form.segs.map((s) => s.kana).join("") : "";
  const activeSeg = form && segIdx != null ? form.segs[segIdx] : null;

  const filtered = words.filter((w) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (w.word + w.reading + w.meaning + romaji(w.reading)).toLowerCase().includes(q);
  });

  function updateDraft(patch) {
    setDraft((d) => {
      const next = { ...d, ...patch };
      if (!next.typeTouched && (patch.word !== undefined || patch.reading !== undefined)) {
        next.type = detectType(next.word, next.reading || next.word);
      }
      return next;
    });
  }

  /** On a narrow screen the deck sits below the stage, so selecting a word has
   *  to bring the breakdown back into view or the tap looks like it did nothing. */
  function revealStage() {
    if (!window.matchMedia || !window.matchMedia("(max-width: 820px)").matches) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }

  async function runLookup() {
    const q = q2.trim();
    if (!q || looking) return;
    setLooking(true);
    setLookErr(null);
    setHits(null);
    try {
      setHits(await lookupWord(q));
    } catch {
      setLookErr("Lookup didn't come back. Check the connection, or fill the fields in by hand.");
    } finally {
      setLooking(false);
    }
  }

  function useHit(c) {
    setDraft({ word: c.word, reading: c.reading, meaning: c.meaning || "", type: c.type, typeTouched: true });
    setHits(null);
    setQ2("");
    setLookErr(null);
  }

  /** Leaving the quiz unmounts it, which throws away the run — so ask first,
   *  but only once a quiz is actually underway. */
  function goto(next) {
    if (next === view) return;
    if (next === "deck" && quizRun.running) { setPendingLeave(true); return; }
    setPendingLeave(false);
    setView(next);
  }

  function leaveQuiz() {
    setPendingLeave(false);
    setQuizRun({ running: false, done: 0, total: 0 });
    setView("deck");
  }

  function closeAdd() {
    setAdding(false);
    setHits(null);
    setQ2("");
    setLookErr(null);
  }

  function addWord() {
    const word = draft.word.trim();
    if (!word) return;
    const entry = {
      id: "w" + Date.now(),
      word,
      reading: (draft.reading.trim() || word),
      meaning: draft.meaning.trim(),
      type: draft.type,
      addedAt: Date.now(),
    };
    setWords((ws) => [entry, ...ws]);
    setSelId(entry.id);
    setDraft({ word: "", reading: "", meaning: "", type: "godan", typeTouched: false });
    closeAdd();
    revealStage();
  }

  function removeWord(id) {
    setPendingDelete(null);
    setWords((ws) => {
      const next = ws.filter((w) => w.id !== id);
      if (id === selId) setSelId(next[0]?.id ?? null);
      return next;
    });
  }

  function saveExamples(id, examples) {
    setWords((ws) => ws.map((w) => (w.id === id ? { ...w, examples } : w)));
  }

  /** Merge an imported deck, skipping entries already present. */
  function importWords(incoming) {
    const have = new Set(words.map((w) => w.word + "|" + w.reading));
    const seen = new Set();
    const fresh = incoming.filter((w) => {
      const k = w.word + "|" + w.reading;
      if (have.has(k) || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (fresh.length) setWords((ws) => [...fresh, ...ws]);
    return fresh.length;
  }

  function setType(id, t) {
    setWords((ws) => ws.map((w) => (w.id === id ? { ...w, type: t } : w)));
  }

  const godanRow = selected?.type === "godan" ? (selected.reading || selected.word).slice(-1) : null;
  const ladderActive = activeSeg && activeSeg.role === "stem" ? activeSeg.kana : null;

  return (
    <div className="kd-app" style={{ background: C.ground, color: C.ink, fontFamily: SANS }}>
      <style>{`
        * { box-sizing: border-box; }
        .kd-app { min-height: 100vh; min-height: 100dvh; }
        .kd-btn { cursor: pointer; border: none; background: none; font: inherit; color: inherit; }
        .kd-form-chip { transition: background .15s, color .15s, border-color .15s; }
        .kd-tile { transition: transform .16s ease, box-shadow .16s ease; }
        .kd-in { width: 100%; background: ${C.panel}; border: 1px solid ${C.rule}; padding: 9px 10px; font: inherit; color: ${C.ink}; outline: none; }
        .kd-in:focus { border-color: ${C.aux}; box-shadow: 0 0 0 2px rgba(42,71,128,.15); }
        button:focus-visible, .kd-in:focus-visible, [tabindex]:focus-visible { outline: 2px solid ${C.aux}; outline-offset: 2px; }

        /* hover only where a pointer can actually hover — otherwise taps leave
           sticky hover states stranded on touch screens */
        @media (hover: hover) {
          .kd-form-chip:hover { border-color: ${C.ink}; }
          .kd-tile:hover { transform: translateY(-2px); }
          .kd-row:hover { background: ${C.panelAlt}; }
        }

        .kd-scrim {
          position: fixed; inset: 0; z-index: 50; padding: 20px;
          background: rgba(22, 27, 25, .55);
          display: flex; align-items: center; justify-content: center;
          animation: kd-fade .16s ease-out;
        }
        .kd-modal {
          width: 100%; max-width: 400px;
          background: ${C.panel};
          border: 1px solid ${C.ink}; border-top: 4px solid ${C.stem};
          box-shadow: 0 18px 44px rgba(22, 27, 25, .3);
          padding: 20px 20px 17px;
          max-height: calc(100% - 8px); overflow-y: auto;
          animation: kd-pop .18s cubic-bezier(.2, .9, .3, 1);
        }
        @keyframes kd-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes kd-pop { from { opacity: 0; transform: translateY(12px) scale(.97) } to { opacity: 1; transform: none } }

        .kd-toast {
          position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%);
          z-index: 60; width: calc(100% - 32px); max-width: 430px;
          background: ${C.panel}; border: 1px solid ${C.ink};
          border-left: 4px solid ${C.stem};
          box-shadow: 0 10px 30px rgba(22, 27, 25, .25);
          padding: 11px 12px;
          animation: kd-rise .2s ease-out;
        }
        @keyframes kd-rise { from { opacity: 0; transform: translate(-50%, 10px) } to { opacity: 1; transform: translate(-50%, 0) } }

        .kd-deck { flex: 1 1 260px; min-width: 250px; max-width: 320px; }
        .kd-stage { flex: 3 1 460px; min-width: 300px; }
        .kd-list { max-height: 68vh; overflow-y: auto; }

        /* The tagline is decoration; it is the first thing to go on a phone. */
        @media (max-width: 640px) { .kd-tagline { display: none; } }

        /* Narrow screens: the breakdown is the point, so it goes first and the
           deck becomes a normal page-scrolling list underneath it. */
        @media (max-width: 820px) {
          .kd-deck { order: 2; max-width: none; min-width: 0; width: 100%; }
          .kd-stage { order: 1; min-width: 0; width: 100%; }
          .kd-list { max-height: none; overflow-y: visible; }
        }

        @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
      `}</style>

      {/* masthead */}
      <header style={{ borderBottom: "1px solid " + C.rule, background: C.panel }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "14px 18px", display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
          <div style={{ fontFamily: MINCHO, fontSize: 26, letterSpacing: ".08em" }}>言葉帳</div>
          <div className="kd-tagline" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".22em", textTransform: "uppercase", color: C.muted }}>
            Kotoba-chō · word deck &amp; morphology
          </div>
          <div style={{ display: "flex", border: "1px solid " + C.rule }}>
            {[["deck", "Deck"], ["quiz", "Quiz"]].map(([id, label]) => {
              const on = view === id;
              return (
                <button key={id} className="kd-btn kd-form-chip" onClick={() => goto(id)}
                  style={{
                    fontFamily: MONO, fontSize: 10, letterSpacing: ".16em", padding: "6px 12px",
                    background: on ? C.stem : "transparent", color: on ? C.panel : C.muted,
                    borderRight: id === "quiz" ? "none" : "1px solid " + C.rule,
                  }}>{label.toUpperCase()}</button>
              );
            })}
          </div>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: ".2em", color: C.muted }}>SCRIPT</span>
              <div style={{ display: "flex", border: "1px solid " + C.rule }}>
                {SCRIPTS.map((s) => {
                  const on = script === s.id;
                  return (
                    <button key={s.id} className="kd-btn kd-form-chip" onClick={() => setScript(s.id)}
                      title={s.id === "furigana" ? "Kanji with the reading above it" : s.id === "kanji" ? "Kanji only, no reading" : "Kana only, no kanji"}
                      style={{
                        fontFamily: MINCHO, fontSize: 13, padding: "4px 9px 5px",
                        background: on ? C.ink : "transparent", color: on ? C.panel : C.muted,
                        borderRight: s.id === "kana" ? "none" : "1px solid " + C.rule,
                      }}>{s.label}</button>
                  );
                })}
              </div>
            </div>
            <span className="kd-tagline" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".16em", color: C.muted }}>
              {words.length} ENTR{words.length === 1 ? "Y" : "IES"}
            </span>
          </div>
        </div>
      </header>

      {pendingLeave && (
        <ConfirmModal
          eyebrow="Quiz in progress"
          stat={quizRun.done + " / " + quizRun.total}
          statLabel={quizRun.done === 1 ? "question answered" : "questions answered"}
          body={quizRun.done > 0
            ? "Going back to the deck ends this run. The score is not saved anywhere yet, so it goes with it."
            : "Going back to the deck ends this run before you've answered anything."}
          confirmLabel="Leave"
          cancelLabel="Keep going"
          onConfirm={leaveQuiz}
          onCancel={() => setPendingLeave(false)}
        />
      )}

      {view === "quiz" ? (
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: 18 }}>
          <Quiz words={words} script={script} onProgress={setQuizRun} />
        </div>
      ) : (
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: 18, display: "flex", gap: 22, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* ---------------- deck ---------------- */}
        <aside className="kd-deck">
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <div style={{ position: "relative", flex: 1 }}>
              <Search size={13} style={{ position: "absolute", left: 9, top: 11, color: C.muted }} />
              <input className="kd-in" style={{ paddingLeft: 27, fontSize: 13 }} placeholder="Search the deck" value={query}
                onChange={(e) => { setQuery(e.target.value); setPendingDelete(null); }} />
            </div>
            <button className="kd-btn" onClick={() => (adding ? closeAdd() : setAdding(true))} title="Add a word"
              style={{ background: adding ? C.ink : C.stem, color: C.panel, width: 38, display: "grid", placeItems: "center" }}>
              {adding ? <X size={15} /> : <Plus size={15} />}
            </button>
          </div>

          {adding && (
            <div style={{ background: C.panel, border: "1px solid " + C.rule, padding: 12, marginBottom: 12, display: "grid", gap: 8 }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: ".16em", color: C.muted, marginBottom: 5 }}>LOOK IT UP</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input className="kd-in" placeholder="iku · 行く · たべる" value={q2} autoFocus
                    onChange={(e) => setQ2(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && runLookup()} />
                  <button className="kd-btn" onClick={runLookup} disabled={looking || !q2.trim()}
                    style={{
                      background: looking || !q2.trim() ? C.rule : C.aux, color: C.panel,
                      padding: "0 12px", fontSize: 12, whiteSpace: "nowrap",
                      cursor: looking || !q2.trim() ? "default" : "pointer",
                    }}>
                    {looking ? "…" : "Look up"}
                  </button>
                </div>
              </div>

              {lookErr && (
                <div style={{ borderLeft: "3px solid " + C.stem, background: C.panelAlt, padding: "7px 9px", fontSize: 11.5, lineHeight: 1.5 }}>{lookErr}</div>
              )}

              {hits && hits.length === 0 && (
                <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5 }}>
                  No match for “{q2 || draft.word}”. Fill the fields in below instead.
                </div>
              )}

              {hits && hits.length > 0 && (
                <div style={{ border: "1px solid " + C.ruleSoft }}>
                  {hits.map((c, i) => (
                    <button key={i} className="kd-btn kd-row" onClick={() => useHit(c)}
                      style={{
                        display: "block", width: "100%", textAlign: "left", padding: "8px 9px",
                        borderBottom: i === hits.length - 1 ? "none" : "1px solid " + C.ruleSoft,
                      }}>
                      <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                        <span style={{ fontFamily: MINCHO, fontSize: 20 }}>
                          <Word text={c.word} kana={c.reading} mode="furigana" ruby={9} />
                        </span>
                        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: ".1em", color: C.aux, border: "1px solid " + C.aux, padding: "1px 4px" }}>
                          {TYPES.find((t) => t.id === c.type)?.label.toUpperCase()}
                        </span>
                      </div>
                      <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>{c.meaning}</div>
                    </button>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                <span style={{ flex: 1, height: 1, background: C.ruleSoft }} />
                <span style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: ".18em", color: C.muted }}>OR ENTER IT</span>
                <span style={{ flex: 1, height: 1, background: C.ruleSoft }} />
              </div>

              <input className="kd-in" placeholder="Word — 行く" value={draft.word} onChange={(e) => updateDraft({ word: e.target.value })} />
              <input className="kd-in" placeholder="Reading in kana — いく" value={draft.reading} onChange={(e) => updateDraft({ reading: e.target.value })} />
              <input className="kd-in" placeholder="Meaning — to go" value={draft.meaning} onChange={(e) => updateDraft({ meaning: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && addWord()} />
              <div>
                <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: ".16em", color: C.muted, marginBottom: 5 }}>
                  WORD CLASS {draft.typeTouched ? "" : "· detected"}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {TYPES.map((t) => (
                    <button key={t.id} className="kd-btn kd-form-chip" onClick={() => setDraft((d) => ({ ...d, type: t.id, typeTouched: true }))}
                      style={{
                        fontSize: 11, padding: "4px 8px", border: "1px solid " + (draft.type === t.id ? C.ink : C.rule),
                        background: draft.type === t.id ? C.ink : "transparent", color: draft.type === t.id ? C.panel : C.muted,
                      }}>{t.label}</button>
                  ))}
                </div>
              </div>
              <button className="kd-btn" onClick={addWord} style={{ background: C.ink, color: C.panel, padding: "9px 0", fontSize: 13, letterSpacing: ".04em" }}>
                Add to deck
              </button>
            </div>
          )}

          <div className="kd-list" style={{ border: "1px solid " + C.rule, background: C.panel }}>
            {filtered.length === 0 && (
              <div style={{ padding: 22, textAlign: "center" }}>
                <div style={{ fontFamily: MINCHO, fontSize: 28, color: C.rule, marginBottom: 8 }}>空</div>
                <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
                  {words.length ? "Nothing matches that search." : "The deck is empty. Add a word and the breakdown builds itself."}
                </div>
              </div>
            )}
            {filtered.map((w) => {
              const on = w.id === selId;
              if (pendingDelete === w.id) {
                return (
                  <div key={w.id} style={{
                    padding: "9px 11px", borderBottom: "1px solid " + C.ruleSoft,
                    borderLeft: "3px solid " + C.stem, background: C.panelAlt,
                  }}>
                    <div style={{ fontSize: 12.5, display: "flex", alignItems: "flex-end", gap: 5, flexWrap: "wrap" }}>
                      <span>Delete</span>
                      <span style={{ fontFamily: MINCHO, fontSize: 17, color: C.stem }}>
                        <Word text={w.word} kana={w.reading} mode={script} ruby={8} rubyColor={C.stem} />
                      </span>
                      <span>from the deck?</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <button className="kd-btn" onClick={() => removeWord(w.id)}
                        style={{ background: C.stem, color: C.panel, padding: "5px 12px", fontSize: 11.5 }}>
                        Delete
                      </button>
                      <button className="kd-btn" onClick={() => setPendingDelete(null)} autoFocus
                        style={{ border: "1px solid " + C.rule, color: C.muted, padding: "5px 12px", fontSize: 11.5, background: C.panel }}>
                        Keep
                      </button>
                    </div>
                  </div>
                );
              }
              return (
                <div key={w.id} className="kd-row"
                  onClick={() => { setSelId(w.id); setPendingDelete(null); revealStage(); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", cursor: "pointer",
                    borderBottom: "1px solid " + C.ruleSoft,
                    borderLeft: "3px solid " + (on ? C.stem : "transparent"),
                    background: on ? C.panelAlt : "transparent",
                  }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontFamily: MINCHO, fontSize: 19 }}>
                      <Word text={w.word} kana={w.reading} mode={script} ruby={9} rubyColor={on ? C.stem : C.muted} />
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.muted, letterSpacing: ".05em", marginTop: 1 }}>
                      {romaji(w.reading)} · {typeLabel(w.type)}
                    </div>
                    {w.meaning && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.meaning}</div>}
                  </div>
                  <button className="kd-btn" title={"Delete " + w.word}
                    onClick={(e) => { e.stopPropagation(); setPendingDelete(w.id); }}
                    style={{ color: C.rule, padding: 9, margin: -3 }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = C.stem)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = C.rule)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
          <DeckTools words={words} onImport={importWords} />
        </aside>

        {/* ---------------- analysis stage ---------------- */}
        <main className="kd-stage">
          {!selected ? (
            <div style={{ border: "1px solid " + C.rule, background: C.panel, padding: 40, textAlign: "center" }}>
              <div style={{ fontFamily: MINCHO, fontSize: 40, color: C.rule }}>—</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 8 }}>Pick a word from the deck to take it apart.</div>
            </div>
          ) : (
            <>
              {/* entry header */}
              <div style={{ display: "flex", alignItems: "flex-end", gap: 14, flexWrap: "wrap", marginBottom: 4 }}>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: ".2em", color: C.muted }}>{romaji(selected.reading).toUpperCase()}</div>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                    <div style={{ fontFamily: MINCHO, fontSize: "clamp(26px, 8vw, 34px)" }}>
                      <Word text={selected.word} kana={selected.reading} mode={script} ruby={13} />
                    </div>
                    <Say text={selected.reading} size={15} label="Play the word" />
                  </div>
                </div>
                <div style={{ paddingBottom: 4 }}>
                  <div style={{ fontSize: 13, color: C.ink }}>{selected.meaning || <span style={{ color: C.muted }}>no gloss</span>}</div>
                  <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap" }}>
                    {TYPES.map((t) => (
                      <button key={t.id} className="kd-btn kd-form-chip" onClick={() => setType(selected.id, t.id)}
                        style={{
                          fontFamily: MONO, fontSize: 9.5, letterSpacing: ".08em", padding: "6px 9px",
                          border: "1px solid " + (selected.type === t.id ? C.aux : C.ruleSoft),
                          background: selected.type === t.id ? C.aux : "transparent",
                          color: selected.type === t.id ? C.panel : C.muted,
                        }}>{t.label.toUpperCase()}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* the signature: morpheme strip with interlinear gloss */}
              <div style={{ border: "1px solid " + C.rule, borderTop: "3px solid " + C.ink, background: C.panel, padding: "20px 18px 16px" }}>
                {form && (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
                      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".2em", textTransform: "uppercase", color: C.muted }}>
                        {form.label} <span style={{ fontFamily: MINCHO, letterSpacing: 0, textTransform: "none" }}>{form.jp}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                        <span style={{ fontFamily: MONO, fontSize: 11, color: C.muted }}>{romaji(readingOut)}</span>
                        <Say text={readingOut} label="Play this form" />
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "flex-start", gap: 6, flexWrap: "wrap" }}>
                      {form.segs.map((s, i) => {
                        const col = ROLE_COLOR[s.role];
                        const on = segIdx === i;
                        return (
                          <button key={i} className="kd-btn kd-tile" onClick={() => setSegIdx(on ? null : i)}
                            style={{ textAlign: "center", padding: 0 }}>
                            <div style={{
                              fontFamily: MINCHO, fontSize: "clamp(21px, 7.2vw, 38px)", padding: "2px 6px 4px",
                              color: col,
                              borderBottom: "3px solid " + (on ? col : "transparent"),
                              background: on ? (s.role === "root" ? C.panelAlt : "transparent") : "transparent",
                            }}>
                              <Word text={s.text} kana={s.kana} mode={script} ruby="clamp(8px, 2.4vw, 12px)" rubyColor={col} reserve />
                            </div>
                            <div style={{ fontFamily: MONO, fontSize: 9, color: C.muted, marginTop: 3 }}>{romaji(s.kana)}</div>
                            <div style={{
                              fontFamily: MONO, fontSize: 8.5, letterSpacing: ".1em", marginTop: 4,
                              color: on ? C.panel : col, background: on ? col : "transparent",
                              border: "1px solid " + col, padding: "2px 5px", whiteSpace: "nowrap",
                            }}>{s.gloss}</div>
                          </button>
                        );
                      })}
                    </div>

                    {/* morpheme note */}
                    <div style={{ marginTop: 16, borderTop: "1px solid " + C.ruleSoft, paddingTop: 13 }}>
                      {activeSeg ? (
                        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
                          <div style={{ flex: "1 1 300px", minWidth: 240 }}>
                            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginBottom: 5 }}>
                              <span style={{ fontFamily: MINCHO, fontSize: 17, color: ROLE_COLOR[activeSeg.role] }}>
                                <Word text={activeSeg.text} kana={activeSeg.kana} mode={script} ruby={9} rubyColor={ROLE_COLOR[activeSeg.role]} />
                              </span>
                              <span style={{ fontSize: 12.5, fontWeight: 600 }}>{activeSeg.title}</span>
                            </div>
                            <div style={{ fontSize: 12.5, lineHeight: 1.65, color: "#3b433e" }}>{activeSeg.body}</div>
                          </div>
                          {godanRow && ladderActive && (
                            <div>
                              <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: ".16em", color: C.muted, marginBottom: 5 }}>
                                五段 · FIVE ROWS OF {romaji(godanRow).toUpperCase()}
                              </div>
                              <Ladder row={godanRow} active={ladderActive} />
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: C.muted }}>
                          Tap any piece above to see what it is doing.
                          {form.note ? " " : ""}
                        </div>
                      )}
                      {form.note && (
                        <div style={{ marginTop: 12, borderLeft: "3px solid " + C.extra, background: C.panelAlt, padding: "9px 11px" }}>
                          <span style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: ".16em", color: C.extra }}>IRREGULAR</span>
                          <div style={{ fontSize: 12.5, lineHeight: 1.6, marginTop: 4 }}>{form.note}</div>
                        </div>
                      )}
                    </div>
                  </>
                )}
                {!form && (
                  <div style={{ fontSize: 13, color: C.muted }}>
                    No forms for this entry. Check the reading is written in kana, then pick the right word class above.
                  </div>
                )}
              </div>

              <StackPanel key={selected.id} word={selected} script={script} />
              <ExamplesPanel word={selected} script={script} onSave={saveExamples} />

              {/* form ladder */}
              <div style={{ marginTop: 18, display: "grid", gap: 14 }}>
                {GROUPS.map((grp) => {
                  const items = forms.filter((f) => f.group === grp);
                  if (!items.length) return null;
                  return (
                    <div key={grp}>
                      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}>
                        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: ".22em", textTransform: "uppercase", color: C.muted }}>{grp}</span>
                        <span style={{ flex: 1, height: 1, background: C.rule }} />
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {items.map((f) => {
                          const on = f.id === formId;
                          return (
                            <button key={f.id} className="kd-btn kd-form-chip" onClick={() => { setFormId(f.id); setSegIdx(null); }}
                              style={{
                                border: "1px solid " + (on ? C.ink : C.rule),
                                background: on ? C.ink : C.panel,
                                color: on ? C.panel : C.ink,
                                padding: "6px 10px 7px", textAlign: "left", minWidth: 84,
                              }}>
                              <div style={{ fontFamily: MINCHO, fontSize: 17, display: "flex", alignItems: "flex-end" }}>
                                {f.segs.map((s, i) => (
                                  <Word key={i} text={s.text} kana={s.kana} mode={script} ruby={8}
                                    rubyColor={on ? "#c9cfd6" : C.muted} />
                                ))}
                              </div>
                              <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: ".08em", marginTop: 2, color: on ? "#c9cfd6" : C.muted }}>
                                {f.label.toUpperCase()}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </main>
      </div>
      )}

      {audioNote && (
        <div className="kd-toast">
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: ".16em", color: C.stem, paddingTop: 2, flexShrink: 0 }}>AUDIO</span>
            <span style={{ fontSize: 12, lineHeight: 1.55, flex: 1 }}>{audioNote}</span>
            <button className="kd-btn" onClick={() => setAudioNote(null)} aria-label="Dismiss"
              style={{ color: C.muted, padding: 2, lineHeight: 0, flexShrink: 0 }}>
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      <footer style={{ borderTop: "1px solid " + C.rule, marginTop: 26 }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "12px 18px", display: "flex", gap: 16, flexWrap: "wrap", fontFamily: MONO, fontSize: 9, letterSpacing: ".14em", color: C.muted }}>
          <span style={{ color: C.root }}>■ ROOT</span>
          <span style={{ color: C.stem }}>■ SHIFTING KANA</span>
          <span style={{ color: C.aux }}>■ AUXILIARY</span>
          <span style={{ color: C.extra }}>■ STACKED SUFFIX</span>
          <span style={{ marginLeft: "auto" }}>
            AUDIO:{" "}
            {!speech.supported
              ? "UNSUPPORTED IN THIS FRAME"
              : speech.voices === 0
                ? "NO VOICES REACHABLE"
                : speech.ja > 0
                  ? speech.ja + " JA VOICE" + (speech.ja === 1 ? "" : "S")
                  : "NO JA VOICE (" + speech.voices + " OTHERS)"}
          </span>
        </div>
      </footer>
    </div>
  );
}
