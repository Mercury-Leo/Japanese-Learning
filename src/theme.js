/* Palette and type stacks. Colour is not decoration here: it encodes
   morpheme class, so ROLE_COLOR is load-bearing. */
export const C = {
  ground: "#e6e9e3",
  panel: "#f5f6f2",
  panelAlt: "#eceee8",
  ink: "#161b19",
  muted: "#6d756f",
  rule: "#cbd1c7",
  ruleSoft: "#dbe0d6",
  root: "#161b19",   // the part that never changes
  stem: "#b8342a",   // the kana that shifts
  aux: "#2a4780",    // auxiliary
  extra: "#7a6a1c",  // stacked suffix
};
export const ROLE_COLOR = { root: C.root, stem: C.stem, aux: C.aux, extra: C.extra };

/* Yu Mincho ships with Windows, Hiragino with macOS/iOS. Stock Android has
   neither and falls back to Noto Sans CJK, which loses the ink feel — if that
   matters, self-host a subsetted Noto Serif JP. */
export const MINCHO = '"Hiragino Mincho ProN","Yu Mincho","YuMincho","Noto Serif JP","Songti SC","MS Mincho",serif';
export const SANS = '"Helvetica Neue",Inter,"Segoe UI",system-ui,sans-serif';
export const MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,monospace';
