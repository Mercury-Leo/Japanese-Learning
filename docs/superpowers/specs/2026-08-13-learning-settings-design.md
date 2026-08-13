# Learning Settings — Design

Date: 2026-08-13
Status: approved, not yet implemented

## Problem

A godan verb produces 19 conjugation forms, the stack builder offers 9 modifiers, and
the deck mixes 7 word classes. All of it renders unconditionally. For a learner working
on ます形 and て形 this is noise, and there is no way to quiet it.

The quiz already solves a version of this: `Quiz` keeps a `formIds` set
(`App.jsx:463`, default `["masu","te","ta","nai"]`) and renders per-form toggle chips
(`App.jsx:637-671`). That interaction is right; it just only governs one view.

## Goals

- Toggle individual conjugation forms (て-form, dictionary form, …) on and off globally.
- Toggle stack-builder modifiers, word classes, and five display elements.
- Narrow the deck by per-word metadata: JLPT level, transitivity, common-vs-rare.
- Presets, so a beginner who doesn't yet know which forms matter has a starting point.
- Work fully offline. The app needs no API key today and must not start needing one.

## Non-goals

- New grammar domains (particles, counters, keigo, adjective adverbials). Each needs its
  own engine work and its own design pass. This spec only gates what already exists.
- Per-(word, form) quiz statistics. Noted in README as the next feature; independent.
- An error boundary. Worth having, unrelated to this change.

## Settings shape

One new localStorage key, `kotoba-settings-v1`, loaded and saved exactly as `script`
already is (`App.jsx:963-991`, via `storage` from `storage.js`).

```js
{
  formIds: ["dict", "nai", "ta", "masu", "te"],       // conjugation forms, by form id
  modIds:  ["neg", "past", "polite"],                  // stack-builder modifiers
  types:   ["godan", "ichidan", "suru", "kuru", "i-adj"],
  jlpt:    ["N5", "N4"],
  trans:   ["trans", "intrans"],
  commonOnly: false,
  show: { romaji: true, glosses: true, ladder: true, audio: true, examples: true },
}
```

Absent key → `DEFAULTS`. A malformed or partial stored object is shallow-merged over
`DEFAULTS`, so a hand-edited or older payload cannot produce `undefined` arrays.

`DEFAULTS` is exactly the Beginner preset plus `trans`, `commonOnly: false` and all `show`
flags true. They are deliberately not two separately-tuned lists — a first run and a press
of Beginner must land in the same place, or the difference becomes a bug nobody can explain.

**Beginner keeps all 7 word classes on.** An earlier draft narrowed it to verbs + い-adj,
which would have silently dropped 静か from the seed deck on first run — a word count
changing from 7 to 6 with no explanation. Word *class* is not the overwhelm; 19 forms per
verb is. Beginner narrows forms and JLPT and leaves the vocabulary alone. "Verbs only"
exists for people who do want to drill verbs exclusively.

### Why `formIds` is one flat list

Form ids recur across the builders: `dict`, `te`, `ta`, `nai` and `desu` each appear in
several word classes. One flat list therefore covers every class, and turning off "Past"
turns off `た` for verbs and `かった` for い-adjectives together. That is the desired
behaviour, and it keeps the list at ~30 ids instead of 7 classes × 19 forms.

The full union, by group:

| Group | Form ids |
|---|---|
| Plain | `dict` `nai` `ta` `nakatta` `vol` `imp` `da` `janai` `datta` |
| Polite | `masu` `masen` `mashita` `masendeshita` `mashou` `desu` `kunaidesu` `kattadesu` `jaarimasen` `deshita` |
| Connective | `te` `teiru` `teimasu` `ba` `adv` `attr` `nara` |
| Derived | `pot` `pass` `caus` `tai` `sou` |

`modIds` values are `caus` `pass` `pot` `prog` `tai` `neg` `past` `polite` `te` (from
`MODS`). **Note the collision:** `te`, `pot`, `pass`, `caus` and `tai` exist as both form
ids and modifier ids. They are separate namespaces and must not be merged into one set.

### Display flags

`show` covers five elements that are currently always on with no way to quiet them: the
romaji transliteration under the morpheme strip, the interlinear gloss tags
(`ROOT`, `STEM.i`, …), the 五段 ladder, the audio buttons, and the example-sentences panel.

There is deliberately **no furigana flag** — the existing `SCRIPT 漢字＋かな / 漢字 / かな`
switch already controls that, and a second control would be a second source of truth.

## Word metadata

Three optional fields on the word record, all absent-by-default:

```js
{ id, word, reading, meaning, type, addedAt,
  jlpt?:   "N5" | "N4" | "N3" | "N2" | "N1",
  trans?:  "trans" | "intrans" | "na",   // na = not applicable (adjectives, nouns)
  common?: boolean }
```

Three sources, in order of precedence:

1. **Bundled** — `SEED` in `engine.js` gains tags for its 7 words. All are N5 and common;
   行く and 来る are `intrans`, 食べる, 飲む and 勉強する are `trans`, 高い and 静か are `na`.
2. **Manual** — the add-word form gains a JLPT select, a transitivity select, and a
   Common checkbox. All three default to unset.
3. **API, optional** — `lookupWord` pre-fills them when `VITE_ANTHROPIC_API_KEY` is set.
   `LOOKUP_PROMPT` gains the three fields; the response is whitelist-validated
   (`jlpt` ∈ N5…N1, `transitivity` ∈ transitive|intransitive|n/a → mapped to
   `trans`/`intrans`/`na`, `common` a boolean). Anything unrecognised is dropped, leaving
   the field absent rather than storing a guess.

## Filtering

Four pure functions in a new `src/settings.js`. It imports `conjugate`, `TYPES` and
`MODS` from `engine.js`; `engine.js` gains nothing but `SEED` tags. This keeps `engine.js`
as pure morphology and puts scope policy in one testable place.

```js
allForms()                      // → [{ id, label, jp, group }] deduped across all 7 classes
visibleForms(forms, settings)   // → forms.filter(f => settings.formIds.includes(f.id))
wordInScope(word, settings)     // → boolean
applyPreset(name, settings)     // → new settings object
```

`allForms()` unions `conjugate()` over one representative word per `TYPES` entry
(行く, 食べる, 勉強する, 来る, 高い, 静か, plus 学生 for `noun`, which `SEED` lacks) and
dedupes by id, keeping the first label seen. This is what populates the settings UI, which
must list every possible form with no word selected.

### The unknown rule

`wordInScope` is the only place this lives:

- **type** — `settings.types.includes(word.type)`. Always applies; `type` is never absent.
- **jlpt** — absent → passes. Present → must be in `settings.jlpt`.
- **trans** — anything other than `"trans"` or `"intrans"` (including absent and `"na"`)
  → passes. Otherwise must be in `settings.trans`.
- **commonOnly** — when true, only `common === false` is hidden. Absent → passes.

**A word is never hidden by a filter it has no data for.** This is what makes the feature
safe on an existing deck, and it is why **no migration code is needed**: a deck already in
localStorage has none of the three fields, so none of the three filters touch it.

## Surfaces gated

| Surface | Location | Change |
|---|---|---|
| Deck list | `App.jsx` deck view | filter by `wordInScope`, composed with the existing `query` search |
| Featured form + morpheme strip | `App.jsx` ~1470-1560 | `formId` intersected with visible forms |
| 五段 ladder | `Ladder`, `App.jsx:1533` | additionally gated by `show.ladder` |
| Form ladder | `App.jsx:1568-1605` | render `visibleForms(forms, settings)` |
| Stack builder | `StackPanel`, `App.jsx:137` | offer only `MODS` in `settings.modIds` |
| Examples panel | `ExamplesPanel`, `App.jsx:245` | rendered only when `show.examples` |
| Audio buttons | `Say`, `App.jsx:84` | render `null` unless `show.audio` |
| Romaji / glosses | `Strip`, `App.jsx:99` | gated by `show.romaji` / `show.glosses` |
| Quiz word list | `Quiz`, `App.jsx:457` | App passes already-scoped `words`, so `picked` initialisation is unchanged |
| Quiz form picker | `App.jsx:637-671` | `available` intersected with `settings.formIds` |
| Word-class buttons | study view type row | show only `settings.types` |

## Edge cases

These are the ways this feature can blank the UI, and each gets explicit handling:

1. **Featured form hidden.** `formId` defaults to `"masu"`; disabling Polite leaves it
   pointing at a form that is no longer rendered. Fall back to the first visible form.
2. **Quiz selection hidden.** Same for `formIds` — intersect, and if the intersection is
   empty, disable Start with a reason rather than starting a zero-question run.
3. **No forms enabled at all.** Study view renders
   "No forms enabled — turn some on in Settings", not an empty container.
4. **No words in scope.** Deck renders "No words match your current scope — widen it in
   Settings", distinct from the existing empty-deck and no-search-results states.
5. **Presets touch content only.** `applyPreset` writes `formIds`, `modIds`, `types` and
   `jlpt`. It does not write `commonOnly` or `show` — those are standing preferences, and a
   content preset must not stomp them.

## Presets

| Preset | Forms | Modifiers | Classes | JLPT |
|---|---|---|---|---|
| Beginner | `dict` `nai` `ta` `masu` `te` | `neg` `past` `polite` | all 7 | N5, N4 |
| Verbs only | `dict` `nai` `ta` `nakatta` `vol` `imp` `masu` `masen` `mashita` `masendeshita` `mashou` `te` `teiru` `teimasu` `ba` `pot` `pass` `caus` `tai` | all 9 | `godan` `ichidan` `suru` `kuru` | all 5 |
| Everything | all 30 | all 9 | all 7 | all 5 |

## UI

A third value on the existing `view` state (`App.jsx:951`, currently `"deck"` / `"quiz"`)
and a third header nav button, inheriting the existing chrome. The panel itself lives in a
new `src/SettingsView.jsx` taking `{ settings, onChange }` — `App.jsx` is already 1,645
lines and this keeps the view self-contained.

Layout: a preset row, then `FORMS · PLAIN / POLITE / CONNECTIVE / DERIVED` chip groups
reusing the existing `kd-form-chip` styling, then `STACK MODIFIERS`, `WORD CLASSES`,
`WORD SCOPE` (JLPT, transitivity, common), and `DISPLAY`. Each group gets an all/none
control. A live count ("7 words · 5 forms") gives immediate feedback that a toggle did
something.

## Testing

New group in `test/engine.test.mjs`, importing from `settings.js`:

- `allForms()` covers all 7 classes and returns no duplicate ids.
- `visibleForms` keeps exactly the ids in `formIds`.
- **`wordInScope` unknown passthrough** — an untagged word survives every combination of
  `jlpt`, `trans` and `commonOnly`. This is the rule that protects existing decks.
- `commonOnly: true` hides `common: false`, keeps `common: true` and keeps absent.
- `trans: "na"` and absent `trans` both pass regardless of `settings.trans`.
- Each of the three presets yields a non-empty form list for every one of the 7 classes,
  which guards against a preset that blanks the study view.
- Shallow-merge: a partial stored settings object produces no `undefined` arrays.

The module-wiring check added earlier picks up new `engine.js` imports in `App.jsx`
automatically; it should be extended to cover `settings.js` imports the same way.

## Notes

This project is not a git repository, so the spec is written to disk but not committed.
