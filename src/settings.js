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
let ALL_FORMS = null;
export function allForms() {
  if (ALL_FORMS) return ALL_FORMS;
  const out = [];
  const seen = new Set();
  for (const w of REPS)
    for (const f of conjugate(w))
      if (!seen.has(f.id)) {
        seen.add(f.id);
        out.push({ id: f.id, label: f.label, jp: f.jp, group: f.group });
      }
  /* Fixed for the life of the process — it walks seven hard-coded representative
     words. SettingsView called it on every render. */
  return (ALL_FORMS = out);
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

/* The four keys a preset owns. Everything else in `settings` is a preference the
   learner set once and no preset may stomp. */
const CONTENT = ["formIds", "modIds", "types", "jlpt"];

export const PRESET_NAMES = [...Object.keys(PRESETS), "Custom"];

export const contentOf = (s) => Object.fromEntries(CONTENT.map((k) => [k, s[k]]));

/** Does this patch change what is being learnt (rather than how it looks)? */
export const isContentPatch = (patch) => CONTENT.some((k) => k in patch);

/** Set-equal on all four content lists — toggling a chip off and on again reorders
 *  the array, so order must not count as a difference. */
export const sameContent = (a, b) =>
  CONTENT.every((k) => a[k].length === b[k].length && a[k].every((v) => b[k].includes(v)));

export const DEFAULTS = {
  ...PRESETS.Beginner,
  trans: ["trans", "intrans"],
  commonOnly: false,
  show: { romaji: true, glosses: true, ladder: true, audio: true, examples: true },
  preset: "Beginner",
  /* The Custom slot: the learner's own saved content, Beginner until overridden. */
  custom: { ...PRESETS.Beginner },
};

export const applyPreset = (name, settings) =>
  name === "Custom" ? { ...settings, ...settings.custom, preset: "Custom" }
  : PRESETS[name] ? { ...settings, ...PRESETS[name], preset: name }
  : settings;

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
    preset: PRESET_NAMES.includes(s.preset) ? s.preset : DEFAULTS.preset,
    custom: Object.fromEntries(CONTENT.map((k) => [k, arr(s.custom?.[k], DEFAULTS.custom[k])])),
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
