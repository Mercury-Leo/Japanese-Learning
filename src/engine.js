/* Kotoba Deck — conjugation engine.
   Pure functions only: no React, no DOM, no network. Importable straight
   into Node, which is what makes test/engine.test.mjs possible. */

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

/* Which euphonic rule a godan verb's て-family forms use. Derived on demand and
   never stored, so refining this taxonomy reclassifies old results for free.
   There are exactly three 音便 — イ, 促, 撥. す is not one of them: 話す→話して is
   the plain い-stem plus て with no sound change, which is why it is labelled as
   the regular case rather than invented into a fourth 音便. */
const TE_RULE = {
  う: "sokuon", つ: "sokuon", る: "sokuon",
  く: "ionbin", ぐ: "ionbin",
  す: "su",
  ぬ: "hatsuon", ぶ: "hatsuon", む: "hatsuon",
};
const TE_RULE_LABEL = {
  sokuon: { label: "う・つ・る → って", jp: "促音便" },
  ionbin: { label: "く・ぐ → いて／いで", jp: "イ音便" },
  su: { label: "す → して", jp: "い-stem" },
  hatsuon: { label: "ぬ・ぶ・む → んで", jp: "撥音便" },
  iku: { label: "行く irregular", jp: "音便例外" },
};

function teRule(word) {
  if (!word || word.type !== "godan") return null;
  const reading = word.reading || word.word;
  /* Same test buildGodan uses, so the two can never disagree about 行く. */
  const cls = (/行く$/.test(word.word) || /いく$/.test(reading))
    ? "iku"
    : TE_RULE[reading.slice(-1)];
  if (!cls) return null;
  return { id: "godan.te." + cls, ...TE_RULE_LABEL[cls] };
}

const GROUPS = ["Plain", "Polite", "Connective", "Derived"];

/* One line per form id, for the legend in settings and the tooltip on every form
   chip. Keyed by id, not by class: 飲む and 高い share ta, te, ba and the rest,
   so a hint has to describe the form, not one word class's version of it. */
const FORM_HINT = {
  dict: "Plain non-past — the form you look up. Present or future for a verb, the bare word for an adjective.",
  nai: "Plain negative, non-past — 飲まない, 高くない.",
  ta: "Plain past — 飲んだ, 高かった.",
  nakatta: "Plain past negative — 飲まなかった, 高くなかった.",
  vol: "Let's, or I think I will — a suggestion or an intention, plain register.",
  imp: "Blunt command. Rare in conversation; you meet it on signs, in orders and in quoted speech.",
  da: "Plain assertion — X is Y. Routinely dropped in casual speech.",
  janai: "Plain negative of だ — is not.",
  datta: "Plain past of だ — was.",

  masu: "Polite non-past — the default register with anyone you are not close to.",
  masen: "Polite negative.",
  mashita: "Polite past.",
  masendeshita: "Polite past negative.",
  mashou: "Polite let's — an invitation or an offer.",
  desu: "Polite non-past with です. Adjectives and nouns take です where verbs take ます.",
  kunaidesu: "Polite negative of an い-adjective — 高くないです.",
  kattadesu: "Polite past of an い-adjective — 高かったです.",
  jaarimasen: "Polite negative of だ — じゃありません.",
  deshita: "Polite past of だ — でした.",

  te: "The joining form: hands off to the next clause, and carries ください, いる and much else.",
  teiru: "In progress now, or the state the action left behind — 知っている is knows, not is knowing.",
  teimasu: "Polite ている.",
  ba: "If — the provisional conditional: whenever the condition holds, the rest follows.",
  nara: "If it is the case that — picks up what was just said and conditions on it.",
  adv: "Adverb form: describes a verb instead of a noun — 早い fast → 早く走る run fast.",
  attr: "The form that goes directly before a noun — 静かな部屋. This な is what names the class.",

  pot: "Can do it. The thing done usually takes が, not を.",
  pass: "It was done to the subject — often with the sense that it happened to them, unwanted.",
  caus: "Make someone do it, or let them.",
  tai: "Want to do it. The result inflects as an い-adjective: たくない, たかった.",
  sou: "Looks like it, judging by appearance — 高そう.",
};

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

/* One call builds ~30 form objects, each with its own segment array, and the
   callers ask for the same word two or three times per render — the quiz derives
   its form list and its question list from the same pool, then conjugates again
   to label every miss. Keyed on content rather than on the object, because
   changing a word's class mints a new object for the same word and has to miss.
   Callers only read the result, never mutate it, so one array can be shared.
   ponytail: unbounded map, sized by the number of distinct words a session
   touches. Add an LRU if a deck ever gets big enough for that to matter. */
const CONJ = new Map();

function conjugate(w) {
  if (!w) return [];
  const key = w.type + "|" + w.word + "|" + (w.reading || "");
  let hit = CONJ.get(key);
  if (!hit) CONJ.set(key, (hit = build(w)));
  return hit;
}

function build(w) {
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

/* hint is the one-line legend shown in settings and hovered on every class chip:
   what the class actually means, not just what it is called. */
const TYPES = [
  { id: "godan", label: "Godan", jp: "五段", hint: "Five-row verb: the last kana walks all five vowels — 飲ま・飲み・飲む・飲め・飲も — so the ending changes shape per form. Ends in う, く, ぐ, す, つ, ぬ, ぶ, む or る." },
  { id: "ichidan", label: "Ichidan", jp: "一段", hint: "One-row verb: the stem never moves. Drop る, add the ending — 食べる → 食べます, 食べない. Always ends in いる or える, though many godan verbs do too." },
  { id: "suru", label: "する verb", jp: "する", hint: "する and every noun that takes it — 勉強する. Irregular: the stem swaps between し, さ and せ." },
  { id: "kuru", label: "来る", jp: "来る", hint: "来る alone, the other irregular verb. Its reading changes with the form: こない, きます, くる." },
  { id: "i-adj", label: "い-adjective", jp: "い形", hint: "Adjective ending in い that conjugates on its own, like a verb — 高い → 高くない, 高かった. No だ." },
  { id: "na-adj", label: "な-adjective", jp: "な形", hint: "Adjective that needs な before a noun — 静かな部屋 — and conjugates with だ/です, not by itself." },
  { id: "noun", label: "Noun", jp: "名詞", hint: "Plain noun. Nothing conjugates on the word itself; だ/です carries the tense and the negative." },
];
const typeLabel = (id) => TYPES.find((t) => t.id === id)?.jp ?? "";


/* jlpt / trans / common feed the scope filters in settings.js. All three are
   optional everywhere: an untagged word is never filtered out. */
const SEED = [
  { word: "行く", reading: "いく", meaning: "to go", type: "godan", jlpt: "N5", trans: "intrans", common: true },
  { word: "食べる", reading: "たべる", meaning: "to eat", type: "ichidan", jlpt: "N5", trans: "trans", common: true },
  { word: "飲む", reading: "のむ", meaning: "to drink", type: "godan", jlpt: "N5", trans: "trans", common: true },
  { word: "勉強する", reading: "べんきょうする", meaning: "to study", type: "suru", jlpt: "N5", trans: "trans", common: true },
  { word: "来る", reading: "くる", meaning: "to come", type: "kuru", jlpt: "N5", trans: "intrans", common: true },
  { word: "高い", reading: "たかい", meaning: "expensive; tall", type: "i-adj", jlpt: "N5", trans: "na", common: true },
  { word: "静か", reading: "しずか", meaning: "quiet", type: "na-adj", jlpt: "N5", trans: "na", common: true },
].map((w, i) => ({ ...w, id: "seed" + i, addedAt: Date.now() - (7 - i) * 86400000 }));


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

/* Meaning questions — a pair per word, word→gloss and gloss→word. This is the
   only drill a noun has, so without it half a vocabulary deck is unquizzable.
   Distractors come from `all` rather than `pool`: drilling a single word should
   not leave it with nothing to be confused with. A word with no gloss, or with
   fewer than two differently-glossed neighbours, produces nothing — a question
   whose wrong answers are also right teaches the wrong thing. */
function meaningItems(pool, all) {
  const gloss = (w) => (w.meaning || "").trim();
  const glossed = all.filter(gloss);
  const out = [];
  for (const w of pool) {
    if (!gloss(w)) continue;
    const others = glossed.filter((x) => x.id !== w.id && gloss(x) !== gloss(w));
    if (others.length < 2) continue;
    for (const kind of ["mean-en", "mean-ja"])
      out.push({ wordId: w.id, formId: null, fromId: null, kind, opts: shuffle([...others]).slice(0, 3).map((x) => x.id) });
  }
  return out;
}


export {
  romaji,
  toKana,
  settleKana,
  conjugate,
  detectType,
  TYPES,
  typeLabel,
  GROUPS,
  FORM_HINT,
  GODAN,
  MODS,
  stems,
  teRule,
  stackInit,
  stackApply,
  trimSegs,
  splitFurigana,
  columns,
  loose,
  formText,
  formKana,
  answerMatches,
  shuffle,
  shuffleStable,
  meaningItems,
  REVERSE_SOURCES,
  SEED,
  seg,
  G,
  isKana,
};
