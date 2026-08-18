/* The app's global sheet. It lives in a module rather than inside App's render
   because it is a fixed string — the values it interpolates are custom-property
   names, not colours — and rebuilding six kilobytes of it on every keystroke
   bought nothing.

   What is here and not inline: anything a pseudo-class, a media query or a
   keyframe needs, which JSX style objects cannot express. Everything else is
   inline at the call site, next to the thing it describes. */
import { C, MINCHO, MONO, T, S, P, THEME_CSS } from "./theme.js";

export const APP_CSS = `
  ${THEME_CSS}
  * { box-sizing: border-box; }
  .kd-app { min-height: 100vh; min-height: 100dvh; }
  .kd-btn { cursor: pointer; border: none; background: none; font: inherit; color: inherit; }
  .kd-form-chip { transition: background .15s, color .15s, border-color .15s; }
  .kd-tile { transition: transform .16s ease, box-shadow .16s ease; }
  .kd-in { width: 100%; background: ${C.panel}; border: 1px solid ${C.rule}; padding: ${P.btn}; font: inherit; color: ${C.ink}; outline: none; }
  .kd-in:focus { border-color: ${C.aux}; box-shadow: 0 0 0 2px var(--focus-ring); }
  button:focus-visible, .kd-in:focus-visible, [tabindex]:focus-visible { outline: 2px solid ${C.aux}; outline-offset: 2px; }

  /* ---- the type scale, as classes, so there is no frictionless path back
     to inventing a twenty-fourth font size ---- */
  .kd-micro {
    font-family: ${MONO}; font-size: ${T.micro}; letter-spacing: .2em;
    text-transform: uppercase; color: ${C.muted};
  }
  .kd-act {
    font-family: ${MONO}; font-size: ${T.micro}; letter-spacing: .1em;
    text-transform: uppercase; color: ${C.aux};
  }
  .kd-gloss {
    font-family: ${MONO}; font-size: ${T.micro}; letter-spacing: .1em;
    padding: 2px 5px; white-space: nowrap;
  }
  /* section heading: eyebrow, optional JP, hairline to the right edge */
  .kd-head { display: flex; align-items: center; gap: ${S[2]}px; margin-bottom: ${S[3]}px; flex-wrap: wrap; }
  .kd-rail { flex: 1; min-width: 20px; height: 1px; background: ${C.ruleSoft}; }
  .kd-note {
    border-left: 3px solid ${C.rule}; background: ${C.panelAlt};
    padding: ${P.btn}; font-size: ${T.sm}; line-height: 1.6;
  }
  .kd-del { color: ${C.rule}; transition: color .15s; }

  /* ---- two tiers. The morpheme strip is the point of the app; before
     this everything shared one treatment and it had to compete with four
     lookalikes stacked under it. ---- */
  /* These three paddings stay literal on purpose. They are optical — set against
     the type inside the card, not against the grid — and snapping them to it
     made the strip sit visibly low in its own panel. */
  .kd-panel {
    background: ${C.panel};
    border: 1px solid ${C.rule}; border-top: 3px solid ${C.ink};
    padding: 22px 18px 18px;
  }
  .kd-panel-sub {
    border: 1px solid ${C.ruleSoft}; background: transparent;
    padding: 15px 15px 13px;
  }

  /* the quiz instruction — a question, not a label */
  .kd-ask {
    display: flex; align-items: center; gap: ${S[2]}px; flex-wrap: wrap;
    font-size: ${T.md}; color: ${C.ink}; margin-bottom: ${S[4]}px;
  }
  .kd-ask-target {
    font-family: ${MONO}; font-size: ${T.base}; letter-spacing: .08em;
    text-transform: uppercase;
    background: ${C.ink}; color: ${C.panel}; padding: ${P.tag};
  }

  /* number hint on a quiz option, for the 1-4 shortcut */
  .kd-opt { display: flex; align-items: center; gap: 10px; text-align: left; padding: ${P.row}; font-size: ${T.base}; }
  .kd-opt-key {
    font-family: ${MONO}; font-size: ${T.micro}; opacity: .5;
    border: 1px solid currentColor; width: 16px; height: 16px;
    display: grid; place-items: center; flex-shrink: 0;
  }

  /* hover only where a pointer can actually hover — otherwise taps leave
     sticky hover states stranded on touch screens */
  @media (hover: hover) {
    /* A chip's own border is always set inline at the call site, so the
       only border this could ever reach was the divider a segment shares
       with its neighbour — which lit up as a stray near-white line rather
       than reading as hover. Tint the ground instead, the same panel-alt a
       deck row uses, which is a different colour in each theme. The
       selected chip keeps its inline background, which outranks this. */
    .kd-seg > .kd-form-chip:hover { background: ${C.panelAlt}; }
    .kd-tile:hover { transform: translateY(-2px); }
    .kd-row:hover { background: ${C.panelAlt}; }
    .kd-del:hover { color: ${C.stem}; }
  }

  .kd-scrim {
    position: fixed; inset: 0; z-index: 50; padding: ${S[5]}px;
    background: var(--scrim);
    display: flex; align-items: center; justify-content: center;
    animation: kd-fade .16s ease-out;
  }
  .kd-modal {
    width: 100%; max-width: 400px;
    background: ${C.panel};
    border: 1px solid ${C.ink}; border-top: 4px solid ${C.stem};
    box-shadow: var(--shadow-modal);
    padding: 20px 20px 17px;
    max-height: calc(100% - 8px); overflow-y: auto;
    animation: kd-pop .18s cubic-bezier(.2, .9, .3, 1);
  }
  @keyframes kd-fade { from { opacity: 0 } to { opacity: 1 } }
  @keyframes kd-pop { from { opacity: 0; transform: translateY(12px) scale(.97) } to { opacity: 1; transform: none } }

  /* The whole point of the app is that a form recomposes from parts, so
     the swap gets shown rather than cut. */
  .kd-swap { animation: kd-swap .16s ease-out; }
  @keyframes kd-swap { from { opacity: 0; transform: translateY(3px) } to { opacity: 1; transform: none } }

  .kd-toast {
    position: fixed; left: 50%; bottom: ${S[4]}px; transform: translateX(-50%);
    z-index: 60; width: calc(100% - 32px); max-width: 430px;
    background: ${C.panel}; border: 1px solid ${C.ink};
    border-left: 4px solid ${C.stem};
    box-shadow: var(--shadow-toast);
    padding: ${P.row};
    animation: kd-rise .2s ease-out;
  }
  @keyframes kd-rise { from { opacity: 0; transform: translate(-50%, 10px) } to { opacity: 1; transform: translate(-50%, 0) } }

  /* One height for every segmented toggle in the masthead, so the nav and
     the script group line up instead of each sizing to its own font. */
  .kd-seg { display: flex; border: 1px solid ${C.rule}; }
  .kd-seg > button { height: 28px; padding: 0 ${S[3]}px; display: flex; align-items: center; }
  .kd-seg > button + button { border-left: 1px solid ${C.rule}; }

  /* Square, and the same 28px as a segment button, so the cog sits on the
     masthead's one horizontal rhythm instead of inventing a second. */
  .kd-cog {
    width: 28px; height: 28px; display: grid; place-items: center;
    transition: background .15s, color .15s, border-color .15s;
  }

  .kd-deck { flex: 1 1 260px; min-width: 250px; max-width: 320px; }
  .kd-stage { flex: 3 1 460px; min-width: 300px; }
  .kd-list { max-height: 68vh; overflow-y: auto; }

  /* The tagline is decoration; it is the first thing to go on a phone. */
  @media (max-width: 640px) { .kd-tagline { display: none; } }

  /* Narrow screens: the deck goes on top as a horizontal shelf — one
     thumb-row of cards instead of a screen-tall list — and the breakdown
     gets the rest of the page underneath it. */
  @media (max-width: 820px) {
    .kd-deck { order: 1; max-width: none; min-width: 0; width: 100%; }
    .kd-stage { order: 2; min-width: 0; width: 100%; }
    .kd-list {
      display: flex; max-height: none;
      overflow-x: auto; overflow-y: hidden;
      scroll-snap-type: x proximity; overscroll-behavior-x: contain;
      /* a cut-off card reads as the end of the list; a faded one reads as
         more to the right */
      -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent);
      mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent);
    }
    .kd-list > * {
      flex: 0 0 min(62vw, 230px); scroll-snap-align: start;
      border-bottom: none !important; border-right: 1px solid ${C.ruleSoft};
    }
    .kd-list > *:last-child { border-right: none; }
    .kd-list > .kd-empty { flex: 1 0 100%; border-right: none; }
  }

  @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
`;
