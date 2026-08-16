/* What the learner has chosen to see. Pure policy: no React, no storage, no DOM,
   so every rule below is reachable from test/engine.test.mjs. */
import { conjugate, TYPES, MODS } from "./engine.js";

export const JLPT = ["N5", "N4", "N3", "N2", "N1"];

/* How the Japanese is written. Lives here rather than in App.jsx because the
   control moved into Settings, and Settings must not import from App. The hint
   rides on the entry so the tooltip travels with the option. */
export const SCRIPTS = [
  { id: "furigana", label: "漢字＋かな", hint: "Kanji with the reading above it" },
  { id: "kanji", label: "漢字", hint: "Kanji only, no reading" },
  { id: "kana", label: "かな", hint: "Kana only, no kanji" },
];

/* One representative per word class, so the settings panel can list every form that
   exists with no word selected. SEED has no noun, hence 学生. */
const REPS = [
  { word: "行く", reading: "いく", type: "godan" },
  { word: "食べる", reading: "たべる", type: "ichidan" },
  { word: "勉強する", reading: "べんきょうする", type: "suru" },
  { word: "来る", reading: "くる", type: "kuru" },
  { word: "高い", reading: "たかい", type: "i-adj" },
  { word: "静か", reading: "しずか", type: "na-adj" },
  { word: "学生", reading: "がくせい", type: "noun" },
];

const VERB_TYPES = ["godan", "ichidan", "suru", "kuru"];

/** Every form the app can render, deduped by id. Ids recur across word classes
 *  (dict, te, ta, nai, desu), which is why one flat list covers all of them. */
export function allForms() {
  const out = [];
  const seen = new Set();
  for (const w of REPS)
    for (const f of conjugate(w))
      if (!seen.has(f.id)) {
        seen.add(f.id);
        out.push({ id: f.id, label: f.label, jp: f.jp, group: f.group });
      }
  return out;
}

const idsFor = (types) => {
  const seen = new Set();
  for (const w of REPS) if (types.includes(w.type)) for (const f of conjugate(w)) seen.add(f.id);
  return [...seen];
};

const ALL_TYPES = TYPES.map((t) => t.id);
const ALL_MOD_IDS = MODS.map((m) => m.id);

/* Content only — never commonOnly, never show. */
export const PRESETS = {
  Beginner: {
    formIds: ["dict", "nai", "ta", "masu", "te"],
    modIds: ["neg", "past", "polite"],
    types: ALL_TYPES,
    jlpt: ["N5", "N4"],
  },
  "Verbs only": {
    formIds: idsFor(VERB_TYPES),
    modIds: ALL_MOD_IDS,
    types: VERB_TYPES,
    jlpt: JLPT,
  },
  Everything: {
    formIds: allForms().map((f) => f.id),
    modIds: ALL_MOD_IDS,
    types: ALL_TYPES,
    jlpt: JLPT,
  },
};

export const DEFAULTS = {
  ...PRESETS.Beginner,
  trans: ["trans", "intrans"],
  commonOnly: false,
  show: { romaji: true, glosses: true, ladder: true, audio: true, examples: true },
};

export const applyPreset = (name, settings) =>
  PRESETS[name] ? { ...settings, ...PRESETS[name] } : settings;

/** Shallow-merge a stored payload over DEFAULTS. A hand-edited or older payload
 *  must not be able to produce an undefined array and crash a .includes() call. */
export function mergeSettings(stored) {
  const s = stored && typeof stored === "object" ? stored : {};
  const arr = (v, d) => (Array.isArray(v) ? v : d);
  return {
    formIds: arr(s.formIds, DEFAULTS.formIds),
    modIds: arr(s.modIds, DEFAULTS.modIds),
    types: arr(s.types, DEFAULTS.types),
    jlpt: arr(s.jlpt, DEFAULTS.jlpt),
    trans: arr(s.trans, DEFAULTS.trans),
    commonOnly: typeof s.commonOnly === "boolean" ? s.commonOnly : DEFAULTS.commonOnly,
    show: { ...DEFAULTS.show, ...(s.show && typeof s.show === "object" ? s.show : {}) },
  };
}

export const visibleForms = (forms, settings) => forms.filter((f) => settings.formIds.includes(f.id));

export const visibleMods = (settings) => MODS.filter((m) => settings.modIds.includes(m.id));

/** Is this word inside the learner's chosen scope?
 *
 *  A word is NEVER hidden by a filter it has no data for. That is what lets an
 *  existing deck — which has none of these tags — keep working untouched, and it
 *  is why this feature needs no migration code. Tightening this into strict
 *  matching would silently empty somebody's deck. */
export function wordInScope(word, settings) {
  if (!settings.types.includes(word.type)) return false;
  if (word.jlpt && !settings.jlpt.includes(word.jlpt)) return false;
  const t = word.trans;
  if ((t === "trans" || t === "intrans") && !settings.trans.includes(t)) return false;
  if (settings.commonOnly && word.common === false) return false;
  return true;
}
