import { useState, useMemo } from "react";
import { Undo2 } from "lucide-react";

import { C, ROLE_COLOR, MINCHO, MONO, T, JP, S, P } from "./theme.js";
import { romaji, MODS, stackInit, stackApply } from "./engine.js";
import { visibleMods } from "./settings.js";
import { Strip } from "./ui.jsx";
import Say from "./Say.jsx";

/* ============================================================
   STACK BUILDER
   ============================================================ */
function applyChain(word, chain) {
  let st = stackInit(word);
  for (const id of chain) st = stackApply(st, id);
  return st;
}

function StackPanel({ word, script, settings }) {
  const [chain, setChain] = useState([]);
  const [pick, setPick] = useState(null);
  const st = useMemo(() => applyChain(word, chain), [word, chain.join(",")]); // eslint-disable-line
  const enabled = visibleMods(settings);
  const avail = enabled.filter((m) => m.from.includes(st.cls));
  const kana = st.segs.map((s) => s.kana).join("");
  const active = pick != null ? st.segs[pick] : null;

  return (
    <section className="kd-panel-sub" style={{ marginTop: S[5] }}>
      <div className="kd-head">
        <span className="kd-micro">Stack forms</span>
        <span style={{ fontFamily: MINCHO, fontSize: T.sm, color: C.muted }}>活用を重ねる</span>
        <span className="kd-rail" />
        {chain.length > 0 && (
          <>
            <button className="kd-btn kd-act" onClick={() => { setChain(chain.slice(0, -1)); setPick(null); }}
              style={{ display: "flex", alignItems: "center", gap: S[1] }}>
              <Undo2 size={11} /> Undo
            </button>
            <button className="kd-btn kd-act" onClick={() => { setChain([]); setPick(null); }}>Reset</button>
          </>
        )}
      </div>

      {/* the chain so far */}
      <div style={{ display: "flex", gap: S[1], flexWrap: "wrap", alignItems: "center", marginBottom: S[3], minHeight: S[5] }}>
        <span style={{ fontFamily: MONO, fontSize: T.micro, color: C.muted }}>{word.word}</span>
        {chain.map((id, i) => {
          const m = MODS.find((x) => x.id === id);
          return (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: S[1] }}>
              <span style={{ color: C.rule, fontSize: T.fine }}>›</span>
              <span style={{ fontFamily: MONO, fontSize: T.micro, letterSpacing: ".08em", color: C.panel, background: C.aux, padding: P.tag }}>
                {m ? m.label.toUpperCase() : id}
              </span>
            </span>
          );
        })}
        {chain.length === 0 && <span style={{ fontSize: T.fine, color: C.muted, marginLeft: S[1] }}>— add a modifier below and they compound</span>}
      </div>

      {/* result */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: S[2], marginBottom: S[3] }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Strip segs={st.segs} script={script} onPick={setPick} activeIdx={pick} glosses={settings.show.glosses} />
          {settings.show.romaji && (
            <div style={{ fontFamily: MONO, fontSize: T.fine, color: C.muted, marginTop: S[2] }}>{romaji(kana)}</div>
          )}
        </div>
        <Say text={kana} size={15} label="Play this form" enabled={settings.show.audio} />
      </div>

      {active && (
        <div style={{ borderTop: "1px solid " + C.ruleSoft, paddingTop: S[3], marginBottom: S[3] }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: S[2], marginBottom: S[1] }}>
            <span style={{ fontFamily: MINCHO, fontSize: JP.sm, color: ROLE_COLOR[active.role] }}>{active.text}</span>
            <span style={{ fontSize: T.base, fontWeight: 600 }}>{active.title}</span>
          </div>
          <div style={{ fontSize: T.base, lineHeight: 1.65, color: C.body }}>{active.body}</div>
        </div>
      )}

      {/* what can still be applied */}
      <div style={{ borderTop: "1px solid " + C.ruleSoft, paddingTop: S[3] }}>
        {enabled.length === 0 ? (
          <div style={{ fontSize: T.sm, color: C.muted, lineHeight: 1.55 }}>
            No stack modifiers enabled. Turn some on in Settings.
          </div>
        ) : avail.length === 0 ? (
          <div style={{ fontSize: T.sm, color: C.muted, lineHeight: 1.55 }}>
            Nothing more attaches here — ます, た and て close a chain. Undo to branch off somewhere else.
          </div>
        ) : (
          <>
            <div className="kd-micro" style={{ marginBottom: S[2] }}>
              Add · currently {st.cls === "closed" ? "closed" : st.cls === "i-adj" ? "behaves as an い-adjective" : st.cls === "ichidan" ? "behaves as an ichidan verb" : st.cls}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: S[1] }}>
              {avail.map((m) => (
                <button key={m.id} className="kd-btn kd-form-chip" title={m.hint}
                  onClick={() => { setChain([...chain, m.id]); setPick(null); }}
                  style={{ border: "1px solid " + C.rule, background: C.panel, padding: P.chip, fontSize: T.fine, textAlign: "left" }}>
                  {m.label}
                  <span style={{ fontFamily: MINCHO, fontSize: T.micro, color: C.muted, marginLeft: S[1] }}>{m.jp}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export default StackPanel;
