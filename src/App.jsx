import { useState, useEffect, useMemo, useRef } from "react";
import { Plus, Trash2, X, Search, Volume2, Undo2, Download, Upload } from "lucide-react";

import { C, ROLE_COLOR, MINCHO, SANS, MONO } from "./theme.js";
import { storage, KEY, SKEY, GKEY } from "./storage.js";
import { SPEECH_OK, speak, useSpeechStatus, setAudioReporter } from "./speech.js";
import { lookupWord, fetchExamples } from "./api.js";
import {
  romaji, toKana, settleKana, conjugate, detectType, TYPES, typeLabel, GROUPS, GODAN,
  MODS, stackInit, stackApply, columns, formText, formKana, answerMatches,
  shuffle, shuffleStable, REVERSE_SOURCES, SEED,
} from "./engine.js";
import { DEFAULTS, mergeSettings, visibleForms, visibleMods, wordInScope, allForms, PRESETS, applyPreset, JLPT } from "./settings.js";
import SettingsView from "./SettingsView.jsx";

/* ============================================================
   SCRIPT RENDERING — furigana / kanji / kana
   Furigana is aligned to the kanji only: 食べ reads た over 食,
   never たべ smeared across both characters.
   ============================================================ */
function Word({ text, kana, mode, ruby = 11, rubyColor = C.muted, reserve = false }) {
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

const SCRIPTS = [
  { id: "furigana", label: "漢字＋かな" },
  { id: "kanji", label: "漢字" },
  { id: "kana", label: "かな" },
];

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
                fontFamily: MINCHO, fontSize: 20, lineHeight: "34px", height: 34,
                color: on ? C.panel : C.muted,
                background: on ? C.stem : "transparent",
                border: "1px solid " + (on ? C.stem : C.ruleSoft),
                transition: "background .18s, color .18s",
              }}
            >{c.k}</div>
            <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: ".14em", color: on ? C.stem : C.muted, marginTop: 3 }}>{c.tag.toUpperCase()}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   AUDIO — Web Speech, no dependency. Reads the kana so the engine
   never has to guess a kanji reading.
   ============================================================ */
function Say({ text, size = 13, color = C.muted, label = "Play", enabled = true }) {
  if (!text || !enabled) return null;
  return (
    <button className="kd-btn" title={label} aria-label={label}
      onClick={(e) => { e.stopPropagation(); speak(text); }}
      style={{ color: SPEECH_OK ? color : C.rule, padding: 6, lineHeight: 0, flexShrink: 0 }}>
      <Volume2 size={size} />
    </button>
  );
}

/* ============================================================
   MORPHEME STRIP — shared by the study view, the stack builder
   and the quiz reveal.
   ============================================================ */
function Strip({ segs, script, size = "clamp(21px, 6.4vw, 32px)", ruby = "clamp(8px, 2.2vw, 11px)", onPick, activeIdx, glosses: showGlosses = true }) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "flex-end" }}>
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
            {showGlosses && (
              <div style={{
                fontFamily: MONO, fontSize: 8, letterSpacing: ".1em", marginTop: 4,
                color: on ? C.panel : col, background: on ? col : "transparent",
                border: "1px solid " + col, padding: "1px 4px",
              }}>{s.gloss}</div>
            )}
          </Tag>
        );
      })}
    </div>
  );
}

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
  const micro = { fontFamily: MONO, fontSize: 9, letterSpacing: ".2em", textTransform: "uppercase", color: C.muted };

  return (
    <div style={{ marginTop: 20, border: "1px solid " + C.rule, background: C.panel, padding: "15px 15px 13px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <span style={micro}>Stack forms</span>
        <span style={{ fontFamily: MINCHO, fontSize: 12, color: C.muted }}>活用を重ねる</span>
        <span style={{ flex: 1, minWidth: 20, height: 1, background: C.ruleSoft }} />
        {chain.length > 0 && (
          <>
            <button className="kd-btn" onClick={() => { setChain(chain.slice(0, -1)); setPick(null); }}
              style={{ ...micro, letterSpacing: ".1em", color: C.aux, display: "flex", alignItems: "center", gap: 3 }}>
              <Undo2 size={11} /> Undo
            </button>
            <button className="kd-btn" onClick={() => { setChain([]); setPick(null); }}
              style={{ ...micro, letterSpacing: ".1em", color: C.aux }}>Reset</button>
          </>
        )}
      </div>

      {/* the chain so far */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center", marginBottom: 13, minHeight: 20 }}>
        <span style={{ fontFamily: MONO, fontSize: 9, color: C.muted }}>{word.word}</span>
        {chain.map((id, i) => {
          const m = MODS.find((x) => x.id === id);
          return (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ color: C.rule, fontSize: 11 }}>›</span>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: ".08em", color: C.panel, background: C.aux, padding: "2px 5px" }}>
                {m ? m.label.toUpperCase() : id}
              </span>
            </span>
          );
        })}
        {chain.length === 0 && <span style={{ fontSize: 11.5, color: C.muted, marginLeft: 4 }}>— add a modifier below and they compound</span>}
      </div>

      {/* result */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Strip segs={st.segs} script={script} onPick={setPick} activeIdx={pick} glosses={settings.show.glosses} />
          {settings.show.romaji && (
            <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.muted, marginTop: 7 }}>{romaji(kana)}</div>
          )}
        </div>
        <Say text={kana} size={15} label="Play this form" enabled={settings.show.audio} />
      </div>

      {active && (
        <div style={{ borderTop: "1px solid " + C.ruleSoft, paddingTop: 11, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 7, marginBottom: 4 }}>
            <span style={{ fontFamily: MINCHO, fontSize: 16, color: ROLE_COLOR[active.role] }}>{active.text}</span>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>{active.title}</span>
          </div>
          <div style={{ fontSize: 12.5, lineHeight: 1.6, color: "#3b433e" }}>{active.body}</div>
        </div>
      )}

      {/* what can still be applied */}
      <div style={{ borderTop: "1px solid " + C.ruleSoft, paddingTop: 11 }}>
        {enabled.length === 0 ? (
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.55 }}>
            No stack modifiers enabled. Turn some on in Settings.
          </div>
        ) : avail.length === 0 ? (
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.55 }}>
            Nothing more attaches here — ます, た and て close a chain. Undo to branch off somewhere else.
          </div>
        ) : (
          <>
            <div style={{ ...micro, fontSize: 8.5, marginBottom: 7 }}>
              Add · currently {st.cls === "closed" ? "closed" : st.cls === "i-adj" ? "behaves as an い-adjective" : st.cls === "ichidan" ? "behaves as an ichidan verb" : st.cls}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {avail.map((m) => (
                <button key={m.id} className="kd-btn kd-form-chip" title={m.hint}
                  onClick={() => { setChain([...chain, m.id]); setPick(null); }}
                  style={{ border: "1px solid " + C.rule, background: C.panel, padding: "6px 9px", fontSize: 11.5, textAlign: "left" }}>
                  {m.label}
                  <span style={{ fontFamily: MINCHO, fontSize: 10, color: C.muted, marginLeft: 5 }}>{m.jp}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

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
  const micro = { fontFamily: MONO, fontSize: 9, letterSpacing: ".2em", textTransform: "uppercase", color: C.muted };

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
    <div style={{ marginTop: 20, border: "1px solid " + C.rule, background: C.panel, padding: "15px 15px 13px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <span style={micro}>In context</span>
        <span style={{ fontFamily: MINCHO, fontSize: 12, color: C.muted }}>例文</span>
        <span style={{ flex: 1, minWidth: 20, height: 1, background: C.ruleSoft }} />
        <button className="kd-btn" onClick={run} disabled={busy}
          style={{
            ...micro, letterSpacing: ".1em", color: busy ? C.rule : C.aux,
            cursor: busy ? "default" : "pointer",
          }}>
          {busy ? "Writing…" : list.length ? "Replace" : "Get sentences"}
        </button>
      </div>

      {err && <div style={{ borderLeft: "3px solid " + C.stem, background: C.panelAlt, padding: "8px 10px", fontSize: 11.5, lineHeight: 1.5, marginBottom: 10 }}>{err}</div>}

      {list.length === 0 && !err && (
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
          A conjugation table doesn't tell you when to use て over たら. Pull a few sentences and each form gets a situation attached to it.
        </div>
      )}

      <div style={{ display: "grid", gap: 14 }}>
        {list.map((e, i) => {
          const f = detectForm(e.ja, forms);
          return (
            <div key={i} style={{ borderLeft: "3px solid " + C.ruleSoft, paddingLeft: 10 }}>
              {f && (
                <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: ".14em", color: C.aux, marginBottom: 4 }}>
                  USES {f.label.toUpperCase()}
                </div>
              )}
              {script !== "kana" && (
                <div style={{ fontFamily: MINCHO, fontSize: 10.5, color: C.muted, letterSpacing: ".04em" }}>{e.kana}</div>
              )}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                <div style={{ fontFamily: MINCHO, fontSize: "clamp(15px, 4.4vw, 18px)", lineHeight: 1.5, flex: 1 }}>
                  {script === "kana" ? e.kana : e.ja}
                </div>
                <Say text={e.kana} label="Play sentence" enabled={settings.show.audio} />
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 3, lineHeight: 1.5 }}>{e.en}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   EXPORT / IMPORT
   ============================================================ */
function DeckTools({ words, onImport }) {
  const [note, setNote] = useState(null);
  const fileRef = useRef(null);

  function exportDeck() {
    const payload = JSON.stringify({ format: "kotoba-deck", version: 1, exportedAt: new Date().toISOString(), words }, null, 2);
    try {
      const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "kotoba-deck.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setNote({ kind: "ok", text: "Saved kotoba-deck.json with " + words.length + " entries." });
    } catch {
      setNote({ kind: "bad", text: "This browser blocked the download. Copy the JSON instead." });
    }
  }

  async function copyDeck() {
    const payload = JSON.stringify({ format: "kotoba-deck", version: 1, words }, null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      setNote({ kind: "ok", text: "Deck JSON copied to the clipboard." });
    } catch {
      setNote({ kind: "bad", text: "Clipboard access was refused. Use Export instead." });
    }
  }

  function readFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const incoming = Array.isArray(parsed) ? parsed : parsed.words;
        if (!Array.isArray(incoming)) throw new Error("shape");
        const clean = incoming
          .filter((w) => w && typeof w.word === "string" && w.word.trim())
          .map((w) => ({
            id: "i" + Math.random().toString(36).slice(2, 9),
            word: String(w.word).trim(),
            reading: String(w.reading || w.word).trim(),
            meaning: String(w.meaning || ""),
            type: TYPES.some((t) => t.id === w.type) ? w.type : detectType(w.word, w.reading || w.word),
            examples: Array.isArray(w.examples) ? w.examples.slice(0, 5) : undefined,
            addedAt: Number(w.addedAt) || Date.now(),
          }));
        if (!clean.length) throw new Error("empty");
        const added = onImport(clean);
        setNote({ kind: "ok", text: "Added " + added + " of " + clean.length + (clean.length - added > 0 ? " — the rest were already in the deck." : ".") });
      } catch {
        setNote({ kind: "bad", text: "That file is not a deck export — it needs a words array of entries." });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const link = { fontFamily: MONO, fontSize: 9, letterSpacing: ".14em", color: C.aux, display: "flex", alignItems: "center", gap: 4 };
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button className="kd-btn" onClick={exportDeck} style={link}><Download size={11} /> EXPORT</button>
        <button className="kd-btn" onClick={() => fileRef.current && fileRef.current.click()} style={link}><Upload size={11} /> IMPORT</button>
        <button className="kd-btn" onClick={copyDeck} style={link}>COPY JSON</button>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={readFile} style={{ display: "none" }} />
      </div>
      {note && (
        <div style={{
          marginTop: 7, fontSize: 11, lineHeight: 1.5, padding: "6px 8px",
          background: C.panelAlt, borderLeft: "3px solid " + (note.kind === "ok" ? C.aux : C.stem),
        }}>{note.text}</div>
      )}
    </div>
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
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: ".2em", textTransform: "uppercase", color: C.stem }}>
          {eyebrow}
        </div>

        {stat && (
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 12 }}>
            <span style={{ fontFamily: MINCHO, fontSize: 40, lineHeight: 1, color: C.ink }}>{stat}</span>
            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: ".16em", textTransform: "uppercase", color: C.muted }}>{statLabel}</span>
          </div>
        )}

        <div style={{ fontSize: 13, lineHeight: 1.6, marginTop: stat ? 10 : 10, color: C.ink }}>{body}</div>

        <div style={{ display: "flex", gap: 7, marginTop: 18 }}>
          <button className="kd-btn" onClick={onConfirm}
            style={{ flex: 1, background: C.stem, color: C.panel, padding: "11px 0", fontSize: 13 }}>
            {confirmLabel}
          </button>
          <button className="kd-btn" onClick={onCancel} autoFocus
            style={{ flex: 1, border: "1px solid " + C.ink, background: C.panel, color: C.ink, padding: "11px 0", fontSize: 13 }}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   ANSWER MATCHING
   The point of the drill is morphology, not romanisation, so input is
   accepted as kanji, kana, or loose romaji. Both sides go through the
   same normaliser, so every rule below only ever adds leniency.
   ============================================================ */
/* ============================================================
   QUIZ
   ============================================================ */
function Quiz({ words, script, onProgress, settings }) {
  /* A conjugation drill should not double as a kanji-reading drill by accident,
     so the reading stays visible here even when the deck is set to 漢字 only. */
  const qMode = script === "kana" ? "kana" : "furigana";

  const [picked, setPicked] = useState(() => new Set(words.map((w) => w.id)));
  const [formIds, setFormIds] = useState(["masu", "te", "ta", "nai"]);
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

  const pool = words.filter((w) => picked.has(w.id));
  const poolKey = pool.map((w) => w.id).join(",");

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
    return [...m.values()];
  }, [poolKey]); // eslint-disable-line

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
    return out;
  }, [poolKey, formIds.join(","), dir]); // eslint-disable-line

  const total = items.length;

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
  const cForms = useMemo(() => (cWord ? conjugate(cWord) : []), [cWord]);
  const target = current ? cForms.find((f) => f.id === current.formId) : null;
  const source = current && current.fromId ? cForms.find((f) => f.id === current.fromId) : null;

  function submit() {
    if (!current || !target) return;
    if (judged) return advance();
    if (!input.trim()) return;
    const settled = ime ? settleKana(input) : input;
    if (settled !== input) setInput(settled);
    const ok = answerMatches(settled, target);
    setJudged({ ok });
    if (ok) setRight((r) => r + 1);
    else setMisses((m) => [...m, current]);
  }

  function choose(id) {
    if (judged || !current) return;
    const ok = id === current.formId;
    setJudged({ ok, chose: id });
    if (ok) setRight((r) => r + 1);
    else setMisses((m) => [...m, current]);
  }

  function reveal() {
    if (judged || !target) return;
    setJudged({ ok: false });
    setMisses((m) => [...m, current]);
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

  const box = { border: "1px solid " + C.rule, background: C.panel, padding: 14 };
  const micro = { fontFamily: MONO, fontSize: 9, letterSpacing: ".2em", textTransform: "uppercase", color: C.muted };

  if (!words.length) {
    return (
      <div style={{ ...box, padding: 40, textAlign: "center" }}>
        <div style={{ fontFamily: MINCHO, fontSize: 34, color: C.rule }}>空</div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 8 }}>Add a word to the deck first — the quiz builds its questions from it.</div>
      </div>
    );
  }

  /* ---------------- setup ---------------- */
  if (stage === "setup") {
    return (
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ ...box, flex: "1 1 260px", minWidth: 240 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={micro}>Words</span>
            <span style={{ flex: 1, height: 1, background: C.ruleSoft }} />
            <button className="kd-btn" onClick={() => setPicked(new Set(words.map((w) => w.id)))} style={{ ...micro, letterSpacing: ".1em", color: C.aux }}>All</button>
            <button className="kd-btn" onClick={() => setPicked(new Set())} style={{ ...micro, letterSpacing: ".1em", color: C.aux }}>None</button>
          </div>
          <div style={{ maxHeight: 300, overflowY: "auto", border: "1px solid " + C.ruleSoft }}>
            {words.map((w) => {
              const on = picked.has(w.id);
              return (
                <button key={w.id} className="kd-btn kd-row" onClick={() => toggleWord(w.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left",
                    padding: "8px 9px", borderBottom: "1px solid " + C.ruleSoft,
                    background: on ? C.panelAlt : "transparent",
                  }}>
                  <span style={{
                    width: 15, height: 15, flexShrink: 0, border: "1px solid " + (on ? C.aux : C.rule),
                    background: on ? C.aux : "transparent", color: C.panel,
                    fontSize: 10, lineHeight: "14px", textAlign: "center",
                  }}>{on ? "✓" : ""}</span>
                  <span style={{ fontFamily: MINCHO, fontSize: 17 }}>
                    <Word text={w.word} kana={w.reading} mode={qMode} ruby={8} />
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 9, color: C.muted, marginLeft: "auto" }}>{typeLabel(w.type)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ ...box, flex: "2 1 340px", minWidth: 260 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={micro}>Forms to drill</span>
            <span style={{ flex: 1, height: 1, background: C.ruleSoft }} />
          </div>
          {available.length === 0 ? (
            <div style={{ fontSize: 12, color: C.muted }}>Pick at least one word to see which forms are available.</div>
          ) : (
            GROUPS.map((grp) => {
              const gs = available.filter((f) => f.group === grp);
              if (!gs.length) return null;
              return (
                <div key={grp} style={{ marginBottom: 11 }}>
                  <div style={{ ...micro, fontSize: 8.5, marginBottom: 5 }}>{grp}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {gs.map((f) => {
                      const on = formIds.includes(f.id);
                      return (
                        <button key={f.id} className="kd-btn kd-form-chip" onClick={() => toggleForm(f.id)}
                          style={{
                            border: "1px solid " + (on ? C.aux : C.rule),
                            background: on ? C.aux : "transparent",
                            color: on ? C.panel : C.ink,
                            padding: "6px 9px", fontSize: 11.5, textAlign: "left",
                          }}>
                          {f.label}
                          <span style={{ fontFamily: MONO, fontSize: 8.5, marginLeft: 5, opacity: .7 }}>{f.n}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}

          <div style={{ borderTop: "1px solid " + C.ruleSoft, paddingTop: 12, marginTop: 4 }}>
            <div style={{ ...micro, fontSize: 8.5, marginBottom: 6 }}>Direction</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
              {[["produce", "Produce the form"], ["recognise", "Name the form"], ["mixed", "Mixed"]].map(([id, label]) => (
                <button key={id} className="kd-btn kd-form-chip" onClick={() => setDir(id)}
                  style={{
                    border: "1px solid " + (dir === id ? C.aux : C.rule),
                    background: dir === id ? C.aux : "transparent",
                    color: dir === id ? C.panel : C.ink, padding: "6px 9px", fontSize: 11.5,
                  }}>{label}</button>
              ))}
            </div>
            <div style={{ ...micro, fontSize: 8.5, marginBottom: 6 }}>Length</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
              {[10, 20, 0].map((n) => (
                <button key={n} className="kd-btn kd-form-chip" onClick={() => setLen(n)}
                  style={{
                    border: "1px solid " + (len === n ? C.ink : C.rule),
                    background: len === n ? C.ink : "transparent",
                    color: len === n ? C.panel : C.ink, padding: "6px 11px", fontSize: 11.5,
                  }}>{n === 0 ? "All" : n}</button>
              ))}
            </div>
            <button className="kd-btn" onClick={() => start()} disabled={total === 0}
              style={{
                width: "100%", background: total === 0 ? C.rule : C.stem, color: C.panel,
                padding: "11px 0", fontSize: 13, letterSpacing: ".04em",
                cursor: total === 0 ? "default" : "pointer",
              }}>
              {total === 0 ? "Pick words and forms to begin" : "Start · " + (len === 0 || len > total ? total : len) + " question" + ((len === 0 || len > total ? total : len) === 1 ? "" : "s")}
            </button>
            {total > 0 && (
              <div style={{ fontSize: 11, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>
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
    return (
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ ...box, flex: "1 1 240px", minWidth: 230 }}>
          <div style={{ ...micro, marginBottom: 14 }}>Result</div>
          <div style={{ display: "flex", gap: 20, marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: MINCHO, fontSize: 44, lineHeight: 1, color: C.aux }}>{right}</div>
              <div style={{ ...micro, fontSize: 9, marginTop: 4 }}>Right</div>
            </div>
            <div>
              <div style={{ fontFamily: MINCHO, fontSize: 44, lineHeight: 1, color: wrongN ? C.stem : C.rule }}>{wrongN}</div>
              <div style={{ ...micro, fontSize: 9, marginTop: 4 }}>Wrong</div>
            </div>
          </div>
          <div style={{ height: 6, background: C.panelAlt, border: "1px solid " + C.ruleSoft, display: "flex", marginBottom: 6 }}>
            <div style={{ width: pct + "%", background: C.aux }} />
          </div>
          <div style={{ fontSize: 11.5, color: C.muted }}>{pct}% of {queue.length}</div>

          <div style={{ display: "grid", gap: 6, marginTop: 18 }}>
            {misses.length > 0 && (
              <button className="kd-btn" onClick={() => start(misses, 0)}
                style={{ background: C.stem, color: C.panel, padding: "10px 0", fontSize: 12.5 }}>
                Drill the {misses.length} missed
              </button>
            )}
            <button className="kd-btn" onClick={() => start()}
              style={{ border: "1px solid " + C.ink, padding: "10px 0", fontSize: 12.5, background: C.panel }}>
              Same quiz again
            </button>
            <button className="kd-btn" onClick={() => setStage("setup")}
              style={{ border: "1px solid " + C.rule, color: C.muted, padding: "10px 0", fontSize: 12.5, background: C.panel }}>
              Change what's drilled
            </button>
          </div>
        </div>

        <div style={{ ...box, flex: "2 1 320px", minWidth: 260 }}>
          <div style={{ ...micro, marginBottom: 12 }}>{misses.length ? "Missed" : "Nothing missed"}</div>
          {misses.length === 0 ? (
            <div style={{ fontFamily: MINCHO, fontSize: 15, color: C.muted }}>全問正解 — clean sweep.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {misses.map((m, i) => {
                const w = words.find((x) => x.id === m.wordId);
                const f = w ? conjugate(w).find((x) => x.id === m.formId) : null;
                if (!f) return null;
                return (
                  <div key={i} style={{ borderLeft: "3px solid " + C.stem, paddingLeft: 9 }}>
                    <div style={{ ...micro, fontSize: 8.5, marginBottom: 2 }}>{w.word} · {f.label}</div>
                    <div style={{ fontFamily: MINCHO, fontSize: 20 }}>
                      <Word text={formText(f)} kana={formKana(f)} mode={qMode} ruby={9} />
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.muted, marginTop: 2 }}>{romaji(formKana(f))}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ---------------- question ---------------- */
  if (!current || !target) {
    return (
      <div style={box}>
        <div style={{ fontSize: 13, color: C.muted }}>That question no longer resolves — the word may have been deleted.</div>
        <button className="kd-btn" onClick={() => setStage("setup")} style={{ marginTop: 10, border: "1px solid " + C.ink, padding: "8px 14px", fontSize: 12.5 }}>Back to setup</button>
      </div>
    );
  }
  const isRecog = current.kind === "recognise";
  const options = isRecog
    ? shuffleStable([target, ...(current.opts || []).map((id) => cForms.find((f) => f.id === id)).filter(Boolean)], current.wordId + current.formId)
    : [];
  const wrongSoFar = idx + (judged ? 1 : 0) - right;
  const pctDone = Math.round((idx / queue.length) * 100);

  return (
    <div>
      {/* progress + live tally */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ ...micro }}>{idx + 1} / {queue.length}</span>
        <div style={{ flex: 1, minWidth: 80, height: 4, background: C.ruleSoft, display: "flex" }}>
          <div style={{ width: pctDone + "%", background: C.ink, transition: "width .25s" }} />
        </div>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".1em", color: C.aux }}>◯ {right}</span>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".1em", color: C.stem }}>✕ {wrongSoFar}</span>
      </div>

      <div style={{ ...box, borderTop: "3px solid " + C.ink, padding: "20px 16px" }}>
        {/* the ask */}
        <div style={{ ...micro, marginBottom: 12 }}>
          {isRecog
            ? "Which form is this?"
            : source
              ? "From this form, write the dictionary form"
              : "Write the " + target.label.toLowerCase()}
          {!isRecog && <span style={{ fontFamily: MINCHO, letterSpacing: 0, textTransform: "none", marginLeft: 6 }}>{target.jp}</span>}
        </div>

        <div style={{ display: "flex", alignItems: "flex-start", gap: 4, marginBottom: 4 }}>
          <div style={{ fontFamily: MINCHO, fontSize: "clamp(28px, 9vw, 44px)" }}>
            {isRecog
              ? <Word text={formText(target)} kana={formKana(target)} mode={qMode} ruby="clamp(10px, 3vw, 15px)" />
              : source
                ? <Word text={formText(source)} kana={formKana(source)} mode={qMode} ruby="clamp(10px, 3vw, 15px)" />
                : <Word text={cWord.word} kana={cWord.reading} mode={qMode} ruby="clamp(10px, 3vw, 15px)" />}
          </div>
          {(isRecog || judged) && <Say text={formKana(target)} size={15} enabled={settings.show.audio} />}
        </div>
        <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 16 }}>
          {cWord.meaning}
          <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: ".1em", marginLeft: 8 }}>{typeLabel(cWord.type)}</span>
          {source && <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: ".1em", marginLeft: 8 }}>{source.label.toUpperCase()}</span>}
        </div>

        {/* answer */}
        {isRecog ? (
          <div style={{ display: "grid", gap: 5 }}>
            {options.map((f) => {
              const chosen = judged && judged.chose === f.id;
              const isRight = judged && f.id === target.id;
              return (
                <button key={f.id} className="kd-btn kd-form-chip" onClick={() => choose(f.id)}
                  disabled={!!judged}
                  style={{
                    textAlign: "left", padding: "10px 12px", fontSize: 13,
                    border: "1px solid " + (isRight ? C.aux : chosen ? C.stem : C.rule),
                    background: isRight ? C.aux : chosen ? C.stem : C.panel,
                    color: isRight || chosen ? C.panel : C.ink,
                    cursor: judged ? "default" : "pointer",
                  }}>
                  {f.label}
                  <span style={{ fontFamily: MINCHO, fontSize: 11, marginLeft: 6, opacity: .75 }}>{f.jp}</span>
                </button>
              );
            })}
            {judged && (
              <button className="kd-btn" onClick={advance}
                style={{ background: C.ink, color: C.panel, padding: "10px 0", fontSize: 13, marginTop: 3 }}>
                {idx + 1 >= queue.length ? "See result" : "Next"}
              </button>
            )}
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <input key={idx} className="kd-in" style={{ flex: "1 1 160px", fontFamily: MINCHO, fontSize: 18 }}
                placeholder={ime ? "Type romaji — it becomes kana" : "Your answer"} value={input} autoFocus
                autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="go"
                inputMode="latin" readOnly={!!judged}
                onChange={(e) => setInput(ime ? toKana(e.target.value) : e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()} />
              <button className="kd-btn" onClick={submit}
                style={{ background: C.ink, color: C.panel, padding: "0 16px", fontSize: 13, minHeight: 42 }}>
                {judged ? (idx + 1 >= queue.length ? "See result" : "Next") : "Check"}
              </button>
              {!judged && (
                <button className="kd-btn" onClick={reveal}
                  style={{ border: "1px solid " + C.rule, color: C.muted, padding: "0 12px", fontSize: 12, minHeight: 42, background: C.panel }}>
                  Show me
                </button>
              )}
            </div>
            <button className="kd-btn" onClick={() => setIme(!ime)}
              style={{ fontFamily: MONO, fontSize: 9, letterSpacing: ".14em", color: C.aux, marginTop: 8 }}>
              かな IME {ime ? "ON" : "OFF"}
            </button>
          </>
        )}

        {/* verdict + breakdown */}
        {judged && (
          <div style={{ marginTop: 16, borderTop: "1px solid " + C.ruleSoft, paddingTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{
                fontFamily: MONO, fontSize: 9, letterSpacing: ".18em", padding: "3px 7px",
                background: judged.ok ? C.aux : C.stem, color: C.panel,
              }}>{judged.ok ? "CORRECT" : "NOT QUITE"}</span>
              {!judged.ok && input.trim() && (
                <span style={{ fontSize: 12, color: C.muted }}>you wrote <span style={{ fontFamily: MINCHO, fontSize: 15, color: C.ink }}>{input.trim()}</span></span>
              )}
            </div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "flex-end" }}>
              {target.segs.map((s, i) => (
                <div key={i} style={{ textAlign: "center" }}>
                  <div style={{
                    fontFamily: MINCHO, fontSize: "clamp(21px, 6.4vw, 32px)", color: ROLE_COLOR[s.role],
                    borderBottom: "2px solid " + ROLE_COLOR[s.role], padding: "0 5px 2px",
                  }}>
                    <Word text={s.text} kana={s.kana} mode={qMode} ruby="clamp(8px, 2.2vw, 11px)" rubyColor={ROLE_COLOR[s.role]} reserve />
                  </div>
                  {settings.show.glosses && (
                    <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: ".1em", color: ROLE_COLOR[s.role], marginTop: 4 }}>{s.gloss}</div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8 }}>
              {settings.show.romaji && (
                <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.muted }}>{romaji(formKana(target))}</span>
              )}
              <Say text={formKana(target)} label="Play the answer" enabled={settings.show.audio} />
            </div>
            {target.note && (
              <div style={{ marginTop: 11, borderLeft: "3px solid " + C.extra, background: C.panelAlt, padding: "8px 10px", fontSize: 12, lineHeight: 1.6 }}>
                {target.note}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   APP
   ============================================================ */
export default function App() {
  const [words, setWords] = useState([]);
  const [ready, setReady] = useState(false);
  const [selId, setSelId] = useState(null);
  const [query, setQuery] = useState("");
  const [formId, setFormId] = useState("masu");
  const [segIdx, setSegIdx] = useState(null);
  const [adding, setAdding] = useState(false);
  const [script, setScript] = useState("furigana");
  const [settings, setSettings] = useState(DEFAULTS);
  const [q2, setQ2] = useState("");
  const [looking, setLooking] = useState(false);
  const [hits, setHits] = useState(null);
  const [lookErr, setLookErr] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [view, setView] = useState("deck");
  const [audioNote, setAudioNote] = useState(null);
  const speech = useSpeechStatus();
  const [quizRun, setQuizRun] = useState({ running: false, done: 0, total: 0 });
  const [pendingLeave, setPendingLeave] = useState(false);
  const [draft, setDraft] = useState({ word: "", reading: "", meaning: "", type: "godan", typeTouched: false });

  useEffect(() => {
    let alive = true;
    (async () => {
      let loaded = null;
      try {
        const r = await storage.get(KEY);
        loaded = JSON.parse(r.value);
      } catch { loaded = null; }
      let pref = null;
      try {
        const p = await storage.get(SKEY);
        pref = JSON.parse(p.value);
      } catch { pref = null; }
      try {
        const g = await storage.get(GKEY);
        setSettings(mergeSettings(JSON.parse(g.value)));
      } catch { /* first run — DEFAULTS stand */ }
      if (!alive) return;
      const list = Array.isArray(loaded) && loaded.length ? loaded : SEED;
      setWords(list);
      setSelId(list[0]?.id ?? null);
      if (SCRIPTS.some((s) => s.id === pref)) setScript(pref);
      setReady(true);
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try { await storage.set(KEY, JSON.stringify(words)); } catch { /* session-only */ }
    })();
  }, [words, ready]);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try { await storage.set(SKEY, JSON.stringify(script)); } catch { /* session-only */ }
    })();
  }, [script, ready]);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try { await storage.set(GKEY, JSON.stringify(settings)); } catch { /* session-only */ }
    })();
  }, [settings, ready]);

  useEffect(() => {
    setAudioReporter(setAudioNote);
    return () => setAudioReporter(null);
  }, []);

  useEffect(() => {
    if (!audioNote) return;
    const t = setTimeout(() => setAudioNote(null), 9000);
    return () => clearTimeout(t);
  }, [audioNote]);

  useEffect(() => {
    if (!pendingDelete) return;
    const onKey = (e) => { if (e.key === "Escape") setPendingDelete(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingDelete]);

  const selected = words.find((w) => w.id === selId) || null;
  const scopedWords = useMemo(() => words.filter((w) => wordInScope(w, settings)), [words, settings]);
  const classChoices = TYPES.filter((t) => settings.types.includes(t.id) || t.id === selected?.type);
  const forms = useMemo(() => conjugate(selected), [selected]);
  const shown = useMemo(() => visibleForms(forms, settings), [forms, settings]);

  useEffect(() => {
    setSegIdx(null);
    if (shown.length && !shown.some((f) => f.id === formId)) setFormId(shown[0].id);
  }, [selId, forms.length, shown]); // eslint-disable-line

  const form = shown.find((f) => f.id === formId) || shown[0] || null;
  const display = form ? form.segs.map((s) => s.text).join("") : "";
  const readingOut = form ? form.segs.map((s) => s.kana).join("") : "";
  const activeSeg = form && segIdx != null ? form.segs[segIdx] : null;

  const filtered = scopedWords.filter((w) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (w.word + w.reading + w.meaning + romaji(w.reading)).toLowerCase().includes(q);
  });

  function updateDraft(patch) {
    setDraft((d) => {
      const next = { ...d, ...patch };
      if (!next.typeTouched && (patch.word !== undefined || patch.reading !== undefined)) {
        next.type = detectType(next.word, next.reading || next.word);
      }
      return next;
    });
  }

  /** On a narrow screen the deck sits below the stage, so selecting a word has
   *  to bring the breakdown back into view or the tap looks like it did nothing. */
  function revealStage() {
    if (!window.matchMedia || !window.matchMedia("(max-width: 820px)").matches) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }

  async function runLookup() {
    const q = q2.trim();
    if (!q || looking) return;
    setLooking(true);
    setLookErr(null);
    setHits(null);
    try {
      setHits(await lookupWord(q));
    } catch (e) {
      setLookErr((e && e.message) || "Lookup didn't come back. Fill the fields in by hand.");
    } finally {
      setLooking(false);
    }
  }

  function useHit(c) {
    setDraft({ word: c.word, reading: c.reading, meaning: c.meaning || "", type: c.type, typeTouched: true });
    setHits(null);
    setQ2("");
    setLookErr(null);
  }

  /** Leaving the quiz unmounts it, which throws away the run — so ask first,
   *  but only once a quiz is actually underway. */
  function goto(next) {
    if (next === view) return;
    if (next !== "quiz" && quizRun.running) { setPendingLeave(next); return; }
    setPendingLeave(false);
    setView(next);
  }

  function leaveQuiz() {
    const dest = typeof pendingLeave === "string" ? pendingLeave : "deck";
    setPendingLeave(false);
    setQuizRun({ running: false, done: 0, total: 0 });
    setView(dest);
  }

  function closeAdd() {
    setAdding(false);
    setHits(null);
    setQ2("");
    setLookErr(null);
  }

  function addWord() {
    const word = draft.word.trim();
    if (!word) return;
    const entry = {
      id: "w" + Date.now(),
      word,
      reading: (draft.reading.trim() || word),
      meaning: draft.meaning.trim(),
      type: draft.type,
      addedAt: Date.now(),
    };
    setWords((ws) => [entry, ...ws]);
    setSelId(entry.id);
    setDraft({ word: "", reading: "", meaning: "", type: "godan", typeTouched: false });
    closeAdd();
    revealStage();
  }

  function removeWord(id) {
    setPendingDelete(null);
    setWords((ws) => {
      const next = ws.filter((w) => w.id !== id);
      if (id === selId) setSelId(next[0]?.id ?? null);
      return next;
    });
  }

  function saveExamples(id, examples) {
    setWords((ws) => ws.map((w) => (w.id === id ? { ...w, examples } : w)));
  }

  /** Merge an imported deck, skipping entries already present. */
  function importWords(incoming) {
    const have = new Set(words.map((w) => w.word + "|" + w.reading));
    const seen = new Set();
    const fresh = incoming.filter((w) => {
      const k = w.word + "|" + w.reading;
      if (have.has(k) || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (fresh.length) setWords((ws) => [...fresh, ...ws]);
    return fresh.length;
  }

  function setType(id, t) {
    setWords((ws) => ws.map((w) => (w.id === id ? { ...w, type: t } : w)));
  }

  const godanRow = selected?.type === "godan" ? (selected.reading || selected.word).slice(-1) : null;
  const ladderActive = activeSeg && activeSeg.role === "stem" ? activeSeg.kana : null;

  return (
    <div className="kd-app" style={{ background: C.ground, color: C.ink, fontFamily: SANS }}>
      <style>{`
        * { box-sizing: border-box; }
        .kd-app { min-height: 100vh; min-height: 100dvh; }
        .kd-btn { cursor: pointer; border: none; background: none; font: inherit; color: inherit; }
        .kd-form-chip { transition: background .15s, color .15s, border-color .15s; }
        .kd-tile { transition: transform .16s ease, box-shadow .16s ease; }
        .kd-in { width: 100%; background: ${C.panel}; border: 1px solid ${C.rule}; padding: 9px 10px; font: inherit; color: ${C.ink}; outline: none; }
        .kd-in:focus { border-color: ${C.aux}; box-shadow: 0 0 0 2px rgba(42,71,128,.15); }
        button:focus-visible, .kd-in:focus-visible, [tabindex]:focus-visible { outline: 2px solid ${C.aux}; outline-offset: 2px; }

        /* hover only where a pointer can actually hover — otherwise taps leave
           sticky hover states stranded on touch screens */
        @media (hover: hover) {
          .kd-form-chip:hover { border-color: ${C.ink}; }
          .kd-tile:hover { transform: translateY(-2px); }
          .kd-row:hover { background: ${C.panelAlt}; }
        }

        .kd-scrim {
          position: fixed; inset: 0; z-index: 50; padding: 20px;
          background: rgba(22, 27, 25, .55);
          display: flex; align-items: center; justify-content: center;
          animation: kd-fade .16s ease-out;
        }
        .kd-modal {
          width: 100%; max-width: 400px;
          background: ${C.panel};
          border: 1px solid ${C.ink}; border-top: 4px solid ${C.stem};
          box-shadow: 0 18px 44px rgba(22, 27, 25, .3);
          padding: 20px 20px 17px;
          max-height: calc(100% - 8px); overflow-y: auto;
          animation: kd-pop .18s cubic-bezier(.2, .9, .3, 1);
        }
        @keyframes kd-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes kd-pop { from { opacity: 0; transform: translateY(12px) scale(.97) } to { opacity: 1; transform: none } }

        .kd-toast {
          position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%);
          z-index: 60; width: calc(100% - 32px); max-width: 430px;
          background: ${C.panel}; border: 1px solid ${C.ink};
          border-left: 4px solid ${C.stem};
          box-shadow: 0 10px 30px rgba(22, 27, 25, .25);
          padding: 11px 12px;
          animation: kd-rise .2s ease-out;
        }
        @keyframes kd-rise { from { opacity: 0; transform: translate(-50%, 10px) } to { opacity: 1; transform: translate(-50%, 0) } }

        .kd-deck { flex: 1 1 260px; min-width: 250px; max-width: 320px; }
        .kd-stage { flex: 3 1 460px; min-width: 300px; }
        .kd-list { max-height: 68vh; overflow-y: auto; }

        /* The tagline is decoration; it is the first thing to go on a phone. */
        @media (max-width: 640px) { .kd-tagline { display: none; } }

        /* Narrow screens: the breakdown is the point, so it goes first and the
           deck becomes a normal page-scrolling list underneath it. */
        @media (max-width: 820px) {
          .kd-deck { order: 2; max-width: none; min-width: 0; width: 100%; }
          .kd-stage { order: 1; min-width: 0; width: 100%; }
          .kd-list { max-height: none; overflow-y: visible; }
        }

        @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
      `}</style>

      {/* masthead */}
      <header style={{ borderBottom: "1px solid " + C.rule, background: C.panel }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "14px 18px", display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
          <div style={{ fontFamily: MINCHO, fontSize: 26, letterSpacing: ".08em" }}>言葉帳</div>
          <div className="kd-tagline" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".22em", textTransform: "uppercase", color: C.muted }}>
            Kotoba-chō · word deck &amp; morphology
          </div>
          <div style={{ display: "flex", border: "1px solid " + C.rule }}>
            {[["deck", "Deck"], ["quiz", "Quiz"], ["settings", "Settings"]].map(([id, label]) => {
              const on = view === id;
              return (
                <button key={id} className="kd-btn kd-form-chip" onClick={() => goto(id)}
                  style={{
                    fontFamily: MONO, fontSize: 10, letterSpacing: ".16em", padding: "6px 12px",
                    background: on ? C.stem : "transparent", color: on ? C.panel : C.muted,
                    borderRight: id === "settings" ? "none" : "1px solid " + C.rule,
                  }}>{label.toUpperCase()}</button>
              );
            })}
          </div>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: ".2em", color: C.muted }}>SCRIPT</span>
              <div style={{ display: "flex", border: "1px solid " + C.rule }}>
                {SCRIPTS.map((s) => {
                  const on = script === s.id;
                  return (
                    <button key={s.id} className="kd-btn kd-form-chip" onClick={() => setScript(s.id)}
                      title={s.id === "furigana" ? "Kanji with the reading above it" : s.id === "kanji" ? "Kanji only, no reading" : "Kana only, no kanji"}
                      style={{
                        fontFamily: MINCHO, fontSize: 13, padding: "4px 9px 5px",
                        background: on ? C.ink : "transparent", color: on ? C.panel : C.muted,
                        borderRight: s.id === "kana" ? "none" : "1px solid " + C.rule,
                      }}>{s.label}</button>
                  );
                })}
              </div>
            </div>
            <span className="kd-tagline" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".16em", color: C.muted }}>
              {scopedWords.length} ENTR{scopedWords.length === 1 ? "Y" : "IES"}
            </span>
          </div>
        </div>
      </header>

      {pendingLeave && (
        <ConfirmModal
          eyebrow="Quiz in progress"
          stat={quizRun.done + " / " + quizRun.total}
          statLabel={quizRun.done === 1 ? "question answered" : "questions answered"}
          body={quizRun.done > 0
            ? "Leaving the quiz ends this run. The score is not saved anywhere yet, so it goes with it."
            : "Leaving the quiz ends this run before you've answered anything."}
          confirmLabel="Leave"
          cancelLabel="Keep going"
          onConfirm={leaveQuiz}
          onCancel={() => setPendingLeave(false)}
        />
      )}

      {view === "quiz" && (
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: 18 }}>
          <Quiz words={words} script={script} onProgress={setQuizRun} settings={settings} />
        </div>
      )}

      {view === "settings" && (
        <SettingsView
          settings={settings}
          onChange={setSettings}
          wordCount={scopedWords.length}
          formCount={settings.formIds.length}
        />
      )}

      {view === "deck" && (
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: 18, display: "flex", gap: 22, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* ---------------- deck ---------------- */}
        <aside className="kd-deck">
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <div style={{ position: "relative", flex: 1 }}>
              <Search size={13} style={{ position: "absolute", left: 9, top: 11, color: C.muted }} />
              <input className="kd-in" style={{ paddingLeft: 27, fontSize: 13 }} placeholder="Search the deck" value={query}
                onChange={(e) => { setQuery(e.target.value); setPendingDelete(null); }} />
            </div>
            <button className="kd-btn" onClick={() => (adding ? closeAdd() : setAdding(true))} title="Add a word"
              style={{ background: adding ? C.ink : C.stem, color: C.panel, width: 38, display: "grid", placeItems: "center" }}>
              {adding ? <X size={15} /> : <Plus size={15} />}
            </button>
          </div>

          {adding && (
            <div style={{ background: C.panel, border: "1px solid " + C.rule, padding: 12, marginBottom: 12, display: "grid", gap: 8 }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: ".16em", color: C.muted, marginBottom: 5 }}>LOOK IT UP</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input className="kd-in" placeholder="iku · 行く · たべる" value={q2} autoFocus
                    onChange={(e) => setQ2(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && runLookup()} />
                  <button className="kd-btn" onClick={runLookup} disabled={looking || !q2.trim()}
                    style={{
                      background: looking || !q2.trim() ? C.rule : C.aux, color: C.panel,
                      padding: "0 12px", fontSize: 12, whiteSpace: "nowrap",
                      cursor: looking || !q2.trim() ? "default" : "pointer",
                    }}>
                    {looking ? "…" : "Look up"}
                  </button>
                </div>
              </div>

              {lookErr && (
                <div style={{ borderLeft: "3px solid " + C.stem, background: C.panelAlt, padding: "7px 9px", fontSize: 11.5, lineHeight: 1.5 }}>{lookErr}</div>
              )}

              {hits && hits.length === 0 && (
                <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5 }}>
                  No match for “{q2 || draft.word}”. Fill the fields in below instead.
                </div>
              )}

              {hits && hits.length > 0 && (
                <div style={{ border: "1px solid " + C.ruleSoft }}>
                  {hits.map((c, i) => (
                    <button key={i} className="kd-btn kd-row" onClick={() => useHit(c)}
                      style={{
                        display: "block", width: "100%", textAlign: "left", padding: "8px 9px",
                        borderBottom: i === hits.length - 1 ? "none" : "1px solid " + C.ruleSoft,
                      }}>
                      <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                        <span style={{ fontFamily: MINCHO, fontSize: 20 }}>
                          <Word text={c.word} kana={c.reading} mode="furigana" ruby={9} />
                        </span>
                        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: ".1em", color: C.aux, border: "1px solid " + C.aux, padding: "1px 4px" }}>
                          {TYPES.find((t) => t.id === c.type)?.label.toUpperCase()}
                        </span>
                      </div>
                      <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>{c.meaning}</div>
                    </button>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                <span style={{ flex: 1, height: 1, background: C.ruleSoft }} />
                <span style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: ".18em", color: C.muted }}>OR ENTER IT</span>
                <span style={{ flex: 1, height: 1, background: C.ruleSoft }} />
              </div>

              <input className="kd-in" placeholder="Word — 行く" value={draft.word} onChange={(e) => updateDraft({ word: e.target.value })} />
              <input className="kd-in" placeholder="Reading in kana — いく" value={draft.reading} onChange={(e) => updateDraft({ reading: e.target.value })} />
              <input className="kd-in" placeholder="Meaning — to go" value={draft.meaning} onChange={(e) => updateDraft({ meaning: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && addWord()} />
              <div>
                <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: ".16em", color: C.muted, marginBottom: 5 }}>
                  WORD CLASS {draft.typeTouched ? "" : "· detected"}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {TYPES.map((t) => (
                    <button key={t.id} className="kd-btn kd-form-chip" onClick={() => setDraft((d) => ({ ...d, type: t.id, typeTouched: true }))}
                      style={{
                        fontSize: 11, padding: "4px 8px", border: "1px solid " + (draft.type === t.id ? C.ink : C.rule),
                        background: draft.type === t.id ? C.ink : "transparent", color: draft.type === t.id ? C.panel : C.muted,
                      }}>{t.label}</button>
                  ))}
                </div>
              </div>
              <button className="kd-btn" onClick={addWord} style={{ background: C.ink, color: C.panel, padding: "9px 0", fontSize: 13, letterSpacing: ".04em" }}>
                Add to deck
              </button>
            </div>
          )}

          <div className="kd-list" style={{ border: "1px solid " + C.rule, background: C.panel }}>
            {filtered.length === 0 && (
              <div style={{ padding: 22, textAlign: "center" }}>
                <div style={{ fontFamily: MINCHO, fontSize: 28, color: C.rule, marginBottom: 8 }}>空</div>
                <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
                  {words.length === 0
                    ? "The deck is empty. Add a word and the breakdown builds itself."
                    : scopedWords.length === 0
                      ? "No words match your current scope. Widen it in Settings."
                      : "Nothing matches that search."}
                </div>
              </div>
            )}
            {filtered.map((w) => {
              const on = w.id === selId;
              if (pendingDelete === w.id) {
                return (
                  <div key={w.id} style={{
                    padding: "9px 11px", borderBottom: "1px solid " + C.ruleSoft,
                    borderLeft: "3px solid " + C.stem, background: C.panelAlt,
                  }}>
                    <div style={{ fontSize: 12.5, display: "flex", alignItems: "flex-end", gap: 5, flexWrap: "wrap" }}>
                      <span>Delete</span>
                      <span style={{ fontFamily: MINCHO, fontSize: 17, color: C.stem }}>
                        <Word text={w.word} kana={w.reading} mode={script} ruby={8} rubyColor={C.stem} />
                      </span>
                      <span>from the deck?</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <button className="kd-btn" onClick={() => removeWord(w.id)}
                        style={{ background: C.stem, color: C.panel, padding: "5px 12px", fontSize: 11.5 }}>
                        Delete
                      </button>
                      <button className="kd-btn" onClick={() => setPendingDelete(null)} autoFocus
                        style={{ border: "1px solid " + C.rule, color: C.muted, padding: "5px 12px", fontSize: 11.5, background: C.panel }}>
                        Keep
                      </button>
                    </div>
                  </div>
                );
              }
              return (
                <div key={w.id} className="kd-row"
                  onClick={() => { setSelId(w.id); setPendingDelete(null); revealStage(); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", cursor: "pointer",
                    borderBottom: "1px solid " + C.ruleSoft,
                    borderLeft: "3px solid " + (on ? C.stem : "transparent"),
                    background: on ? C.panelAlt : "transparent",
                  }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontFamily: MINCHO, fontSize: 19 }}>
                      <Word text={w.word} kana={w.reading} mode={script} ruby={9} rubyColor={on ? C.stem : C.muted} />
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.muted, letterSpacing: ".05em", marginTop: 1 }}>
                      {romaji(w.reading)} · {typeLabel(w.type)}
                    </div>
                    {w.meaning && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.meaning}</div>}
                  </div>
                  <button className="kd-btn" title={"Delete " + w.word}
                    onClick={(e) => { e.stopPropagation(); setPendingDelete(w.id); }}
                    style={{ color: C.rule, padding: 9, margin: -3 }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = C.stem)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = C.rule)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
          <DeckTools words={words} onImport={importWords} />
        </aside>

        {/* ---------------- analysis stage ---------------- */}
        <main className="kd-stage">
          {!selected ? (
            <div style={{ border: "1px solid " + C.rule, background: C.panel, padding: 40, textAlign: "center" }}>
              <div style={{ fontFamily: MINCHO, fontSize: 40, color: C.rule }}>—</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 8 }}>Pick a word from the deck to take it apart.</div>
            </div>
          ) : (
            <>
              {/* entry header */}
              <div style={{ display: "flex", alignItems: "flex-end", gap: 14, flexWrap: "wrap", marginBottom: 4 }}>
                <div>
                  {settings.show.romaji && (
                    <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: ".2em", color: C.muted }}>{romaji(selected.reading).toUpperCase()}</div>
                  )}
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                    <div style={{ fontFamily: MINCHO, fontSize: "clamp(26px, 8vw, 34px)" }}>
                      <Word text={selected.word} kana={selected.reading} mode={script} ruby={13} />
                    </div>
                    <Say text={selected.reading} size={15} label="Play the word" enabled={settings.show.audio} />
                  </div>
                </div>
                <div style={{ paddingBottom: 4 }}>
                  <div style={{ fontSize: 13, color: C.ink }}>{selected.meaning || <span style={{ color: C.muted }}>no gloss</span>}</div>
                  <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap" }}>
                    {classChoices.map((t) => (
                      <button key={t.id} className="kd-btn kd-form-chip" onClick={() => setType(selected.id, t.id)}
                        style={{
                          fontFamily: MONO, fontSize: 9.5, letterSpacing: ".08em", padding: "6px 9px",
                          border: "1px solid " + (selected.type === t.id ? C.aux : C.ruleSoft),
                          background: selected.type === t.id ? C.aux : "transparent",
                          color: selected.type === t.id ? C.panel : C.muted,
                        }}>{t.label.toUpperCase()}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* the signature: morpheme strip with interlinear gloss */}
              <div style={{ border: "1px solid " + C.rule, borderTop: "3px solid " + C.ink, background: C.panel, padding: "20px 18px 16px" }}>
                {form && (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
                      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".2em", textTransform: "uppercase", color: C.muted }}>
                        {form.label} <span style={{ fontFamily: MINCHO, letterSpacing: 0, textTransform: "none" }}>{form.jp}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                        {settings.show.romaji && (
                          <span style={{ fontFamily: MONO, fontSize: 11, color: C.muted }}>{romaji(readingOut)}</span>
                        )}
                        <Say text={readingOut} label="Play this form" enabled={settings.show.audio} />
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "flex-start", gap: 6, flexWrap: "wrap" }}>
                      {form.segs.map((s, i) => {
                        const col = ROLE_COLOR[s.role];
                        const on = segIdx === i;
                        return (
                          <button key={i} className="kd-btn kd-tile" onClick={() => setSegIdx(on ? null : i)}
                            style={{ textAlign: "center", padding: 0 }}>
                            <div style={{
                              fontFamily: MINCHO, fontSize: "clamp(21px, 7.2vw, 38px)", padding: "2px 6px 4px",
                              color: col,
                              borderBottom: "3px solid " + (on ? col : "transparent"),
                              background: on ? (s.role === "root" ? C.panelAlt : "transparent") : "transparent",
                            }}>
                              <Word text={s.text} kana={s.kana} mode={script} ruby="clamp(8px, 2.4vw, 12px)" rubyColor={col} reserve />
                            </div>
                            {settings.show.romaji && (
                              <div style={{ fontFamily: MONO, fontSize: 9, color: C.muted, marginTop: 3 }}>{romaji(s.kana)}</div>
                            )}
                            {settings.show.glosses && (
                              <div style={{
                                fontFamily: MONO, fontSize: 8.5, letterSpacing: ".1em", marginTop: 4,
                                color: on ? C.panel : col, background: on ? col : "transparent",
                                border: "1px solid " + col, padding: "2px 5px", whiteSpace: "nowrap",
                              }}>{s.gloss}</div>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* morpheme note */}
                    <div style={{ marginTop: 16, borderTop: "1px solid " + C.ruleSoft, paddingTop: 13 }}>
                      {activeSeg ? (
                        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
                          <div style={{ flex: "1 1 300px", minWidth: 240 }}>
                            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginBottom: 5 }}>
                              <span style={{ fontFamily: MINCHO, fontSize: 17, color: ROLE_COLOR[activeSeg.role] }}>
                                <Word text={activeSeg.text} kana={activeSeg.kana} mode={script} ruby={9} rubyColor={ROLE_COLOR[activeSeg.role]} />
                              </span>
                              <span style={{ fontSize: 12.5, fontWeight: 600 }}>{activeSeg.title}</span>
                            </div>
                            <div style={{ fontSize: 12.5, lineHeight: 1.65, color: "#3b433e" }}>{activeSeg.body}</div>
                          </div>
                          {settings.show.ladder && godanRow && ladderActive && (
                            <div>
                              <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: ".16em", color: C.muted, marginBottom: 5 }}>
                                五段 · FIVE ROWS OF {romaji(godanRow).toUpperCase()}
                              </div>
                              <Ladder row={godanRow} active={ladderActive} />
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: C.muted }}>
                          Tap any piece above to see what it is doing.
                          {form.note ? " " : ""}
                        </div>
                      )}
                      {form.note && (
                        <div style={{ marginTop: 12, borderLeft: "3px solid " + C.extra, background: C.panelAlt, padding: "9px 11px" }}>
                          <span style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: ".16em", color: C.extra }}>IRREGULAR</span>
                          <div style={{ fontSize: 12.5, lineHeight: 1.6, marginTop: 4 }}>{form.note}</div>
                        </div>
                      )}
                    </div>
                  </>
                )}
                {!form && (
                  <div style={{ fontSize: 13, color: C.muted }}>
                    No forms for this entry. Check the reading is written in kana, then pick the right word class above.
                  </div>
                )}
              </div>

              <StackPanel key={selected.id} word={selected} script={script} settings={settings} />
              {settings.show.examples && <ExamplesPanel word={selected} script={script} onSave={saveExamples} settings={settings} />}

              {/* form ladder */}
              <div style={{ marginTop: 18, display: "grid", gap: 14 }}>
                {GROUPS.map((grp) => {
                  const items = shown.filter((f) => f.group === grp);
                  if (!items.length) return null;
                  return (
                    <div key={grp}>
                      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}>
                        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: ".22em", textTransform: "uppercase", color: C.muted }}>{grp}</span>
                        <span style={{ flex: 1, height: 1, background: C.rule }} />
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {items.map((f) => {
                          const on = f.id === formId;
                          return (
                            <button key={f.id} className="kd-btn kd-form-chip" onClick={() => { setFormId(f.id); setSegIdx(null); }}
                              style={{
                                border: "1px solid " + (on ? C.ink : C.rule),
                                background: on ? C.ink : C.panel,
                                color: on ? C.panel : C.ink,
                                padding: "6px 10px 7px", textAlign: "left", minWidth: 84,
                              }}>
                              <div style={{ fontFamily: MINCHO, fontSize: 17, display: "flex", alignItems: "flex-end" }}>
                                {f.segs.map((s, i) => (
                                  <Word key={i} text={s.text} kana={s.kana} mode={script} ruby={8}
                                    rubyColor={on ? "#c9cfd6" : C.muted} />
                                ))}
                              </div>
                              <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: ".08em", marginTop: 2, color: on ? "#c9cfd6" : C.muted }}>
                                {f.label.toUpperCase()}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              {shown.length === 0 && (
                <div style={{ fontSize: 12.5, color: C.muted, border: "1px dashed " + C.rule, padding: "14px 16px" }}>
                  No forms enabled. Turn some on in Settings.
                </div>
              )}
            </>
          )}
        </main>
      </div>
      )}

      {audioNote && (
        <div className="kd-toast">
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: ".16em", color: C.stem, paddingTop: 2, flexShrink: 0 }}>AUDIO</span>
            <span style={{ fontSize: 12, lineHeight: 1.55, flex: 1 }}>{audioNote}</span>
            <button className="kd-btn" onClick={() => setAudioNote(null)} aria-label="Dismiss"
              style={{ color: C.muted, padding: 2, lineHeight: 0, flexShrink: 0 }}>
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      <footer style={{ borderTop: "1px solid " + C.rule, marginTop: 26 }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "12px 18px", display: "flex", gap: 16, flexWrap: "wrap", fontFamily: MONO, fontSize: 9, letterSpacing: ".14em", color: C.muted }}>
          <span style={{ color: C.root }}>■ ROOT</span>
          <span style={{ color: C.stem }}>■ SHIFTING KANA</span>
          <span style={{ color: C.aux }}>■ AUXILIARY</span>
          <span style={{ color: C.extra }}>■ STACKED SUFFIX</span>
          <span style={{ marginLeft: "auto" }}>
            AUDIO:{" "}
            {!speech.supported
              ? "UNSUPPORTED IN THIS FRAME"
              : speech.voices === 0
                ? "NO VOICES REACHABLE"
                : speech.ja > 0
                  ? speech.ja + " JA VOICE" + (speech.ja === 1 ? "" : "S")
                  : "NO JA VOICE (" + speech.voices + " OTHERS)"}
          </span>
        </div>
      </footer>
    </div>
  );
}
