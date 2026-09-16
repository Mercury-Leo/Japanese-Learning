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
