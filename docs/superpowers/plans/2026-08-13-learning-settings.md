# Learning Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a SETTINGS tab that controls which conjugation forms, stack modifiers, word classes, vocabulary (by JLPT / transitivity / frequency) and display elements the app shows, so a learner can quiet the 19-forms-per-verb firehose.

**Architecture:** A new pure module `src/settings.js` owns the settings shape, three presets, and four filter functions. `src/SettingsView.jsx` renders the panel. `src/App.jsx` holds the state, persists it beside `script`, and applies the filters at each render site. `src/engine.js` is untouched except for metadata on `SEED`.

**Tech Stack:** React 18, Vite 5, plain ES modules. No test framework — `test/engine.test.mjs` is a hand-rolled runner using an `eq(got, want, label)` helper, run via `npm test`.

## Global Constraints

- **This project is not a git repository.** There is nothing to commit to. Every task therefore ends with `npm test` green plus, where the change is visible, a browser check — not a commit. Do not run `git init` unless the user asks.
- **No new dependencies.** Everything here is plain JS, React, and the existing `lucide-react` icons.
- **Tests only cover pure modules.** `App.jsx` and `SettingsView.jsx` are JSX and cannot be imported by the Node runner. Their behaviour is verified in the browser at `http://localhost:5173` (start with `npm run dev` if it is not already running).
- **Test style is fixed.** Add assertions with the existing helpers in `test/engine.test.mjs`: `eq(got, want, label)`, `group(name)`, `W(word, reading, type)`. No `describe`/`it`, no vitest, no assert library.
- **Insert new test groups immediately before the `/* ---------------- module wiring ---------------- */` comment**, so the wiring check stays last and the `pass`/`fail` summary stays at the very end of the file.
- **The unknown rule is load-bearing:** a word is never hidden by a filter it has no data for. It exists so an already-saved deck keeps working with zero migration code. Do not "improve" it into strict matching.
- Settings values persist under the localStorage key `kotoba-settings-v1`.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/settings.js` | create | Settings shape, `DEFAULTS`, `PRESETS`, and the four pure filter functions. Imports from `engine.js`; imports no React. |
| `src/SettingsView.jsx` | create | The settings panel. Props `{ settings, onChange, wordCount, formCount }`. No storage access, no filtering logic. |
| `src/storage.js` | modify | Add the `GKEY` constant for the settings key. |
| `src/engine.js` | modify | Metadata tags on the 7 `SEED` words. Nothing else. |
| `src/api.js` | modify | Lookup returns the 3 tags; add an exported pure `tagsFromLookup` validator. |
| `src/App.jsx` | modify | Settings state + persistence, third nav tab, and filters applied at each render site. |
| `test/engine.test.mjs` | modify | New `learning settings` group; wiring check extended to `settings.js`. |

---

## Task 1: Settings module — shape, presets, merge

**Files:**
- Create: `src/settings.js`
- Modify: `src/storage.js` (add `GKEY`)
- Test: `test/engine.test.mjs`

**Interfaces:**
- Consumes: `conjugate`, `TYPES`, `MODS` from `./engine.js` (all already exported).
- Produces: `JLPT` (string[]), `PRESETS` (object keyed by preset name), `DEFAULTS` (settings object), `applyPreset(name, settings) -> settings`, `mergeSettings(stored) -> settings`, `allForms() -> {id,label,jp,group}[]`. Later tasks rely on these exact names.

- [ ] **Step 1: Add the storage key**

In `src/storage.js`, after the `SKEY` line:

```js
export const GKEY = "kotoba-settings-v1";
```

- [ ] **Step 2: Write the failing tests**

In `test/engine.test.mjs`, add to the import block at the top:

```js
import { DEFAULTS, PRESETS, applyPreset, mergeSettings } from "../src/settings.js";
```

Then insert this group immediately before the `/* ---------------- module wiring ---------------- */` comment:

```js
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/settings.js'`

- [ ] **Step 4: Write `src/settings.js`**

```js
/* What the learner has chosen to see. Pure policy: no React, no storage, no DOM,
   so every rule below is reachable from test/engine.test.mjs. */
import { conjugate, TYPES, MODS } from "./engine.js";

export const JLPT = ["N5", "N4", "N3", "N2", "N1"];

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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, and the total count rises from 61 to 73.

---

## Task 2: `allForms()` covers every class

**Files:**
- Test: `test/engine.test.mjs`

**Interfaces:**
- Consumes: `allForms` from Task 1.
- Produces: nothing new. This task only proves Task 1's `allForms` is complete enough to build the UI from.

- [ ] **Step 1: Write the failing tests**

Extend the import from `../src/settings.js` to include `allForms`, then append to the `learning settings` group:

```js
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
```

- [ ] **Step 2: Run the tests**

Run: `npm test`
Expected: PASS immediately — Task 1's implementation already satisfies these. If any id is missing, the bug is in `REPS` (a word class has no representative) or in `engine.js`, not in the test.

---

## Task 3: The filters — `visibleForms`, `visibleMods`, `wordInScope`

**Files:**
- Modify: `src/settings.js`
- Test: `test/engine.test.mjs`

**Interfaces:**
- Consumes: `DEFAULTS` from Task 1.
- Produces: `visibleForms(forms, settings) -> forms[]`, `visibleMods(settings) -> MODS[]`, `wordInScope(word, settings) -> boolean`. Tasks 5–10 call all three.

- [ ] **Step 1: Write the failing tests**

Extend the `../src/settings.js` import to include `visibleForms`, `visibleMods`, `wordInScope`, then append to the `learning settings` group:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `visibleForms is not a function` (the import resolves but the binding is undefined).

- [ ] **Step 3: Implement the three functions**

Append to `src/settings.js`:

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, total rises to roughly 106.

---

## Task 4: Tag the seed words, and prove no preset blanks the UI

**Files:**
- Modify: `src/engine.js` (the `SEED` array only)
- Test: `test/engine.test.mjs`

**Interfaces:**
- Consumes: `SEED` (already exported from `engine.js`), `PRESETS`, `visibleForms`, `wordInScope`.
- Produces: `SEED` entries gain optional `jlpt`, `trans`, `common` fields.

- [ ] **Step 1: Write the failing tests**

Extend the `../src/engine.js` import to include `SEED` and `TYPES`, then append to the `learning settings` group:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — "every seed word is tagged" gets `false`.

- [ ] **Step 3: Tag `SEED`**

In `src/engine.js`, replace the `SEED` array with:

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Confirm the existing suite still passes**

Run: `npm test`
Expected: the original 40 engine assertions and the wiring check are all still green. `SEED` gained fields but changed no readings or types, so no conjugation assertion should move.

---

## Task 5: Settings state and persistence in App.jsx

**Files:**
- Modify: `src/App.jsx` (imports, state, load/save effects)
- Test: `test/engine.test.mjs` (extend the wiring check)

**Interfaces:**
- Consumes: `mergeSettings`, `DEFAULTS` from `settings.js`; `GKEY` from `storage.js`.
- Produces: `settings` state and a `setSettings` updater inside `App`, available to every later task. No UI yet.

- [ ] **Step 1: Extend the wiring check to cover settings.js**

The check added when `GODAN` went missing only inspects `engine.js`. `settings.js` is now a second module `App.jsx` imports from, and it needs the same protection. In `test/engine.test.mjs`, inside the `module wiring` group, replace the three lines starting `const exported =` with:

```js
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
    if (new RegExp(`\\b${name}\\b`).test(appCode))
      eq(imported.includes(name), true, `App.jsx references ${name} but does not import it from ${file}`);
}
```

Note `settings.js` uses `export const` / `export function` rather than one trailing `export {}` block, which is why the exported list is built from both patterns.

- [ ] **Step 2: Run the tests**

Run: `npm test`
Expected: PASS. `settings.js` exports nothing that `App.jsx` references yet, so the new loop finds nothing to complain about.

- [ ] **Step 3: Add the import to App.jsx**

After the existing `import { ... } from "./engine.js";` block, add:

```js
import { DEFAULTS, mergeSettings, visibleForms, visibleMods, wordInScope, allForms, PRESETS, applyPreset, JLPT } from "./settings.js";
```

And change the `storage.js` import line to:

```js
import { storage, KEY, SKEY, GKEY } from "./storage.js";
```

- [ ] **Step 4: Add the state**

In `App`, next to `const [script, setScript] = useState("furigana");` (around line 945), add:

```js
const [settings, setSettings] = useState(DEFAULTS);
```

- [ ] **Step 5: Load on mount**

The existing mount effect reads `KEY` then `SKEY` in a `try`/`catch` per key. Add a third block in the same shape, immediately after the `SKEY` block:

```js
try {
  const g = await storage.get(GKEY);
  setSettings(mergeSettings(JSON.parse(g.value)));
} catch { /* first run — DEFAULTS stand */ }
```

- [ ] **Step 6: Save on change**

Mirror the existing `script` save effect:

```js
useEffect(() => {
  if (!ready) return;
  (async () => {
    try { await storage.set(GKEY, JSON.stringify(settings)); } catch { /* session-only */ }
  })();
}, [settings, ready]);
```

- [ ] **Step 7: Verify persistence in the browser**

Run `npm run dev` if needed, open `http://localhost:5173`, then in the devtools console:

```js
localStorage.getItem("kotoba-settings-v1")
```

Expected: a JSON string containing `"formIds"` with the five Beginner ids. The app must look and behave exactly as before — nothing is gated yet.

- [ ] **Step 8: Run the tests**

Run: `npm test`
Expected: PASS. The wiring check now sees `settings.js` names in `App.jsx` and confirms each is imported.

---

## Task 6: The SETTINGS panel and its nav tab

**Files:**
- Create: `src/SettingsView.jsx`
- Modify: `src/App.jsx` (nav button, view branch)

**Interfaces:**
- Consumes: `settings` / `setSettings` from Task 5; `allForms`, `PRESETS`, `applyPreset`, `JLPT` from `settings.js`; `TYPES`, `MODS`, `GROUPS`, `typeLabel` from `engine.js`; `C`, `MONO` from `theme.js`.
- Produces: default export `SettingsView({ settings, onChange, wordCount, formCount })`.

- [ ] **Step 1: Write `src/SettingsView.jsx`**

```jsx
import { C, MONO } from "./theme.js";
import { TYPES, MODS, GROUPS, typeLabel } from "./engine.js";
import { allForms, PRESETS, applyPreset, JLPT } from "./settings.js";

const micro = { fontFamily: MONO, fontSize: 9, letterSpacing: ".2em", textTransform: "uppercase", color: C.muted };

function Chip({ on, onClick, accent = C.aux, children }) {
  return (
    <button className="kd-btn kd-form-chip" onClick={onClick}
      style={{
        border: "1px solid " + (on ? accent : C.rule),
        background: on ? accent : "transparent",
        color: on ? C.panel : C.ink,
        padding: "6px 9px", fontSize: 11.5, textAlign: "left",
      }}>{children}</button>
  );
}

function Section({ label, onAll, onNone, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
        <span style={micro}>{label}</span>
        <span style={{ flex: 1, height: 1, background: C.rule }} />
        {onAll && (
          <button className="kd-btn" onClick={onAll} style={{ ...micro, fontSize: 8.5, color: C.aux }}>ALL</button>
        )}
        {onNone && (
          <button className="kd-btn" onClick={onNone} style={{ ...micro, fontSize: 8.5, color: C.aux }}>NONE</button>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>{children}</div>
    </div>
  );
}

export default function SettingsView({ settings, onChange, wordCount, formCount }) {
  const set = (patch) => onChange({ ...settings, ...patch });
  const toggle = (key, id) =>
    set({ [key]: settings[key].includes(id) ? settings[key].filter((x) => x !== id) : [...settings[key], id] });
  const forms = allForms();

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "18px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={micro}>Preset</span>
        {Object.keys(PRESETS).map((name) => (
          <button key={name} className="kd-btn kd-form-chip" onClick={() => onChange(applyPreset(name, settings))}
            style={{ border: "1px solid " + C.ink, background: "transparent", color: C.ink, padding: "6px 11px", fontSize: 11.5 }}>
            {name}
          </button>
        ))}
        <span style={{ ...micro, marginLeft: "auto", color: C.stem }}>
          {wordCount} words · {formCount} forms
        </span>
      </div>

      {GROUPS.map((grp) => {
        const items = forms.filter((f) => f.group === grp);
        if (!items.length) return null;
        const ids = items.map((f) => f.id);
        return (
          <Section key={grp} label={"Forms · " + grp}
            onAll={() => set({ formIds: [...new Set([...settings.formIds, ...ids])] })}
            onNone={() => set({ formIds: settings.formIds.filter((id) => !ids.includes(id)) })}>
            {items.map((f) => (
              <Chip key={f.id} on={settings.formIds.includes(f.id)} onClick={() => toggle("formIds", f.id)}>
                {f.label}
                <span style={{ fontFamily: MONO, fontSize: 8.5, marginLeft: 5, opacity: .7 }}>{f.jp}</span>
              </Chip>
            ))}
          </Section>
        );
      })}

      <Section label="Stack modifiers"
        onAll={() => set({ modIds: MODS.map((m) => m.id) })}
        onNone={() => set({ modIds: [] })}>
        {MODS.map((m) => (
          <Chip key={m.id} on={settings.modIds.includes(m.id)} onClick={() => toggle("modIds", m.id)}>
            {m.label}
            <span style={{ fontFamily: MONO, fontSize: 8.5, marginLeft: 5, opacity: .7 }}>{m.jp}</span>
          </Chip>
        ))}
      </Section>

      <Section label="Word classes"
        onAll={() => set({ types: TYPES.map((t) => t.id) })}
        onNone={() => set({ types: [] })}>
        {TYPES.map((t) => (
          <Chip key={t.id} on={settings.types.includes(t.id)} onClick={() => toggle("types", t.id)}>
            {t.label}
            <span style={{ fontFamily: MONO, fontSize: 8.5, marginLeft: 5, opacity: .7 }}>{typeLabel(t.id)}</span>
          </Chip>
        ))}
      </Section>

      <Section label="Word scope">
        {JLPT.map((lv) => (
          <Chip key={lv} on={settings.jlpt.includes(lv)} onClick={() => toggle("jlpt", lv)}>{lv}</Chip>
        ))}
        <span style={{ width: 14 }} />
        <Chip on={settings.trans.includes("trans")} onClick={() => toggle("trans", "trans")}>他動詞</Chip>
        <Chip on={settings.trans.includes("intrans")} onClick={() => toggle("trans", "intrans")}>自動詞</Chip>
        <span style={{ width: 14 }} />
        <Chip accent={C.stem} on={settings.commonOnly} onClick={() => set({ commonOnly: !settings.commonOnly })}>
          Common words only
        </Chip>
      </Section>

      <Section label="Display">
        {[["romaji", "Romaji"], ["glosses", "Morpheme glosses"], ["ladder", "五段 ladder"],
          ["audio", "Audio buttons"], ["examples", "Example sentences"]].map(([k, label]) => (
          <Chip key={k} accent={C.extra} on={settings.show[k]}
            onClick={() => set({ show: { ...settings.show, [k]: !settings.show[k] } })}>{label}</Chip>
        ))}
      </Section>

      <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.6, borderTop: "1px solid " + C.ruleSoft, paddingTop: 12 }}>
        Word scope only filters words that carry the matching tag. A word with no JLPT level,
        no transitivity or no frequency is never hidden, so nothing you have already added
        can disappear here.
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the nav button in App.jsx**

The header nav renders DECK and QUIZ buttons from the `view` state. Add a third entry so the list reads `[["deck","Deck"],["quiz","Quiz"],["settings","Settings"]]` — match the existing button markup exactly, including `className` and the active/inactive style branches. Do not restyle the existing two.

- [ ] **Step 3: Import and branch on the new view**

Add near the other component imports:

```js
import SettingsView from "./SettingsView.jsx";
```

The deck markup is wrapped in `{view === "deck" && ( ... )}` and the quiz in its own branch. Add a third sibling branch:

```jsx
{view === "settings" && (
  <SettingsView
    settings={settings}
    onChange={setSettings}
    wordCount={scopedWords.length}
    formCount={settings.formIds.length}
  />
)}
```

`scopedWords` does not exist yet — for this task pass `words.length`, and Task 8 swaps it to `scopedWords.length` when it creates that value.

- [ ] **Step 4: Verify in the browser**

Reload `http://localhost:5173`, click **SETTINGS**. Expected: the preset row, four `FORMS ·` sections, stack modifiers, word classes, word scope, display, and the explanatory footnote. Five form chips are lit (Dictionary, Negative, Past, Polite, て-form); three modifiers; all 7 classes; N5 and N4; both transitivity chips; all five display chips.

Click **Everything**: every form chip lights. Click **Beginner**: back to five. Reload the page: the last preset you chose is still applied.

Check the console for errors — expected: none. If the screen goes white, read the stack trace before changing anything; that is how the `GODAN` bug presented.

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS, unchanged count. This task adds no pure logic.

---

## Task 7: Gate the study view

**Files:**
- Modify: `src/App.jsx` (form ladder, featured form, `Ladder`, `Strip`, `Say`, `ExamplesPanel` call sites)

**Interfaces:**
- Consumes: `visibleForms`, `settings` from earlier tasks.
- Produces: no new exports. `Strip` gains two optional props, `Say` gains one.

- [ ] **Step 1: Filter the form list**

At `src/App.jsx:1014` the study view computes `const forms = useMemo(() => conjugate(selected), [selected]);`. Add a filtered value directly below it:

```js
const shown = useMemo(() => visibleForms(forms, settings), [forms, settings]);
```

- [ ] **Step 2: Point the existing fallback at the filtered list**

Lines 1018 and 1021 already handle "the selected form does not exist for this word". Reuse that mechanism rather than adding a second one — change `forms` to `shown` in both:

```js
if (shown.length && !shown.some((f) => f.id === formId)) setFormId(shown[0].id);
```
```js
const form = shown.find((f) => f.id === formId) || shown[0] || null;
```

Add `shown` to the effect's dependency array. This is the whole of the "featured form was hidden" edge case.

- [ ] **Step 3: Render the filtered list in the ladder**

At line 1569–1570 the ladder maps `GROUPS` and filters `forms` per group. Change `forms.filter((f) => f.group === grp)` to `shown.filter((f) => f.group === grp)`.

- [ ] **Step 4: Add the empty state**

Immediately after the closing `</div>` of the form-ladder grid (around line 1605), add a sibling:

```jsx
{shown.length === 0 && (
  <div style={{ fontSize: 12.5, color: C.muted, border: "1px dashed " + C.rule, padding: "14px 16px" }}>
    No forms enabled. Turn some on in Settings.
  </div>
)}
```

- [ ] **Step 5: Gate the 五段 ladder**

At line 1533 the condition is `godanRow && ladderActive`. Make it `settings.show.ladder && godanRow && ladderActive`.

- [ ] **Step 6: Gate romaji and glosses**

`Strip` renders the romaji transliteration and the gloss tag under each tile. Add two props with backwards-compatible defaults to its signature:

```jsx
function Strip({ segs, script, size = "clamp(21px, 6.4vw, 32px)", ruby = "clamp(8px, 2.2vw, 11px)", onPick, activeIdx, romaji: showRomaji = true, glosses: showGlosses = true }) {
```

Wrap the romaji line in `{showRomaji && ( ... )}` and the gloss tag in `{showGlosses && ( ... )}`. Then at each `<Strip ... />` call site in the study view, stack panel and quiz reveal, pass `romaji={settings.show.romaji}` and `glosses={settings.show.glosses}`. `StackPanel` and `Quiz` do not receive `settings` yet — add a `settings` prop to each and pass it down from `App`.

- [ ] **Step 7: Gate audio**

`Say` returns `null` when `!text`. Add a prop and extend that guard:

```jsx
function Say({ text, size = 13, color = C.muted, label = "Play", enabled = true }) {
  if (!text || !enabled) return null;
```

Pass `enabled={settings.show.audio}` at each `<Say ... />` call site.

- [ ] **Step 8: Gate the examples panel**

At line 1565, wrap the element:

```jsx
{settings.show.examples && <ExamplesPanel word={selected} script={script} onSave={saveExamples} />}
```

- [ ] **Step 9: Verify in the browser**

With Beginner active, open the deck and select 行く. Expected: the form ladder shows exactly 5 chips — Dictionary, Negative, Past under PLAIN, Polite under POLITE, て-form under CONNECTIVE. No DERIVED heading at all, since none of its ids are enabled.

Then in SETTINGS turn off Polite, return to the deck: the featured form must switch to another visible form rather than blanking. Turn off all five form chips: the study view shows "No forms enabled." and does not crash. Turn the 五段 ladder off, click き on a godan verb: the gloss appears, the ladder does not. Turn Romaji off: `ikimasu` disappears; Glosses off: the `ROOT`/`STEM.i` tags disappear; Audio off: the speaker buttons disappear; Examples off: the 例文 panel disappears.

- [ ] **Step 10: Run the tests**

Run: `npm test`
Expected: PASS, unchanged count.

---

## Task 8: Gate the deck list and word classes

**Files:**
- Modify: `src/App.jsx` (deck list, word-class row, `SettingsView` props)

**Interfaces:**
- Consumes: `wordInScope`, `settings`.
- Produces: `scopedWords` inside `App`, consumed by Task 10.

- [ ] **Step 1: Compute the scoped list**

Next to the existing filtered-by-search value in `App`, add:

```js
const scopedWords = useMemo(() => words.filter((w) => wordInScope(w, settings)), [words, settings]);
```

Use `scopedWords` wherever the deck list currently maps `words`, keeping the existing `query` search filter composed on top of it.

- [ ] **Step 2: Add the out-of-scope empty state**

The deck already handles an empty deck and empty search results. Add a third case, distinct from both:

```jsx
{words.length > 0 && scopedWords.length === 0 && (
  <div style={{ fontSize: 12.5, color: C.muted, border: "1px dashed " + C.rule, padding: "14px 16px" }}>
    No words match your current scope. Widen it in Settings.
  </div>
)}
```

- [ ] **Step 3: Filter the word-class buttons**

The study view renders a row of 7 class buttons (GODAN, ICHIDAN, する VERB, 来る, い-ADJECTIVE, な-ADJECTIVE, NOUN) from `TYPES`. Filter it to `TYPES.filter((t) => settings.types.includes(t.id))`. Leave the currently-selected word's own class visible even when disabled, so a word cannot become uneditable:

```js
const classChoices = TYPES.filter((t) => settings.types.includes(t.id) || t.id === selected?.type);
```

- [ ] **Step 4: Fix the SettingsView word count**

Change `wordCount={words.length}` from Task 6 Step 3 to `wordCount={scopedWords.length}`.

- [ ] **Step 5: Verify in the browser**

In SETTINGS turn off な-ADJECTIVE. The deck drops from 7 entries to 6 — 静か disappears, the count in the header updates, and the live count in SETTINGS reads `6 words`. Turn off every word class: the deck shows "No words match your current scope." Turn them back on.

Set JLPT to N3 only. All 7 seed words are tagged N5, so the deck empties — the same message appears. Now add a word manually without touching the new dropdowns and confirm it stays visible under an N3-only filter: that is the unknown rule working.

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: PASS, unchanged count.

---

## Task 9: Gate the stack builder

**Files:**
- Modify: `src/App.jsx` (`StackPanel`)

**Interfaces:**
- Consumes: `visibleMods`, `settings` (the `settings` prop added to `StackPanel` in Task 7 Step 6).
- Produces: nothing new.

- [ ] **Step 1: Filter the modifier buttons**

`StackPanel` maps `MODS` to render the "ADD · CURRENTLY GODAN" button row. Replace that with `visibleMods(settings)`. Leave the `from`/`to` class gating exactly as it is — it is what makes ます visibly close a chain, and it is orthogonal to this filter.

- [ ] **Step 2: Handle every modifier being disabled**

If `visibleMods(settings)` is empty, render in place of the button row:

```jsx
<div style={{ fontSize: 12, color: C.muted }}>No stack modifiers enabled. Turn some on in Settings.</div>
```

- [ ] **Step 3: Verify in the browser**

With Beginner active, the stack builder offers exactly three modifiers: Negative, Past, Polite. Chain Negative then Past on 行く and confirm 行かなかった builds with its morphemes glossed. In SETTINGS press "Verbs only" and confirm all nine modifiers return, then rebuild 行かせられたくなかった as before. Turn all nine off and confirm the message appears instead of an empty row.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS, unchanged count.

---

## Task 10: Quiz integration

**Files:**
- Modify: `src/App.jsx` (`Quiz` props, `available`, the Start button)

**Interfaces:**
- Consumes: `scopedWords` from Task 8, `settings`.
- Produces: nothing new.

- [ ] **Step 1: Pass scoped words into the quiz**

The quiz branch renders `<Quiz words={words} ... />`. Change it to `words={scopedWords}`. `Quiz` seeds `picked` from `words` in a `useState` initialiser, so no change inside `Quiz` is needed for this.

- [ ] **Step 2: Intersect the drill pool with the global settings**

Inside `Quiz`, the `available` value collects the forms of the picked words. Filter it by the global pool so a form hidden everywhere else cannot be drilled:

```js
const available = allAvailable.filter((f) => settings.formIds.includes(f.id));
```

Keep the existing per-form counts. `Quiz` already receives `settings` from Task 7 Step 6.

- [ ] **Step 3: Drop hidden ids from the per-run selection**

`formIds` inside `Quiz` defaults to `["masu","te","ta","nai"]`, which can name forms the settings have hidden. Add an effect that prunes it:

```js
useEffect(() => {
  setFormIds((ids) => ids.filter((id) => settings.formIds.includes(id)));
}, [settings.formIds]);
```

- [ ] **Step 4: Explain a disabled Start**

The Start button is already disabled when `total === 0`. Add a reason beside it so the state is not mysterious:

```jsx
{available.length === 0 && (
  <div style={{ fontSize: 11.5, color: C.muted, marginTop: 8 }}>
    No forms available. Enable some in Settings, or pick more words.
  </div>
)}
```

- [ ] **Step 5: Verify in the browser**

With Beginner active, open QUIZ. "Forms to drill" offers only the five enabled forms; the four default selections have been pruned to those that survive. Start a 10-question run, answer one correctly by typing romaji, and confirm the tally and the morpheme reveal still work.

In SETTINGS turn off every form, return to QUIZ: Start is disabled and the reason is shown. Turn off な-ADJECTIVE and confirm 静か is absent from the quiz word list.

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: PASS, unchanged count.

---

## Task 11: Tag entry — add-word dropdowns and API pre-fill

**Files:**
- Modify: `src/api.js` (prompt + a new exported validator)
- Modify: `src/App.jsx` (add-word form, `draft` state, lookup result handling)
- Test: `test/engine.test.mjs`

**Interfaces:**
- Consumes: `JLPT` from `settings.js`.
- Produces: `tagsFromLookup(raw) -> { jlpt?, trans?, common? }` exported from `api.js`.

- [ ] **Step 1: Write the failing tests**

Add to the imports in `test/engine.test.mjs`:

```js
import { tagsFromLookup } from "../src/api.js";
```

Append to the `learning settings` group:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `tagsFromLookup is not a function`.

**Note:** importing `api.js` from the Node test runner touches `import.meta.env`, which Vite provides but plain Node does not. If the run fails with a `TypeError` on `import.meta.env` rather than the expected assertion failure, change the `API_KEY` line in `api.js` to `const API_KEY = import.meta.env?.VITE_ANTHROPIC_API_KEY;` — an optional chain that is correct under both Vite and Node.

- [ ] **Step 3: Implement the validator**

Add to `src/api.js`:

```js
const TRANS = { transitive: "trans", intransitive: "intrans", "n/a": "na" };

/** Keep only values we recognise. An unrecognised tag is dropped rather than stored,
 *  because an absent tag is never used to hide a word but a wrong one would be. */
export function tagsFromLookup(raw) {
  const c = raw && typeof raw === "object" ? raw : {};
  const out = {};
  if (["N5", "N4", "N3", "N2", "N1"].includes(c.jlpt)) out.jlpt = c.jlpt;
  if (TRANS[c.transitivity]) out.trans = TRANS[c.transitivity];
  if (typeof c.common === "boolean") out.common = c.common;
  return out;
}
```

- [ ] **Step 4: Extend the lookup prompt**

In `LOOKUP_PROMPT`, add to the JSON example and the rules:

```
- jlpt: the JLPT level, exactly one of N5, N4, N3, N2, N1 — omit if unsure
- transitivity: exactly one of transitive, intransitive, n/a (use n/a for adjectives and nouns) — omit if unsure
- common: true if the word is in everyday use, false if rare or literary
```

In `lookupWord`, spread the validated tags onto each candidate:

```js
return (parsed.candidates || [])
  .filter((c) => c && c.word && c.reading && TYPES.some((t) => t.id === c.type))
  .slice(0, 3)
  .map((c) => ({ ...c, ...tagsFromLookup(c) }));
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Add the dropdowns**

`draft` state is `{ word, reading, meaning, type, typeTouched }`. Extend it with `jlpt: "", trans: "", common: null`, and reset those three wherever `draft` is reset.

In the add-word form, below the word-class row, add three controls styled like the existing inputs:

```jsx
<select value={draft.jlpt} onChange={(e) => setDraft({ ...draft, jlpt: e.target.value })}>
  <option value="">JLPT —</option>
  {JLPT.map((lv) => <option key={lv} value={lv}>{lv}</option>)}
</select>
<select value={draft.trans} onChange={(e) => setDraft({ ...draft, trans: e.target.value })}>
  <option value="">Transitivity —</option>
  <option value="trans">他動詞 transitive</option>
  <option value="intrans">自動詞 intransitive</option>
  <option value="na">n/a</option>
</select>
<label style={{ fontSize: 11.5, color: C.muted, display: "flex", alignItems: "center", gap: 5 }}>
  <input type="checkbox" checked={draft.common === true}
    onChange={(e) => setDraft({ ...draft, common: e.target.checked ? true : null })} />
  Common
</label>
```

- [ ] **Step 7: Write the tags only when set**

Where the new word object is built on save, add the three fields only when they hold a value, so an untouched dropdown leaves the field absent and the unknown rule keeps applying:

```js
const tags = {};
if (draft.jlpt) tags.jlpt = draft.jlpt;
if (draft.trans) tags.trans = draft.trans;
if (draft.common !== null) tags.common = draft.common;
```

Spread `...tags` into the new word alongside `word`, `reading`, `meaning`, `type`.

- [ ] **Step 8: Pre-fill from a lookup hit**

Where a lookup candidate is accepted into `draft`, carry its tags across:

```js
setDraft({ ...draft, word: c.word, reading: c.reading, meaning: c.meaning, type: c.type, typeTouched: true,
           jlpt: c.jlpt || "", trans: c.trans || "", common: typeof c.common === "boolean" ? c.common : null });
```

- [ ] **Step 9: Verify in the browser**

Add a word leaving all three new controls untouched. In the console:

```js
JSON.parse(localStorage.getItem("kotoba-deck-v1")).at(-1)
```

Expected: no `jlpt`, `trans` or `common` keys at all. Set JLPT to N1 only in SETTINGS and confirm the new word still shows — the unknown rule.

Now add a second word with JLPT set to N3. With the filter on N1 only, that word is hidden; add N3 and it returns.

- [ ] **Step 10: Run the full suite**

Run: `npm test`
Expected: PASS, everything green.

---

## Self-Review

**Spec coverage:** settings shape → Task 1; `allForms` → Tasks 1–2; filters and the unknown rule → Task 3; `SEED` tags and the no-blank-preset guard → Task 4; persistence → Task 5; UI and presets → Task 6; the eleven gated surfaces → Tasks 7–10 (study view 7, deck and classes 8, stack builder 9, quiz 10); metadata entry and API pre-fill → Task 11; all five edge cases → Task 7 Steps 2/4, Task 8 Step 2, Task 9 Step 2, Task 10 Step 4, and `applyPreset` in Task 1. Every spec section maps to a task.

**Placeholders:** none. Every code step carries the code. The only deferred value is `wordCount` in Task 6 Step 3, which Task 8 Step 4 explicitly resolves.

**Type consistency:** `visibleForms(forms, settings)`, `visibleMods(settings)`, `wordInScope(word, settings)`, `mergeSettings(stored)`, `applyPreset(name, settings)`, `allForms()` and `tagsFromLookup(raw)` keep the same names and argument order in every task that mentions them. Settings keys are `formIds`, `modIds`, `types`, `jlpt`, `trans`, `commonOnly`, `show` throughout. Word tags are `jlpt`, `trans`, `common` — never `transitivity`, which is the API's wire name and is mapped by `tagsFromLookup`.

**Known risk, flagged:** Task 11 imports `api.js` into the Node test runner, which does not implement `import.meta.env`. Step 2 states the symptom and the one-line fix rather than leaving it to be discovered.
