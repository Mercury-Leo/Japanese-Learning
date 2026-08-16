# Quiz Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist per-(word, form) quiz outcomes across sessions and devices, and report accuracy grouped by grammar rule — so the app can say "ぬ・ぶ・む → んで: 41%" rather than only "you missed 飲んで".

**Architecture:** `engine.js` gains one pure grammar function, `teRule(word)`, which names the euphonic rule a godan verb's て-family forms use. A new pure module `src/stats.js` owns the storage shape, recording, merging and rollups, and composes `teRule` with `allForms()` into `ruleKey(word, formId)`. `src/App.jsx` holds the stats object beside `words` and persists it the same way. Three read-only surfaces consume it. Nothing about conjugation changes.

**Tech Stack:** React 18, Vite 5, plain ES modules. No test framework — `test/engine.test.mjs` is a hand-rolled runner using `eq(got, want, label)`, run via `npm test`.

## Global Constraints

- **No new dependencies.** Plain JS, React, and the existing `lucide-react` icons.
- **This IS a git repository** (branch `master`). Each task ends with a commit. *(The older `2026-08-13-learning-settings.md` plan says it is not a repo — that is stale, ignore it.)*
- **Tests only cover pure modules.** `App.jsx`, `ProgressView.jsx` and `SettingsView.jsx` are JSX and cannot be imported by the Node runner. Verify those in the browser at `http://localhost:5173` (`npm run dev`).
- **Test style is fixed.** Use the existing helpers in `test/engine.test.mjs`: `eq(got, want, label)`, `group(name)`, `W(word, reading, type)`. No `describe`/`it`, no vitest, no assert library.
- **Insert new test groups immediately before the `/* ---------------- module wiring ---------------- */` comment** (currently `test/engine.test.mjs:290`), so the wiring check stays last and the `pass`/`fail` summary stays at the end of the file.
- **New `engine.js` exports go in the trailing `export { … }` block** at `engine.js:733`, not as inline `export function`. `stats.js` uses inline `export`, matching `settings.js`.
- **Stats are keyed by `word + "|" + reading`, never by `wordId`.** `addWord` uses `"w" + Date.now()` and `readFile` mints `"i" + Math.random()…`, so ids are device-local and Import would strand id-keyed progress.
- **Never record from a `useEffect`.** The app renders under `<React.StrictMode>` (`main.jsx`), which double-invokes effects in development and would double-count every answer.
- Stats persist under the localStorage key `kotoba-stats-v1`.
- **Do not implement question weighting.** It is deliberately out of scope; see the spec's Non-goals.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/engine.js` | modify | Add `teRule(word)` — pure grammar, names the euphonic rule. Export it. Nothing else changes. |
| `src/stats.js` | create | Storage shape, `record`, `mergeStats`, `ruleKey`, and the rollups. Imports `engine.js` and `settings.js`; imports no React. |
| `src/storage.js` | modify | Add the `PKEY` constant. |
| `src/ProgressView.jsx` | create | The Progress screen. Props `{ stats, words }`. No storage access, no aggregation logic of its own. |
| `src/App.jsx` | modify | Stats state + persistence, `PROGRESS` nav item, wiring into Quiz / Vocab, and export/import. |
| `test/engine.test.mjs` | modify | New `te rules` and `quiz stats` groups; wiring check extended to `stats.js`. |

**Why `ruleKey` is split across two files.** The spec put it wholly in `engine.js`. It cannot be: the non-onbin fallback needs form display labels, which come from `allForms()` in `settings.js`, and `settings.js` already imports `engine.js`. So `engine.js` owns the grammar (`teRule`) and `stats.js` owns the composition (`ruleKey`). Import direction stays acyclic: `stats → settings → engine`, `stats → engine`.

---

## Task 1: `teRule` — naming the euphonic rule

**Files:**
- Modify: `src/engine.js` (new function; add to the `export {}` block at `engine.js:733`)
- Test: `test/engine.test.mjs`

**Interfaces:**
- Consumes: the module-private `ONBIN` map (`engine.js:137`) for the kana set. Nothing new.
- Produces: `teRule(word) -> { id, label, jp } | null`, where `word` is `{ word, reading, type }`. Returns `null` for anything that is not a godan verb. Task 2 depends on this exact name and shape.

- [ ] **Step 1: Write the failing tests**

In `test/engine.test.mjs`, add `teRule` to the `../src/engine.js` import list at the top, then insert this group immediately before the `/* ---------------- module wiring ---------------- */` comment:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `SyntaxError` on the import, because `teRule` is not exported yet.

- [ ] **Step 3: Implement `teRule`**

In `src/engine.js`, immediately after the `ONBIN` map (which ends at line 147) and before `const GROUPS = …`:

```js
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
```

- [ ] **Step 4: Export it**

In the `export { … }` block at `engine.js:733`, add `teRule,` after `stems,`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — 191 + 14 new engine assertions, 10 service worker, 0 failed.

- [ ] **Step 6: Commit**

```bash
git add src/engine.js test/engine.test.mjs
git commit -m "Name the euphonic rule behind each godan te-form"
```

---

## Task 2: `src/stats.js` — shape, recording, rollups

**Files:**
- Create: `src/stats.js`
- Modify: `src/storage.js` (add `PKEY`)
- Test: `test/engine.test.mjs`

**Interfaces:**
- Consumes: `teRule` from `./engine.js` (Task 1); `allForms` from `./settings.js` (already exported).
- Produces, all relied on by Tasks 3–7:
  - `EMPTY` — `{ version: 1, entries: {} }`
  - `MEANING` — the string `"meaning"`, the pseudo-form id
  - `wordKey(word) -> string`
  - `record(stats, word, formId, ok, now) -> stats` (pure, returns a new object)
  - `statFor(stats, word, formId) -> { n, ok, last, streak } | null`
  - `ruleKey(word, formId) -> { id, label, jp }`
  - `byRule(stats, words, minN = 1) -> [{ id, label, jp, n, ok, pct }]` ascending by `pct`
  - `wordAccuracy(stats, word) -> { n, ok }`
  - `totals(stats) -> { n, ok }`
  - `mergeStats(a, b) -> stats`

- [ ] **Step 1: Add the storage key**

In `src/storage.js`, after the `TKEY` line:

```js
export const PKEY = "kotoba-stats-v1";
```

- [ ] **Step 2: Write the failing tests**

In `test/engine.test.mjs`, add to the import block at the top:

```js
import { EMPTY, MEANING, wordKey, record, statFor, ruleKey, byRule, wordAccuracy, totals, mergeStats } from "../src/stats.js";
```

Then insert this group immediately before the `/* ---------------- module wiring ---------------- */` comment (after the `te rules` group from Task 1):

```js
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
eq(record(s, nomu, "te", false, 3000).streak, -2, "consecutive misses deepen the streak");
eq(record(record(s, nomu, "te", true, 3000), nomu, "te", true, 4000).streak, 2, "consecutive hits climb");
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

// per-word and overall
eq(wordAccuracy(r, asobu).n, 2, "word accuracy sums that word's forms");
eq(wordAccuracy(r, taberu).n, 0, "an undrilled word reports zero, not null");
eq(totals(r).n, 3, "totals count every attempt");

// merge on import
const a = record(EMPTY, nomu, "te", true, 1000);
const b = record(EMPTY, nomu, "te", false, 5000);
const m = mergeStats(a, b);
eq(statFor(m, nomu, "te").n, 2, "merge sums attempts");
eq(statFor(m, nomu, "te").ok, 1, "merge sums correct");
eq(statFor(m, nomu, "te").last, 5000, "merge takes the newer timestamp");
eq(statFor(m, nomu, "te").streak, 0, "two streaks cannot be combined, so merge resets");
eq(statFor(mergeStats(EMPTY, b), nomu, "te").n, 1, "merging into empty keeps the incoming row");
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` for `../src/stats.js`.

- [ ] **Step 4: Write `src/stats.js`**

```js
/* Bookkeeping for quiz outcomes. Pure policy: no React, no storage, no DOM, so
   every rule below is reachable from test/engine.test.mjs.

   Entries are keyed by `word|reading` and never by id. App.jsx mints ids with
   Date.now() and Import mints fresh ones with Math.random(), so id-keyed
   progress would be destroyed by the very operation the README prescribes for
   moving a deck onto a phone. `importWords` already dedups on this same pair. */
import { teRule } from "./engine.js";
import { allForms } from "./settings.js";

/** Meaning questions carry no formId, so they occupy a reserved pseudo-form. */
export const MEANING = "meaning";

export const EMPTY = { version: 1, entries: {} };

export const wordKey = (w) => w.word + "|" + w.reading;

/** Immutable: returns a new stats object, so React state updates stay honest. */
export function record(stats, word, formId, ok, now) {
  const k = wordKey(word);
  const prev = (stats.entries[k] || {})[formId];
  const streak = ok
    ? Math.max(0, prev ? prev.streak : 0) + 1
    : Math.min(0, prev ? prev.streak : 0) - 1;
  const next = {
    n: (prev ? prev.n : 0) + 1,
    ok: (prev ? prev.ok : 0) + (ok ? 1 : 0),
    last: now,
    streak,
  };
  return {
    ...stats,
    entries: { ...stats.entries, [k]: { ...stats.entries[k], [formId]: next } },
  };
}

export function statFor(stats, word, formId) {
  const row = stats.entries[wordKey(word)];
  return (row && row[formId]) || null;
}

/* Form labels for the non-euphonic fallback. allForms() walks one representative
   per class, so this is a fixed ~30-entry map — built once, not per call. */
let LABELS = null;
const formLabel = (formId) => {
  if (!LABELS) {
    LABELS = {};
    for (const f of allForms()) LABELS[f.id] = f;
  }
  return LABELS[formId] || null;
};

/** Which rule this (word, form) exercises. A derivation, never stored. */
export function ruleKey(word, formId) {
  if (formId === MEANING) return { id: MEANING, label: "Meaning", jp: "意味" };
  /* Only the forms that actually consume GODAN[last].te / .ta. nakatta is
     excluded on purpose: it builds off the A-stem and involves no 音便. */
  if (formId === "te" || formId === "ta" || formId === "teiru" || formId === "teimasu") {
    const r = teRule(word);
    if (r) return r;
  }
  const f = formLabel(formId);
  return {
    id: word.type + "." + formId,
    label: f ? f.label : formId,
    jp: f ? f.jp : "",
  };
}

const pct = (ok, n) => (n ? Math.round((ok / n) * 100) : 0);

/** Accuracy per grammar rule, weakest first. Words absent from `words` are
 *  skipped rather than guessed at — their rows survive for a later re-import. */
export function byRule(stats, words, minN = 1) {
  const out = new Map();
  for (const w of words) {
    const row = stats.entries[wordKey(w)];
    if (!row) continue;
    for (const formId of Object.keys(row)) {
      const { id, label, jp } = ruleKey(w, formId);
      const acc = out.get(id) || { id, label, jp, n: 0, ok: 0 };
      acc.n += row[formId].n;
      acc.ok += row[formId].ok;
      out.set(id, acc);
    }
  }
  return [...out.values()]
    .filter((r) => r.n >= minN)
    .map((r) => ({ ...r, pct: pct(r.ok, r.n) }))
    .sort((a, b) => a.pct - b.pct || b.n - a.n);
}

export function wordAccuracy(stats, word) {
  const row = stats.entries[wordKey(word)] || {};
  let n = 0, ok = 0;
  for (const k of Object.keys(row)) { n += row[k].n; ok += row[k].ok; }
  return { n, ok };
}

export function totals(stats) {
  let n = 0, ok = 0;
  for (const k of Object.keys(stats.entries))
    for (const f of Object.keys(stats.entries[k])) { n += stats.entries[k][f].n; ok += stats.entries[k][f].ok; }
  return { n, ok };
}

/** Import merge. Streaks are dropped: two histories cannot be interleaved, and
 *  a wrong streak is worse than no streak. */
export function mergeStats(a, b) {
  const entries = { ...a.entries };
  for (const k of Object.keys(b.entries)) {
    entries[k] = { ...entries[k] };
    for (const f of Object.keys(b.entries[k])) {
      const x = entries[k][f], y = b.entries[k][f];
      entries[k][f] = x
        ? { n: x.n + y.n, ok: x.ok + y.ok, last: Math.max(x.last, y.last), streak: 0 }
        : { ...y };
    }
  }
  return { version: 1, entries };
}

/** Storage is untrusted: a hand-edited or truncated value must not crash boot. */
export function mergeStored(stored) {
  if (!stored || typeof stored !== "object" || !stored.entries || typeof stored.entries !== "object") return EMPTY;
  const entries = {};
  for (const k of Object.keys(stored.entries)) {
    const row = stored.entries[k];
    if (!row || typeof row !== "object") continue;
    for (const f of Object.keys(row)) {
      const v = row[f];
      if (!v || typeof v.n !== "number" || typeof v.ok !== "number") continue;
      entries[k] = entries[k] || {};
      entries[k][f] = { n: v.n, ok: v.ok, last: Number(v.last) || 0, streak: Number(v.streak) || 0 };
    }
  }
  return { version: 1, entries };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all `quiz stats` assertions green, 0 failed.

- [ ] **Step 6: Extend the module wiring check**

In `test/engine.test.mjs`, in the `modules` array (currently `engine.js:301`–`304` of the test file), add a third row:

```js
  ["stats.js", /import \{([^{}]*?)\} from "\.\/stats\.js"/],
```

This is the check that caught `GODAN` being dropped from `App.jsx`'s import list. It will pass trivially now and start earning its keep in Task 3.

- [ ] **Step 7: Run the tests again**

Run: `npm test`
Expected: PASS, 0 failed.

- [ ] **Step 8: Commit**

```bash
git add src/stats.js src/storage.js test/engine.test.mjs
git commit -m "Add the quiz stats module: record, roll up by rule, merge"
```

---

## Task 3: Record outcomes and persist them

**Files:**
- Modify: `src/App.jsx` (the `Quiz` component and the `App` state block)
- Test: browser — nothing here is reachable from the Node runner

**Interfaces:**
- Consumes: `EMPTY`, `MEANING`, `record`, `mergeStored` from `./stats.js`; `PKEY` from `./storage.js`.
- Produces: `stats` state in `App`, and a `onRecord(word, formId, ok)` prop on `Quiz`. Tasks 4–7 read the same `stats` object.

- [ ] **Step 1: Import the module**

At the top of `src/App.jsx`, beside the existing storage and settings imports:

```js
import { EMPTY, MEANING, record, mergeStored, byRule, wordAccuracy, totals } from "./stats.js";
```

Update the `./storage.js` import to include `PKEY`.

> `byRule`, `wordAccuracy` and `totals` are unused until Tasks 4–6. The wiring
> check added in Task 2 only fails on *referenced but unimported* names, never
> the reverse, so importing them now is safe.

- [ ] **Step 2: Add the state and persistence in `App`**

Beside the `words` state declaration:

```js
const [stats, setStats] = useState(EMPTY);
```

In the boot effect, beside the existing `GKEY` read, load and sanitise:

```js
try {
  const p = await storage.get(PKEY);
  setStats(mergeStored(JSON.parse(p.value)));
} catch { /* first run — EMPTY stands */ }
```

And add a persistence effect matching the existing `words` / `settings` ones:

```js
useEffect(() => {
  if (!ready) return;
  (async () => {
    try { await storage.set(PKEY, JSON.stringify(stats)); } catch { /* session-only */ }
  })();
}, [stats, ready]);
```

- [ ] **Step 3: Add the recorder and pass it down**

In `App`, beside `saveExamples`:

```js
/* Called from Quiz on every judged answer. Date.now() lives here rather than in
   stats.js so that module stays pure and testable. */
function recordAnswer(word, formId, ok) {
  setStats((s) => record(s, word, formId, ok, Date.now()));
}
```

Pass it to `Quiz`, which is rendered at the `view === "quiz"` branch:

```jsx
<Quiz words={scopedWords} script={script} onProgress={setQuizRun}
      settings={settings} stats={stats} onRecord={recordAnswer} />
```

Add `stats` and `onRecord` to the `Quiz` signature.

- [ ] **Step 4: Consolidate judging into one write site**

`submit`, `choose` and `reveal` in `Quiz` each already do the same three things — set `judged`, bump `right`, or push to `misses`. Replace that triplicated tail with one helper, placed just above `submit`:

```js
/* One place to judge, so there is exactly one place that records. Deliberately
   NOT a useEffect on `judged`: StrictMode double-invokes effects in dev and
   would double-count every answer. */
function judge(ok, chose) {
  setJudged(chose === undefined ? { ok } : { ok, chose });
  if (ok) setRight((r) => r + 1);
  else setMisses((m) => [...m, current]);
  if (onRecord && cWord) onRecord(cWord, isMean ? MEANING : current.formId, ok);
}
```

Then rewrite the three callers to use it:

```js
function submit() {
  if (!current || !target) return;
  if (judged) return advance();
  if (!input.trim()) return;
  const settled = ime ? settleKana(input) : input;
  if (settled !== input) setInput(settled);
  judge(answerMatches(settled, target));
}

function choose(id) {
  if (judged || !current) return;
  /* Form questions are answered with a form id, meaning questions with a
     word id — same picker, two different keys. */
  judge(id === (current.kind === "recognise" ? current.formId : current.wordId), id);
}

function reveal() {
  /* "Show me" counts as a miss: not knowing it is not knowing it. */
  if (judged || !target) return;
  judge(false);
}
```

- [ ] **Step 5: Verify in the browser**

Start `npm run dev` if it is not running, then at `http://localhost:5173`:

1. Quiz → Start → answer two questions, one right, one wrong.
2. In the console: `JSON.parse(localStorage.getItem("kotoba-stats-v1"))`
3. Expected: `entries` has one key per answered word in `word|reading` form, each with a form id holding `{n, ok, last, streak}`. Confirm `n` is **1** per answer and not 2 — 2 means recording drifted into an effect and StrictMode is double-counting.
4. Reload the page and answer one more; confirm the counts continue rather than reset.

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: PASS, 0 failed — including the wiring check, which now sees `stats.js`.

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx
git commit -m "Record quiz outcomes and persist them across sessions"
```

---

## Task 4: Show the diagnosis on the results screen

**Files:**
- Modify: `src/App.jsx` (the `stage === "done"` branch of `Quiz`)
- Test: browser

**Interfaces:**
- Consumes: `byRule` from `./stats.js`; `stats` prop from Task 3.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Compute the rollup for the run**

In `Quiz`, inside the `stage === "done"` branch, above the `return`:

```js
/* Lifetime accuracy for the rules this run actually touched — the run's own
   sample is far too small to call anything a weakness. minN of 3 keeps a single
   lucky or unlucky answer from being reported as a diagnosis. */
const touched = new Set();
for (const q of queue) {
  const w = words.find((x) => x.id === q.wordId);
  /* A word deleted mid-run has no type, so it can name no rule — skip it
     rather than letting ruleKey mint an "undefined.te" bucket. */
  if (w) touched.add(ruleKey(w, q.kind.startsWith("mean") ? MEANING : q.formId).id);
}
const runRules = byRule(stats, words, 3).filter((r) => touched.has(r.id));
```

Add `ruleKey` to the `./stats.js` import list in `App.jsx`.

- [ ] **Step 2: Render it**

In the same branch, inside the right-hand `box` and after the missed list, add:

```jsx
{runRules.length > 0 && (
  <div style={{ marginTop: S[5], borderTop: "1px solid " + C.ruleSoft, paddingTop: S[3] }}>
    <div className="kd-micro" style={{ marginBottom: S[3] }}>By rule · lifetime</div>
    <div style={{ display: "grid", gap: S[2] }}>
      {runRules.map((r) => (
        <div key={r.id} style={{ display: "flex", alignItems: "center", gap: S[3] }}>
          <span style={{ fontSize: T.sm, flex: "1 1 auto", minWidth: 0 }}>
            {r.label}
            {r.jp && <span style={{ fontFamily: MINCHO, color: C.muted, marginLeft: S[1] + 1 }}>{r.jp}</span>}
          </span>
          <span style={{ flex: "0 0 64px", height: 4, background: C.ruleSoft, display: "flex" }}>
            <span style={{ width: r.pct + "%", background: r.pct < 60 ? C.stem : C.aux }} />
          </span>
          <span style={{ fontFamily: MONO, fontSize: T.micro, color: C.muted, flex: "0 0 auto" }}>
            {r.pct}% · {r.n}
          </span>
        </div>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 3: Verify in the browser**

1. Quiz → Start with the Direction set to **Produce the form**, length 20.
2. Deliberately fail every て-form of a ぬ/ぶ/む verb and pass the rest.
3. Finish the run. Expected: a "BY RULE · LIFETIME" block listing `ぬ・ぶ・む → んで 撥音便` with a low percentage and a red bar, ordered above healthier rules.
4. Run a second quiz. Expected: counts accumulate rather than reset — this is lifetime, not per-run.
5. Toggle to dark mode in Settings and confirm the bars and text remain legible.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "Report accuracy by grammar rule on the quiz results screen"
```

---

## Task 5: Accuracy in the Vocab ledger

**Files:**
- Modify: `src/App.jsx` (`VocabView`)
- Test: browser

**Interfaces:**
- Consumes: `wordAccuracy` from `./stats.js`.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Pass stats into `VocabView`**

Add `stats` to the `VocabView` signature and to its render site in `App`:

```jsx
<VocabView words={words} scopedCount={scopedWords.length} script={script}
           settings={settings} stats={stats} onOpen={…} onAdd={…} onDelete={…} />
```

- [ ] **Step 2: Render the figure in each row**

In the row's tag cluster, immediately before the `<Say …/>`:

```jsx
{(() => {
  const a = wordAccuracy(stats, w);
  /* An undrilled word shows nothing rather than a demoralising 0%. */
  if (!a.n) return null;
  const p = Math.round((a.ok / a.n) * 100);
  return (
    <span style={{ ...tag, color: p < 60 ? C.stem : C.aux, borderColor: p < 60 ? C.stem : C.aux }}
          title={a.ok + " of " + a.n + " correct"}>
      {p}%
    </span>
  );
})()}
```

- [ ] **Step 3: Verify in the browser**

1. Answer several questions about one word, then open **Vocab**.
2. Expected: that word carries a percentage tag; untouched words carry none.
3. Hover it. Expected: a title of the form "3 of 5 correct".
4. Confirm a sub-60% word reads in the red `stem` colour and a healthy one in `aux`, in both themes.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "Show per-word accuracy in the vocabulary ledger"
```

---

## Task 6: Carry stats through Export / Import

**Files:**
- Modify: `src/App.jsx` (`DeckTools`, `importWords`)
- Test: browser

**Interfaces:**
- Consumes: `mergeStats`, `mergeStored` from `./stats.js`.
- Produces: export payload gains a `stats` key; `onImport` gains a second argument.

- [ ] **Step 1: Write stats into the export**

`DeckTools` takes a new `stats` prop. Both `exportDeck` and `copyDeck` build their payload as:

```js
{ format: "kotoba-deck", version: 1, exportedAt: new Date().toISOString(), words, stats }
```

(`copyDeck` keeps omitting `exportedAt`, as it does today.)

Pass it at the render site: `<DeckTools words={words} stats={stats} onImport={importWords} />`

- [ ] **Step 2: Read stats back on import**

In `readFile`, after `clean` is built and before `onImport` is called:

```js
/* Sanitised through the same gate as stored values — an import file is just as
   untrusted as localStorage. */
const incomingStats = parsed && parsed.stats ? mergeStored(parsed.stats) : null;
const added = onImport(clean, incomingStats);
```

Add `mergeStored` to `DeckTools`'s available imports (already imported at module scope in Task 3).

- [ ] **Step 3: Merge on the App side**

Change `importWords` to accept and merge the second argument:

```js
function importWords(incoming, incomingStats) {
  const have = new Set(words.map((w) => w.word + "|" + w.reading));
  const seen = new Set();
  const fresh = incoming.filter((w) => {
    const k = w.word + "|" + w.reading;
    if (have.has(k) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (fresh.length) setWords((ws) => [...fresh, ...ws]);
  /* Stats key on word|reading, the same pair used for dedup above, so they line
     up with no id mapping — which is the whole reason they are not id-keyed. */
  if (incomingStats) setStats((s) => mergeStats(s, incomingStats));
  return fresh.length;
}
```

- [ ] **Step 4: Verify in the browser**

1. Answer a few questions so stats exist. Deck → **EXPORT**.
2. Open the downloaded `kotoba-deck.json`. Expected: a `stats` key beside `words`, with entries keyed `word|reading`.
3. In the console, clear only the stats: `localStorage.removeItem("kotoba-stats-v1")`, then reload.
4. Confirm Vocab shows no percentages.
5. Deck → **IMPORT** the file. Expected: percentages return, even though every word id was regenerated on import. This is the exact failure the natural key exists to prevent.
6. Import the same file a second time. Expected: no new words ("the rest were already in the deck"), but note that stats **do** sum again — see below.

- [ ] **Step 5: Guard double-import inflation**

Step 4.6 exposes a real flaw: re-importing the same file sums the stats again, inflating `n`. Fix by only merging stats for words that were actually new, plus words already present — i.e. always merge, but make merge idempotent is *not* possible with counters. Instead, skip the stats merge when nothing was fresh **and** the incoming stats are a subset:

```js
  /* Re-importing the same file must not inflate counts. Merging is only safe
     when the incoming deck brings words this device has not seen. */
  if (incomingStats && fresh.length) setStats((s) => mergeStats(s, incomingStats));
```

Re-run Step 4.6 and confirm a second import leaves counts unchanged.

> `ponytail: counter-based merge cannot be idempotent, so this trades a rare
> real case (re-importing after adding words on another device) for the common
> accident. An event log with ids would fix it properly; see the spec's
> "Deliberate limitation".`

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: PASS, 0 failed.

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx
git commit -m "Carry quiz progress through deck export and import"
```

---

## Task 7: The Progress view

**Files:**
- Create: `src/ProgressView.jsx`
- Modify: `src/App.jsx` (nav item, route, `goto` guard)
- Test: browser

**Interfaces:**
- Consumes: `byRule`, `totals` from `./stats.js`; `teRule`, `GODAN` from `./engine.js`; `C`, `T`, `S`, `JP`, `MINCHO`, `MONO` from `./theme.js`.
- Produces: default-exported `ProgressView`, props `{ stats, words }`.

- [ ] **Step 1: Create the view**

```jsx
import { C, MINCHO, MONO, T, JP, S } from "./theme.js";
import { teRule } from "./engine.js";
import { byRule, totals } from "./stats.js";

/* The nine godan endings, in the order a 五段 table lists them. Each maps to one
   euphonic rule, so this grid is the whole class seen at once — the generalised
   version of the per-verb Ladder in App.jsx. */
const ENDINGS = ["う", "つ", "る", "く", "ぐ", "す", "ぬ", "ぶ", "む"];

export default function ProgressView({ stats, words }) {
  const all = byRule(stats, words, 1);
  const t = totals(stats);
  const pct = t.n ? Math.round((t.ok / t.n) * 100) : 0;
  const byId = new Map(all.map((r) => [r.id, r]));

  if (!t.n) {
    return (
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: S[4] }}>
        <div style={{ border: "1px solid " + C.rule, background: C.panel, padding: S[6] + S[2], textAlign: "center" }}>
          <div style={{ fontFamily: MINCHO, fontSize: JP.display, color: C.rule }}>未</div>
          <div style={{ fontSize: T.base, color: C.muted, marginTop: S[2], lineHeight: 1.6 }}>
            Nothing drilled yet. Take a quiz and this fills in — accuracy lands
            against the grammar rule, not just the word.
          </div>
        </div>
      </div>
    );
  }

  const bar = (p) => (
    <span style={{ flex: "0 0 72px", height: 4, background: C.ruleSoft, display: "flex" }}>
      <span style={{ width: p + "%", background: p < 60 ? C.stem : C.aux }} />
    </span>
  );

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: S[4] }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: S[3], marginBottom: S[5] }}>
        <span style={{ fontFamily: MINCHO, fontSize: JP.figure, lineHeight: 1, color: pct < 60 ? C.stem : C.aux }}>{pct}%</span>
        <span className="kd-micro">{t.ok} of {t.n} answered correctly</span>
      </div>

      <div className="kd-head">
        <span className="kd-micro">Weakest rules</span>
        <span style={{ fontFamily: MINCHO, fontSize: T.sm, color: C.muted }}>弱点</span>
        <span className="kd-rail" />
      </div>
      <div style={{ display: "grid", gap: S[2], marginBottom: S[5] }}>
        {all.map((r) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: S[3] }}>
            <span style={{ fontSize: T.sm, flex: "1 1 auto", minWidth: 0 }}>
              {r.label}
              {r.jp && <span style={{ fontFamily: MINCHO, color: C.muted, marginLeft: S[1] + 1 }}>{r.jp}</span>}
            </span>
            {bar(r.pct)}
            <span style={{ fontFamily: MONO, fontSize: T.micro, color: C.muted }}>{r.pct}% · {r.n}</span>
          </div>
        ))}
      </div>

      <div className="kd-head">
        <span className="kd-micro">Godan endings</span>
        <span style={{ fontFamily: MINCHO, fontSize: T.sm, color: C.muted }}>五段</span>
        <span className="kd-rail" />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: S[2] }}>
        {ENDINGS.map((k) => {
          const r = byId.get((teRule({ word: "x" + k, reading: "x" + k, type: "godan" }) || {}).id);
          const p = r ? r.pct : null;
          return (
            <div key={k} style={{ textAlign: "center", width: 52 }}>
              <div style={{
                fontFamily: MINCHO, fontSize: JP.md, lineHeight: "44px", height: 44,
                color: p === null ? C.muted : C.panel,
                background: p === null ? "transparent" : p < 60 ? C.stem : C.aux,
                border: "1px solid " + (p === null ? C.ruleSoft : "transparent"),
              }}>{k}</div>
              <div className="kd-micro" style={{ marginTop: S[1] }}>{p === null ? "—" : p + "%"}</div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: T.fine, color: C.muted, lineHeight: 1.6, marginTop: S[3] }}>
        Endings sharing a rule share a score — う・つ・る all take って, and く・ぐ
        both take い. A dash means you have not drilled that ending's て or た form yet.
      </div>
    </div>
  );
}
```

> The `teRule({ word: "x"+k, … })` call builds a throwaway verb ending in each
> kana purely to ask which rule it uses — `teRule` only reads `type` and the
> final kana, so a stub is enough. Keep the `"x"` prefix: it costs nothing and
> keeps the stub from ever colliding with the `行く`/`いく` irregular test if that
> test is later loosened.

- [ ] **Step 2: Route it in `App.jsx`**

Import it beside `SettingsView`:

```js
import ProgressView from "./ProgressView.jsx";
```

Add to the nav array, after `quiz`:

```js
["deck", "Deck"], ["vocab", "Vocab"], ["quiz", "Quiz"], ["progress", "Progress"], ["settings", "Settings"]
```

And add the route beside the others:

```jsx
{view === "progress" && <ProgressView stats={stats} words={words} />}
```

`goto` needs no change — its guard is `next !== "quiz" && quizRun.running`, which
already covers a new destination.

- [ ] **Step 3: Verify in the browser**

1. With no stats (`localStorage.removeItem("kotoba-stats-v1")`, reload): Progress shows the 未 empty state, no empty grid.
2. Answer some questions, including failing ぬ/ぶ/む て-forms.
3. Expected: ぬ, ぶ and む all show the **same** percentage — they share one rule. So do う, つ and る; so do く and ぐ.
4. Endings never drilled show a dash and an outlined, unfilled cell.
5. Check the masthead at a 375px viewport: five nav items must still wrap cleanly without the page scrolling sideways.
6. Check both themes.

- [ ] **Step 4: Start a quiz, then click Progress**

Expected: the "Quiz in progress" confirmation modal appears, exactly as it does for Deck and Vocab. This confirms the new route did not slip past the `goto` guard.

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS, 0 failed. The wiring check now also verifies `ProgressView`'s engine imports.

- [ ] **Step 6: Commit**

```bash
git add src/ProgressView.jsx src/App.jsx
git commit -m "Add the Progress view with the godan accuracy grid"
```

---

## Task 8: Update the README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Move the feature out of "Where to take it next"**

The section currently reads "Persisting quiz results per (word, form) is the highest-value addition." That is now built. Replace the section body with the next thing — sourcing example sentences from Tatoeba, which is the remaining API-key dependency — and add to **Features**:

```markdown
- **Progress** — every answer is recorded per (word, form) and rolled up along
  the *grammar*: "ぬ・ぶ・む → んで, 41%" is a diagnosis a flashcard app cannot
  produce, because it needs to know those three verbs share one rule. Results
  travel with Export / Import, keyed on word+reading rather than on a local id.
```

- [ ] **Step 2: Note the limitation**

Under **Known limitations**:

```markdown
**Progress is aggregate, not history.** Stats store totals per (word, form), so
"accuracy ever" is available but "accuracy this month" is not. Trend lines would
need an append-only event log — a different schema, not an extension of this one.
Re-importing a deck that brings no new words deliberately skips the stats merge,
since counter-based merges cannot be idempotent.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Document the progress feature and its limits"
```

---

## Self-Review Notes

Checked against the spec:

| Spec requirement | Task |
|---|---|
| Storage keyed `word\|reading` under `kotoba-stats-v1` | 2, 3 |
| `{n, ok, last, streak}` shape | 2 |
| `meaning` pseudo-form for `mean-en`/`mean-ja` | 2, 3 |
| Rule derived, not stored | 1, 2 |
| す is not an 音便 | 1 |
| て-family is te/ta/teiru/teimasu, `nakatta` excluded | 2 |
| Recording via one `judge()` helper, never an effect | 3 |
| `reveal` counts as a miss | 3 |
| Quiz results surface, `minN` 3 | 4 |
| Vocab ledger surface | 5 |
| Export/import merge, streak reset | 2, 6 |
| Progress view + 五段 grid | 7 |
| Empty states in the app's voice | 7 |
| Weighting excluded | — (Global Constraints) |

Two things this plan adds that the spec did not specify:

1. **`mergeStored`** — the spec described the merge for import but not the
   validation of stored values. `mergeSettings` already sets that precedent for
   `GKEY`, and a truncated localStorage value crashing boot is a real failure.
2. **Double-import guard** (Task 6, Step 5). Only surfaced by writing the
   verification steps out. Counter-based merges cannot be idempotent, so the
   plan takes the trade explicitly and marks it with a `ponytail:` comment
   rather than leaving it to be discovered as a bug.
