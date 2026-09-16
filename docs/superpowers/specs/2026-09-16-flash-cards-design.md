# Flash cards — Design

Date: 2026-09-16
Status: approved, not yet implemented

## Problem

The Quiz asks for an answer and judges it. That is the right instrument for a form you
half-know, and the wrong one for a form you have never seen: being marked wrong twenty
times is not how a word is met for the first time. There is currently no way to *read*
the deck form by form — the Vocab view is meaning-forward and lists dictionary forms
only, and the deck view shows one word at a time behind a selection.

A flash card is the missing instrument: show the surface, let the reader try to recall,
reveal, and let them say whether they had it. It is the low-stakes pass that comes
before the drill.

Everything it needs already exists. `conjugate()` returns the full form list for every
word class, `Strip` (`ui.jsx:73`) draws the morpheme breakdown, `Say` reads the kana,
and `onRecord` (`App.jsx:264`) is already threaded into `Quiz`. Nothing here is a new
capability — it is a second face on the material the Quiz already assembles.

## Goals

- A card per (word, form), front the Japanese surface, back the meaning, the dictionary
  form, and which form it is.
- Self-graded, recorded into the same stats the Quiz writes, so Progress and the
  by-rule rollup see flash card sessions.
- Reuse the Quiz's setup, run and result machinery rather than growing a parallel one.

## Non-goals

- **English-front cards.** The ask was Japanese-front. Reversing it is a second toggle
  and a second thing to explain; the Quiz already drills gloss→word under **Meaning**.
- **Scheduling — SRS, intervals, due dates.** Stats are aggregate per (word, form) by
  design (`README.md`, "Progress is aggregate, not history"). Real spaced repetition
  needs an event log and a different schema, not a new face on this one.
- **Going back to a previous card.** A graded card is spent, exactly as a judged
  question is. Revisable grades mean holding grades in the queue and writing once at
  the end, which is a different lifecycle from the one `judge()` has.
- **Persisting the chosen mode.** Quiz state is local and resets on unmount; the mode
  joins it. A settings key for a two-position toggle is not worth a migration.

## Design

### Entry

A mode toggle at the top of the setup screen (`Quiz.jsx:217`), above the two picker
panels, as a pair of `Chip`s: **Quiz** / **Flash cards**. One setup screen serves both
— the word picker and the form picker are already exactly the controls a card deck
needs, and `available` (`Quiz.jsx:43`) already narrows the form list to what the picked
words actually offer.

Three setup controls are Quiz-only and hide in card mode:

- **Direction** (`Quiz.jsx:295`) — a card has no direction; it has a front and a back.
- **かな IME** — there is no answer field to type into.
- **Meaning** (`Quiz.jsx:283`) — redundant, and this is the non-obvious one. The chip
  exists because meaning "is the only drill a noun has". That is untrue of cards:
  `build()` (`engine.js:422`) routes `noun` through `buildNaAdj(word, reading, true)`,
  so a noun has ten forms (辞書形 / だ / じゃない / です / の …) and is not a special
  case. Every card reveals its meaning anyway, and ticking **Dictionary** in the form
  picker gives the plain-word card — front 食べる, back "to eat" — which is what the
  Meaning chip would have produced.

**Length** stays, unchanged: 10 / 20 / All.

### The card set

A new pure function in `engine.js`, beside `meaningItems`:

```js
cardItems(pool, formIds)
```

For each word in `pool`, for each of its forms whose id is in `formIds`, one
`{ wordId, formId, fromId: null, kind: "card" }`.

It keeps the homograph dedupe that the Quiz's item builder uses (`Quiz.jsx:61`): an
ichidan potential and passive are both 食べられる, and two cards with an identical front
and contradicting backs is a trap rather than a drill. One card per distinct surface,
first form wins.

It lives in `engine.js` rather than inline in the memo for the reason the file exists —
pure logic, no React, independently testable — and so the test below can reach it.

`Quiz.jsx`'s `items` memo (`Quiz.jsx:55`) branches on mode: card mode returns
`cardItems(pool, formIds)` and appends no meaning items.

### The card

`src/FlashCard.jsx`, new and presentational. Props: `word`, `form`, `script`,
`settings`, `flipped`, `onFlip`, `onGrade`. It holds no run state — the queue, the
index and the tally stay in `Quiz`.

`flipped` is a new `useState` in `Quiz`, not a reuse of `judged`: a card has three
states where a question has two, and `flipped && !judged` — revealed, not yet graded —
is the one the grade buttons appear in. `advance()` clears it alongside `judged` and
`input`.

**Front.** The form's surface at `JP.xl` through `Word`, furigana per the deck's script
setting (`qMode`, so a 漢字-only deck still shows the reading here for the same reason
the Quiz gives: a conjugation drill must not become an accidental kanji-reading drill).
A `Say` button. The word's class as a `MONO` micro tag. Nothing else — no meaning, no
form name, or the card is already flipped.

The whole face is one button: tap anywhere to reveal.

**Back.** Revealed in place under the front, wrapped in `kd-swap` (`app-css.js:127`),
which already exists and which the global `prefers-reduced-motion` rule at
`app-css.js:184` already disables. No 3D flip, no new keyframes.

In order:

1. The dictionary form and the meaning — `食べる · to eat`.
2. The form's name and its Japanese label — `Polite past · ました`.
3. `<Strip segs={form.segs} script={qMode} glosses={settings.show.glosses} />`, the
   morpheme breakdown. This is the reason to build cards in this app rather than use
   any of the twenty that exist: the back does not just assert that 食べました is the
   polite past, it shows 食べ・まし・た with the glosses on.
4. Romaji when `settings.show.romaji`, and a `Say` on the answer.
5. `form.note` in a `kd-note` when the form has one.

A dictionary-form card has no "regular form" to reveal, so line 1 collapses to the
meaning alone and the Strip is a single segment. That is correct output, not a case to
special-case.

### Grading

Two buttons under the revealed back: **Didn't** / **Knew it**, styled as the Quiz's
wrong and right colours (`C.stem`, `C.aux`). Either calls
`onRecord(cWord, current.formId, ok)` through the existing `judge(ok)` — the same one
call site, so there is still exactly one place that records.

No grade is offered before the flip. You have to look before you can claim you knew it.
`Show`-then-`Knew it` is dishonest self-report and the app cannot police it; what it can
do is refuse to make the dishonest path the fast one.

### Keyboard

The run's existing listener (`Quiz.jsx:178`) gains a card branch, keeping its contract:
digits pick, focused controls own their own keys.

- Before the flip: `Enter` or `Space` flips.
- After the flip: `1` is **Didn't**, `2` is **Knew it**, matching the `kd-opt-key`
  digits the multiple-choice options already use.

`Enter` is deliberately **inert after the flip**, and no grade button is auto-focused —
unlike the Quiz, which focuses Next (`Quiz.jsx:202`). Autofocusing either grade lets a
held `Enter` walk the whole deck recording answers nobody gave, and whichever one got
the focus would be the one it recorded. Grading is a deliberate second key.

### What does not change

The result stage (`Quiz.jsx:332`) needs no edit at all, which is worth stating because
it looks like it should:

- The miss list branches on `m.kind.startsWith("mean")` (`Quiz.jsx:393`). `"card"` does
  not, so a card miss falls into the form renderer below it, which looks the form up by
  `m.formId` and prints word, form label, surface and romaji — exactly right.
- The by-rule rollup's `touched` set (`Quiz.jsx:344`) reads `q.formId` for any
  non-meaning kind. A card item has a real form id, so `ruleKey` buckets it correctly.
- **Drill the N missed** (`Quiz.jsx:370`) calls `start(misses, 0)`, which re-queues the
  same card items. The missed cards come back as cards.

`start`, `advance`, `judge`, the progress header and `onProgress` are all generic over
`{wordId, formId, kind}` and are reused as they stand.

The leave-confirmation modal in `App.jsx:351` keeps its "Quiz in progress" eyebrow and
its "questions answered" label. Flash cards are in the Quiz tab and the count is
accurate; a noun prop threaded through for one word is not worth it.

### Test

`cardItems` is pure, so it goes in the existing suite as its own group:

- One card per (word, form) for the form ids given, and none for ids left out.
- A noun yields cards — guards the claim that nouns are not a special case.
- An ichidan verb with both `pot` and `pass` selected yields one 食べられる card, not
  two. This is the dedupe, and it is the one piece of real logic here.
- Every item is `kind: "card"` with a non-null `formId`, which is what the untouched
  result stage depends on.

`FlashCard.jsx` is picked up free by the module-wiring group (`engine.test.mjs:542`),
which globs `src/*.jsx` — a missing import there is a blank screen, and that check is
why it is caught.

## Files

| File | Change |
|---|---|
| `src/engine.js` | `cardItems(pool, formIds)`, added to the export list |
| `src/FlashCard.jsx` | New. The card face, ~130 lines |
| `src/Quiz.jsx` | `mode` state, mode toggle, `items` branch, question-stage branch, three controls hidden in card mode. ~+40 lines |
| `test/engine.test.mjs` | `cardItems` group |
| `src/changelog.js`, `package.json` | 0.6.0 entry and bump, in one commit of their own |
| `README.md` | Flash cards in the Features list |

## Deliberate limitation

**A self-grade and a typed answer land in the same counter.** `record()` takes a
boolean; it has no notion of how hard the evidence was. Twenty cards marked **Knew it**
move a rule's accuracy exactly as far as twenty typed answers would, and the Progress
view cannot tell them apart.

This was chosen over a separate counter set, which would mean a `stats.js` schema
change, a migration in `mergeStored`, a second number everywhere in `ProgressView`, and
a decision about which one the by-rule diagnosis reports. The cost of the cheap version
is that a lenient self-grader inflates their own numbers — a bias against themselves
only, in a single-player app with no leaderboard. If it ever matters, the fix is a
third argument to `record()` and a weight, not a second schema.
