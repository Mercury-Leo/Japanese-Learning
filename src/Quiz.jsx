import { useState, useEffect, useMemo, useRef } from "react";

import { C, MINCHO, MONO, T, JP, RUBY, S, P } from "./theme.js";
import {
  romaji, toKana, settleKana, conjugate, typeLabel, GROUPS, formText, formKana,
  answerMatches, shuffle, shuffleStable, meaningItems, REVERSE_SOURCES,
} from "./engine.js";
import { MEANING, ruleKey, byRule } from "./stats.js";
import { Word, Strip, Chip } from "./ui.jsx";
import Say from "./Say.jsx";

/* ============================================================
   QUIZ
   ============================================================ */
function Quiz({ words, allWords, script, onProgress, settings, stats, onRecord }) {
  /* A conjugation drill should not double as a kanji-reading drill by accident,
     so the reading stays visible here even when the deck is set to 漢字 only. */
  const qMode = script === "kana" ? "kana" : "furigana";

  const [picked, setPicked] = useState(() => new Set(words.map((w) => w.id)));
  const [formIds, setFormIds] = useState(["masu", "te", "ta", "nai"]);
  const [meaningOn, setMeaningOn] = useState(true);
  const [len, setLen] = useState(20);
  const [dir, setDir] = useState("mixed");
  const [ime, setIme] = useState(true);
  const [stage, setStage] = useState("setup");
  const [queue, setQueue] = useState([]);
  const [idx, setIdx] = useState(0);
  const [right, setRight] = useState(0);
  const [misses, setMisses] = useState([]);
  const [input, setInput] = useState("");
  const [judged, setJudged] = useState(null);

  useEffect(() => {
    setFormIds((ids) => ids.filter((id) => settings.formIds.includes(id)));
  }, [settings.formIds]);

  const pool = useMemo(() => words.filter((w) => picked.has(w.id)), [words, picked]);
  const poolKey = useMemo(() => pool.map((w) => w.id).join(","), [pool]);

  /* Which forms the chosen words actually offer — a な-adjective has no て-form
     in the verb sense, so the options have to follow the selection. */
  const available = useMemo(() => {
    const m = new Map();
    for (const w of pool) {
      for (const f of conjugate(w)) {
        const prev = m.get(f.id);
        if (prev) prev.n += 1;
        else m.set(f.id, { id: f.id, label: f.label, jp: f.jp, group: f.group, n: 1 });
      }
    }
    return [...m.values()].filter((f) => settings.formIds.includes(f.id));
  }, [poolKey, settings.formIds.join(",")]); // eslint-disable-line

  const items = useMemo(() => {
    const out = [];
    for (const w of pool) {
      const fs = conjugate(w);
      /* Some forms are homographs — an ichidan potential and passive are both
         食べられる — so keep one question per distinct answer. */
      const taken = new Set();
      for (const f of fs) {
        if (!formIds.includes(f.id)) continue;
        const answer = formText(f);
        if (taken.has(answer)) continue;
        const kind = dir === "mixed" ? (Math.random() < 0.4 ? "recognise" : "produce") : dir;
        if (kind === "recognise") {
          /* Distractors are other forms of the same word, so the choice is
             about morphology rather than about which word it is. */
          const pool2 = fs.filter((x) => x.id !== f.id && formText(x) !== answer).map((x) => x.id);
          out.push({ wordId: w.id, formId: f.id, fromId: null, kind: "recognise", opts: shuffle(pool2).slice(0, 3) });
        } else if (f.id === "dict") {
          const src = fs.filter((x) => REVERSE_SOURCES.includes(x.id));
          if (!src.length) continue;
          out.push({ wordId: w.id, formId: f.id, fromId: src[Math.floor(Math.random() * src.length)].id, kind: "produce" });
        } else {
          out.push({ wordId: w.id, formId: f.id, fromId: null, kind: "produce" });
        }
        taken.add(answer);
      }
    }
    if (meaningOn) out.push(...meaningItems(pool, words));
    return out;
  }, [poolKey, formIds.join(","), dir, meaningOn, words]); // eslint-disable-line

  const total = items.length;
  const meaningCount = items.filter((i) => i.kind.startsWith("mean")).length;

  function start(list, cap) {
    const c = cap === undefined ? len : cap;
    const q = shuffle([...(list || items)]);
    setQueue(c === 0 ? q : q.slice(0, c));
    setIdx(0);
    setRight(0);
    setMisses([]);
    setInput("");
    setJudged(null);
    setStage("run");
  }

  useEffect(() => {
    /* a judged-but-not-advanced question has still been answered */
    if (onProgress) onProgress({ running: stage === "run", done: idx + (judged ? 1 : 0), total: queue.length });
  }, [stage, idx, queue.length, judged]); // eslint-disable-line

  useEffect(() => () => { if (onProgress) onProgress({ running: false, done: 0, total: 0 }); }, []); // eslint-disable-line

  const current = queue[idx] || null;
  const cWord = current ? words.find((w) => w.id === current.wordId) : null;
  const isMean = !!current && current.kind.startsWith("mean");
  const cForms = useMemo(() => (cWord ? conjugate(cWord) : []), [cWord]);
  const target = current && !isMean ? cForms.find((f) => f.id === current.formId) : null;
  const source = current && current.fromId ? cForms.find((f) => f.id === current.fromId) : null;

  /* One place to judge, so there is exactly one place that records. Deliberately
     NOT a useEffect on `judged`: StrictMode double-invokes effects in dev and
     would double-count every answer. */
  function judge(ok, chose) {
    setJudged(chose === undefined ? { ok } : { ok, chose });
    if (ok) setRight((r) => r + 1);
    else setMisses((m) => [...m, current]);
    if (onRecord && cWord) onRecord(cWord, isMean ? MEANING : current.formId, ok);
  }

  function submit() {
    if (!current || !target) return;
    if (judged) return advance();
    if (!input.trim()) return;
    const settled = ime ? settleKana(input) : input;
    if (settled !== input) setInput(settled);
    judge(answerMatches(settled, target));
  }

  function choose(id) {
    if (judged || !current) return;
    /* Form questions are answered with a form id, meaning questions with a
       word id — same picker, two different keys. */
    judge(id === (current.kind === "recognise" ? current.formId : current.wordId), id);
  }

  function reveal() {
    /* "Show me" counts as a miss: not knowing it is not knowing it. */
    if (judged || !target) return;
    judge(false);
  }

  function advance() {
    setInput("");
    setJudged(null);
    if (idx + 1 >= queue.length) setStage("done");
    else setIdx((i) => i + 1);
  }

  const toggleWord = (id) => setPicked((s) => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const toggleForm = (id) => setFormIds((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));

  /* Derived above the stage returns rather than beside the JSX that uses them,
     because the two hooks below need them and hooks cannot sit after a return. */
  const isRecog = !!current && current.kind === "recognise";
  const toEn = !!current && current.kind === "mean-en";
  const options = !current ? []
    : isRecog && target
      ? shuffleStable([target, ...(current.opts || []).map((id) => cForms.find((f) => f.id === id)).filter(Boolean)], current.wordId + current.formId)
      : isMean && cWord
        ? shuffleStable([cWord, ...(current.opts || []).map((id) => words.find((w) => w.id === id)).filter(Boolean)], current.wordId + current.kind)
        : [];

  /* A drill is a keyboard instrument. Digits pick an option; Enter is left to
     whatever control has focus, which is the input on produce questions and —
     via the effect below — the Next button once a choice has been judged. */
  const nextRef = useRef(null);
  useEffect(() => {
    if (stage !== "run") return;
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target && e.target.tagName) || "";
      /* A focused control owns its own keys: the romaji input handles Enter via
         submit(), and a focused button activates natively. This listener is only
         for keys nothing else has claimed. */
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Enter") {
        /* Focus normally sits on Next by the effect below, so the button
           handles this. The fallback matters when focus has fallen to body. */
        if (judged && tag !== "BUTTON") { e.preventDefault(); advance(); }
        return;
      }
      if (judged || !options.length) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > options.length) return;
      e.preventDefault();
      choose(options[n - 1].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, judged, options]); // eslint-disable-line

  useEffect(() => {
    if (judged && nextRef.current) nextRef.current.focus();
  }, [judged]);

  const box = { border: "1px solid " + C.rule, background: C.panel, padding: S[4] };

  if (!words.length) {
    return (
      <div style={{ ...box, padding: S[6] + S[2], textAlign: "center" }}>
        <div style={{ fontFamily: MINCHO, fontSize: JP.display, color: C.rule }}>空</div>
        <div style={{ fontSize: T.base, color: C.muted, marginTop: S[2] }}>Add a word to the deck first — the quiz builds its questions from it.</div>
      </div>
    );
  }

  /* ---------------- setup ---------------- */
  if (stage === "setup") {
    return (
      <div style={{ display: "flex", gap: S[4] + 2, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ ...box, flex: "1 1 260px", minWidth: 240 }}>
          <div className="kd-head">
            <span className="kd-micro">Words</span>
            <span className="kd-rail" />
            <button className="kd-btn kd-act" onClick={() => setPicked(new Set(words.map((w) => w.id)))}>All</button>
            <button className="kd-btn kd-act" onClick={() => setPicked(new Set())}>None</button>
          </div>
          <div style={{ maxHeight: 300, overflowY: "auto", border: "1px solid " + C.ruleSoft }}>
            {words.map((w) => {
              const on = picked.has(w.id);
              return (
                <button key={w.id} className="kd-btn kd-row" onClick={() => toggleWord(w.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: S[2], width: "100%", textAlign: "left",
                    padding: P.row, borderBottom: "1px solid " + C.ruleSoft,
                    background: on ? C.panelAlt : "transparent",
                  }}>
                  <span style={{
                    width: 15, height: 15, flexShrink: 0, border: "1px solid " + (on ? C.aux : C.rule),
                    background: on ? C.aux : "transparent", color: C.panel,
                    fontSize: T.micro, lineHeight: "14px", textAlign: "center",
                  }}>{on ? "✓" : ""}</span>
                  <span style={{ fontFamily: MINCHO, fontSize: JP.sm }}>
                    <Word text={w.word} kana={w.reading} mode={qMode} ruby={RUBY.sm} />
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: T.micro, color: C.muted, marginLeft: "auto" }}>{typeLabel(w.type)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ ...box, flex: "2 1 340px", minWidth: 260 }}>
          <div className="kd-head">
            <span className="kd-micro">Forms to drill</span>
            <span className="kd-rail" />
          </div>
          {pool.length === 0 ? (
            <div style={{ fontSize: T.sm, color: C.muted }}>Pick at least one word to see which forms are available.</div>
          ) : (
            GROUPS.map((grp) => {
              const gs = available.filter((f) => f.group === grp);
              if (!gs.length) return null;
              return (
                <div key={grp} style={{ marginBottom: S[3] }}>
                  <div className="kd-micro" style={{ marginBottom: S[1] }}>{grp}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: S[1] }}>
                    {gs.map((f) => {
                      const on = formIds.includes(f.id);
                      return (
                        <Chip key={f.id} on={on} onClick={() => toggleForm(f.id)}>
                          {f.label}
                          <span style={{ fontFamily: MONO, fontSize: T.micro, marginLeft: S[1], opacity: .7 }}>{f.n}</span>
                        </Chip>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}

          <div style={{ borderTop: "1px solid " + C.ruleSoft, paddingTop: S[3], marginTop: S[1] }}>
            <div className="kd-micro" style={{ marginBottom: S[2] }}>Vocabulary</div>
            <div style={{ display: "flex", gap: S[1], flexWrap: "wrap", alignItems: "center", marginBottom: S[3] }}>
              <Chip on={meaningOn} onClick={() => setMeaningOn(!meaningOn)}>
                Meaning
                <span style={{ fontFamily: MINCHO, fontSize: T.micro, marginLeft: S[1], opacity: .8 }}>意味</span>
                <span style={{ fontFamily: MONO, fontSize: T.micro, marginLeft: S[1], opacity: .7 }}>{meaningCount}</span>
              </Chip>
              <span style={{ fontSize: T.fine, color: C.muted, lineHeight: 1.5, flex: "1 1 140px" }}>
                Both ways — word to gloss and gloss to word. The only drill a noun has.
              </span>
            </div>

            <div className="kd-micro" style={{ marginBottom: S[2] }}>Direction</div>
            <div style={{ display: "flex", gap: S[1], flexWrap: "wrap", marginBottom: S[3] }}>
              {[["produce", "Produce the form"], ["recognise", "Name the form"], ["mixed", "Mixed"]].map(([id, label]) => (
                <Chip key={id} on={dir === id} onClick={() => setDir(id)}>{label}</Chip>
              ))}
            </div>
            <div className="kd-micro" style={{ marginBottom: S[2] }}>Length</div>
            <div style={{ display: "flex", gap: S[1], flexWrap: "wrap", marginBottom: S[3] }}>
              {[10, 20, 0].map((n) => (
                <Chip key={n} on={len === n} ink onClick={() => setLen(n)}>{n === 0 ? "All" : n}</Chip>
              ))}
            </div>
            <button className="kd-btn" onClick={() => start()} disabled={total === 0}
              style={{
                width: "100%", background: total === 0 ? C.rule : C.stem, color: C.panel,
                padding: P.wide, fontSize: T.base, letterSpacing: ".04em",
                cursor: total === 0 ? "default" : "pointer",
              }}>
              {total === 0 ? "Pick words and forms to begin" : "Start · " + (len === 0 || len > total ? total : len) + " question" + ((len === 0 || len > total ? total : len) === 1 ? "" : "s")}
            </button>
            {available.length === 0 && meaningCount === 0 && (
              <div style={{ fontSize: T.fine, color: C.muted, marginTop: S[2] }}>
                No forms available. Enable some in Settings, or turn Meaning on above.
              </div>
            )}
            {total > 0 && (
              <div style={{ fontSize: T.fine, color: C.muted, marginTop: S[2], lineHeight: 1.5 }}>
                {total} available from {pool.length} word{pool.length === 1 ? "" : "s"}. Answer in kanji, kana, or romaji.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- results ---------------- */
  if (stage === "done") {
    const wrongN = queue.length - right;
    const pct = queue.length ? Math.round((right / queue.length) * 100) : 0;

    /* Lifetime accuracy for the rules this run actually touched — the run's own
       sample is far too small to call anything a weakness. minN of 3 keeps a single
       lucky or unlucky answer from being reported as a diagnosis. */
    const touched = new Set();
    for (const q of queue) {
      const w = words.find((x) => x.id === q.wordId);
      /* A word deleted mid-run has no type, so it can name no rule — skip it
         rather than letting ruleKey mint an "undefined.te" bucket. */
      if (w) touched.add(ruleKey(w, q.kind.startsWith("mean") ? MEANING : q.formId).id);
    }
    const runRules = byRule(stats, allWords, 3).filter((r) => touched.has(r.id));
    return (
      <div style={{ display: "flex", gap: S[4] + 2, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ ...box, flex: "1 1 240px", minWidth: 230 }}>
          <div className="kd-micro" style={{ marginBottom: S[4] }}>Result</div>
          <div style={{ display: "flex", gap: S[5], marginBottom: S[4] }}>
            <div>
              <div style={{ fontFamily: MINCHO, fontSize: JP.figure, lineHeight: 1, color: C.aux }}>{right}</div>
              <div className="kd-micro" style={{ marginTop: S[1] }}>Right</div>
            </div>
            <div>
              <div style={{ fontFamily: MINCHO, fontSize: JP.figure, lineHeight: 1, color: wrongN ? C.stem : C.rule }}>{wrongN}</div>
              <div className="kd-micro" style={{ marginTop: S[1] }}>Wrong</div>
            </div>
          </div>
          <div style={{ height: 6, background: C.panelAlt, border: "1px solid " + C.ruleSoft, display: "flex", marginBottom: S[2] }}>
            <div style={{ width: pct + "%", background: C.aux }} />
          </div>
          <div style={{ fontSize: T.fine, color: C.muted }}>{pct}% of {queue.length}</div>

          <div style={{ display: "grid", gap: S[2], marginTop: S[4] }}>
            {misses.length > 0 && (
              <button className="kd-btn" onClick={() => start(misses, 0)}
                style={{ background: C.stem, color: C.panel, padding: P.wide, fontSize: T.base }}>
                Drill the {misses.length} missed
              </button>
            )}
            <button className="kd-btn" onClick={() => start()}
              style={{ border: "1px solid " + C.ink, padding: P.wide, fontSize: T.base, background: C.panel }}>
              Same quiz again
            </button>
            <button className="kd-btn" onClick={() => setStage("setup")}
              style={{ border: "1px solid " + C.rule, color: C.muted, padding: P.wide, fontSize: T.base, background: C.panel }}>
              Change what's drilled
            </button>
          </div>
        </div>

        <div style={{ ...box, flex: "2 1 320px", minWidth: 260 }}>
          <div className="kd-micro" style={{ marginBottom: S[3] }}>{misses.length ? "Missed" : "Nothing missed"}</div>
          {misses.length === 0 ? (
            <div style={{ fontFamily: MINCHO, fontSize: JP.sm, color: C.muted }}>全問正解 — clean sweep.</div>
          ) : (
            <div style={{ display: "grid", gap: S[3] }}>
              {misses.map((m, i) => {
                const w = words.find((x) => x.id === m.wordId);
                if (!w) return null;
                if (m.kind.startsWith("mean")) {
                  return (
                    <div key={i} style={{ borderLeft: "3px solid " + C.stem, paddingLeft: S[2] }}>
                      <div className="kd-micro" style={{ marginBottom: 2 }}>{w.word} · Meaning</div>
                      <div style={{ fontFamily: MINCHO, fontSize: JP.md }}>
                        <Word text={w.word} kana={w.reading} mode={qMode} ruby={RUBY.sm} />
                      </div>
                      <div style={{ fontSize: T.base, color: C.muted, marginTop: S[1] }}>{w.meaning}</div>
                    </div>
                  );
                }
                const f = conjugate(w).find((x) => x.id === m.formId);
                if (!f) return null;
                return (
                  <div key={i} style={{ borderLeft: "3px solid " + C.stem, paddingLeft: S[2] }}>
                    <div className="kd-micro" style={{ marginBottom: 2 }}>{w.word} · {f.label}</div>
                    <div style={{ fontFamily: MINCHO, fontSize: JP.md }}>
                      <Word text={formText(f)} kana={formKana(f)} mode={qMode} ruby={RUBY.sm} />
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: T.micro, color: C.muted, marginTop: 2 }}>{romaji(formKana(f))}</div>
                  </div>
                );
              })}
            </div>
          )}
          {runRules.length > 0 && (
            <div style={{ marginTop: S[5], borderTop: "1px solid " + C.ruleSoft, paddingTop: S[3] }}>
              <div className="kd-micro" style={{ marginBottom: S[3] }}>By rule · lifetime</div>
              <div style={{ display: "grid", gap: S[2] }}>
                {runRules.map((r) => (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", gap: S[3] }}>
                    <span style={{ fontSize: T.sm, flex: "1 1 auto", minWidth: 0 }}>
                      {r.label}
                      {r.jp && <span style={{ fontFamily: MINCHO, color: C.muted, marginLeft: S[1] + 1 }}>{r.jp}</span>}
                    </span>
                    <span style={{ flex: "0 0 72px", height: 4, background: C.ruleSoft, display: "flex" }}>
                      <span style={{ width: r.pct + "%", background: r.pct < 60 ? C.stem : C.aux }} />
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: T.micro, color: C.muted, flex: "0 0 auto" }}>
                      {r.pct}% · {r.n}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ---------------- question ---------------- */
  if (!current || !cWord || (!isMean && !target)) {
    return (
      <div style={box}>
        <div style={{ fontSize: T.base, color: C.muted }}>That question no longer resolves — the word may have been deleted.</div>
        <button className="kd-btn" onClick={() => setStage("setup")} style={{ marginTop: S[3], border: "1px solid " + C.ink, padding: P.btn, fontSize: T.base }}>Back to setup</button>
      </div>
    );
  }
  const wrongSoFar = idx + (judged ? 1 : 0) - right;
  const pctDone = Math.round((idx / queue.length) * 100);

  return (
    <div>
      {/* progress + live tally */}
      <div style={{ display: "flex", alignItems: "center", gap: S[3], marginBottom: S[3], flexWrap: "wrap" }}>
        <span className="kd-micro">{idx + 1} / {queue.length}</span>
        <div style={{ flex: 1, minWidth: 80, height: 4, background: C.ruleSoft, display: "flex" }}>
          <div style={{ width: pctDone + "%", background: C.ink, transition: "width .25s" }} />
        </div>
        <span style={{ fontFamily: MONO, fontSize: T.micro, letterSpacing: ".1em", color: C.aux }}>◯ {right}</span>
        <span style={{ fontFamily: MONO, fontSize: T.micro, letterSpacing: ".1em", color: C.stem }}>✕ {wrongSoFar}</span>
      </div>

      <div style={{ ...box, borderTop: "3px solid " + C.ink, padding: "20px 16px" }}>
        {/* The ask. This is the instruction that changes card to card, and
            reading it wrong means answering a different form entirely — so it
            is sized as a question rather than as an eyebrow. The target form
            sits in the same filled chip the deck uses for a selected form, so
            "the form in question" looks the same in both views. */}
        <div className="kd-ask">
          <span>
            {isMean
              ? (toEn ? "What does this mean?" : "Which word means this?")
              : isRecog
                ? "Which form is this?"
                : source
                  ? "From this form, write the"
                  : "Write the"}
          </span>
          {!isRecog && !isMean && (
            <span className="kd-ask-target">
              {target.label}
              <span style={{ fontFamily: MINCHO, letterSpacing: 0, textTransform: "none", marginLeft: S[1] + 1 }}>{target.jp}</span>
            </span>
          )}
          {isMean && <span style={{ fontFamily: MINCHO, color: C.muted }}>意味</span>}
        </div>

        {isMean && !toEn ? (
          /* The gloss is the prompt — English, so it stays in the sans face. */
          <div style={{ fontSize: T.prompt, lineHeight: 1.35, marginBottom: S[4] }}>{cWord.meaning}</div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "flex-start", gap: S[1], marginBottom: S[1] }}>
              <div style={{ fontFamily: MINCHO, fontSize: JP.xl }}>
                {isMean || (!isRecog && !source)
                  ? <Word text={cWord.word} kana={cWord.reading} mode={qMode} ruby={RUBY.xl} />
                  : isRecog
                    ? <Word text={formText(target)} kana={formKana(target)} mode={qMode} ruby={RUBY.xl} />
                    : <Word text={formText(source)} kana={formKana(source)} mode={qMode} ruby={RUBY.xl} />}
              </div>
              {(isRecog || isMean || judged) && (
                <Say text={isMean ? cWord.reading : formKana(target)} size={15} enabled={settings.show.audio} />
              )}
            </div>
            <div style={{ fontSize: T.base, color: C.muted, marginBottom: S[4] }}>
              {/* Never leak the answer: a meaning question must not print the gloss. */}
              {!isMean && cWord.meaning}
              <span style={{ fontFamily: MONO, fontSize: T.micro, letterSpacing: ".1em", marginLeft: isMean ? 0 : S[2] }}>{typeLabel(cWord.type)}</span>
              {source && <span style={{ fontFamily: MONO, fontSize: T.micro, letterSpacing: ".1em", marginLeft: S[2] }}>{source.label.toUpperCase()}</span>}
            </div>
          </>
        )}

        {/* answer */}
        {isMean ? (
          <div style={{ display: "grid", gap: S[1] }}>
            {options.map((w, i) => {
              const chosen = judged && judged.chose === w.id;
              const isRight = judged && w.id === cWord.id;
              return (
                <button key={w.id} className="kd-btn kd-form-chip kd-opt" onClick={() => choose(w.id)}
                  disabled={!!judged}
                  style={{
                    border: "1px solid " + (isRight ? C.aux : chosen ? C.stem : C.rule),
                    background: isRight ? C.aux : chosen ? C.stem : C.panel,
                    color: isRight || chosen ? C.panel : C.ink,
                    cursor: judged ? "default" : "pointer",
                  }}>
                  <span className="kd-opt-key" aria-hidden="true">{i + 1}</span>
                  {toEn ? w.meaning : (
                    <span style={{ fontFamily: MINCHO, fontSize: JP.md }}>
                      <Word text={w.word} kana={w.reading} mode={qMode} ruby={RUBY.sm}
                        rubyColor={isRight || chosen ? C.onInkDim : C.muted} />
                    </span>
                  )}
                </button>
              );
            })}
            {judged && (
              <button ref={nextRef} className="kd-btn" onClick={advance}
                style={{ background: C.ink, color: C.panel, padding: P.wide, fontSize: T.base, marginTop: S[1] }}>
                {idx + 1 >= queue.length ? "See result" : "Next"}
              </button>
            )}
          </div>
        ) : isRecog ? (
          <div style={{ display: "grid", gap: S[1] }}>
            {options.map((f, i) => {
              const chosen = judged && judged.chose === f.id;
              const isRight = judged && f.id === target.id;
              return (
                <button key={f.id} className="kd-btn kd-form-chip kd-opt" onClick={() => choose(f.id)}
                  disabled={!!judged}
                  style={{
                    border: "1px solid " + (isRight ? C.aux : chosen ? C.stem : C.rule),
                    background: isRight ? C.aux : chosen ? C.stem : C.panel,
                    color: isRight || chosen ? C.panel : C.ink,
                    cursor: judged ? "default" : "pointer",
                  }}>
                  <span className="kd-opt-key" aria-hidden="true">{i + 1}</span>
                  {f.label}
                  <span style={{ fontFamily: MINCHO, fontSize: T.fine, marginLeft: S[2], opacity: .75 }}>{f.jp}</span>
                </button>
              );
            })}
            {judged && (
              <button ref={nextRef} className="kd-btn" onClick={advance}
                style={{ background: C.ink, color: C.panel, padding: P.wide, fontSize: T.base, marginTop: S[1] }}>
                {idx + 1 >= queue.length ? "See result" : "Next"}
              </button>
            )}
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
              <input key={idx} className="kd-in" style={{ flex: "1 1 160px", fontFamily: MINCHO, fontSize: T.lg }}
                placeholder={ime ? "Type romaji — it becomes kana" : "Your answer"} value={input} autoFocus
                autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="go"
                inputMode="latin" readOnly={!!judged}
                onChange={(e) => setInput(ime ? toKana(e.target.value) : e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()} />
              <button className="kd-btn" onClick={submit}
                style={{ background: C.ink, color: C.panel, padding: "0 16px", fontSize: T.base, minHeight: 42 }}>
                {judged ? (idx + 1 >= queue.length ? "See result" : "Next") : "Check"}
              </button>
              {!judged && (
                <button className="kd-btn" onClick={reveal}
                  style={{ border: "1px solid " + C.rule, color: C.muted, padding: "0 12px", fontSize: T.sm, minHeight: 42, background: C.panel }}>
                  Show me
                </button>
              )}
            </div>
            <button className="kd-btn kd-act" onClick={() => setIme(!ime)} style={{ marginTop: S[2] }}>
              かな IME {ime ? "ON" : "OFF"}
            </button>
          </>
        )}

        {/* verdict + breakdown */}
        {judged && (
          <div style={{ marginTop: S[4], borderTop: "1px solid " + C.ruleSoft, paddingTop: S[4] }}>
            <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[3] }}>
              <span style={{
                fontFamily: MONO, fontSize: T.micro, letterSpacing: ".18em", padding: P.tag,
                background: judged.ok ? C.aux : C.stem, color: C.panel,
              }}>{judged.ok ? "CORRECT" : "NOT QUITE"}</span>
              {!isMean && !judged.ok && input.trim() && (
                <span style={{ fontSize: T.sm, color: C.muted }}>you wrote <span style={{ fontFamily: MINCHO, fontSize: JP.sm, color: C.ink }}>{input.trim()}</span></span>
              )}
            </div>
            {isMean ? (
              /* Both halves of the pair, whichever half was the prompt — the point
                 is that the two are now attached to each other. */
              <div style={{ display: "flex", alignItems: "flex-end", gap: S[3], flexWrap: "wrap" }}>
                <span style={{ fontFamily: MINCHO, fontSize: JP.lg }}>
                  <Word text={cWord.word} kana={cWord.reading} mode={qMode} ruby={RUBY.lg} />
                </span>
                <span style={{ fontSize: T.md, paddingBottom: S[1] }}>{cWord.meaning}</span>
                <span style={{ paddingBottom: 2 }}>
                  <Say text={cWord.reading} label="Play the word" enabled={settings.show.audio} />
                </span>
                {settings.show.romaji && (
                  <span style={{ fontFamily: MONO, fontSize: T.fine, color: C.muted, paddingBottom: S[1] + 1 }}>{romaji(cWord.reading)}</span>
                )}
              </div>
            ) : (
            <Strip segs={target.segs} script={qMode} glosses={settings.show.glosses} />
            )}
            {!isMean && (
            <div style={{ display: "flex", alignItems: "center", gap: S[1], marginTop: S[2] }}>
              {settings.show.romaji && (
                <span style={{ fontFamily: MONO, fontSize: T.fine, color: C.muted }}>{romaji(formKana(target))}</span>
              )}
              <Say text={formKana(target)} label="Play the answer" enabled={settings.show.audio} />
            </div>
            )}
            {!isMean && target.note && (
              <div className="kd-note" style={{ marginTop: S[3], borderLeftColor: C.extra }}>{target.note}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Quiz;
