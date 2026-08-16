/* Regression suite for the conjugation engine.
   No framework: node test/engine.test.mjs  (or: npm test)
   Every case here corresponds to a bug that actually occurred during
   development, so deleting one is how a fixed bug comes back. */
import { readFileSync } from "node:fs";
import {
  romaji, toKana, settleKana, conjugate, detectType,
  stackInit, stackApply, answerMatches, columns, formText, meaningItems,
  SEED, TYPES,
} from "../src/engine.js";
import { allForms, DEFAULTS, PRESETS, applyPreset, mergeSettings, visibleForms, visibleMods, wordInScope } from "../src/settings.js";
import { tagsFromLookup, candidateWithTags } from "../src/api.js";

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

// A partial or junk payload must never yield undefined arrays.
eq(mergeSettings({}).formIds.length, DEFAULTS.formIds.length, "empty stored object falls back to defaults");
eq(mergeSettings({ formIds: ["te"] }).formIds.join(","), "te", "stored value wins");
eq(mergeSettings({ formIds: ["te"] }).types.length, 7, "missing key falls back");
eq(mergeSettings(null).jlpt.length, 2, "null payload falls back");
eq(mergeSettings({ formIds: "nonsense" }).formIds.length, DEFAULTS.formIds.length, "non-array is rejected");
eq(mergeSettings({ show: { audio: false } }).show.glosses, true, "show is merged key-by-key, not replaced");

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

/* ---------------- module wiring ---------------- */
// GODAN was left out of App.jsx's import list when the single file was split, so
// tapping a godan stem unmounted the whole tree. Nothing that only calls the
// engine can see that, hence this static check on the import list itself.
group("module wiring");
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const decomment = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const names = (src, re) => (src.match(re)?.[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const appSrc = read("../src/App.jsx");
const appCode = decomment(appSrc);
const modules = [
  ["engine.js", /import \{([^{}]*?)\} from "\.\/engine\.js"/],
  ["settings.js", /import \{([^{}]*?)\} from "\.\/settings\.js"/],
];
for (const [file, importRe] of modules) {
  const exported = names(decomment(read("../src/" + file)), /export \{([^{}]*?)\}/)
    .concat([...decomment(read("../src/" + file)).matchAll(/export (?:const|function) (\w+)/g)].map((m) => m[1]));
  const imported = names(appSrc, importRe);
  eq(exported.length > 0, true, `found the export list of ${file}`);
  for (const name of exported)
    // \b treats "-" as a boundary, so a CSS class like .kd-seg reads as a
    // reference to the export `seg`. Exclude hyphens on both sides.
    if (new RegExp(`(?<![\\w-])${name}(?![\\w-])`).test(appCode))
      eq(imported.includes(name), true, `App.jsx references ${name} but does not import it from ${file}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
