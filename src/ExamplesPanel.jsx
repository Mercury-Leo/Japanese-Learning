import { useState, useMemo } from "react";

import { C, MINCHO, T, JP, S } from "./theme.js";
import { conjugate, formText } from "./engine.js";
import { fetchExamples } from "./api.js";
import Say from "./Say.jsx";

/* ============================================================
   EXAMPLE SENTENCES
   Prototype source is the model; a shipping build would pull these from
   Tatoeba or JMdict's examples file instead.
   ============================================================ */
/** Which form the sentence actually uses — checked against our own engine
 *  rather than trusted from the model. Longest match wins so the dictionary
 *  form does not shadow a longer conjugation. */
function detectForm(sentence, forms) {
  let best = null;
  for (const f of forms) {
    const t = formText(f);
    if (t && sentence.includes(t) && (!best || t.length > formText(best).length)) best = f;
  }
  return best;
}

function ExamplesPanel({ word, script, onSave, settings }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const forms = useMemo(() => conjugate(word), [word]);
  const list = word.examples || [];

  async function run() {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const ex = await fetchExamples(word);
      if (!ex.length) setErr("Nothing came back for this word. Try again, or write your own sentences in later.");
      else onSave(word.id, ex);
    } catch (e) {
      setErr((e && e.message) || "Couldn't reach the sentence generator.");
    } finally { setBusy(false); }
  }

  return (
    <section className="kd-panel-sub" style={{ marginTop: S[5] }}>
      <div className="kd-head">
        <span className="kd-micro">In context</span>
        <span style={{ fontFamily: MINCHO, fontSize: T.sm, color: C.muted }}>例文</span>
        <span className="kd-rail" />
        <button className="kd-btn kd-act" onClick={run} disabled={busy}
          style={{ color: busy ? C.rule : C.aux, cursor: busy ? "default" : "pointer" }}>
          {busy ? "Writing…" : list.length ? "Replace" : "Get sentences"}
        </button>
      </div>

      {err && <div className="kd-note" style={{ borderLeftColor: C.stem, marginBottom: S[3] }}>{err}</div>}

      {list.length === 0 && !err && (
        <div style={{ fontSize: T.sm, color: C.muted, lineHeight: 1.6 }}>
          A conjugation table doesn't tell you when to use て over たら. Pull a few sentences and each form gets a situation attached to it.
        </div>
      )}

      <div style={{ display: "grid", gap: S[4] }}>
        {list.map((e, i) => {
          const f = detectForm(e.ja, forms);
          return (
            <div key={i} style={{ borderLeft: "3px solid " + C.ruleSoft, paddingLeft: S[3] }}>
              {f && (
                <div className="kd-micro" style={{ letterSpacing: ".14em", color: C.aux, marginBottom: S[1] }}>
                  USES {f.label.toUpperCase()}
                </div>
              )}
              {script !== "kana" && (
                <div style={{ fontFamily: MINCHO, fontSize: T.fine, color: C.muted, letterSpacing: ".04em" }}>{e.kana}</div>
              )}
              <div style={{ display: "flex", alignItems: "flex-start", gap: S[1] }}>
                <div style={{ fontFamily: MINCHO, fontSize: JP.sm, lineHeight: 1.55, flex: 1 }}>
                  {script === "kana" ? e.kana : e.ja}
                </div>
                <Say text={e.kana} label="Play sentence" enabled={settings.show.audio} />
              </div>
              <div style={{ fontSize: T.sm, color: C.muted, marginTop: S[1], lineHeight: 1.5 }}>{e.en}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default ExamplesPanel;
