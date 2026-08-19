/* Palette, type scale and spacing. Colour is not decoration here: it encodes
   morpheme class, so ROLE_COLOR is load-bearing.

   Every value below is a custom-property reference, never a literal. The real
   hexes live in THEME_CSS once per theme, which is what makes a dark mode a
   palette edit instead of a component rewrite — `C` is consumed opaquely
   (`color: C.ink`, `"1px solid " + C.rule`), so call sites never had to know. */
export const C = {
  ground: "var(--ground)",
  panel: "var(--panel)",
  panelAlt: "var(--panel-alt)",
  ink: "var(--ink)",
  muted: "var(--muted)",
  rule: "var(--rule)",
  ruleSoft: "var(--rule-soft)",
  root: "var(--role-root)",   // the part that never changes
  stem: "var(--role-stem)",   // the kana that shifts
  aux: "var(--role-aux)",     // auxiliary
  extra: "var(--role-extra)", // stacked suffix
  body: "var(--body)",        // long-form prose, softer than ink
  onInkDim: "var(--on-ink-dim)", // ruby/label sitting on a filled ink chip
};
export const ROLE_COLOR = { root: C.root, stem: C.stem, aux: C.aux, extra: C.extra };

/* Type. Two scales, because CJK and Latin do not sit comfortably on one — mincho
   needs more size than sans at the same optical weight. T is Latin (sans/mono),
   JP is mincho. Ten sizes total, replacing the twenty-three this file used to
   sanction by omission. */
export const T = {
  micro: "var(--t-micro)",  // 10px — mono eyebrows. The AA floor, not 8px.
  fine: "var(--t-fine)",    // 11px
  sm: "var(--t-sm)",        // 12px
  base: "var(--t-base)",    // 13px
  md: "var(--t-md)",        // 15px
  lg: "var(--t-lg)",        // 18px
  prompt: "var(--t-prompt)", // an English gloss used as a quiz prompt
};
export const JP = {
  sm: "var(--jp-sm)",       // 17px — inline in a row
  md: "var(--jp-md)",       // 21px — list headword
  strip: "var(--jp-strip)", // the morpheme strip
  lg: "var(--jp-lg)",       // entry headword
  xl: "var(--jp-xl)",       // quiz prompt
  /* Not body text: a 空 standing in for an empty list, and the score numerals.
     Sized as figures, which is why they sit outside the reading scale. */
  display: "var(--jp-display)",
  figure: "var(--jp-figure)",
};
/* Ruby rides above the base glyph, so it scales with it rather than with the
   Latin scale. */
export const RUBY = {
  sm: "var(--ruby-sm)",
  md: "var(--ruby-md)",
  strip: "var(--ruby-strip)",
  lg: "var(--ruby-lg)",
  xl: "var(--ruby-xl)",
};

/* 4px grid, for layout: gaps, margins, the space between things. Everything that
   used to be 2,3,5,6,7,9,11,13,18,22 snaps here. */
export const S = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32 };

/* Control padding, which S never covered — so every view invented its own. The
   same toggle chip shipped as 6/9 in Settings, 6/10 in Vocab and 6/11 in the
   quiz, sitting inches apart on screen. Five roles, one value each.

   Deliberately not on the 4px grid: a control's mass is set by the text inside
   it, and 4px steps are too coarse to separate a badge from a chip. S spaces
   things out, P pads them. */
export const P = {
  tag: "3px 7px",    // a badge that only labels: JLPT, 他/自, CORRECT
  chip: "6px 10px",  // a toggle: forms, presets, word classes, filters
  row: "9px 11px",   // a row in a list
  btn: "8px 12px",   // an inline button
  wide: "11px 0",    // a full-width action button, centred
};

/* Yu Mincho ships with Windows, Hiragino with macOS/iOS. Stock Android has
   neither and falls back to Noto Sans CJK, which loses the ink feel — if that
   matters, self-host a subsetted Noto Serif JP. */
export const MINCHO = '"Hiragino Mincho ProN","Yu Mincho","YuMincho","Noto Serif JP","Songti SC","MS Mincho",serif';
export const SANS = '"Helvetica Neue",Inter,"Segoe UI",system-ui,sans-serif';
export const MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,monospace';

/* The two palettes. Dark is not a neutral black: the light theme is warm
   grey-green paper, so dark is the same paper unlit, or the app stops feeling
   like one object.

   The role colours are the real work. The light three are dark pigments —
   dropped onto a dark ground they disappear — so each is lifted in luminance
   while holding its hue identity: brick stays red, navy stays blue, olive stays
   yellow-green. Contrast against --panel is >= 4.5:1 in both themes. */
const LIGHT = `
  --ground: #e6e9e3;
  --panel: #f5f6f2;
  --panel-alt: #eceee8;
  --ink: #161b19;
  --muted: #5b635d;        /* was #6d756f — 4.37:1, under AA. This is 5.33:1. */
  --rule: #cbd1c7;
  --rule-soft: #dbe0d6;
  --body: #3b433e;
  --on-ink-dim: #c9cfd6;
  --role-root: #161b19;
  --role-stem: #b8342a;
  --role-aux: #2a4780;
  --role-extra: #7a6a1c;
  --focus-ring: rgba(42, 71, 128, .16);
  --scrim: rgba(22, 27, 25, .55);
  --shadow-modal: 0 18px 44px rgba(22, 27, 25, .3);
  --shadow-toast: 0 10px 30px rgba(22, 27, 25, .25);
`;

const DARK = `
  --ground: #161917;
  --panel: #1d211e;
  --panel-alt: #252a26;
  --ink: #e6e9e2;
  --muted: #98a099;
  --rule: #333a35;
  --rule-soft: #282e29;
  --body: #c2c9c1;
  --on-ink-dim: #2b322d;
  --role-root: #e8e6df;
  --role-stem: #e8695c;
  --role-aux: #7ea2e8;
  --role-extra: #cbb35e;
  --focus-ring: rgba(126, 162, 232, .22);
  --scrim: rgba(8, 10, 9, .66);
  --shadow-modal: 0 18px 44px rgba(0, 0, 0, .5);
  --shadow-toast: 0 10px 30px rgba(0, 0, 0, .45);
`;

/* The bootstrap background in index.html has to agree with --ground before any
   JS runs, or the first paint flashes. Exported so there is one source. */
export const GROUND = { light: "#e6e9e3", dark: "#161917" };

/* Light lives on bare :root so no colour is ever defined only inside a media
   query. Dark is applied twice: once for the system preference (guarded so an
   explicit light choice still wins) and once for the explicit attribute. */
export const THEME_CSS = `
  :root {
    ${LIGHT}
    --t-micro: 10px;
    --t-fine: 11px;
    --t-sm: 12px;
    --t-base: 13px;
    --t-md: 15px;
    --t-lg: 18px;
    --t-prompt: clamp(19px, 5.4vw, 26px);
    --jp-sm: 17px;
    --jp-md: 21px;
    --jp-strip: clamp(22px, 7vw, 38px);
    --jp-lg: clamp(26px, 8vw, 34px);
    --jp-xl: clamp(28px, 9vw, 44px);
    --jp-display: 34px;
    --jp-figure: 42px;
    --ruby-sm: 9px;
    --ruby-md: 10px;
    --ruby-strip: clamp(8px, 2.4vw, 12px);
    --ruby-lg: 13px;
    --ruby-xl: clamp(10px, 3vw, 15px);
    color-scheme: light;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) { ${DARK} color-scheme: dark; }
  }
  :root[data-theme="dark"] { ${DARK} color-scheme: dark; }
`;

export const THEMES = ["system", "light", "dark"];

/** Resolve "system" against the media query; light/dark pass through. */
export function resolveTheme(pref) {
  if (pref === "light" || pref === "dark") return pref;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Drive the attribute CSS keys off, plus the PWA chrome colour, which is a real
 *  hex in a meta tag and so cannot ride on a custom property. */
export function applyTheme(pref) {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", GROUND[resolveTheme(pref)]);
}
