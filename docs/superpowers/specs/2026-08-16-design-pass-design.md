# Design Pass — Design

Date: 2026-08-16
Status: approved, not yet implemented

## Problem

The visual language is sound — flat editorial, hairline rules, no radii, mono micro-caps
eyebrows, mincho for Japanese, and colour carrying morpheme semantics via `ROLE_COLOR`
(`theme.js:16`). That last part is load-bearing and worth protecting.

The execution under it is not composed:

- **No type scale.** ~23 distinct font sizes across `App.jsx`, in half-pixel increments:
  8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 14, 15, 17, 18, 19, 20, 21, 26, 28,
  34, 40, 44. Spacing is equally ad hoc: 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16,
  18, 20, 22.
- **Cause: everything is an inline style object.** 2000 lines of them, so there is no
  friction against inventing a 24th size. `micro` is redefined five separate times
  (`App.jsx:149,261,481,745`, `SettingsView.jsx:6`).
- **Micro-type fails WCAG AA.** `C.muted #6d756f` on `C.panel #f5f6f2` is 4.37:1, under
  the 4.5 threshold — and it is the app's most frequent text style, used at 8–9px.
- **Flat hierarchy.** The morpheme strip (`App.jsx:1830`), `StackPanel` (`:152`),
  `ExamplesPanel` (`:276`) and the form ladder all use identical
  `1px solid C.rule` + `C.panel`. The signature element competes with four lookalikes.
- **The colour key is buried.** The legend explaining the app's core mechanic sits in the
  footer at 9px, below the fold (`App.jsx:1987`).
- **No dark mode.** A nightly study app with a paper-only palette.
- **Quiz keyboard flow is half-built.** `submit()` (`App.jsx:702`) gives Enter-to-advance
  to input questions only; multiple-choice requires a mouse for both selection and Next.

## Goals

- One set of design tokens as the only place sizes, spacing and colour are defined.
- A dark theme that preserves morpheme-colour semantics.
- WCAG AA on body and micro type in both themes.
- Two-tier panel hierarchy so the morpheme strip reads as primary.
- Complete the quiz keyboard path.

## Non-goals

- No change to the visual language: no border-radius, shadows, gradients or font swap.
- No new dependencies.
- No engine, settings-model or storage-shape changes.
- Per-word study statistics. Independent, already noted in README.

## Design

### Tokens

`C` keeps its exact shape and every call site. Its values become `var(--*)` strings.
This works because `C` is consumed opaquely everywhere — `color: C.ink`,
`"1px solid " + C.rule`, `${C.panel}` inside the `<style>` block. Only five hardcoded
hexes exist outside `theme.js`:

| location | hex | token |
| --- | --- | --- |
| `App.jsx:203,1886` | `#3b433e` | `--body` |
| `App.jsx:1062,1947,1950` | `#c9cfd6` | `--on-ink-dim` |
| `App.jsx:1438` | `rgba(42,71,128,.15)` | `--focus-ring` |

Real values live in one CSS block with three states: `:root` (light),
`@media (prefers-color-scheme: dark)`, and `[data-theme="dark"]` / `[data-theme="light"]`
so an explicit choice beats the system preference in both directions.

### Type scale — 23 sizes to 10

Two scales; CJK and Latin do not share one comfortably.

| Latin (sans/mono) | | Japanese (mincho) | |
| --- | --- | --- | --- |
| `--t-micro` | 10px | `--jp-sm` | 17px |
| `--t-fine` | 11px | `--jp-md` | 21px |
| `--t-sm` | 12px | `--jp-strip` | `clamp(22px, 7vw, 38px)` |
| `--t-base` | 13px | `--jp-lg` | `clamp(26px, 8vw, 34px)` |
| `--t-md` | 15px | `--jp-xl` | `clamp(28px, 9vw, 44px)` |
| `--t-lg` | 18px | | |

Accepted consequence: mono eyebrows go 8/8.5/9/9.5 → a uniform 10px. Morpheme-strip
gloss chips and 五段 ladder labels get slightly wider. Density loses a little,
legibility wins; this is the most visible single change in the pass.

Spacing snaps to a 4px scale: `--s1:4 --s2:8 --s3:12 --s4:16 --s5:24 --s6:32`.

### Palettes

Light changes in exactly one place: `muted` `#6d756f` → `#5b635d`, moving 4.37:1 → 5.33:1.

Dark keeps the warm grey-green temperature rather than going neutral black:

```
ground #161917   panel #1d211e   panelAlt #252a26
rule   #333a35   ruleSoft #282e29
ink    #e6e9e2   muted #98a099
```

Role colours are the real work. The light three are dark pigments that would vanish on a
dark ground, so each is lifted while holding hue identity:

| role | light | dark |
| --- | --- | --- |
| root | `#161b19` | `#e8e6df` |
| stem | `#b8342a` | `#e8695c` |
| aux | `#2a4780` | `#7ea2e8` |
| extra | `#7a6a1c` | `#cbb35e` |

### Theme switching

Stored under its own key, mirroring how `script` uses `SKEY` (`storage.js:4`).
Deliberately **not** part of `settings` — that object is what deck export writes out, for
the same reason the API key is excluded (`SettingsView.jsx:120`). Three-way control in
Settings: System / Light / Dark, defaulting to System.

`index.html` gets a `prefers-color-scheme` bootstrap background so first paint does not
flash white, and `<meta name="theme-color">` is updated on switch so PWA chrome follows.

### Hierarchy

Two tiers replace the current single treatment:

- **Primary** — the morpheme strip only: filled panel, 3px ink cap rule, more padding.
- **Secondary** — stack, examples, form ladder: hairline outline on the ground colour,
  no fill.

The colour legend moves out of the footer and into the strip panel, where the colours
it explains actually are.

### Interaction

- Quiz: `1`–`4` select an option; Enter advances after judging on every question type.
- Morpheme strip crossfades (160ms) when `formId` changes, showing the recomposition.
  The existing `prefers-reduced-motion` block (`App.jsx:1510`) already covers it.
- `.kd-list` gets a `mask-image` edge fade at ≤820px so the mobile horizontal deck shelf
  reads as scrollable.
- `Say` renders a disabled placeholder rather than `null` when audio is off, removing the
  layout shift.

### Repeated style objects to CSS classes

`micro` (five copies), `box`, and the chip style become classes. This is what keeps the
scale honest — it removes the frictionless path back to arbitrary sizes.

## Testing

`npm test` covers the engine and service worker and must stay green; none of this touches
either. Verification is visual: both themes at desktop and mobile widths, console clean,
contrast spot-checked on micro type.
