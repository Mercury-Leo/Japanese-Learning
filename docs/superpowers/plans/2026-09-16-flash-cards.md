# Flash Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a flash card mode to the Quiz tab — a card per (word, form) that shows the Japanese surface, and on tap reveals the meaning, the dictionary form, which form it is, and the morpheme breakdown, self-graded into the same stats the Quiz writes.

**Architecture:** A new pure `cardItems()` in `engine.js` builds the card list; a new presentational `FlashCard.jsx` draws one card; `Quiz.jsx` gains a `mode` toggle and routes its existing queue/tally/result machinery at it. The result stage is untouched — a card item's shape is deliberately the same `{wordId, formId, fromId, kind}` the Quiz already carries, so every downstream consumer keeps working.

**Tech Stack:** React 18, Vite, no test framework (`node test/engine.test.mjs`), inline styles from `theme.js` with shared classes in `app-css.js`.

Spec: `docs/superpowers/specs/2026-09-16-flash-cards-design.md`

## Global Constraints

- **No new dependencies.** Everything needed exists in `engine.js`, `ui.jsx`, `theme.js`, `app-css.js`.
- **No new CSS.** The reveal reuses `.kd-swap` (`app-css.js:127`); the global `prefers-reduced-motion` rule at `app-css.js:184` already disables it. Do not add keyframes.
- **`engine.js` stays pure** — no React, no DOM, no network. `cardItems` is a plain function over plain objects.
- **Every name a `.jsx` file references from `engine.js` / `settings.js` / `stats.js` / `theme.js` / `ui.jsx` must be imported explicitly.** The module-wiring group in `test/engine.test.mjs:535` fails the build otherwise — a missing import is a blank screen no other test can see.
- **Tests run with `npm test`** (`node test/engine.test.mjs && node test/sw.test.mjs`). Exit code is non-zero on any failure.
- **Commit messages:** imperative mood, no `feat:`/`fix:` prefixes — match the existing log (`Drill a chart, or the whole tab it sits in`). End with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Branch:** `flash-cards`. Do not merge or push.

---

### Task 1: `cardItems` in the engine

The card list is the only real logic in this feature — specifically the homograph dedupe. It goes in `engine.js` because that is where pure logic lives and because the suite can only reach it there.

**Files:**
- Modify: `src/engine.js` — add `cardItems` after `meaningItems` (currently ends at line 820), and add it to the `export {` block (line 823)
- Test: `test/engine.test.mjs` — new group after the `meaning questions` group (which ends around line 413)

**Interfaces:**
- Consumes: `conjugate(w)` and `formText(f)`, both already defined in `engine.js` above this point.
- Produces: `cardItems(pool, formIds) → Array<{ wordId, formId, fromId: null, kind: "card" }>`, where `pool` is an array of word objects (`{id, word, reading, type, meaning}`) and `formIds` is an array of form-id strings. Task 3 calls this.

- [ ] **Step 1: Write the failing test**

In `test/engine.test.mjs`, add `cardItems` to the existing `../src/engine.js` import list (line 6-10), so it reads:

```js
import {
  romaji, toKana, settleKana, conjugate, detectType,
  stackInit, stackApply, answerMatches, columns, formText, meaningItems, cardItems,
  teRule, SEED, TYPES,
} from "../src/engine.js";
```

Then add this group immediately after the `meaning questions` group (before `/* ---------------- settings ---------------- */` or whatever group follows it):

```js
/* ---------------- flash cards ---------------- */
group("flash cards");
const FC = (id, word, reading, type) => ({ id, word, reading, type, meaning: "x" });
const eat = FC("eat", "食べる", "たべる", "ichidan");
const book = FC("book", "本", "ほん", "noun");

const ci = cardItems([eat], ["dict", "masu", "te"]);
eq(ci.length, 3, "one card per selected form");
eq(ci.every((i) => i.kind === "card"), true, "every item is a card");
eq(ci.every((i) => i.wordId === "eat" && i.formId && i.fromId === null), true, "a card carries a real form id");
eq(ci.map((i) => i.formId).join(","), "dict,masu,te", "cards come out in engine form order");
eq(cardItems([eat], ["nope"]).length, 0, "a form id the word does not have yields nothing");
eq(cardItems([], ["dict"]).length, 0, "an empty pool yields nothing");

// 食べられる is both the potential and the passive. Two cards with one front and
// contradicting backs is a trap rather than a drill, so the first of the pair in
// engine order wins and the second is dropped.
const both = cardItems([eat], ["pot", "pass"]);
eq(both.length, 1, "a homograph pair collapses to one card");
eq(both[0].formId, "pot", "and it is the first of the pair in engine order");

// A noun is not a special case: build() routes it through buildNaAdj, which gives
// it ten forms of its own. This is why flash cards need no Meaning question.
eq(cardItems([book], ["dict", "desu", "janai"]).length, 3, "a noun yields cards like anything else");
eq(cardItems([eat, book], ["dict"]).length, 2, "one card per word per form across the pool");
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test
```

Expected: `SyntaxError` — `The requested module '../src/engine.js' does not provide an export named 'cardItems'`. The suite does not start.

- [ ] **Step 3: Write the implementation**

In `src/engine.js`, directly after `meaningItems` ends (line 820) and before the `export {` block:

```js
/* Flash cards — one per (word, form) the caller asked for, in engine form order.
   Unlike a quiz item there is no direction and no distractor set: a card has a
   front and a back, and the back is the same every time.

   The dedupe is the whole reason this is a function rather than two nested maps.
   An ichidan potential and passive are both 食べられる, and two cards with one
   front and contradicting backs teaches that the front is ambiguous — which it
   is, but that is a lesson for the breakdown, not for a recall drill. First form
   in engine order wins. */
function cardItems(pool, formIds) {
  const want = new Set(formIds);
  const out = [];
  for (const w of pool) {
    const taken = new Set();
    for (const f of conjugate(w)) {
      if (!want.has(f.id)) continue;
      const surface = formText(f);
      if (taken.has(surface)) continue;
      taken.add(surface);
      out.push({ wordId: w.id, formId: f.id, fromId: null, kind: "card" });
    }
  }
  return out;
}
```

Then add `cardItems,` to the `export {` block, on the line directly after `meaningItems,`:

```js
  meaningItems,
  cardItems,
  REVERSE_SOURCES,
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test
```

Expected: the `flash cards` group prints with no `FAIL` lines, and the run exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/engine.js test/engine.test.mjs
git commit -m "$(cat <<'EOF'
Build the flash card list, one card per word and form

A homograph pair collapses to one card: 食べられる is both the ichidan
potential and the passive, and two cards with one front and contradicting
backs is a trap rather than a drill.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The card face

`FlashCard.jsx` draws one card and nothing else. It owns no run state: the queue, the index, the tally and even `flipped` live in `Quiz`, because the run's keyboard listener has to be able to open a card.

**Files:**
- Create: `src/FlashCard.jsx`

**Interfaces:**
- Consumes: `formText(f)` / `formKana(f)` / `romaji(kana)` / `typeLabel(id)` from `engine.js`; `Word` and `Strip` from `ui.jsx`; `Say` from `Say.jsx`.
- Produces: default export `FlashCard({ word, form, script, settings, flipped, onFlip, onGrade })`.
  - `word` — a deck word `{word, reading, type, meaning}`
  - `form` — one form object from `conjugate(word)`: `{id, label, jp, group, segs, note}`
  - `script` — `"kana"` or `"furigana"`
  - `settings` — needs `settings.show.audio`, `.romaji`, `.glosses`
  - `flipped` — boolean, controlled by the parent
  - `onFlip()` — called when the front is tapped
  - `onGrade(ok: boolean)` — `false` for **Didn't**, `true` for **Knew it**

  Task 3 renders this.

- [ ] **Step 1: Write the component**

Create `src/FlashCard.jsx`:

```jsx
import { C, MINCHO, MONO, T, JP, RUBY, S, P } from "./theme.js";
import { romaji, formText, formKana, typeLabel } from "./engine.js";
import { Word, Strip } from "./ui.jsx";
import Say from "./Say.jsx";

/* ============================================================
   FLASH CARD

   One card: the surface on the front, and on the back everything that makes it
   that surface — the word it came from, what the form is called, and the
   morphemes it is built out of. That last part is the reason to build cards
   here rather than use any of the twenty apps that already have them: the back
   does not merely assert that 食べました is the polite past, it shows
   食べ・まし・た with the glosses on.

   Presentational only. Every piece of run state, `flipped` included, lives in
   Quiz — the keyboard listener there has to be able to open a card, and state
   that two places set belongs to neither of them.
   ============================================================ */
export default function FlashCard({ word, form, script, settings, flipped, onFlip, onGrade }) {
  /* The dictionary form has no "regular form" to reveal — it *is* the regular
     form — so its back is the meaning alone and its Strip is one segment. That
     is correct output rather than a case to special-case. */
  const isDict = form.id === "dict";

  return (
    <div>
      {/* ---- front ---- */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: S[1] }}>
        {/* The word itself is the button — turning a card over is a gesture at
            the card, not at a control beside it. Say sits outside rather than
            inside it, because a button inside a button is not a thing. */}
        <button className="kd-btn" onClick={onFlip} disabled={flipped}
          style={{
            flex: 1, minWidth: 0, textAlign: "left", padding: 0,
            background: "transparent", cursor: flipped ? "default" : "pointer",
          }}>
          <div style={{ fontFamily: MINCHO, fontSize: JP.xl }}>
            <Word text={formText(form)} kana={formKana(form)} mode={script} ruby={RUBY.xl} />
          </div>
        </button>
        <Say text={formKana(form)} size={15} enabled={settings.show.audio} />
      </div>

      <div style={{ fontFamily: MONO, fontSize: T.micro, letterSpacing: ".1em", color: C.muted, marginTop: S[1] }}>
        {typeLabel(word.type)}
      </div>

      {!flipped ? (
        <div style={{ fontSize: T.fine, color: C.muted, marginTop: S[5] }}>
          Tap the word to turn it over — or press Enter.
        </div>
      ) : (
        /* ---- back ---- */
        <div className="kd-swap" style={{ marginTop: S[4], borderTop: "1px solid " + C.ruleSoft, paddingTop: S[4] }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: S[3], flexWrap: "wrap", marginBottom: S[3] }}>
            {!isDict && (
              <span style={{ fontFamily: MINCHO, fontSize: JP.lg }}>
                <Word text={word.word} kana={word.reading} mode={script} ruby={RUBY.lg} />
              </span>
            )}
            <span style={{ fontSize: T.md, paddingBottom: S[1] }}>{word.meaning}</span>
            {!isDict && (
              <span style={{ paddingBottom: 2 }}>
                <Say text={word.reading} label="Play the dictionary form" enabled={settings.show.audio} />
              </span>
            )}
          </div>

          {/* Same filled chip the deck and the quiz use for "the form in
              question", so one form looks the same in all three. */}
          <div className="kd-ask">
            <span>{isDict ? "This is the" : "which is the"}</span>
            <span className="kd-ask-target">
              {form.label}
              <span style={{ fontFamily: MINCHO, letterSpacing: 0, textTransform: "none", marginLeft: S[1] + 1 }}>{form.jp}</span>
            </span>
          </div>

          <Strip segs={form.segs} script={script} glosses={settings.show.glosses} />

          <div style={{ display: "flex", alignItems: "center", gap: S[1], marginTop: S[2] }}>
            {settings.show.romaji && (
              <span style={{ fontFamily: MONO, fontSize: T.fine, color: C.muted }}>{romaji(formKana(form))}</span>
            )}
            <Say text={formKana(form)} label="Play the form" enabled={settings.show.audio} />
          </div>

          {form.note && (
            <div className="kd-note" style={{ marginTop: S[3], borderLeftColor: C.extra }}>{form.note}</div>
          )}

          {/* No grade before the flip, and none of these is focused: a held
              Enter would otherwise walk the whole deck recording answers nobody
              gave, and whichever button had the focus is the one it would
              record. Grading is a deliberate reach. */}
          <div style={{ display: "flex", gap: S[2], marginTop: S[5] }}>
            {[[false, "1", "Didn't", C.stem], [true, "2", "Knew it", C.aux]].map(([ok, key, label, bg]) => (
              <button key={key} className="kd-btn" onClick={() => onGrade(ok)}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: S[2],
                  background: bg, color: C.panel, padding: P.wide, fontSize: T.base,
                }}>
                <span className="kd-opt-key" aria-hidden="true">{key}</span>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run the tests**

```bash
npm test
```

Expected: PASS. The `module wiring` group globs `src/*.jsx` (`test/engine.test.mjs:542`), so it now checks this file's import list too. If it reports `FlashCard.jsx references X but does not import it from Y`, add the missing import — that failure is exactly the blank screen the group exists to catch.

This is the honest limit of what this task can verify: the file parses and imports everything it uses. Nothing renders it yet — Task 3 is where it is seen.

- [ ] **Step 3: Commit**

```bash
git add src/FlashCard.jsx
git commit -m "$(cat <<'EOF'
Draw a flash card, surface on the front and the morphemes on the back

The back gives the dictionary form, the meaning, what the form is called,
and the breakdown with its glosses — the last is the reason to build cards
in this app rather than use one that already has them.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Run the cards in the Quiz tab

The task that makes it work. Every edit is to `src/Quiz.jsx`.

**Files:**
- Modify: `src/Quiz.jsx`

**Interfaces:**
- Consumes: `cardItems` (Task 1), `FlashCard` (Task 2).
- Produces: nothing downstream depends on this.

**Do not touch the result stage** (`Quiz.jsx:332`–`450`). It needs no edit, which is worth stating because it looks like it should need one: the miss list branches on `m.kind.startsWith("mean")` (`Quiz.jsx:393`), and `"card"` does not match, so a card miss falls into the form renderer below it and prints word, form label, surface and romaji correctly. The by-rule `touched` set (`Quiz.jsx:344`) reads `q.formId` for any non-meaning kind, and a card item has a real one. **Drill the N missed** (`Quiz.jsx:370`) re-queues card items as cards.

Nor is there a かな IME control to hide: it lives inside the answer-input branch of the question stage, which a card never reaches.

- [ ] **Step 1: Add the imports**

Add `cardItems` to the `engine.js` import list at the top of `src/Quiz.jsx`:

```js
import {
  romaji, toKana, settleKana, conjugate, typeLabel, GROUPS, formText, formKana,
  answerMatches, shuffle, shuffleStable, meaningItems, cardItems, REVERSE_SOURCES,
} from "./engine.js";
```

And add, after the `import Say from "./Say.jsx";` line:

```js
import FlashCard from "./FlashCard.jsx";
```

- [ ] **Step 2: Add the two new pieces of state**

After `const [meaningOn, setMeaningOn] = useState(true);` (line 22):

```js
  const [mode, setMode] = useState("quiz");
```

After `const [judged, setJudged] = useState(null);` (line 32):

```js
  /* A card has three states where a question has two: `flipped && !judged` —
     revealed, not yet graded — is the one the grade buttons live in. */
  const [flipped, setFlipped] = useState(false);
```

- [ ] **Step 3: Branch the item builder**

In the `items` memo (`Quiz.jsx:55`), insert as the first statement of the memo body, above `const out = [];`:

```js
    /* Cards are one per (word, form) and nothing else. No direction to pick,
       and no meaning pair: every card reveals its meaning anyway, so the
       Meaning question would be the same card twice. */
    if (mode === "cards") return cardItems(pool, formIds);
```

And add `mode` to that memo's dependency array, so it reads:

```js
  }, [poolKey, formIds.join(","), dir, meaningOn, words, mode]); // eslint-disable-line
```

- [ ] **Step 4: Clear `flipped` on every queue move**

In `start()` (`Quiz.jsx:89`), after `setJudged(null);`:

```js
    setFlipped(false);
```

In `advance()` (`Quiz.jsx:147`), after `setJudged(null);`:

```js
    setFlipped(false);
```

- [ ] **Step 5: Add `grade()`**

Directly after `advance()` ends:

```js
  /* A card has already shown its whole back by the time you grade it, so there
     is nothing left to reveal and the grade is the advance. judge() still does
     the recording, so there is still exactly one place that records. Both
     setState calls land in one batch, which is why `judged` is never observed
     true on a card — and why the verdict block and the Next-focus effect below
     never fire for one. */
  function grade(ok) {
    if (!flipped) return;
    judge(ok);
    advance();
  }
```

- [ ] **Step 6: Add the `isCard` flag**

Beside `isRecog` (`Quiz.jsx` — the line `const isRecog = !!current && current.kind === "recognise";`), directly after it:

```js
  const isCard = !!current && current.kind === "card";
```

- [ ] **Step 7: Give the keyboard listener a card branch**

In the run's `onKey` (`Quiz.jsx:178`), insert this block directly after the `if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;` guard and before the `if (e.key === "Enter")` block:

```js
      /* A card is flip-then-grade, so it does not share the question keys.
         Enter or Space opens it; once open, only the digits commit. Enter is
         deliberately inert after the flip, and no grade button is focused —
         a held Enter would otherwise walk the deck recording answers nobody
         gave, and whichever button had the focus is the one it would record. */
      if (isCard) {
        if (!flipped) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setFlipped(true); }
        } else if (e.key === "1" || e.key === "2") {
          e.preventDefault();
          grade(e.key === "2");
        }
        return;
      }
```

Then extend that effect's dependency array — **this matters**: the listener closes over `flipped`, so without it the flip key works on the first card and dies on the second.

```js
  }, [stage, judged, options, isCard, flipped]); // eslint-disable-line
```

- [ ] **Step 8: Add the mode toggle to the setup screen**

In the `stage === "setup"` return (`Quiz.jsx:217`), wrap the existing two-panel row in an outer `<div>` and put the toggle above it. The return becomes:

```jsx
    return (
      <div>
        <div style={{ display: "flex", gap: S[1], marginBottom: S[4] }}>
          {[["quiz", "Quiz", "問"], ["cards", "Flash cards", "札"]].map(([id, label, jp]) => (
            <Chip key={id} on={mode === id} ink onClick={() => setMode(id)}>
              {label}
              <span style={{ fontFamily: MINCHO, fontSize: T.micro, marginLeft: S[1], opacity: .8 }}>{jp}</span>
            </Chip>
          ))}
        </div>
        <div style={{ display: "flex", gap: S[4] + 2, flexWrap: "wrap", alignItems: "flex-start" }}>
```

…leaving the two panel `<div>`s exactly as they are, and closing with one extra `</div>` before the existing `);`.

- [ ] **Step 9: Hide the three Quiz-only setup controls**

In the second panel, wrap the **Vocabulary / Meaning** block and the **Direction** block — that is, everything from `<div className="kd-micro" style={{ marginBottom: S[2] }}>Vocabulary</div>` (`Quiz.jsx:283`) through the closing `</div>` of the Direction chip row (`Quiz.jsx:299`-ish, the one directly before `<div className="kd-micro" style={{ marginBottom: S[2] }}>Length</div>`) — in:

```jsx
            {mode === "quiz" && (<>
              ...the Vocabulary heading, the Meaning chip row, the Direction heading, the Direction chip row, unchanged...
            </>)}
```

Leave **Length** and everything below it alone.

- [ ] **Step 10: Make the start button and its hints say "card" in card mode**

Directly above the `return (` of the setup stage, add:

```jsx
    const unit = mode === "cards" ? "card" : "question";
```

In the start button's label, replace `" question"` with `" " + unit`:

```jsx
              {total === 0 ? "Pick words and forms to begin" : "Start · " + (len === 0 || len > total ? total : len) + " " + unit + ((len === 0 || len > total ? total : len) === 1 ? "" : "s")}
```

Replace the no-forms warning (`Quiz.jsx:314`-ish) with:

```jsx
            {available.length === 0 && (mode === "cards" || meaningCount === 0) && (
              <div style={{ fontSize: T.fine, color: C.muted, marginTop: S[2] }}>
                No forms available. Enable some in Settings{mode === "cards" ? "." : ", or turn Meaning on above."}
              </div>
            )}
```

And the closing hint:

```jsx
            {total > 0 && (
              <div style={{ fontSize: T.fine, color: C.muted, marginTop: S[2], lineHeight: 1.5 }}>
                {total} available from {pool.length} word{pool.length === 1 ? "" : "s"}.{" "}
                {mode === "cards" ? "Tap a card to turn it over." : "Answer in kanji, kana, or romaji."}
              </div>
            )}
```

- [ ] **Step 11: Render the card in the question stage**

The progress header is shared, so lift it out rather than duplicating it. Directly after `const pctDone = Math.round((idx / queue.length) * 100);`, add:

```jsx
  const header = (
    <div style={{ display: "flex", alignItems: "center", gap: S[3], marginBottom: S[3], flexWrap: "wrap" }}>
      <span className="kd-micro">{idx + 1} / {queue.length}</span>
      <div style={{ flex: 1, minWidth: 80, height: 4, background: C.ruleSoft, display: "flex" }}>
        <div style={{ width: pctDone + "%", background: C.ink, transition: "width .25s" }} />
      </div>
      <span style={{ fontFamily: MONO, fontSize: T.micro, letterSpacing: ".1em", color: C.aux }}>◯ {right}</span>
      <span style={{ fontFamily: MONO, fontSize: T.micro, letterSpacing: ".1em", color: C.stem }}>✕ {wrongSoFar}</span>
    </div>
  );

  if (isCard) return (
    <div>
      {header}
      <div style={{ ...box, borderTop: "3px solid " + C.ink, padding: "20px 16px" }}>
        <FlashCard word={cWord} form={target} script={qMode} settings={settings}
          flipped={flipped} onFlip={() => setFlipped(true)} onGrade={grade} />
      </div>
    </div>
  );
```

Then in the existing question-stage `return (`, delete the now-duplicated progress-header block (the `<div>` opening `<span className="kd-micro">{idx + 1} / {queue.length}</span>`, through its closing `</div>`, and the `{/* progress + live tally */}` comment above it) and put `{header}` in its place.

- [ ] **Step 12: Run the tests**

```bash
npm test
```

Expected: PASS, including the `module wiring` group now checking `Quiz.jsx`'s two new imports.

- [ ] **Step 13: Verify in the browser**

Start the dev server with the Browser pane (`preview_start` with `{name: "kotoba-dev"}` — never `npm run dev` in a shell), then walk this list. The deck ships with a seed deck, so there are words to pick.

1. Go to **Quiz**. The `Quiz 問 / Flash cards 札` toggle sits above both panels.
2. Tap **Flash cards**. The **Vocabulary / Meaning** and **Direction** blocks disappear; **Length** stays. The start button reads `Start · N cards`, and the line under it ends `Tap a card to turn it over.`
3. Start a run. A card shows one Japanese surface, a play button, and the class tag — **no meaning and no form name**. Confirm the back is genuinely not on screen.
4. Tap the word. The back appears with the dictionary form, the meaning, the form name chip, the morpheme Strip with glosses, romaji, and the two grade buttons.
5. Press **Knew it**. It advances immediately, and `◯` goes up by one.
6. On the next card press `Enter`, then `1`. It advances and `✕` goes up by one.
7. Check the console (`read_console_messages`) — no React key warnings, no "buttons cannot appear as a descendant of button".
8. Finish the run. The result screen lists the cards you pressed **Didn't** on, each with its form label and surface. Press **Drill the N missed** — those come back as cards, not as typed questions.
9. Go to **Progress**. The words you graded have moved.
10. Switch back to **Quiz** mode and start a normal run — typed answers, multiple choice and Meaning questions all still work, and `Enter` still advances a judged question.

Fix anything that fails here before committing.

- [ ] **Step 14: Commit**

```bash
git add src/Quiz.jsx
git commit -m "$(cat <<'EOF'
Turn the deck over card by card, in the Quiz tab

Flash cards share the Quiz's word picker, form picker, queue, tally and
result screen — the result stage needed no edit at all, because a card miss
already falls through its kind branch into the form renderer.

Grading advances: the back is fully shown before you grade, so there is
nothing left to reveal. Enter opens a card and the digits commit, but Enter
is inert once open and neither grade button is focused — otherwise a held
Enter walks the deck recording answers nobody gave.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Release

The repo's convention (`src/changelog.js:1-9`): a version bump and its changelog entry go in one commit of their own, and a bump with no entry ships silently rather than announcing a version it cannot describe.

**Files:**
- Modify: `package.json` — `version`
- Modify: `src/changelog.js` — new entry at the head of `CHANGELOG`
- Modify: `README.md` — the Features list

**Interfaces:** none.

- [ ] **Step 1: Add the changelog entry**

In `src/changelog.js`, add as the first element of the `CHANGELOG` array, above the `0.5.0` entry:

```js
  {
    version: "0.6.0",
    changes: [
      "The Quiz tab turns into a stack of flash cards: a form on the front, and on the back the word it came from, what it means, and what the form is called.",
      "The back shows the morphemes too, so a card says why 食べました is the polite past rather than only that it is.",
      "Say whether you knew it and the answer counts toward Progress like any other.",
    ],
  },
```

- [ ] **Step 2: Bump the version**

In `package.json`, change `"version": "0.5.0",` to `"version": "0.6.0",`.

- [ ] **Step 3: Add it to the README**

In `README.md`, in the **Features** list, insert directly after the **Quiz** bullet (the one ending "It is the only drill a noun has."):

```markdown
- **Flash cards** in the same tab, off the same word and form pickers — a form on
  the front, and on the back the dictionary form, the gloss, the form's name and
  its morpheme breakdown. Self-graded, and the grade counts toward Progress like
  a typed answer does. A noun is not a special case here: it has ten forms of its
  own, so **Dictionary** is the plain word-to-meaning card.
```

- [ ] **Step 4: Build, and see the note**

```bash
npm test && npm run build
```

Expected: both green. The build is the part that matters here — `npm test` never *executes* `changelog.js` (the module-wiring group reads `.jsx` files as text, and no test imports `App.jsx`), so a syntax error in the new entry would sail straight past it. Vite parses the whole graph and would not.

Then check the **What's new** popup, which has two traps in it:

- `vite.config.js:8` reads `package.json` at *config* load and bakes it into `__VERSION__`, so a dev server started before Step 2 is still serving 0.5.0. **Restart it** (`preview_stop`, then `preview_start`) — a reload is not enough.
- `App.jsx:60` returns nothing when no version is stored, so a browser profile that has never run the app shows no popup. If you want to see it, run the app once on 0.5.0 first, then restart on 0.6.0.

With both handled, the popup should list the three lines above on load. Dismiss it.

- [ ] **Step 5: Commit**

```bash
git add package.json src/changelog.js README.md
git commit -m "$(cat <<'EOF'
Say what 0.6.0 changed, and bump to it

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-review notes

**Spec coverage.** Entry toggle → Task 3 Step 8. Three hidden controls → Step 9 (and the note above Step 1 explaining why かな IME needs no edit). `cardItems` incl. dedupe → Task 1. Card front/back in the spec's five-part order → Task 2. Grading through `judge` → Task 3 Step 5. Keyboard contract → Step 7. "What does not change" → asserted in the Task 3 preamble and checked at Step 13 items 8–10. Test list → Task 1 Step 1, all four cases present.

**One decision the spec left open,** resolved here: grading advances immediately, with no Next button. The spec said the grade "calls `onRecord` through the existing `judge(ok)`" but did not say what happens next; since a card shows its entire back *before* it is graded, there is nothing a Next step would reveal. The consequence is that `judged` is never observed true during a card, which is why the verdict block and the `nextRef` focus effect need no card guards.

**Naming consistency.** `cardItems(pool, formIds)`, `kind: "card"`, `isCard`, `flipped`, `grade(ok)`, `FlashCard({word, form, script, settings, flipped, onFlip, onGrade})` — used identically in Tasks 1, 2 and 3.
