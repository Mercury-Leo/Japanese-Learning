# Quiz Results — Design

Date: 2026-08-16
Status: approved, not yet implemented

## Problem

The quiz has no memory. `right` and `misses` are `useState` inside `Quiz`, discarded
when the component unmounts — the leave-confirmation says so out loud: "The score is
not saved anywhere yet, so it goes with it" (`App.jsx:1570`). Every run starts knowing
nothing about the learner.

The opportunity is not "add spaced repetition". It is that **these questions are
structured by grammar**, so results aggregate along the grammar rather than the
vocabulary. Each item already carries `{wordId, formId, kind}`. A conventional
flashcard app can record that you failed 飲んで. This app can record that you fail the
撥音便 rule across 飲む, 遊ぶ and 死ぬ — because `engine.js` knows those three share it.

That diagnosis is the differentiator, and nothing else in the backlog depends on
storage the way it does.

## Goals

- Persist per-(word, form) outcomes across sessions and devices.
- Report accuracy grouped by **grammar rule**, not just by word.
- Surface it in three places: quiz results, a Progress view, the Vocab ledger.
- Stay offline, keep the existing storage approach, no new dependency.

## Non-goals

- **Question weighting.** Deferred deliberately: tuning a selection algorithm against
  zero data is guesswork. Agreed approach for the follow-up is *half the queue drawn
  from weakest (word, form) pairs, half at random* — predictable, nothing to tune, and
  it keeps surfacing known items, which is how they stay known. Not in this spec.
- **Leitner buckets or interval scheduling.** Needs a time model this does not have.
- **Accuracy over time.** See "Deliberate limitation" below.
- **Server sync.** Export/Import remains the migration path.

## Design

### Two findings that drive the rest

**1. The diagnosis is a derivation, not stored data.** `conjugate()` does not tag forms
with a rule identity, and does not need to. The rule is a pure function of
`(word.type, formId, final kana of reading)` — `ONBIN` (`engine.js:137`) already groups
the euphonic classes and `GODAN[last]` already holds the outcome.

So: **store the outcome, derive the rule at read time.** No engine change, no new
field, no migration. If the taxonomy is refined later, historical data reclassifies
itself, because the classification was never baked in.

**2. Stats must not be keyed by `wordId`.** `importWords` dedups on
`w.word + "|" + w.reading` (`App.jsx:1410`), but `readFile` mints *new* ids on import
(`"i" + Math.random()…`) and `addWord` uses `"w" + Date.now()`. Ids are device-local.
Keying stats by `wordId` would destroy progress on the exact operation the README
prescribes for moving a deck to a phone.

Stats are therefore keyed by the same natural `word|reading` pair the dedup already
uses. Cost: editing a word's reading orphans its history. Accepted.

### Storage

New key `kotoba-stats-v1` in `storage.js`, alongside `KEY`/`SKEY`/`GKEY`/`TKEY`.

```js
{
  version: 1,
  entries: {
    "飲む|のむ": {
      te:      { n: 12, ok: 5, last: 1755300000000, streak: -2 },
      meaning: { n: 4,  ok: 4, last: 1755299000000, streak: 4 }
    }
  }
}
```

- `n` attempts, `ok` correct, `last` epoch ms, `streak` consecutive (positive = right,
  negative = wrong).
- Form key is the `formId`, plus the pseudo-form `meaning` for `mean-en` / `mean-ja`
  items, which have no `formId`.
- Held in `App` state beside `words` and persisted by the same `useEffect` pattern
  already used there, so it flows down to Quiz, Progress and Vocab unchanged.

Roughly 40 bytes per entry. Only drilled forms get entries, so a realistic deck lands
in the low hundreds of KB against a ~5 MB budget.

> `ponytail: whole-map JSON.stringify on every answer. Fine at hundreds of entries;
> move to IndexedDB if a deck ever makes the write measurable.`

### Rule derivation

One pure function in `engine.js` — it is logic, it is testable, and that file is
explicitly the valuable independently-testable part.

```js
ruleKey(word, formId) -> { id, label, jp }
```

Two flat groupings, not a taxonomy tree: accuracy **by form** is just `groupBy(formId)`
and needs no function at all, so `ruleKey` only has to name the grammar rule.

| case | id | label |
| --- | --- | --- |
| meaning pseudo-form | `meaning` | Meaning · 意味 |
| godan, て-family, 行く | `godan.te.iku` | 行く irregular · 音便例外 |
| godan, て-family, う・つ・る | `godan.te.sokuon` | う・つ・る → って · 促音便 |
| godan, て-family, く・ぐ | `godan.te.ionbin` | く・ぐ → いて／いで · イ音便 |
| godan, て-family, す | `godan.te.su` | す → して · い-stem, no 音便 |
| godan, て-family, ぬ・ぶ・む | `godan.te.hatsuon` | ぬ・ぶ・む → んで · 撥音便 |
| anything else | `<type>.<formId>` | e.g. Ichidan て-form |

There are exactly **three** 音便 — イ, 促, 撥. す is not one of them: 話す → 話して is the
plain い-stem plus て with no sound change at all, which is what `ONBIN` already says at
`engine.js:140`. Labelling it シ音便 would teach something false, so the す bucket is
named as the regular case. It still earns a bucket, because learners miss it anyway.

The て-family is `te`, `ta`, `teiru`, `teimasu` — the forms that actually consume
`GODAN[last].te` / `.ta`. `nakatta` is excluded: it builds from the A-stem and involves
no euphonic change.

### Recording

`submit`, `choose` and `reveal` each already do the same three things — set `judged`,
bump `right`, or push to `misses`. Extract the shared `judge(ok, chose)` helper and
record there. That removes existing duplication and leaves exactly one write site.

Recording must **not** live in a `useEffect` keyed on `judged`: the app renders under
`<React.StrictMode>`, which double-invokes effects in development and would double-count
every answer.

`reveal` ("Show me") records as a miss — not knowing it is the same as getting it wrong.

### Export / import

`stats` becomes a sibling of `words` in the export payload. Because both are keyed on
`word|reading`, they line up without any id mapping.

Merge on import: sum `n`, sum `ok`, take `max(last)`, reset `streak` to `0` — two
streaks cannot be meaningfully combined.

Note: exporting a deck to share it also shares your accuracy numbers. Acceptable for a
personal study tool; a deck-only export toggle can come later if it ever matters.

### Surfaces, in build order

**(a) Quiz results screen** — cheapest, extends the existing `done` stage which already
renders Right/Wrong and the missed list. Add a "By rule" block: rules touched in this
run, lifetime accuracy, weakest first. Suppress rules with `n < 3` so a single answer
does not read as a diagnosis.

**(b) Vocab ledger** — an accuracy figure per row, aggregated across that word's forms.
The rows are full-width and currently carry only a gloss and tags.

**(c) Progress view** — a fifth nav item, and the bulk of the work. Contents:

- Overall answered and accuracy.
- Weakest rules (`n >= 3`), ascending, using the same `ruleKey` labels.
- A 9×5 五段 grid: rows う・く・ぐ・す・つ・ぬ・ぶ・む・る, tinted by accuracy on that
  ending's onbin rule. This is the existing `Ladder` idea generalised from one verb to
  the whole class, and it is the picture the whole feature exists to draw.

Empty states matter here: with no data the Progress view must say so plainly rather
than render an empty grid, in the same voice as the existing 空 states.

### Deliberate limitation

The schema stores **aggregates, not events**, so "accuracy over the last month" is not
recoverable — only "accuracy ever". This keeps storage flat and small.

If trend lines are wanted later they need an append-only event log, which is a
different schema, not an extension of this one. Stated here so the tradeoff is a
decision rather than a surprise.

## Testing

`engine.test.mjs` gets `ruleKey` coverage — it is pure, so this is cheap and is where
the real risk sits:

- each て-family class maps correctly (う・つ・る, く, ぐ, す, ぬ・ぶ・む)
- ぐ lands in the same イ音便 bucket as く, not a bucket of its own
- 行く classifies as the irregular, not as the く rule
- `nakatta` does **not** classify as an onbin rule
- non-godan types fall through to `<type>.<formId>`
- `meaning` maps to the pseudo-form

Plus one merge test: importing a deck whose stats overlap the existing ones sums `n`
and `ok` and does not double-count.

The existing 191 engine and 10 service-worker tests must stay green; nothing here
touches conjugation or caching.
