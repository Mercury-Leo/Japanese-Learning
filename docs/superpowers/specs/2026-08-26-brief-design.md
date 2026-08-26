# Brief — Design

Date: 2026-08-26
Status: approved, not yet implemented

## Problem

Words go into the deck and are never looked at again as a *cohort*. The Vocab view
lists all of them, filtered by class, and the Quiz draws from the whole scope — nothing
answers "what did I add lately, and have I actually drilled it?"

The data for that already exists and is unused. Every word carries `addedAt`:
`AddWord.jsx:74` stamps it, `DeckTools.jsx:59` preserves it through an import
(`Number(w.addedAt) || Date.now()`), and `engine.js:489` backdates the seed deck across
the previous week. Nothing in the UI reads the field.

One premise correction that shapes the design: the original ask was "since last push".
Decks live in that device's `localStorage` — the repo contains no words — so a git push
is unrelated to what a device has seen. The window has to come from a device-local
marker instead.

## Goals

- Show which words were added since the last time this device read a brief.
- Let that set be drilled in one tap.
- No new word fields, no migration, no new dependency.

## Non-goals

- **Weakest-rule lines, streaks, accuracy trends.** `ProgressView` owns those. A brief
  that grows into a second dashboard is two ideas in one panel.
- **A rolling 7-day mode alongside the marker.** Rejected during design: two windows
  means a toggle, and a default to argue about. Seven days survives only as the
  first-run fallback below.
- **Cross-device agreement on what has been reviewed.** The marker is per-device, on
  purpose — see below.

## Design

### The window

One new key in `storage.js`: `BKEY = "kotoba-brief-v1"`, holding the epoch-ms time this
device last read a brief. It gets a synchronous `readBriefAt` / `writeBriefAt` pair
beside `readTheme` and `readSeenVersion`, and for the reason already written above
those: it is not part of the deck anyone exports. Which words *this phone* has been
shown is nobody else's business, and a device that imports a deck should get its own
brief rather than inheriting the exporter's.

Same failure posture as the pair it sits next to: reads are wrapped and fall back,
writes swallow the exception and stay session-only. A device with storage denied gets a
brief every launch, which is the harmless direction.

**No marker stored** — first run, or first run after this ships — falls back to
`Date.now() - 7 * 86400000` rather than to zero:

```js
const since = readBriefAt() || Date.now() - 7 * 86400000;
```

Zero would make the first brief on a freshly imported 400-word deck all 400 words, since
an import file without `addedAt` stamps every row `Date.now()`. Seven days bounds it,
needs no first-run stamping branch, and on the seed deck happens to land on roughly the
backdated week.

### Selection

New module `src/brief.js`. Pure — no React, no storage, no DOM — so
`test/engine.test.mjs` can import it, same rule `stats.js` follows.

```js
newSince(words, since, now) → [{ day, label, words }]   // newest day first
```

- Filter `(w.addedAt || 0) > since`. A word with no `addedAt` counts as old: only
  hand-edited or truncated storage produces one, and flooding the brief is worse than
  omitting it.
- Sort newest first, then group by **calendar day in the local timezone**, not by
  24-hour buckets counted back from `since` — the headings say "Today", so the grouping
  has to agree with them.
- `day` is the day's local midnight in epoch ms (the grouping key and the React key).
  `label` is "Today", "Yesterday", or `"24 Aug"`.
- Empty deck, or nothing newer than `since`, returns `[]`.

`now` is a parameter rather than a `Date.now()` call inside, so "today" is testable
without touching the clock — the same reason `record()` in `stats.js` takes `now`.

### Entry point

One line above the deck list in the `view === "deck"` branch, rendered only when the
count is non-zero:

> 7 new words since your last brief

It is a button (`kd-btn` at the existing micro scale). When nothing is new the line is
absent and the brief is unreachable — there is no empty state to design, because there
is no way to reach one. Explicitly not a sixth nav tab: the five-tab `kd-seg` already
wraps on a phone, and a sixth that is usually empty costs the other five room.

Singular/plural on "word" follows the `ENTR{Y,IES}` precedent at `App.jsx:284`.

### The panel

A `Brief` component in `ui.jsx` beside `WhatsNew`, on the machinery that component
already uses: `kd-scrim`, `kd-modal`, `useModalDismiss(onClose)`, `role="dialog"`,
`aria-modal`, an `aria-label`. No new file — `ui.jsx` is where shared presentational
parts live, and this is a second modal, not a new pattern.

Contents, per day group: the `label` as a `kd-micro` heading, then one row per word —
the `Word` component (so the script setting governs furigana/kanji/kana), the gloss, the
class, and its record so far from `wordAccuracy(stats, w)` when `n > 0`, or nothing when
it has never been drilled.

Two buttons: **Drill these** and **Done**.

### Closing writes the marker

Every exit path means "read": both buttons, the scrim, and Escape all route through the
one `onClose`, which writes `Date.now()` to `BKEY` and drops the deck line. **Drill
these** writes it too — drilling is the strongest form of having read it, and leaving
the line sitting there afterwards would be wrong.

The cost, paid knowingly: open-and-close loses the list, and those words are then only
reachable through the Vocab view. Accepted over a separate "Mark reviewed" button —
one more control, and one more thing to remember to press.

### Drilling

`const [drill, setDrill] = useState(null)` in `App.jsx`. **Drill these** sets it to the
brief's flat word list, closes the brief, and switches `view` to `"quiz"` through the
existing `setView` path, so the leave-confirmation logic is untouched.

```jsx
<Quiz words={drill || scopedWords} allWords={words} … />
```

`allWords` already supplies distractors, so a three-word drill still has wrong answers
to offer. `drill` is cleared on leaving the quiz view, so the next visit to Quiz is the
normal scoped run.

Deliberately **not** passed through `wordInScope`: the brief is an explicit request for
those words, and a JLPT scope silently dropping words from their own brief would be a
bug, not a filter.

### Test

Asserts appended to `test/engine.test.mjs`, using its existing `eq` helper:

- A word stamped one ms after `since` is in; one ms before is out; exactly `since` is
  out (the filter is `>`).
- A word with no `addedAt` is out.
- Two words either side of a local midnight land in two groups, newest group first,
  labelled "Today" and "Yesterday".
- Three words on one day land in one group.
- Nothing newer than `since` returns `[]`.

## Files

| File | Change |
|---|---|
| `src/brief.js` | new — `newSince(words, since, now)` |
| `src/storage.js` | `BKEY`, `readBriefAt`, `writeBriefAt` |
| `src/ui.jsx` | `Brief` component, added to the export list |
| `src/App.jsx` | `since`/`drill` state, deck line, panel render, `Quiz words` override |
| `test/engine.test.mjs` | the asserts above |
| `src/changelog.js`, `package.json` | 0.5.0 entry and bump, same commit — `changelog.js:7` |

## Deliberate limitation

The marker is a single timestamp, not a set of reviewed word ids. A word added while a
brief is open, between the render and the close, is stamped as reviewed without ever
having been shown. The window is small, the loss is one word from one brief, and the
alternative — tracking reviewed ids per word — is a growing structure in storage for a
race nobody will hit. If it ever matters, the fix is to capture `Date.now()` at open and
write that on close instead.
