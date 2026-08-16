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

/** Import merge. Re-importing a file must be a no-op, so counts take the
 *  higher of the two sides rather than summing — summing would inflate every
 *  time the same export gets imported again. Streaks are dropped: two
 *  histories cannot be interleaved, and a wrong streak is worse than no streak.
 *  Cost, paid honestly: two devices with genuinely separate histories merge
 *  conservatively (20 and 20 becomes 20, not 40) — it undercounts rather than
 *  inflates, which is the safer direction. */
export function mergeStats(a, b) {
  const entries = { ...a.entries };
  for (const k of Object.keys(b.entries)) {
    entries[k] = { ...entries[k] };
    for (const f of Object.keys(b.entries[k])) {
      const x = entries[k][f], y = b.entries[k][f];
      entries[k][f] = x
        ? { n: Math.max(x.n, y.n), ok: Math.max(x.ok, y.ok), last: Math.max(x.last, y.last), streak: 0 }
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
