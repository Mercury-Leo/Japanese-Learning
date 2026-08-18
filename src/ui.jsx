/* Shared presentational parts. Nothing here reads storage, calls the network or
   knows what a view is: they take props and draw. Every other component file
   pulls from here, which is what keeps one chip from drifting into four. */
import { useEffect, useRef } from "react";
import { C, ROLE_COLOR, MINCHO, MONO, T, JP, RUBY, S, P } from "./theme.js";
import { columns, GODAN, romaji } from "./engine.js";

/* ============================================================
   SCRIPT RENDERING — furigana / kanji / kana
   Furigana is aligned to the kanji only: 食べ reads た over 食,
   never たべ smeared across both characters.
   ============================================================ */
function Word({ text, kana, mode, ruby = RUBY.md, rubyColor = C.muted, reserve = false }) {
  const cols = columns(text, kana, mode);
  const showRuby = mode === "furigana" && (reserve || cols.some((c) => c.ruby));
  return (
    <span style={{ display: "inline-flex", alignItems: "flex-end" }}>
      {cols.map((c, i) => (
        <span key={i} style={{ display: "inline-flex", flexDirection: "column", alignItems: "center" }}>
          {showRuby && (
            <span style={{ fontSize: ruby, lineHeight: 1.1, height: "1.25em", color: rubyColor, whiteSpace: "nowrap", letterSpacing: ".02em" }}>
              {c.ruby || "\u00a0"}
            </span>
          )}
          <span style={{ lineHeight: 1.2 }}>{c.base}</span>
        </span>
      ))}
    </span>
  );
}

/* ============================================================
   五段 ladder — the literal "five rows" a godan stem walks through
   ============================================================ */
function Ladder({ row, active }) {
  const g = GODAN[row];
  if (!g) return null;
  const cells = [
    { k: g.a, tag: "a" },
    { k: g.i, tag: "i" },
    { k: row, tag: "u" },
    { k: g.e, tag: "e" },
    { k: g.o, tag: "o" },
  ];
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2 }}>
      {cells.map((c) => {
        const on = c.k === active;
        return (
          <div key={c.tag} style={{ textAlign: "center", width: 34 }}>
            <div
              style={{
                fontFamily: MINCHO, fontSize: JP.md, lineHeight: "34px", height: 34,
                color: on ? C.panel : C.muted,
                background: on ? C.stem : "transparent",
                border: "1px solid " + (on ? C.stem : C.ruleSoft),
                transition: "background .18s, color .18s",
              }}
            >{c.k}</div>
            <div className="kd-micro" style={{ letterSpacing: ".14em", color: on ? C.stem : C.muted, marginTop: S[1] }}>{c.tag.toUpperCase()}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   MORPHEME STRIP — shared by the study view, the stack builder
   and the quiz reveal.
   ============================================================ */
function Strip({ segs, script, size = JP.strip, ruby = RUBY.strip, onPick, activeIdx, glosses: showGlosses = true, romaji: showRomaji = false }) {
  return (
    <div style={{ display: "flex", gap: S[1], flexWrap: "wrap", alignItems: "flex-end" }}>
      {segs.map((s, i) => {
        const col = ROLE_COLOR[s.role];
        const on = activeIdx === i;
        const Tag = onPick ? "button" : "div";
        return (
          <Tag key={i} className={onPick ? "kd-btn kd-tile" : undefined}
            onClick={onPick ? () => onPick(on ? null : i) : undefined}
            style={{ textAlign: "center", padding: 0 }}>
            <div style={{
              fontFamily: MINCHO, fontSize: size, color: col, padding: "0 5px 2px",
              borderBottom: "2px solid " + (on || !onPick ? col : "transparent"),
            }}>
              <Word text={s.text} kana={s.kana} mode={script} ruby={ruby} rubyColor={col} reserve />
            </div>
            {showRomaji && (
              <div style={{ fontFamily: MONO, fontSize: T.micro, color: C.muted, marginTop: S[1] }}>{romaji(s.kana)}</div>
            )}
            {showGlosses && (
              <div className="kd-gloss" style={{
                marginTop: S[1],
                color: on ? C.panel : col, background: on ? col : "transparent",
                border: "1px solid " + col,
              }}>{s.gloss}</div>
            )}
          </Tag>
        );
      })}
    </div>
  );
}


/* ============================================================
   CHIP — the app's one toggle. Selected is a filled accent, unselected is
   an outline. Used for forms, presets, word classes, filters and quiz
   options, which between them had four different paddings before this.
   ============================================================ */
function Chip({ on, onClick, accent = C.aux, ink = false, className = "", style, children, ...rest }) {
  const fill = ink ? C.ink : accent;
  return (
    <button className={"kd-btn kd-form-chip " + className} onClick={onClick} aria-pressed={on}
      style={{
        border: "1px solid " + (on ? fill : C.rule),
        background: on ? fill : "transparent",
        color: on ? C.panel : C.ink,
        padding: P.chip, fontSize: T.fine, textAlign: "left",
        ...style,
      }} {...rest}>{children}</button>
  );
}

/* ============================================================
   CONFIRM MODAL
   Used for interruptions that are not anchored to a spot on the page.
   Row-level actions keep their inline confirmations instead.
   ============================================================ */
function ConfirmModal({ eyebrow, stat, statLabel, body, confirmLabel, cancelLabel, onConfirm, onCancel }) {
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") cancelRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="kd-scrim" onClick={onCancel}>
      <div className="kd-modal" role="dialog" aria-modal="true" aria-label={body} onClick={(e) => e.stopPropagation()}>
        <div className="kd-micro" style={{ color: C.stem }}>{eyebrow}</div>

        {stat && (
          <div style={{ display: "flex", alignItems: "baseline", gap: S[2], marginTop: S[3] }}>
            <span style={{ fontFamily: MINCHO, fontSize: JP.figure, lineHeight: 1, color: C.ink }}>{stat}</span>
            <span className="kd-micro" style={{ letterSpacing: ".16em" }}>{statLabel}</span>
          </div>
        )}

        <div style={{ fontSize: T.base, lineHeight: 1.6, marginTop: S[3], color: C.ink }}>{body}</div>

        <div style={{ display: "flex", gap: S[2], marginTop: S[4] }}>
          <button className="kd-btn" onClick={onConfirm}
            style={{ flex: 1, background: C.stem, color: C.panel, padding: P.wide, fontSize: T.base }}>
            {confirmLabel}
          </button>
          <button className="kd-btn" onClick={onCancel} autoFocus
            style={{ flex: 1, border: "1px solid " + C.ink, background: C.panel, color: C.ink, padding: P.wide, fontSize: T.base }}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export { Word, Ladder, Strip, Chip, ConfirmModal };
