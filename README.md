# 言葉帳 · Kotoba-chō

A Japanese vocabulary deck built around a conjugation engine that composes rather
than enumerates. Track words, take any form apart morpheme by morpheme, stack
modifiers the way Japanese actually does, and drill it.

## Running it

```
npm install
npm run dev
```

Then open the URL Vite prints. `npm test` runs the engine regression suite.

## What's here

```
src/engine.js   pure logic — conjugation, stacking, the kana IME, answer
                matching. No React, no DOM, no network. This is the valuable
                part and it is independently testable.
src/App.jsx     the React shell: deck, study view, stack builder, quiz.
src/theme.js    palette and type stacks. Colour encodes morpheme class.
src/storage.js  localStorage behind an async interface.
src/speech.js   Web Speech audio with failure reporting.
src/api.js      the two optional network features.
test/           the regression suite.
```

## Features

- **Deck** with furigana / kanji / kana toggle, persisted locally.
- **Morpheme breakdown** — every form splits into tiles with interlinear glosses
  (`STEM.i`, `POL.NPST`, `NEG.PST`), each tappable for an explanation. Godan
  stems show the 五段 ladder with the active row lit.
- **Stacked forms** — chain causative → passive → たい → negative → past and get
  食べさせられたくなかった with all eight morphemes still individually glossed.
  Available modifiers are gated by the current class, so ます/た/て visibly close
  a chain.
- **Quiz** in two directions: produce a form, or name a form you're shown.
  Answers accepted as kanji, kana, or romaji. Right/wrong tally, missed-item
  drill.
- **Kana IME** in the answer field: type `itte`, get いって.
- **Audio** via Web Speech, reading the kana.
- **Export / import** the deck as JSON.

## Known limitations

**Audio depends on the OS.** Web Speech needs a `ja-JP` voice installed. Windows
has Haruka/Ayumi via Language Settings; macOS has Kyoko. With no Japanese voice
the app says so in the footer rather than failing silently. Recorded audio or a
TTS API is the real fix.

**Lookup and example sentences need an API key.** Copy `.env.example` to `.env`
and set `VITE_ANTHROPIC_API_KEY`. Vite inlines `VITE_*` into the browser bundle,
so the key is visible in devtools — fine locally, but put a server proxy in front
of it before this goes anywhere else. Everything else works offline.

**Sentences are generated, not sourced.** For a real build, pull them from
Tatoeba (CC-licensed) or JMdict's `JMdict_e_examp.xml`.

**Word class is guessed on manual entry.** The heuristic can't distinguish 帰る
(godan) from 変える (ichidan) by sound alone, so it's one tap to correct. Sourcing
from JMdict removes the guess entirely: `v5k-s` *is* the 行く irregularity and
`adj-ix` *is* the いい irregularity, as data rather than special cases.

**Fonts are system-dependent.** Yu Mincho on Windows, Hiragino on macOS. Stock
Android has neither and falls back to sans — self-host a subsetted Noto Serif JP
if that matters.

## Where to take it next

Persisting quiz results per (word, form) is the highest-value addition. The
questions are structured, so results aggregate along the *grammar* rather than
the vocabulary: "て-form, ぬ/ぶ/む → んで: 41%" is a diagnosis no flashcard app
can produce. Once that table exists, weighting question selection toward weak
forms is a few lines.
