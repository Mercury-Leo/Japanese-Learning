import { useState, useMemo, useEffect, useRef } from "react";
import { C, MINCHO, MONO, T, JP, S, P } from "./theme.js";
import { shuffleStable } from "./engine.js";
import { quizQueue, read } from "./charts.js";
import Say from "./Say.jsx";

/* A drill on one chart, run in place of the chart. Multiple choice, and the
   options are always other cells of the same table — the confusions worth
   drilling are the ones inside the set (さんがい against さんかい), never a
   reading from some other page.

   In place, not beside: the table is the answer key, so it has to go away while
   the quiz is up. The main Quiz owns the deck's spaced repetition; this one
   keeps no record, because a closed set is looked up rather than scheduled. */

/* The counters grid holds 112 readings and nobody drills 112 of anything. */
const LEN = 12;

export default function ChartQuiz({ items, audio, onClose }) {
  const [queue, setQueue] = useState(() => quizQueue(items, LEN));
  const [idx, setIdx] = useState(0);
  const [right, setRight] = useState(0);
  const [chose, setChose] = useState(null);
  const nextRef = useRef(null);

  const q = queue[idx] || null;
  const done = idx >= queue.length;
  /* A tab-wide run jumps between tables, so each question has to say which one
     it is in — 何 means one thing under Counters and another under Asking. A
     single-chart run has its title in the heading directly above. */
  const spans = new Set(items.map((i) => i.chart)).size > 1;

  /* Seeded, not random: a re-render must not move the answer out from under a
     finger that is already on its way down. */
  const options = useMemo(() => {
    if (!q) return [];
    /* Wrong answers come from the question's own table even when the run
       covers a whole tab — a reading from another chart is eliminated on sight
       and drills nothing. Deduped by reading, not by cell: a chart can print
       one kana twice, and the same option twice is a free elimination. */
    const seen = new Set([q.kana]);
    const pool = items.filter((i) => i.chart === q.chart && !seen.has(i.kana) && seen.add(i.kana));
    return shuffleStable([q, ...shuffleStable(pool, q.kana + idx).slice(0, 3)], q.ask + idx);
  }, [idx, q, items]);

  function answer(o) {
    if (chose) return;
    setChose(o);
    if (o.kana === q.kana) setRight((r) => r + 1);
  }

  function advance() {
    setChose(null);
    setIdx((i) => i + 1);
  }

  function again() {
    setQueue(quizQueue(items, LEN));
    setIdx(0);
    setRight(0);
    setChose(null);
  }

  /* Same keyboard contract as the deck quiz: digits pick, Enter advances. */
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Enter") {
        if (chose && tag !== "BUTTON") { e.preventDefault(); advance(); }
        return;
      }
      if (chose || !options.length) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > options.length) return;
      e.preventDefault();
      answer(options[n - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chose, options]); // eslint-disable-line

  useEffect(() => { if (chose && nextRef.current) nextRef.current.focus(); }, [chose]);

  /* The heavy top rule is on both panels, not only the question: React reuses
     this div between the two, and a borderTop that appears and vanishes over a
     border shorthand is the one mix it warns about. */
  const box = {
    border: "1px solid " + C.rule, borderTop: "3px solid " + C.ink,
    background: C.panel, padding: S[4],
  };

  if (done) {
    const pct = queue.length ? Math.round((right / queue.length) * 100) : 0;
    return (
      <div style={{ ...box, display: "flex", alignItems: "center", gap: S[4], flexWrap: "wrap" }}>
        <div style={{ fontFamily: MINCHO, fontSize: JP.figure, lineHeight: 1, color: right === queue.length ? C.aux : C.ink }}>
          {right}
        </div>
        <div style={{ flex: "1 1 120px" }}>
          <div className="kd-micro">of {queue.length} · {pct}%</div>
          <div style={{ height: 6, background: C.panelAlt, border: "1px solid " + C.ruleSoft, display: "flex", marginTop: S[2] }}>
            <div style={{ width: pct + "%", background: C.aux }} />
          </div>
        </div>
        <button className="kd-btn" onClick={again}
          style={{ background: C.stem, color: C.panel, padding: P.btn, fontSize: T.base }}>Again</button>
        <button className="kd-btn" onClick={onClose}
          style={{ border: "1px solid " + C.rule, color: C.muted, background: C.panel, padding: P.btn, fontSize: T.base }}>
          Back to the chart
        </button>
      </div>
    );
  }

  return (
    <div style={box}>
      <div style={{ display: "flex", alignItems: "center", gap: S[3], marginBottom: S[3] }}>
        <span className="kd-micro">{idx + 1} / {queue.length}</span>
        <div style={{ flex: 1, minWidth: 60, height: 4, background: C.ruleSoft, display: "flex" }}>
          <div style={{ width: Math.round((idx / queue.length) * 100) + "%", background: C.ink, transition: "width .25s" }} />
        </div>
        <span style={{ fontFamily: MONO, fontSize: T.micro, letterSpacing: ".1em", color: C.aux }}>◯ {right}</span>
        <button className="kd-btn kd-act" onClick={onClose}>Stop</button>
      </div>

      <div className="kd-ask"><span>{q.en ? "Which one is this?" : "How is this read?"}</span></div>

      <div style={{ marginBottom: S[4] }}>
        {spans && <div className="kd-micro" style={{ marginBottom: S[1] }}>{q.chart}</div>}
        <div style={q.en ? { fontSize: T.prompt, lineHeight: 1.35 } : { fontFamily: MINCHO, fontSize: JP.xl, lineHeight: 1.2 }}>
          {q.ask}
        </div>
        {q.sub && <div style={{ fontSize: T.base, color: C.muted, marginTop: S[1] }}>{q.sub}</div>}
      </div>

      <div style={{ display: "grid", gap: S[1] }}>
        {options.map((o, i) => {
          const isRight = chose && o.kana === q.kana;
          const wrong = chose === o && !isRight;
          return (
            <button key={o.kana} className="kd-btn kd-form-chip kd-opt" onClick={() => answer(o)} disabled={!!chose}
              style={{
                border: "1px solid " + (isRight ? C.aux : wrong ? C.stem : C.rule),
                background: isRight ? C.aux : wrong ? C.stem : C.panel,
                color: isRight || wrong ? C.panel : C.ink,
                cursor: chose ? "default" : "pointer",
              }}>
              <span className="kd-opt-key" aria-hidden="true">{i + 1}</span>
              <span style={{ fontFamily: MINCHO, fontSize: JP.md }}>{o.kana}</span>
              <span style={{ fontFamily: MONO, fontSize: T.micro, letterSpacing: ".05em", opacity: .7, marginLeft: "auto" }}>
                {read(o.kana)}
              </span>
            </button>
          );
        })}
      </div>

      {chose && (
        <div style={{ marginTop: S[4], borderTop: "1px solid " + C.ruleSoft, paddingTop: S[4] }}>
          <div style={{ display: "flex", alignItems: "center", gap: S[2], flexWrap: "wrap" }}>
            <span style={{
              fontFamily: MONO, fontSize: T.micro, letterSpacing: ".18em", padding: P.tag,
              background: chose.kana === q.kana ? C.aux : C.stem, color: C.panel,
            }}>{chose.kana === q.kana ? "CORRECT" : "NOT QUITE"}</span>
            <span style={{ fontFamily: MINCHO, fontSize: JP.md }}>{q.ja || q.ask}</span>
            <span style={{ fontFamily: MINCHO, fontSize: JP.md, color: q.irr ? C.stem : C.ink }}>{q.kana}</span>
            <Say text={q.kana} label="Play the answer" enabled={audio} />
            {/* The chart flags this reading as one that breaks its own pattern,
                so the drill says so too rather than leaving it as a miss. */}
            {q.irr && <span style={{ fontSize: T.fine, color: C.stem }}>breaks the pattern of this chart</span>}
            <button ref={nextRef} className="kd-btn" onClick={advance}
              style={{ background: C.ink, color: C.panel, padding: P.btn, fontSize: T.base, marginLeft: "auto" }}>
              {idx + 1 >= queue.length ? "See result" : "Next"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
