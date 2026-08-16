import { useState, useEffect, useMemo, useRef } from "react";
import { Plus, Trash2, X, Search, Volume2, Undo2, Download, Upload } from "lucide-react";

import { C, ROLE_COLOR, MINCHO, SANS, MONO, T, JP, RUBY, S, THEME_CSS, THEMES, applyTheme } from "./theme.js";
import { storage, KEY, SKEY, GKEY, PKEY, readTheme, writeTheme } from "./storage.js";
import { EMPTY, MEANING, record, mergeStored, ruleKey, byRule } from "./stats.js";
import { SPEECH_OK, speak, useSpeechStatus, setAudioReporter } from "./speech.js";
import { lookupWord, fetchExamples, warmDict } from "./api.js";
import {
  romaji, toKana, settleKana, conjugate, detectType, TYPES, typeLabel, GROUPS, GODAN,
  MODS, stackInit, stackApply, columns, formText, formKana, answerMatches,
  shuffle, shuffleStable, meaningItems, REVERSE_SOURCES, SEED,
} from "./engine.js";
import { DEFAULTS, mergeSettings, visibleForms, visibleMods, wordInScope, JLPT } from "./settings.js";
import SettingsView from "./SettingsView.jsx";

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
   AUDIO — Web Speech, no dependency. Reads the kana so the engine
   never has to guess a kanji reading.
   ============================================================ */
/* Holds its footprint when disabled rather than unmounting — otherwise toggling
   audio off in Settings reflows every row and heading that contains one. */
function Say({ text, size = 13, color = C.muted, label = "Play", enabled = true }) {
  if (!text) return null;
  if (!enabled) return <span aria-hidden="true" style={{ display: "inline-block", width: size + 12, flexShrink: 0 }} />;
  return (
    <button className="kd-btn" title={label} aria-label={label}
      onClick={(e) => { e.stopPropagation(); speak(text); }}
      style={{ color: SPEECH_OK ? color : C.rule, padding: S[1] + 2, lineHeight: 0, flexShrink: 0 }}>
      <Volume2 size={size} />
    </button>
  );
}

/* ============================================================
   MORPHEME STRIP — shared by the study view, the stack builder
   and the quiz reveal.
   ============================================================ */
function Strip({ segs, script, size = JP.strip, ruby = RUBY.strip, onPick, activeIdx, glosses: showGlosses = true }) {
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
              <span style={{ fontFamily: MONO, fontSize: T.micro, letterSpacing: ".08em", color: C.panel, background: C.aux, padding: "2px 5px" }}>
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
                  style={{ border: "1px solid " + C.rule, background: C.panel, padding: "6px 9px", fontSize: T.fine, textAlign: "left" }}>
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
            ...(JLPT.includes(w.jlpt) ? { jlpt: w.jlpt } : {}),
            ...(["trans", "intrans", "na"].includes(w.trans) ? { trans: w.trans } : {}),
            ...(typeof w.common === "boolean" ? { common: w.common } : {}),
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

  const link = { display: "flex", alignItems: "center", gap: S[1], letterSpacing: ".14em" };
  return (
    <div style={{ marginTop: S[3] }}>
      <div style={{ display: "flex", gap: S[3], flexWrap: "wrap", alignItems: "center" }}>
        <button className="kd-btn kd-act" onClick={exportDeck} style={link}><Download size={11} /> EXPORT</button>
        <button className="kd-btn kd-act" onClick={() => fileRef.current && fileRef.current.click()} style={link}><Upload size={11} /> IMPORT</button>
        <button className="kd-btn kd-act" onClick={copyDeck} style={link}>COPY JSON</button>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={readFile} style={{ display: "none" }} />
      </div>
      {note && (
        <div className="kd-note" style={{ marginTop: S[2], borderLeftColor: note.kind === "ok" ? C.aux : C.stem }}>{note.text}</div>
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
            style={{ flex: 1, background: C.stem, color: C.panel, padding: "11px 0", fontSize: T.base }}>
            {confirmLabel}
          </button>
          <button className="kd-btn" onClick={onCancel} autoFocus
            style={{ flex: 1, border: "1px solid " + C.ink, background: C.panel, color: C.ink, padding: "11px 0", fontSize: T.base }}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   VOCABULARY
   The deck sidebar is a picker — narrow, truncated, one word at a time.
   This is the ledger: everything tracked, full width, meaning-forward,
   verbs and plain words in the same list. Rows open in the deck, so the
   two views are one deck seen from two distances.
   ============================================================ */
const VOCAB_GROUPS = [
  { id: "all", label: "All", jp: "全部", types: null },
  { id: "verb", label: "Verbs", jp: "動詞", types: ["godan", "ichidan", "suru", "kuru"] },
  { id: "adj", label: "Adjectives", jp: "形容詞", types: ["i-adj", "na-adj"] },
  { id: "other", label: "Nouns & rest", jp: "名詞", types: ["noun"] },
];

function VocabView({ words, scopedCount, script, settings, onOpen, onAdd, onDelete }) {
  const [grp, setGrp] = useState("all");
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState(null);

  const need = q.trim().toLowerCase();
  const inGroup = (w, g) => !g.types || g.types.includes(w.type);
  const group = VOCAB_GROUPS.find((x) => x.id === grp) || VOCAB_GROUPS[0];
  const list = words.filter((w) =>
    inGroup(w, group) &&
    (!need || (w.word + w.reading + w.meaning + romaji(w.reading)).toLowerCase().includes(need)));
  const doomed = confirm ? words.find((w) => w.id === confirm) : null;

  const tag = { fontFamily: MONO, fontSize: T.micro, letterSpacing: ".12em", padding: "1px 5px", border: "1px solid " + C.ruleSoft, color: C.muted };

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: S[4] }}>
      {doomed && (
        <ConfirmModal
          eyebrow="Remove from vocabulary"
          stat={doomed.word}
          statLabel={doomed.meaning || typeLabel(doomed.type)}
          body="This drops the word from the deck entirely — its examples and tags go with it."
          confirmLabel="Delete"
          cancelLabel="Keep"
          onConfirm={() => { onDelete(doomed.id); setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        />
      )}

      <div style={{ display: "flex", gap: S[2], alignItems: "center", flexWrap: "wrap", marginBottom: S[3] }}>
        <div style={{ position: "relative", flex: "1 1 200px", minWidth: 170 }}>
          <Search size={13} style={{ position: "absolute", left: 9, top: 11, color: C.muted }} />
          <input className="kd-in" style={{ paddingLeft: 27, fontSize: T.base }} placeholder="Search everything you track"
            value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: S[1] }}>
          {VOCAB_GROUPS.map((g) => {
            const on = g.id === grp;
            const n = words.filter((w) => inGroup(w, g)).length;
            return (
              <button key={g.id} className="kd-btn kd-form-chip" onClick={() => setGrp(g.id)}
                style={{
                  border: "1px solid " + (on ? C.ink : C.rule), background: on ? C.ink : C.panel,
                  color: on ? C.panel : C.ink, padding: "6px 10px", fontSize: T.fine,
                }}>
                {g.label}
                <span style={{ fontFamily: MINCHO, fontSize: T.micro, marginLeft: S[1], opacity: .7 }}>{g.jp}</span>
                <span style={{ fontFamily: MONO, fontSize: T.micro, marginLeft: S[1], opacity: .7 }}>{n}</span>
              </button>
            );
          })}
        </div>
        <button className="kd-btn" onClick={onAdd}
          style={{ background: C.stem, color: C.panel, padding: "8px 12px", fontSize: T.sm, display: "flex", alignItems: "center", gap: S[1] }}>
          <Plus size={13} /> Add a word
        </button>
      </div>

      <div style={{ border: "1px solid " + C.rule, background: C.panel }}>
        {list.length === 0 ? (
          <div style={{ padding: S[6] + S[2], textAlign: "center" }}>
            <div style={{ fontFamily: MINCHO, fontSize: JP.display, color: C.rule }}>空</div>
            <div style={{ fontSize: T.base, color: C.muted, marginTop: S[2], lineHeight: 1.6 }}>
              {words.length === 0
                ? "Nothing tracked yet. Add a word — verb, adjective or plain noun, they all live here."
                : need
                  ? "Nothing matches that search."
                  : "No " + group.label.toLowerCase() + " tracked yet."}
            </div>
          </div>
        ) : list.map((w) => (
          <div key={w.id} className="kd-row" onClick={() => onOpen(w.id)}
            style={{
              display: "flex", alignItems: "center", gap: S[4], padding: "10px 13px", cursor: "pointer",
              borderBottom: "1px solid " + C.ruleSoft, flexWrap: "wrap",
            }}>
            <div style={{ flex: "0 1 200px", minWidth: 130 }}>
              <div style={{ fontFamily: MINCHO, fontSize: JP.md }}>
                <Word text={w.word} kana={w.reading} mode={script} ruby={RUBY.sm} />
              </div>
              {settings.show.romaji && (
                <div style={{ fontFamily: MONO, fontSize: T.micro, color: C.muted, letterSpacing: ".05em", marginTop: 1 }}>{romaji(w.reading)}</div>
              )}
            </div>
            <div style={{ flex: "3 1 220px", minWidth: 150, fontSize: T.base, lineHeight: 1.5 }}>
              {w.meaning || <span style={{ color: C.muted }}>no gloss — open it to add one</span>}
            </div>
            <div style={{ display: "flex", gap: S[1], alignItems: "center", flexWrap: "wrap", marginLeft: "auto" }}>
              <span style={{ ...tag, fontFamily: MINCHO, fontSize: T.fine, letterSpacing: 0, color: C.aux, borderColor: C.aux }}>{typeLabel(w.type)}</span>
              {w.jlpt && <span style={tag}>{w.jlpt}</span>}
              {(w.trans === "trans" || w.trans === "intrans") && <span style={tag}>{w.trans === "trans" ? "他" : "自"}</span>}
              {w.common === true && <span style={tag}>COMMON</span>}
              <Say text={w.reading} label={"Play " + w.word} enabled={settings.show.audio} />
              <button className="kd-btn kd-del" title={"Delete " + w.word}
                onClick={(e) => { e.stopPropagation(); setConfirm(w.id); }}
                style={{ padding: S[2], margin: -2 }}>
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="kd-micro" style={{ marginTop: S[3], lineHeight: 1.7 }}>
        {list.length} shown · {words.length} tracked
        {scopedCount < words.length && (
          <span style={{ textTransform: "none", letterSpacing: 0, fontFamily: SANS, fontSize: T.fine, marginLeft: S[2] }}>
            The deck and quiz currently see {scopedCount} of them — the rest fall outside your scope in Settings.
          </span>
        )}
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
function Quiz({ words, script, onProgress, settings, stats, onRecord }) {
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
                    padding: "8px 9px", borderBottom: "1px solid " + C.ruleSoft,
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
                        <button key={f.id} className="kd-btn kd-form-chip" onClick={() => toggleForm(f.id)}
                          style={{
                            border: "1px solid " + (on ? C.aux : C.rule),
                            background: on ? C.aux : "transparent",
                            color: on ? C.panel : C.ink,
                            padding: "6px 9px", fontSize: T.fine, textAlign: "left",
                          }}>
                          {f.label}
                          <span style={{ fontFamily: MONO, fontSize: T.micro, marginLeft: S[1], opacity: .7 }}>{f.n}</span>
                        </button>
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
              <button className="kd-btn kd-form-chip" onClick={() => setMeaningOn(!meaningOn)}
                style={{
                  border: "1px solid " + (meaningOn ? C.aux : C.rule),
                  background: meaningOn ? C.aux : "transparent",
                  color: meaningOn ? C.panel : C.ink, padding: "6px 9px", fontSize: T.fine,
                }}>
                Meaning
                <span style={{ fontFamily: MINCHO, fontSize: T.micro, marginLeft: S[1], opacity: .8 }}>意味</span>
                <span style={{ fontFamily: MONO, fontSize: T.micro, marginLeft: S[1], opacity: .7 }}>{meaningCount}</span>
              </button>
              <span style={{ fontSize: T.fine, color: C.muted, lineHeight: 1.5, flex: "1 1 140px" }}>
                Both ways — word to gloss and gloss to word. The only drill a noun has.
              </span>
            </div>

            <div className="kd-micro" style={{ marginBottom: S[2] }}>Direction</div>
            <div style={{ display: "flex", gap: S[1], flexWrap: "wrap", marginBottom: S[3] }}>
              {[["produce", "Produce the form"], ["recognise", "Name the form"], ["mixed", "Mixed"]].map(([id, label]) => (
                <button key={id} className="kd-btn kd-form-chip" onClick={() => setDir(id)}
                  style={{
                    border: "1px solid " + (dir === id ? C.aux : C.rule),
                    background: dir === id ? C.aux : "transparent",
                    color: dir === id ? C.panel : C.ink, padding: "6px 9px", fontSize: T.fine,
                  }}>{label}</button>
              ))}
            </div>
            <div className="kd-micro" style={{ marginBottom: S[2] }}>Length</div>
            <div style={{ display: "flex", gap: S[1], flexWrap: "wrap", marginBottom: S[3] }}>
              {[10, 20, 0].map((n) => (
                <button key={n} className="kd-btn kd-form-chip" onClick={() => setLen(n)}
                  style={{
                    border: "1px solid " + (len === n ? C.ink : C.rule),
                    background: len === n ? C.ink : "transparent",
                    color: len === n ? C.panel : C.ink, padding: "6px 11px", fontSize: T.fine,
                  }}>{n === 0 ? "All" : n}</button>
              ))}
            </div>
            <button className="kd-btn" onClick={() => start()} disabled={total === 0}
              style={{
                width: "100%", background: total === 0 ? C.rule : C.stem, color: C.panel,
                padding: "11px 0", fontSize: T.base, letterSpacing: ".04em",
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
    const runRules = byRule(stats, words, 3).filter((r) => touched.has(r.id));
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
                style={{ background: C.stem, color: C.panel, padding: "10px 0", fontSize: T.base }}>
                Drill the {misses.length} missed
              </button>
            )}
            <button className="kd-btn" onClick={() => start()}
              style={{ border: "1px solid " + C.ink, padding: "10px 0", fontSize: T.base, background: C.panel }}>
              Same quiz again
            </button>
            <button className="kd-btn" onClick={() => setStage("setup")}
              style={{ border: "1px solid " + C.rule, color: C.muted, padding: "10px 0", fontSize: T.base, background: C.panel }}>
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
                    <span style={{ flex: "0 0 64px", height: 4, background: C.ruleSoft, display: "flex" }}>
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
        <button className="kd-btn" onClick={() => setStage("setup")} style={{ marginTop: S[3], border: "1px solid " + C.ink, padding: "8px 14px", fontSize: T.base }}>Back to setup</button>
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
                style={{ background: C.ink, color: C.panel, padding: "10px 0", fontSize: T.base, marginTop: S[1] }}>
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
                style={{ background: C.ink, color: C.panel, padding: "10px 0", fontSize: T.base, marginTop: S[1] }}>
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
                fontFamily: MONO, fontSize: T.micro, letterSpacing: ".18em", padding: "3px 7px",
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
            <div style={{ display: "flex", gap: S[1], flexWrap: "wrap", alignItems: "flex-end" }}>
              {target.segs.map((s, i) => (
                <div key={i} style={{ textAlign: "center" }}>
                  <div style={{
                    fontFamily: MINCHO, fontSize: JP.strip, color: ROLE_COLOR[s.role],
                    borderBottom: "2px solid " + ROLE_COLOR[s.role], padding: "0 5px 2px",
                  }}>
                    <Word text={s.text} kana={s.kana} mode={qMode} ruby={RUBY.strip} rubyColor={ROLE_COLOR[s.role]} reserve />
                  </div>
                  {settings.show.glosses && (
                    <div style={{ fontFamily: MONO, fontSize: T.micro, letterSpacing: ".1em", color: ROLE_COLOR[s.role], marginTop: S[1] }}>{s.gloss}</div>
                  )}
                </div>
              ))}
            </div>
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

/* ============================================================
   APP
   ============================================================ */
export default function App() {
  const [words, setWords] = useState([]);
  const [stats, setStats] = useState(EMPTY);
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
  /* main.jsx already applied this before first paint; state just mirrors it so
     the Settings control has something to render against. */
  const [theme, setTheme] = useState(readTheme);
  const [draft, setDraft] = useState({ word: "", reading: "", meaning: "", type: "godan", typeTouched: false, jlpt: "", trans: "", common: null });

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
      try {
        const p = await storage.get(PKEY);
        setStats(mergeStored(JSON.parse(p.value)));
      } catch { /* first run — EMPTY stands */ }
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
    if (!ready) return;
    (async () => {
      try { await storage.set(PKEY, JSON.stringify(stats)); } catch { /* session-only */ }
    })();
  }, [stats, ready]);

  useEffect(() => {
    applyTheme(theme);
    writeTheme(theme);
  }, [theme]);

  /* On "system" the OS can change under us — without this the page keeps the
     theme it happened to load with. */
  useEffect(() => {
    if (theme !== "system" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

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
  }, [selId, shown.map((f) => f.id).join(",")]); // eslint-disable-line

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

  /** On a narrow screen the deck sits above the stage, so selecting a word has
   *  to bring the breakdown into view or the tap looks like it did nothing. */
  function revealStage() {
    if (!window.matchMedia || !window.matchMedia("(max-width: 820px)").matches) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.querySelector(".kd-stage")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
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
    setDraft({
      word: c.word, reading: c.reading, meaning: c.meaning || "", type: c.type, typeTouched: true,
      jlpt: c.jlpt || "", trans: c.trans || "", common: typeof c.common === "boolean" ? c.common : null,
    });
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
    const tags = {};
    if (draft.jlpt) tags.jlpt = draft.jlpt;
    if (draft.trans) tags.trans = draft.trans;
    if (draft.common !== null) tags.common = draft.common;
    const entry = {
      id: "w" + Date.now(),
      word,
      reading: (draft.reading.trim() || word),
      meaning: draft.meaning.trim(),
      type: draft.type,
      ...tags,
      addedAt: Date.now(),
    };
    setWords((ws) => [entry, ...ws]);
    setSelId(entry.id);
    setDraft({ word: "", reading: "", meaning: "", type: "godan", typeTouched: false, jlpt: "", trans: "", common: null });
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

  /* Called from Quiz on every judged answer. Date.now() lives here rather than in
     stats.js so that module stays pure and testable. */
  function recordAnswer(word, formId, ok) {
    setStats((s) => record(s, word, formId, ok, Date.now()));
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
        ${THEME_CSS}
        * { box-sizing: border-box; }
        .kd-app { min-height: 100vh; min-height: 100dvh; }
        .kd-btn { cursor: pointer; border: none; background: none; font: inherit; color: inherit; }
        .kd-form-chip { transition: background .15s, color .15s, border-color .15s; }
        .kd-tile { transition: transform .16s ease, box-shadow .16s ease; }
        .kd-in { width: 100%; background: ${C.panel}; border: 1px solid ${C.rule}; padding: 9px 10px; font: inherit; color: ${C.ink}; outline: none; }
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
        .kd-head { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
        .kd-rail { flex: 1; min-width: 20px; height: 1px; background: ${C.ruleSoft}; }
        .kd-note {
          border-left: 3px solid ${C.rule}; background: ${C.panelAlt};
          padding: 8px 10px; font-size: ${T.sm}; line-height: 1.6;
        }
        .kd-del { color: ${C.rule}; transition: color .15s; }

        /* ---- two tiers. The morpheme strip is the point of the app; before
           this everything shared one treatment and it had to compete with four
           lookalikes stacked under it. ---- */
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
          display: flex; align-items: center; gap: 9px; flex-wrap: wrap;
          font-size: ${T.md}; color: ${C.ink}; margin-bottom: 16px;
        }
        .kd-ask-target {
          font-family: ${MONO}; font-size: ${T.base}; letter-spacing: .08em;
          text-transform: uppercase;
          background: ${C.ink}; color: ${C.panel}; padding: 4px 9px;
        }

        /* number hint on a quiz option, for the 1-4 shortcut */
        .kd-opt { display: flex; align-items: center; gap: 10px; text-align: left; padding: 10px 12px; font-size: ${T.base}; }
        .kd-opt-key {
          font-family: ${MONO}; font-size: ${T.micro}; opacity: .5;
          border: 1px solid currentColor; width: 16px; height: 16px;
          display: grid; place-items: center; flex-shrink: 0;
        }

        /* hover only where a pointer can actually hover — otherwise taps leave
           sticky hover states stranded on touch screens */
        @media (hover: hover) {
          .kd-form-chip:hover { border-color: ${C.ink}; }
          .kd-tile:hover { transform: translateY(-2px); }
          .kd-row:hover { background: ${C.panelAlt}; }
          .kd-del:hover { color: ${C.stem}; }
        }

        .kd-scrim {
          position: fixed; inset: 0; z-index: 50; padding: 20px;
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
          position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%);
          z-index: 60; width: calc(100% - 32px); max-width: 430px;
          background: ${C.panel}; border: 1px solid ${C.ink};
          border-left: 4px solid ${C.stem};
          box-shadow: var(--shadow-toast);
          padding: 11px 12px;
          animation: kd-rise .2s ease-out;
        }
        @keyframes kd-rise { from { opacity: 0; transform: translate(-50%, 10px) } to { opacity: 1; transform: translate(-50%, 0) } }

        /* One height for every segmented toggle in the masthead, so the nav and
           the script group line up instead of each sizing to its own font. */
        .kd-seg { display: flex; border: 1px solid ${C.rule}; }
        .kd-seg > button { height: 28px; padding: 0 11px; display: flex; align-items: center; }
        .kd-seg > button + button { border-left: 1px solid ${C.rule}; }

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
      `}</style>

      {/* masthead */}
      <header style={{ borderBottom: "1px solid " + C.rule, background: C.panel }}>
        {/* justify-content plus one auto margin on the title packs every control
            against the right edge: one line on a desktop, and on a phone the nav
            stays flush right beside the title with the script row flush right
            under it — no third row, nothing left hanging mid-width. */}
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "12px 18px", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 14, flexWrap: "wrap" }}>
          {/* Title and tagline share a baseline; everything else centres on the row. */}
          <div style={{ display: "flex", alignItems: "baseline", gap: S[3], minWidth: 0, marginRight: "auto" }}>
            <div style={{ fontFamily: MINCHO, fontSize: 26, letterSpacing: ".08em", lineHeight: 1 }}>言葉帳</div>
            <div className="kd-tagline kd-micro" style={{ letterSpacing: ".22em" }}>
              Kotoba-chō · word deck &amp; morphology
            </div>
          </div>
          <div className="kd-seg">
            {[["deck", "Deck"], ["vocab", "Vocab"], ["quiz", "Quiz"], ["settings", "Settings"]].map(([id, label]) => {
              const on = view === id;
              return (
                <button key={id} className="kd-btn kd-form-chip" onClick={() => goto(id)}
                  aria-current={on ? "page" : undefined}
                  style={{
                    fontFamily: MONO, fontSize: T.micro, letterSpacing: ".16em",
                    background: on ? C.stem : "transparent", color: on ? C.panel : C.muted,
                  }}>{label.toUpperCase()}</button>
              );
            })}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: S[4] }}>
            <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
              <span className="kd-micro">SCRIPT</span>
              <div className="kd-seg">
                {SCRIPTS.map((s) => {
                  const on = script === s.id;
                  return (
                    <button key={s.id} className="kd-btn kd-form-chip" onClick={() => setScript(s.id)}
                      aria-pressed={on}
                      title={s.id === "furigana" ? "Kanji with the reading above it" : s.id === "kanji" ? "Kanji only, no reading" : "Kana only, no kanji"}
                      style={{
                        fontFamily: MINCHO, fontSize: T.base,
                        background: on ? C.ink : "transparent", color: on ? C.panel : C.muted,
                      }}>{s.label}</button>
                  );
                })}
              </div>
            </div>
            <span className="kd-tagline kd-micro" style={{ letterSpacing: ".16em" }}>
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
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: S[4] }}>
          <Quiz words={scopedWords} script={script} onProgress={setQuizRun}
                settings={settings} stats={stats} onRecord={recordAnswer} />
        </div>
      )}

      {view === "vocab" && (
        <VocabView
          words={words}
          scopedCount={scopedWords.length}
          script={script}
          settings={settings}
          onOpen={(id) => { setSelId(id); setView("deck"); }}
          onAdd={() => { warmDict(); setAdding(true); setView("deck"); }}
          onDelete={removeWord}
        />
      )}

      {view === "settings" && (
        <SettingsView
          settings={settings}
          onChange={setSettings}
          wordCount={scopedWords.length}
          formCount={settings.formIds.length}
          theme={theme}
          onTheme={setTheme}
        />
      )}

      {view === "deck" && (
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: S[4], display: "flex", gap: S[5], alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* ---------------- deck ---------------- */}
        <aside className="kd-deck">
          <div style={{ display: "flex", gap: S[2], marginBottom: S[3] }}>
            <div style={{ position: "relative", flex: 1 }}>
              <Search size={13} style={{ position: "absolute", left: 9, top: 11, color: C.muted }} />
              <input className="kd-in" style={{ paddingLeft: 27, fontSize: T.base }} placeholder="Search the deck" value={query}
                onChange={(e) => { setQuery(e.target.value); setPendingDelete(null); }} />
            </div>
            <button className="kd-btn" onClick={() => (adding ? closeAdd() : (warmDict(), setAdding(true)))} title="Add a word"
              style={{ background: adding ? C.ink : C.stem, color: C.panel, width: 38, display: "grid", placeItems: "center" }}>
              {adding ? <X size={15} /> : <Plus size={15} />}
            </button>
          </div>

          {adding && (
            <div style={{ background: C.panel, border: "1px solid " + C.rule, padding: S[3], marginBottom: S[3], display: "grid", gap: S[2] }}>
              <div>
                <div className="kd-micro" style={{ letterSpacing: ".16em", marginBottom: S[1] }}>LOOK IT UP</div>
                <div style={{ display: "flex", gap: S[2] }}>
                  <input className="kd-in" placeholder="iku · 行く · たべる" value={q2} autoFocus
                    onChange={(e) => setQ2(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && runLookup()} />
                  <button className="kd-btn" onClick={runLookup} disabled={looking || !q2.trim()}
                    style={{
                      background: looking || !q2.trim() ? C.rule : C.aux, color: C.panel,
                      padding: "0 12px", fontSize: T.sm, whiteSpace: "nowrap",
                      cursor: looking || !q2.trim() ? "default" : "pointer",
                    }}>
                    {looking ? "…" : "Look up"}
                  </button>
                </div>
              </div>

              {lookErr && <div className="kd-note" style={{ borderLeftColor: C.stem }}>{lookErr}</div>}

              {hits && hits.length === 0 && (
                <div style={{ fontSize: T.fine, color: C.muted, lineHeight: 1.5 }}>
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
                      <div style={{ display: "flex", alignItems: "flex-end", gap: S[2] }}>
                        <span style={{ fontFamily: MINCHO, fontSize: JP.md }}>
                          <Word text={c.word} kana={c.reading} mode="furigana" ruby={RUBY.sm} />
                        </span>
                        <span style={{ fontFamily: MONO, fontSize: T.micro, letterSpacing: ".1em", color: C.aux, border: "1px solid " + C.aux, padding: "1px 4px" }}>
                          {TYPES.find((t) => t.id === c.type)?.label.toUpperCase()}
                        </span>
                      </div>
                      <div style={{ fontSize: T.fine, color: C.muted, marginTop: S[1] }}>{c.meaning}</div>
                    </button>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: S[2], marginTop: 2 }}>
                <span className="kd-rail" />
                <span className="kd-micro" style={{ letterSpacing: ".18em" }}>OR ENTER IT</span>
                <span className="kd-rail" />
              </div>

              <input className="kd-in" placeholder="Word — 行く" value={draft.word} onChange={(e) => updateDraft({ word: e.target.value })} />
              <input className="kd-in" placeholder="Reading in kana — いく" value={draft.reading} onChange={(e) => updateDraft({ reading: e.target.value })} />
              <input className="kd-in" placeholder="Meaning — to go" value={draft.meaning} onChange={(e) => updateDraft({ meaning: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && addWord()} />
              <div>
                <div className="kd-micro" style={{ letterSpacing: ".16em", marginBottom: S[1] }}>
                  WORD CLASS {draft.typeTouched ? "" : "· detected"}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: S[1] }}>
                  {TYPES.map((t) => (
                    <button key={t.id} className="kd-btn kd-form-chip" onClick={() => setDraft((d) => ({ ...d, type: t.id, typeTouched: true }))}
                      style={{
                        fontSize: T.fine, padding: "4px 8px", border: "1px solid " + (draft.type === t.id ? C.ink : C.rule),
                        background: draft.type === t.id ? C.ink : "transparent", color: draft.type === t.id ? C.panel : C.muted,
                      }}>{t.label}</button>
                  ))}
                </div>
              </div>
              <select className="kd-in" value={draft.jlpt} onChange={(e) => updateDraft({ jlpt: e.target.value })}>
                <option value="">JLPT —</option>
                {JLPT.map((lv) => <option key={lv} value={lv}>{lv}</option>)}
              </select>
              <select className="kd-in" value={draft.trans} onChange={(e) => updateDraft({ trans: e.target.value })}>
                <option value="">Transitivity —</option>
                <option value="trans">他動詞 transitive</option>
                <option value="intrans">自動詞 intransitive</option>
                <option value="na">n/a</option>
              </select>
              <label style={{ fontSize: T.fine, color: C.muted, display: "flex", alignItems: "center", gap: S[1] }}>
                <input type="checkbox" checked={draft.common === true}
                  onChange={(e) => updateDraft({ common: e.target.checked ? true : null })} />
                Common
              </label>
              <button className="kd-btn" onClick={addWord} style={{ background: C.ink, color: C.panel, padding: "9px 0", fontSize: T.base, letterSpacing: ".04em" }}>
                Add to deck
              </button>
            </div>
          )}

          <div className="kd-list" style={{ border: "1px solid " + C.rule, background: C.panel }}>
            {filtered.length === 0 && (
              <div className="kd-empty" style={{ padding: S[5], textAlign: "center" }}>
                <div style={{ fontFamily: MINCHO, fontSize: JP.display, color: C.rule, marginBottom: S[2] }}>空</div>
                <div style={{ fontSize: T.sm, color: C.muted, lineHeight: 1.6 }}>
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
                    <div style={{ fontSize: T.base, display: "flex", alignItems: "flex-end", gap: S[1], flexWrap: "wrap" }}>
                      <span>Delete</span>
                      <span style={{ fontFamily: MINCHO, fontSize: JP.sm, color: C.stem }}>
                        <Word text={w.word} kana={w.reading} mode={script} ruby={RUBY.sm} rubyColor={C.stem} />
                      </span>
                      <span>from the deck?</span>
                    </div>
                    <div style={{ display: "flex", gap: S[2], marginTop: S[2] }}>
                      <button className="kd-btn" onClick={() => removeWord(w.id)}
                        style={{ background: C.stem, color: C.panel, padding: "5px 12px", fontSize: T.fine }}>
                        Delete
                      </button>
                      <button className="kd-btn" onClick={() => setPendingDelete(null)} autoFocus
                        style={{ border: "1px solid " + C.rule, color: C.muted, padding: "5px 12px", fontSize: T.fine, background: C.panel }}>
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
                    display: "flex", alignItems: "center", gap: S[3], padding: "9px 11px", cursor: "pointer",
                    borderBottom: "1px solid " + C.ruleSoft,
                    borderLeft: "3px solid " + (on ? C.stem : "transparent"),
                    background: on ? C.panelAlt : "transparent",
                  }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontFamily: MINCHO, fontSize: JP.md }}>
                      <Word text={w.word} kana={w.reading} mode={script} ruby={RUBY.sm} rubyColor={on ? C.stem : C.muted} />
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: T.micro, color: C.muted, letterSpacing: ".05em", marginTop: 1 }}>
                      {romaji(w.reading)} · {typeLabel(w.type)}
                    </div>
                    {w.meaning && <div style={{ fontSize: T.fine, color: C.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.meaning}</div>}
                  </div>
                  <button className="kd-btn kd-del" title={"Delete " + w.word}
                    onClick={(e) => { e.stopPropagation(); setPendingDelete(w.id); }}
                    style={{ padding: S[2], margin: -3 }}>
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
            <div style={{ border: "1px solid " + C.rule, background: C.panel, padding: S[6] + S[2], textAlign: "center" }}>
              <div style={{ fontFamily: MINCHO, fontSize: JP.display, color: C.rule }}>—</div>
              <div style={{ fontSize: T.base, color: C.muted, marginTop: S[2] }}>Pick a word from the deck to take it apart.</div>
            </div>
          ) : (
            <>
              {/* entry header */}
              <div style={{ display: "flex", alignItems: "flex-end", gap: S[4], flexWrap: "wrap", marginBottom: S[1] }}>
                <div>
                  {settings.show.romaji && (
                    <div className="kd-micro">{romaji(selected.reading).toUpperCase()}</div>
                  )}
                  <div style={{ display: "flex", alignItems: "flex-start", gap: S[1] }}>
                    <div style={{ fontFamily: MINCHO, fontSize: JP.lg }}>
                      <Word text={selected.word} kana={selected.reading} mode={script} ruby={RUBY.lg} />
                    </div>
                    <Say text={selected.reading} size={15} label="Play the word" enabled={settings.show.audio} />
                  </div>
                </div>
                <div style={{ paddingBottom: S[1] }}>
                  <div style={{ fontSize: T.base, color: C.ink }}>{selected.meaning || <span style={{ color: C.muted }}>no gloss</span>}</div>
                  <div style={{ display: "flex", gap: S[1], marginTop: S[1] + 1, flexWrap: "wrap" }}>
                    {classChoices.map((t) => (
                      <button key={t.id} className="kd-btn kd-form-chip" onClick={() => setType(selected.id, t.id)}
                        aria-pressed={selected.type === t.id}
                        style={{
                          fontFamily: MONO, fontSize: T.micro, letterSpacing: ".08em", padding: "6px 9px",
                          border: "1px solid " + (selected.type === t.id ? C.aux : C.ruleSoft),
                          background: selected.type === t.id ? C.aux : "transparent",
                          color: selected.type === t.id ? C.panel : C.muted,
                        }}>{t.label.toUpperCase()}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* the signature: morpheme strip with interlinear gloss */}
              <div className="kd-panel">
                {form && (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: S[3], marginBottom: S[4], flexWrap: "wrap" }}>
                      <div className="kd-micro">
                        {form.label} <span style={{ fontFamily: MINCHO, letterSpacing: 0, textTransform: "none" }}>{form.jp}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: S[1] }}>
                        {settings.show.romaji && (
                          <span style={{ fontFamily: MONO, fontSize: T.fine, color: C.muted }}>{romaji(readingOut)}</span>
                        )}
                        <Say text={readingOut} label="Play this form" enabled={settings.show.audio} />
                      </div>
                    </div>

                    {/* keyed on the form so switching forms replays the fade —
                        the recomposition is the thing being taught */}
                    <div key={form.id} className="kd-swap" style={{ display: "flex", alignItems: "flex-start", gap: S[2], flexWrap: "wrap" }}>
                      {form.segs.map((s, i) => {
                        const col = ROLE_COLOR[s.role];
                        const on = segIdx === i;
                        return (
                          <button key={i} className="kd-btn kd-tile" onClick={() => setSegIdx(on ? null : i)}
                            aria-pressed={on}
                            style={{ textAlign: "center", padding: 0 }}>
                            <div style={{
                              fontFamily: MINCHO, fontSize: JP.strip, padding: "2px 6px 4px",
                              color: col,
                              borderBottom: "3px solid " + (on ? col : "transparent"),
                              background: on ? (s.role === "root" ? C.panelAlt : "transparent") : "transparent",
                            }}>
                              <Word text={s.text} kana={s.kana} mode={script} ruby={RUBY.strip} rubyColor={col} reserve />
                            </div>
                            {settings.show.romaji && (
                              <div style={{ fontFamily: MONO, fontSize: T.micro, color: C.muted, marginTop: S[1] }}>{romaji(s.kana)}</div>
                            )}
                            {settings.show.glosses && (
                              <div className="kd-gloss" style={{
                                marginTop: S[1],
                                color: on ? C.panel : col, background: on ? col : "transparent",
                                border: "1px solid " + col,
                              }}>{s.gloss}</div>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* The key to the whole colour system. It used to live in the
                        footer at 9px, below the fold, explaining a mechanic the
                        reader had already met three screens earlier. */}
                    <div style={{ display: "flex", gap: S[3], flexWrap: "wrap", marginTop: S[4], paddingTop: S[3], borderTop: "1px solid " + C.ruleSoft }}>
                      {[["root", "Root"], ["stem", "Shifting kana"], ["aux", "Auxiliary"], ["extra", "Stacked suffix"]].map(([role, label]) => (
                        <span key={role} className="kd-micro" style={{ display: "flex", alignItems: "center", gap: S[1], letterSpacing: ".1em", color: ROLE_COLOR[role] }}>
                          <span aria-hidden="true" style={{ width: 8, height: 8, background: ROLE_COLOR[role], flexShrink: 0 }} />
                          {label}
                        </span>
                      ))}
                    </div>

                    {/* morpheme note */}
                    <div style={{ marginTop: S[4], borderTop: "1px solid " + C.ruleSoft, paddingTop: S[3] }}>
                      {activeSeg ? (
                        <div style={{ display: "flex", gap: S[4], flexWrap: "wrap", alignItems: "flex-start" }}>
                          <div style={{ flex: "1 1 300px", minWidth: 240 }}>
                            <div style={{ display: "flex", alignItems: "flex-end", gap: S[2], marginBottom: S[1] }}>
                              <span style={{ fontFamily: MINCHO, fontSize: JP.sm, color: ROLE_COLOR[activeSeg.role] }}>
                                <Word text={activeSeg.text} kana={activeSeg.kana} mode={script} ruby={RUBY.sm} rubyColor={ROLE_COLOR[activeSeg.role]} />
                              </span>
                              <span style={{ fontSize: T.base, fontWeight: 600 }}>{activeSeg.title}</span>
                            </div>
                            <div style={{ fontSize: T.base, lineHeight: 1.65, color: C.body }}>{activeSeg.body}</div>
                          </div>
                          {settings.show.ladder && godanRow && ladderActive && (
                            <div>
                              <div className="kd-micro" style={{ letterSpacing: ".16em", marginBottom: S[1] }}>
                                五段 · FIVE ROWS OF {romaji(godanRow).toUpperCase()}
                              </div>
                              <Ladder row={godanRow} active={ladderActive} />
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ fontSize: T.sm, color: C.muted }}>
                          Tap any piece above to see what it is doing.
                          {form.note ? " " : ""}
                        </div>
                      )}
                      {form.note && (
                        <div className="kd-note" style={{ marginTop: S[3], borderLeftColor: C.extra }}>
                          <span className="kd-micro" style={{ letterSpacing: ".16em", color: C.extra }}>IRREGULAR</span>
                          <div style={{ fontSize: T.base, lineHeight: 1.6, marginTop: S[1] }}>{form.note}</div>
                        </div>
                      )}
                    </div>
                  </>
                )}
                {!form && forms.length === 0 && (
                  <div style={{ fontSize: T.base, color: C.muted }}>
                    No forms for this entry. Check the reading is written in kana, then pick the right word class above.
                  </div>
                )}
              </div>

              <StackPanel key={selected.id} word={selected} script={script} settings={settings} />
              {settings.show.examples && <ExamplesPanel word={selected} script={script} onSave={saveExamples} settings={settings} />}

              {/* form ladder */}
              <div style={{ marginTop: S[5], display: "grid", gap: S[4] }}>
                {GROUPS.map((grp) => {
                  const items = shown.filter((f) => f.group === grp);
                  if (!items.length) return null;
                  return (
                    <div key={grp}>
                      <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[2] }}>
                        <span className="kd-micro" style={{ letterSpacing: ".22em" }}>{grp}</span>
                        <span style={{ flex: 1, height: 1, background: C.rule }} />
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: S[2] }}>
                        {items.map((f) => {
                          const on = f.id === formId;
                          return (
                            <button key={f.id} className="kd-btn kd-form-chip" onClick={() => { setFormId(f.id); setSegIdx(null); }}
                              aria-pressed={on}
                              style={{
                                border: "1px solid " + (on ? C.ink : C.rule),
                                background: on ? C.ink : C.panel,
                                color: on ? C.panel : C.ink,
                                padding: "6px 10px 7px", textAlign: "left", minWidth: 84,
                              }}>
                              <div style={{ fontFamily: MINCHO, fontSize: JP.sm, display: "flex", alignItems: "flex-end" }}>
                                {f.segs.map((s, i) => (
                                  <Word key={i} text={s.text} kana={s.kana} mode={script} ruby={RUBY.sm}
                                    rubyColor={on ? C.onInkDim : C.muted} />
                                ))}
                              </div>
                              <div style={{ fontFamily: MONO, fontSize: T.micro, letterSpacing: ".08em", marginTop: 2, color: on ? C.onInkDim : C.muted }}>
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
              {forms.length > 0 && shown.length === 0 && (
                <div style={{ fontSize: T.base, color: C.muted, border: "1px dashed " + C.rule, padding: "14px 16px" }}>
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
          <div style={{ display: "flex", alignItems: "flex-start", gap: S[3] }}>
            <span className="kd-micro" style={{ letterSpacing: ".16em", color: C.stem, paddingTop: 2, flexShrink: 0 }}>AUDIO</span>
            <span style={{ fontSize: T.sm, lineHeight: 1.55, flex: 1 }}>{audioNote}</span>
            <button className="kd-btn" onClick={() => setAudioNote(null)} aria-label="Dismiss"
              style={{ color: C.muted, padding: 2, lineHeight: 0, flexShrink: 0 }}>
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      {/* The colour legend used to live here. It explains the app's core
          mechanic, so it now sits beside the colours it describes, on the strip. */}
      <footer style={{ borderTop: "1px solid " + C.rule, marginTop: S[6] }}>
        <div className="kd-micro" style={{ maxWidth: 1120, margin: "0 auto", padding: "12px 18px", display: "flex", gap: S[4], flexWrap: "wrap", letterSpacing: ".14em" }}>
          <span>
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
        {/* CC BY-SA makes this a licence condition, not a courtesy. */}
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "0 18px 13px", fontSize: T.fine, lineHeight: 1.6, color: C.muted }}>
          Dictionary data from{" "}
          <a href="https://www.edrdg.org/jmdict/j_jmdict.html" target="_blank" rel="noreferrer" style={{ color: C.aux }}>JMdict</a>
          {" "}by the{" "}
          <a href="https://www.edrdg.org/" target="_blank" rel="noreferrer" style={{ color: C.aux }}>Electronic Dictionary Research and Development Group</a>
          , used under{" "}
          <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer" style={{ color: C.aux }}>CC BY-SA 4.0</a>.
        </div>
      </footer>
    </div>
  );
}
