/* Regression suite for the conjugation engine.
   No framework: node test/engine.test.mjs  (or: npm test)
   Every case here corresponds to a bug that actually occurred during
   development, so deleting one is how a fixed bug comes back. */
import { readFileSync, readdirSync } from "node:fs";
import {
  romaji, toKana, settleKana, conjugate, detectType,
  stackInit, stackApply, answerMatches, columns, formText, meaningItems,
  teRule, SEED, TYPES,
} from "../src/engine.js";
import { allForms, DEFAULTS, PRESETS, applyPreset, mergeSettings, visibleForms, visibleMods, wordInScope, contentOf, isContentPatch, sameContent } from "../src/settings.js";
import { tagsFromLookup, candidateWithTags, rankMatches } from "../src/api.js";
import { CHARTS, GROUPS, cell, read as chartRomaji } from "../src/charts.js";
import { EMPTY, MEANING, wordKey, record, statFor, ruleKey, byRule, wordAccuracy, totals, mergeStats, mergeStored } from "../src/stats.js";

let pass = 0, fail = 0;
const eq = (got, want, label) => {
  if (got === want) { pass++; return; }
  fail++;
  console.log(`  FAIL ${label}\n       got  ${got}\n       want ${want}`);
};
const W = (word, reading, type) => ({ word, reading, type });
const group = (name) => console.log("\n" + name);

/* ---------------- conjugation ---------------- */
group("conjugation");
const form = (w, id) => {
  const f = conjugate(w).find((x) => x.id === id);
  return f ? formText(f) : "(missing)";
};
// 行く is the one irregular て-form in the godan class
eq(form(W("行く", "いく", "godan"), "te"), "行って", "行く te-form is 行って, not 行いて");
eq(form(W("書く", "かく", "godan"), "te"), "書いて", "regular く verb keeps いて");
eq(form(W("泳ぐ", "およぐ", "godan"), "te"), "泳いで", "ぐ voices to いで");
eq(form(W("飲む", "のむ", "godan"), "te"), "飲んで", "む goes nasal");
eq(form(W("買う", "かう", "godan"), "nai"), "買わない", "う takes わ, not あ");
eq(form(W("いい", "いい", "i-adj"), "ta"), "よかった", "いい borrows 良い");
eq(form(W("勉強する", "べんきょうする", "suru"), "pot"), "勉強できる", "する potential is できる");
eq(form(W("来る", "くる", "kuru"), "imp"), "来い", "来る imperative is 来い, not 来ろ");

/* ---------------- word class detection ---------------- */
group("class detection");
eq(detectType("学生", "がくせい"), "noun", "kanji-final word is not an い-adjective");
eq(detectType("高い", "たかい"), "i-adj", "trailing kana い means い-adjective");
eq(detectType("帰る", "かえる"), "godan", "帰る is godan despite the える ending");
eq(detectType("食べる", "たべる"), "ichidan", "食べる is ichidan");

/* ---------------- furigana alignment ---------------- */
group("furigana");
const cols = (t, k) => columns(t, k, "furigana").map((c) => (c.ruby ? `${c.base}(${c.ruby})` : c.base)).join("");
eq(cols("食べ", "たべ"), "食(た)べ", "ruby sits on the kanji only");
eq(cols("お茶", "おちゃ"), "お茶(ちゃ)", "leading kana is peeled off too");
eq(cols("静か", "しずか"), "静(しず)か", "trailing kana is peeled off");

/* ---------------- kana IME ---------------- */
group("kana IME");
eq(toKana("itte"), "いって", "gemination");
eq(toKana("nonde"), "のんで", "n before a consonant");
eq(toKana("konnichi"), "こんにち", "nn consumes one n, not two");
eq(toKana("nya"), "にゃ", "digraph beats the n rule");
eq(toKana("na"), "な", "a lone n must stay pending");
eq(settleKana("ikimasen"), "いきません", "trailing n settles on submit");
eq(toKana("tabesaseraretakunakatta"), "たべさせられたくなかった", "long input");

/* ---------------- stacked forms ---------------- */
group("stacked forms");
const chain = (w, ...mods) => {
  let st = stackInit(w);
  for (const m of mods) st = stackApply(st, m);
  return st;
};
eq(chain(W("食べる", "たべる", "ichidan"), "caus", "pass", "tai", "neg", "past").segs.map((s) => s.text).join(""),
   "食べさせられたくなかった", "five modifiers compose");
eq(chain(W("食べる", "たべる", "ichidan"), "caus", "pass", "tai", "neg", "past").segs.length,
   8, "every morpheme keeps its own segment");
eq(chain(W("来る", "くる", "kuru"), "prog", "polite").segs.map((s) => s.kana).join(""),
   "きています", "来る shifts its reading under inflection");
eq(chain(W("いい", "いい", "i-adj"), "neg", "past").segs.map((s) => s.text).join(""),
   "よくなかった", "いい substitutes よ when it inflects");
eq(chain(W("勉強する", "べんきょうする", "suru"), "pot", "neg", "polite").segs.map((s) => s.text).join(""),
   "勉強できないです", "suru potential then adjective inflection");
eq(chain(W("高い", "たかい", "i-adj"), "polite").segs.map((s) => s.text).join(""),
   "高いです", "い-adjective keeps its い before です");
eq(chain(W("行く", "いく", "godan"), "polite").cls, "closed", "ます closes the chain");

/* ---------------- answer matching ---------------- */
group("answer matching");
const te = conjugate(W("行く", "いく", "godan")).find((f) => f.id === "te");
for (const good of ["行って", "いって", "itte", " ITTE "])
  eq(answerMatches(good, te), true, `accepts ${good.trim()}`);
for (const bad of ["iite", "いいて", "ite"])
  eq(answerMatches(bad, te), false, `rejects ${bad} (the regular-but-wrong form)`);
const takakatta = conjugate(W("高い", "たかい", "i-adj")).find((f) => f.id === "ta");
eq(answerMatches("takakatta", takakatta), true, "lenient romanisation");
eq(answerMatches("takakata", takakatta), false, "gemination is not collapsed");
const hanasu = conjugate(W("話す", "はなす", "godan")).find((f) => f.id === "masu");
eq(answerMatches("hanasimasu", hanasu), true, "si and shi both accepted");

/* ---------------- homographs ---------------- */
group("homographs");
// An ichidan potential and passive are the same string. Quiz distractors must be
// filtered by answer text, not by form id, or a correct answer scores as wrong.
const tf = conjugate(W("食べる", "たべる", "ichidan"));
eq(formText(tf.find((f) => f.id === "pot")), formText(tf.find((f) => f.id === "pass")),
   "食べられる is both potential and passive");

/* ---------------- learning settings ---------------- */
group("learning settings");
// DEFAULTS and the Beginner preset must be the same place. Two separately-tuned
// lists produce a first run that silently differs from pressing Beginner.
eq(DEFAULTS.formIds.join(","), PRESETS.Beginner.formIds.join(","), "DEFAULTS forms are the Beginner preset");
eq(DEFAULTS.types.length, 7, "Beginner keeps all 7 word classes — narrowing them would drop 静か from the seed deck");
eq(DEFAULTS.commonOnly, false, "nothing is hidden by frequency until asked");
eq(DEFAULTS.show.glosses, true, "display flags default on");

// A preset is content only. Stomping display or frequency preferences is a bug.
const tweaked = { ...DEFAULTS, commonOnly: true, show: { ...DEFAULTS.show, audio: false } };
const after = applyPreset("Everything", tweaked);
eq(after.commonOnly, true, "preset leaves commonOnly alone");
eq(after.show.audio, false, "preset leaves show flags alone");
eq(after.formIds.length > DEFAULTS.formIds.length, true, "Everything widens the form list");

// Custom preset: loads the saved slot, and only claims to be a named preset while
// the screen still matches it.
eq(DEFAULTS.preset, "Beginner", "a first run is on Beginner, not Custom");
eq(sameContent(DEFAULTS.custom, PRESETS.Beginner), true, "an untouched Custom slot is Beginner");
const edited = { ...DEFAULTS, modIds: ["neg"] };
eq(sameContent(edited, edited.custom), false, "an edit differs from the saved slot — Override is offered");
const saved = { ...edited, custom: contentOf(edited) };
eq(sameContent(saved, saved.custom), true, "after Override the slot matches, so it is offered no more");
// Loading Custom must restore content only, never the display preferences.
const loaded = applyPreset("Custom", { ...saved, ...PRESETS.Everything, commonOnly: true });
eq(loaded.modIds.join(","), "neg", "Custom loads the saved content back");
eq(loaded.preset, "Custom", "Custom is the active preset once loaded");
eq(loaded.commonOnly, true, "Custom leaves commonOnly alone, like every other preset");
eq(applyPreset("Everything", saved).custom.modIds.join(","), "neg", "a named preset does not wipe the saved slot");
eq(isContentPatch({ formIds: [] }), true, "a form edit is content");
eq(isContentPatch({ show: {} }) || isContentPatch({ commonOnly: true }), false, "display and frequency are not");

// A partial or junk payload must never yield undefined arrays.
eq(mergeSettings({}).formIds.length, DEFAULTS.formIds.length, "empty stored object falls back to defaults");
eq(mergeSettings({ formIds: ["te"] }).formIds.join(","), "te", "stored value wins");
eq(mergeSettings({ formIds: ["te"] }).types.length, 7, "missing key falls back");
eq(mergeSettings(null).jlpt.length, 2, "null payload falls back");
eq(mergeSettings({ formIds: "nonsense" }).formIds.length, DEFAULTS.formIds.length, "non-array is rejected");
eq(mergeSettings({ show: { audio: false } }).show.glosses, true, "show is merged key-by-key, not replaced");
eq(mergeSettings({ preset: "nonsense" }).preset, "Beginner", "an unknown preset name is rejected");
eq(mergeSettings({ custom: { modIds: ["neg"] } }).custom.formIds.length, DEFAULTS.formIds.length,
   "a half-written Custom slot falls back key-by-key");

// The settings panel is built from this list, so a missing id means a form the
// learner can never turn on.
const AF = allForms();
eq(new Set(AF.map((f) => f.id)).size, AF.length, "allForms has no duplicate ids");
for (const id of ["dict", "nai", "ta", "masu", "te", "pot", "caus", "tai"])
  eq(AF.some((f) => f.id === id), true, `allForms includes the verb form ${id}`);
for (const id of ["desu", "kunaidesu", "kattadesu", "adv", "sou"])
  eq(AF.some((f) => f.id === id), true, `allForms includes the い-adjective form ${id}`);
for (const id of ["da", "janai", "datta", "jaarimasen", "attr", "nara"])
  eq(AF.some((f) => f.id === id), true, `allForms includes the copula form ${id}`);
for (const g of ["Plain", "Polite", "Connective", "Derived"])
  eq(AF.some((f) => f.group === g), true, `allForms spans the ${g} group`);
eq(AF.every((f) => !!f.label), true, "every form carries a label for the settings chip");

// visibleForms, visibleMods, wordInScope
const S = { ...DEFAULTS, formIds: ["dict", "te"], modIds: ["neg"], jlpt: ["N5"], trans: ["trans"], types: DEFAULTS.types };
const iku = conjugate(W("行く", "いく", "godan"));
eq(visibleForms(iku, S).map((f) => f.id).join(","), "dict,te", "visibleForms keeps exactly the enabled ids");
eq(visibleForms(iku, { ...S, formIds: [] }).length, 0, "an empty form list yields nothing to render");
eq(visibleMods(S).map((m) => m.id).join(","), "neg", "visibleMods filters the stack modifiers");

// THE UNKNOWN RULE. An untagged word is what an existing saved deck looks like,
// and it must survive every filter combination — this is why no migration exists.
const bare = { word: "犬", reading: "いぬ", type: "noun" };
eq(wordInScope(bare, S), true, "an untagged word passes a narrow jlpt filter");
eq(wordInScope(bare, { ...S, commonOnly: true }), true, "an untagged word passes commonOnly");
eq(wordInScope(bare, { ...S, trans: [] }), true, "an untagged word passes an empty transitivity filter");
eq(wordInScope(bare, { ...S, jlpt: [] }), true, "an untagged word passes an empty jlpt filter");

// Word class always applies — type is never absent.
eq(wordInScope(bare, { ...S, types: ["godan"] }), false, "word class is filtered strictly");

// jlpt: present must match, absent passes.
eq(wordInScope({ ...bare, jlpt: "N5" }, S), true, "N5 word passes an N5 filter");
eq(wordInScope({ ...bare, jlpt: "N2" }, S), false, "N2 word fails an N5 filter");

// transitivity: only trans/intrans are filtered; "na" and absent always pass.
eq(wordInScope({ ...bare, trans: "trans" }, S), true, "transitive passes when enabled");
eq(wordInScope({ ...bare, trans: "intrans" }, S), false, "intransitive fails when disabled");
eq(wordInScope({ ...bare, trans: "na" }, { ...S, trans: [] }), true, "n/a is never filtered");

// commonOnly hides only an explicit false.
eq(wordInScope({ ...bare, common: false }, { ...S, commonOnly: true }), false, "commonOnly hides a rare word");
eq(wordInScope({ ...bare, common: true }, { ...S, commonOnly: true }), true, "commonOnly keeps a common word");
eq(wordInScope({ ...bare, common: false }, S), true, "a rare word shows when commonOnly is off");

eq(SEED.length, 7, "seed deck still has 7 words");
eq(SEED.every((w) => w.jlpt && w.trans && typeof w.common === "boolean"), true, "every seed word is tagged");
eq(SEED.filter((w) => w.trans === "na").length, 2, "高い and 静か are not verbs, so transitivity is n/a");
eq(SEED.every((w) => wordInScope(w, DEFAULTS)), true, "a first run shows all 7 seed words — none silently vanish");

// A preset that leaves some word class with nothing to show is a blank screen.
for (const name of Object.keys(PRESETS)) {
  const s = applyPreset(name, DEFAULTS);
  for (const t of TYPES.map((x) => x.id)) {
    if (!s.types.includes(t)) continue;
    const rep = { word: "食べる", reading: "たべる", type: t };
    eq(visibleForms(conjugate(rep), s).length > 0, true, `preset ${name} leaves ${t} at least one visible form`);
  }
}

// The loop above passes structurally today: every builder emits dict and te, which
// Beginner enables. This is its negative control — proof the check can detect the
// failure it claims to guard, so the loop is a real forward guard for new presets.
eq(visibleForms(conjugate({ word: "静か", reading: "しずか", type: "na-adj" }),
                { ...DEFAULTS, formIds: ["pot", "caus"] }).length,
   0,
   "a preset with no ids for a class blanks it — what the loop above guards");

// A model can return anything. Storing a guess as fact would let a bad tag hide a
// word the learner added, so anything unrecognised is dropped rather than kept.
eq(JSON.stringify(tagsFromLookup({ jlpt: "N5", transitivity: "transitive", common: true })),
   JSON.stringify({ jlpt: "N5", trans: "trans", common: true }), "valid tags map through");
eq(JSON.stringify(tagsFromLookup({ jlpt: "N9", transitivity: "maybe", common: "yes" })),
   JSON.stringify({}), "unrecognised values are dropped, not stored");
eq(JSON.stringify(tagsFromLookup({})), JSON.stringify({}), "absent tags stay absent");
eq(JSON.stringify(tagsFromLookup(null)), JSON.stringify({}), "a null payload is safe");
eq(tagsFromLookup({ transitivity: "n/a" }).trans, "na", "n/a maps to na");
eq(tagsFromLookup({ transitivity: "intransitive" }).trans, "intrans", "intransitive maps to intrans");

// The validated tags used to be merged OVER the raw candidate, so an invalid jlpt survived
// by key collision and permanently hid the word from every scope. Strip, then re-add.
const badCand = { word: "泳ぐ", reading: "およぐ", meaning: "to swim", type: "godan", jlpt: "N9", transitivity: "maybe", common: "yes" };
eq("jlpt" in candidateWithTags(badCand), false, "an invalid jlpt is stripped, never stored");
eq("common" in candidateWithTags(badCand), false, "an invalid common is stripped");
eq("transitivity" in candidateWithTags(badCand), false, "the raw wire field never survives");
eq(candidateWithTags(badCand).word, "泳ぐ", "non-tag fields are preserved");
eq(candidateWithTags({ ...badCand, jlpt: "N4" }).jlpt, "N4", "a valid jlpt still comes through");
eq("trans" in candidateWithTags({ word: "泳ぐ", reading: "およぐ", type: "godan", trans: "garbage" }), false,
   "a raw internal `trans` key from a lookup is stripped too, not just `transitivity`");

/* ---------------- offline dictionary ---------------- */
group("offline dictionary");
// [word, reading, meaning, type, trans] — the shape scripts/build-dict.mjs writes.
const ROWS = [
  ["行く", "いく", "to go", "godan", "intrans"],
  ["生きる", "いきる", "to live", "ichidan", "intrans"],
  ["医院", "いいん", "clinic; doctor's office", "noun", ""],
  ["図書館", "としょかん", "library", "noun", ""],
  ["静か", "しずか", "quiet; silent", "na-adj", ""],
];
const hits = (q) => rankMatches(ROWS, q).map((c) => c.word);

eq(JSON.stringify(hits("行く")), JSON.stringify(["行く"]), "the written form matches");
eq(JSON.stringify(hits("いく")), JSON.stringify(["行く"]), "the reading matches");
eq(JSON.stringify(hits("iku")), JSON.stringify(["行く"]), "romaji matches through the kana IME");
eq(JSON.stringify(hits("toshokan")), JSON.stringify(["図書館"]), "settleKana finalises a trailing n");
// An exact reading must outrank a prefix, or いく surfaces 生きる ahead of 行く.
eq(hits("いく")[0], "行く", "exact beats prefix");
// English is the model's job — ordering gloss matches needs frequency data JMdict
// simplified drops, and a "quiet" that omits 静か reads as broken.
eq(hits("library").length, 0, "English falls through to the model, not a bad guess");
eq(hits("い")[0], undefined, "a single kana is too short to prefix-match on");
eq(hits("").length, 0, "an empty query matches nothing");
eq(rankMatches(ROWS, "行く")[0].trans, "intrans", "transitivity survives the tag whitelist");
eq("transitivity" in rankMatches(ROWS, "行く")[0], false, "the raw wire field never reaches the deck");
eq(rankMatches(ROWS, "図書館")[0].common, true, "the common subset is flagged common");
eq(rankMatches(ROWS, "いく").length <= 3, true, "at most three candidates");
eq(rankMatches(ROWS, "いく")[0].sure, true, "an exact hit is one the dictionary stands behind");
eq(rankMatches(ROWS, "いき")[0].sure, false, "a prefix hit is flagged as the guess it is");

/* A learner types the form they heard, not the form JMdict lists. Every case below
   returned nothing (ます) or the wrong entry (て) before the query was folded back
   to a dictionary form. */
const CONJ_ROWS = [
  ["行く", "いく", "to go", "godan", "intrans"],
  ["行う", "おこなう", "to perform", "godan", "trans"],
  ["買う", "かう", "to buy", "godan", "trans"],
  ["書く", "かく", "to write", "godan", "trans"],
  ["待つ", "まつ", "to wait", "godan", "intrans"],
  ["話す", "はなす", "to speak", "godan", "trans"],
  ["飲む", "のむ", "to drink", "godan", "trans"],
  ["食べる", "たべる", "to eat", "ichidan", "trans"],
  ["勉強する", "べんきょうする", "to study", "suru", "trans"],
  ["来る", "くる", "to come", "kuru", "intrans"],
  ["高い", "たかい", "expensive; tall", "i-adj", ""],
  ["静か", "しずか", "quiet; silent", "na-adj", ""],
  ["図書館", "としょかん", "library", "noun", ""],
];
const cj = (q) => rankMatches(CONJ_ROWS, q).map((c) => c.word);
const folds = (q, want) => eq(cj(q).includes(want), true, `${q} folds to ${want} — got [${cj(q)}]`);

folds("食べます", "食べる");
folds("たべます", "食べる");
folds("tabemasu", "食べる");
folds("飲みます", "飲む");
folds("のみます", "飲む");
folds("待ちます", "待つ");
folds("話します", "話す");
folds("買います", "買う");
folds("勉強します", "勉強する");
folds("きます", "来る");
folds("飲みませんでした", "飲む");
folds("飲みましょう", "飲む");

folds("食べて", "食べる");
folds("飲んで", "飲む");
folds("nonde", "飲む");
folds("書いて", "書く");
folds("話して", "話す");
folds("待って", "待つ");
folds("勉強して", "勉強する");
folds("飲んだ", "飲む");
folds("食べた", "食べる");

folds("飲まない", "飲む");
folds("食べない", "食べる");
folds("買わない", "買う");
folds("こない", "来る");
folds("高くて", "高い");
folds("高かった", "高い");
folds("高くない", "高い");

// 行く is the one verb whose て-form ignores its ending, so って must reach く too.
folds("行って", "行く");
folds("いって", "行く");
// ...but only from that stem. A blanket って → く would answer 買って with 書く.
eq(cj("買って").includes("書く"), false, "って does not fold to く off any other stem");
folds("買って", "買う");
// 行って really is both verbs written down — showing both is the honest answer.
eq(cj("行って").includes("行う"), true, "行って is genuinely ambiguous, and says so");
// The dictionary is the filter: 食べむ and 行つ get generated and then find nothing.
eq(cj("食べます").includes("飲む"), false, "an over-generous guess dies on lookup");
// です carries the politeness for the classes that cannot conjugate for it.
folds("高いです", "高い");
folds("静かです", "静か");
folds("静かでした", "静か");
folds("図書館です", "図書館");

/* Potential, passive and causative — MODS builds each of them into a fresh
   ichidan verb, so the fold has to run back down through one. */
folds("飲める", "飲む");
folds("行ける", "行く");
folds("話せる", "話す");
folds("待てる", "待つ");
folds("買える", "買う");
folds("nomeru", "飲む");
folds("飲まれる", "飲む");
folds("買われる", "買う");
folds("飲ませる", "飲む");
folds("買わせる", "買う");
folds("食べられる", "食べる");
folds("食べさせる", "食べる");
folds("tabesaseru", "食べる");
// ら-nuki: not textbook, but it is what gets said and what gets typed.
folds("食べれる", "食べる");
// する has no regular potential — できる replaces it wholesale.
folds("勉強できる", "勉強する");
folds("勉強される", "勉強する");
folds("勉強させる", "勉強する");
folds("来られる", "来る");
folds("こられる", "来る");
folds("来させる", "来る");

/* Derived verbs stack, so one peel is not enough: these unwind two and three deep. */
folds("行けます", "行く");
folds("飲まれました", "飲む");
folds("食べさせない", "食べる");
folds("食べさせられる", "食べる");
eq(cj("食べさせられます")[0], "食べる", `three peels deep still lands first — got [${cj("食べさせられます")}]`);
// The potential peel takes any る, so every ichidan verb runs through it. It must
// not cost 食べる its own entry.
eq(cj("食べる")[0], "食べる", "a dictionary form still answers as itself");

// A form still loses to a word actually spelled that way.
eq(cj("いく")[0], "行く", "an exact hit still outranks a deconjugated one");

// The committed artifact, not just the ranking over it: a bad part-of-speech map
// in build-dict.mjs would silently mistype every entry, and nothing else would notice.
const dict = JSON.parse(readFileSync(new URL("../src/dict.json", import.meta.url), "utf8"));
const find = (w) => dict.find((r) => r[0] === w);
eq(dict.length > 20000, true, "the dictionary is the common subset, not a stub");
eq(find("行く")[3], "godan", "行く is godan — the v5k-s irregularity detectType cannot see");
eq(find("食べる")[3], "ichidan", "食べる is ichidan");
eq(find("来る")[3], "kuru", "来る is kuru");
eq(find("高い")[3], "i-adj", "高い is an い-adjective");
eq(find("静か")[3], "na-adj", "静か is a な-adjective");
eq(find("図書館")[3], "noun", "図書館 is a noun");
// 帰る/変える is the pair the reading heuristic gets wrong; JMdict has it as data.
eq(find("帰る")[3], "godan", "帰る is godan");
eq(find("変える")[3], "ichidan", "変える is ichidan");
// JMdict lists 勉強 as a noun tagged `vs`; build-dict emits the する form too.
eq(find("勉強する")[3], "suru", "the する form is emitted for vs-tagged nouns");
eq(find("勉強")[3], "noun", "and the bare noun is kept alongside it");
eq(dict.every((r) => TYPES.some((t) => t.id === r[3])), true, "every entry carries a class the engine knows");
eq(dict.every((r) => r[1] && !/[a-zA-Z]/.test(r[1])), true, "every reading is kana, never romaji");

/* ---------------- meaning questions ---------------- */
group("meaning questions");
const V = (id, meaning) => ({ id, word: id, reading: id, meaning, type: "noun" });
const deck = [V("a", "library"), V("b", "station"), V("c", "school"), V("d", "")];

const mi = meaningItems(deck, deck);
eq(mi.length, 6, "a gloss pair per glossed word, and none for the ungloss'd one");
eq(mi.filter((i) => i.kind === "mean-en").length, 3, "half ask word → gloss");
eq(mi.filter((i) => i.kind === "mean-ja").length, 3, "half ask gloss → word");
eq(mi.every((i) => !i.opts.includes(i.wordId)), true, "a word is never its own distractor");
eq(mi.every((i) => !i.opts.includes("d")), true, "an ungloss'd word cannot be a distractor either");

// Drilling one word still needs distractors, so they come from the whole deck.
eq(meaningItems([deck[0]], deck).length, 2, "a one-word selection still gets its pair");
const pair = deck.slice(0, 2);
eq(meaningItems(pair, pair).length, 0, "a two-word deck cannot fill a choice, so it asks nothing");

// Two words that mean the same thing would make a question with two right answers.
const dup = [V("a", "library"), V("b", "library"), V("c", "school"), V("d", "station")];
eq(meaningItems([dup[0]], dup).every((i) => !i.opts.includes("b")), true,
   "a same-gloss word is never offered as a wrong answer");

/* ---------------- te rules ---------------- */
// The whole point of the stats feature is aggregating along the grammar, so a
// misfiled rule silently merges two different lessons into one number.
group("te rules");
const rule = (w) => (teRule(w) || {}).id;
eq(rule(W("買う", "かう", "godan")), "godan.te.sokuon", "う takes っ");
eq(rule(W("待つ", "まつ", "godan")), "godan.te.sokuon", "つ takes っ");
eq(rule(W("帰る", "かえる", "godan")), "godan.te.sokuon", "godan る takes っ");
eq(rule(W("書く", "かく", "godan")), "godan.te.ionbin", "く takes い");
eq(rule(W("泳ぐ", "およぐ", "godan")), "godan.te.ionbin", "ぐ is イ音便 too, voiced — same rule as く");
eq(rule(W("話す", "はなす", "godan")), "godan.te.su", "す is the plain い-stem, not an 音便");
eq(rule(W("死ぬ", "しぬ", "godan")), "godan.te.hatsuon", "ぬ goes nasal");
eq(rule(W("遊ぶ", "あそぶ", "godan")), "godan.te.hatsuon", "ぶ goes nasal");
eq(rule(W("飲む", "のむ", "godan")), "godan.te.hatsuon", "む goes nasal");
eq(rule(W("行く", "いく", "godan")), "godan.te.iku", "行く is its own rule, not the く rule");
eq(teRule(W("食べる", "たべる", "ichidan")), null, "ichidan has no euphonic rule");
eq(teRule(W("勉強する", "べんきょうする", "suru")), null, "suru has no euphonic rule");
eq(teRule(W("高い", "たかい", "i-adj")), null, "i-adj has no euphonic rule");
eq(teRule(W("飲む", "のむ", "godan")).jp, "撥音便", "the label names the 音便 for display");

/* ---------------- quiz stats ---------------- */
group("quiz stats");
const nomu = W("飲む", "のむ", "godan");
const asobu = W("遊ぶ", "あそぶ", "godan");
const taberu = W("食べる", "たべる", "ichidan");

// keyed on the natural pair, because Import mints fresh ids
eq(wordKey(nomu), "飲む|のむ", "key is word|reading");

// recording is pure and accumulates
let s = record(EMPTY, nomu, "te", true, 1000);
s = record(s, nomu, "te", false, 2000);
eq(statFor(s, nomu, "te").n, 2, "two attempts recorded");
eq(statFor(s, nomu, "te").ok, 1, "one correct");
eq(statFor(s, nomu, "te").last, 2000, "last is the newest timestamp");
eq(statFor(s, nomu, "te").streak, -1, "a miss resets the streak negative");
eq(statFor(record(s, nomu, "te", false, 3000), nomu, "te").streak, -2, "consecutive misses deepen the streak");
eq(statFor(record(record(s, nomu, "te", true, 3000), nomu, "te", true, 4000), nomu, "te").streak, 2, "consecutive hits climb");
eq(EMPTY.entries["飲む|のむ"], undefined, "record does not mutate its input");
eq(statFor(EMPTY, nomu, "te"), null, "unseen pairs report null, not a zeroed row");

// rules aggregate across different words sharing one grammar rule
eq(ruleKey(nomu, "te").id, "godan.te.hatsuon", "godan te-form uses the euphonic rule");
eq(ruleKey(nomu, "teiru").id, "godan.te.hatsuon", "ている consumes the same て, so same rule");
eq(ruleKey(nomu, "ta").id, "godan.te.hatsuon", "た comes from the same euphonic change");
eq(ruleKey(nomu, "nakatta").id, "godan.nakatta", "なかった builds off the A-stem, no 音便");
eq(ruleKey(nomu, "masu").id, "godan.masu", "non-te forms fall through to type.form");
eq(ruleKey(taberu, "te").id, "ichidan.te", "ichidan te-form has no euphonic rule");
eq(ruleKey(nomu, MEANING).id, "meaning", "meaning questions get their own bucket");
eq(ruleKey(nomu, "masu").label.length > 0, true, "the fallback still carries a display label");

let r = record(EMPTY, nomu, "te", false, 1000);
r = record(r, asobu, "te", false, 1000);
r = record(r, asobu, "te", true, 2000);
const rules = byRule(r, [nomu, asobu]);
eq(rules.length, 1, "飲む and 遊ぶ collapse into one 撥音便 bucket");
eq(rules[0].id, "godan.te.hatsuon", "and it is the nasal rule");
eq(rules[0].n, 3, "three attempts across both words");
eq(rules[0].ok, 1, "one of them correct");
eq(rules[0].pct, 33, "percentage rounds");
eq(byRule(r, [nomu, asobu], 4).length, 0, "minN suppresses thin buckets");
eq(byRule(r, []).length, 0, "words no longer in the deck are skipped, not crashed on");
eq(byRule(r, [nomu, nomu])[0].n, byRule(r, [nomu])[0].n, "a duplicate deck entry is deduped, not double-counted");

// per-word and overall
eq(wordAccuracy(r, asobu).n, 2, "word accuracy sums that word's forms");
eq(wordAccuracy(r, taberu).n, 0, "an undrilled word reports zero, not null");
eq(totals(r).n, 3, "totals count every attempt");

// merge on import
const a = record(EMPTY, nomu, "te", true, 1000);
const b = record(EMPTY, nomu, "te", false, 5000);
const m = mergeStats(a, b);
eq(statFor(m, nomu, "te").n, 1, "merge takes the max of attempts, not the sum");
eq(statFor(m, nomu, "te").ok, 1, "merge takes the max of correct, not the sum");
eq(statFor(m, nomu, "te").last, 5000, "merge takes the newer timestamp");
eq(statFor(m, nomu, "te").streak, 0, "two streaks cannot be combined, so merge resets");
eq(statFor(mergeStats(EMPTY, b), nomu, "te").n, 1, "merging into empty keeps the incoming row");
eq(statFor(mergeStats(a, a), nomu, "te").n, 1, "merging stats with itself is idempotent");
eq(statFor(mergeStats(a, a), nomu, "te").ok, 1, "merging stats with itself is idempotent (correct)");
eq(statFor(mergeStats(EMPTY, a), nomu, "te").n, 1, "merging into EMPTY restores the incoming counts intact");
eq(statFor(mergeStats(EMPTY, a), nomu, "te").ok, 1, "merging into EMPTY restores the incoming counts intact (correct)");

// mergeStored defends untrusted boot and import data
eq(Object.keys(mergeStored(null).entries).length, 0, "null returns empty-shaped output");
eq(Object.keys(mergeStored({}).entries).length, 0, "missing entries key returns empty entries");
eq(Object.keys(mergeStored({ entries: "not an object" }).entries).length, 0, "non-object entries returns empty");

const stored = {
  entries: {
    "飲む|のむ": {
      te: { n: 3, ok: 2, last: 5000, streak: 1 },
      ta: { n: "not a number", ok: 1, last: 1000 },
      masu: { n: 2, ok: 2 },
      kanou: { n: 2, ok: 3 },
    },
    "not an object": "invalid",
  },
};
const cleaned = mergeStored(stored);
eq(statFor(cleaned, nomu, "te").n, 3, "valid entry survives sanitization");
eq(statFor(cleaned, nomu, "ta"), null, "entry with non-number n is dropped");
eq(statFor(cleaned, nomu, "masu").last, 0, "missing last coerces to zero");
eq(statFor(cleaned, nomu, "masu").streak, 0, "missing streak coerces to zero");
eq(statFor(cleaned, nomu, "kanou").ok, 2, "ok is clamped to n rather than exceeding it");

const pristine = { version: 1, entries: { "飲む|のむ": { te: { n: 5, ok: 3, last: 9999, streak: 2 } } } };
const roundtrip = mergeStored(JSON.parse(JSON.stringify(pristine)));
eq(statFor(roundtrip, nomu, "te").n, 5, "well-formed data round-trips intact");

/* ---------------- module wiring ---------------- */
// GODAN was left out of App.jsx's import list when the single file was split, so
// tapping a godan stem unmounted the whole tree. Nothing that only calls the
// engine can see that, hence this static check on the import lists themselves.
group("module wiring");
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const decomment = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const names = (src, re) => (src.match(re)?.[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/* Every component file, not just App.jsx: the same omission in Quiz.jsx or
   VocabView.jsx is the same blank screen, and there are eight of them now. */
const VIEWS = readdirSync(new URL("../src/", import.meta.url)).filter((f) => f.endsWith(".jsx"));
const SOURCES = ["engine.js", "settings.js", "stats.js", "theme.js", "ui.jsx"];

eq(VIEWS.length > 1, true, "found the component files");
for (const view of VIEWS) {
  const src = read("../src/" + view);
  /* Strings and JSX text are not references: a Section labelled "Word classes"
     is not a call to Word, and settings.show.romaji is not a call to romaji. */
  const code = decomment(src).replace(/"[^"]*"|'[^']*'/g, '""').replace(/>[^<>{}]*</g, "><");
  /* A name the file defines itself, or already imports from somewhere else,
     needs no import from here — GROUPS is exported by both engine and charts. */
  const local = new RegExp("(?:function|const|let)\\s+(\\w+)", "g");
  const own = new Set([...code.matchAll(local)].map((m) => m[1]));
  for (const m of src.matchAll(/import\s+\{([^}]*)\}\s+from\s+"\.\/([\w.]+)"/g))
    for (const n of m[1].split(",")) own.add(n.trim().split(/\s+as\s+/).pop() + "@" + m[2]);
  for (const file of SOURCES) {
    if (view === file) continue;
    const dep = decomment(read("../src/" + file));
    const exported = names(dep, /export \{([^{}]*?)\}/)
      .concat([...dep.matchAll(/export (?:const|function) (\w+)/g)].map((m) => m[1]));
    const imported = names(src, new RegExp('import \\{([^{}]*?)\\} from "\\./' + file.replace(".", "\\.") + '"'));
    eq(exported.length > 0, true, `found the export list of ${file}`);
    for (const name of exported)
      // \b treats "-" as a boundary, so a CSS class like .kd-seg reads as a
      // reference to the export `seg`. Exclude hyphens on both sides.
      if (!own.has(name) && ![...own].some((k) => k.startsWith(name + "@")) &&
          new RegExp(`(?<![\\w.-])${name}(?![\\w-])`).test(code))
        eq(imported.includes(name), true, `${view} references ${name} but does not import it from ${file}`);
  }
}

/* ---------------- reference charts ---------------- */
group("reference charts");
/* Kana, the reading separator and the long mark, nothing else. A kanji left in a
   reading slot renders as garbage romaji, and a matrix row one cell short shifts
   every reading after it under the wrong column heading — the two mistakes a
   table this size hides best. */
const KANA_ONLY = /^[ぁ-んァ-ヺ・ー]+$/;
eq(new Set(CHARTS.map((c) => c.title)).size, CHARTS.length, "chart titles are unique — they are React keys");
eq(CHARTS.every((c) => GROUPS.includes(c.group)), true, "every chart names a subject the tab row will show");
/* The view filters CHARTS by subject, so a group split across two stretches of
   the array would reorder that tab's charts and strand the notes that say
   "above" and "below". */
eq(CHARTS.map((c) => c.group).filter((g, i, a) => g !== a[i - 1]).length, GROUPS.length,
   "each subject's charts sit together in CHARTS");
for (const c of CHARTS) {
  eq(!!(c.title && c.jp && c.note), true, `${c.title || "(untitled)"} has a title, a JP label and a note`);
  const keys = c.cols ? c.rows.map((r) => r.k) : c.rows.map((r) => r[0]);
  eq(new Set(keys).size, keys.length, `${c.title} · row keys are unique`);
  if (c.cols) for (const r of c.rows) eq(r.cells.length, c.cols.length, `${c.title} · row ${r.k} has one cell per column`);
  else for (const r of c.rows) eq(r.length, 3, `${c.title} · row ${r[0]} is [kanji, reading, gloss]`);
  const readings = c.cols
    ? c.rows.flatMap((r) => r.cells.map((raw) => [r.k, raw]))
    : c.rows.map((r) => [r[0], r[1]]);
  for (const [label, raw] of readings) {
    const { kana } = cell(raw);
    eq(KANA_ONLY.test(kana), true, `${c.title} · ${label} · "${kana}" is kana only`);
    eq(/[ぁ-んァ-ヺ]/.test(chartRomaji(kana)), false, `${c.title} · ${label} · "${kana}" transliterates fully`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
