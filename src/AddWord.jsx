/* The add-word panel: dictionary lookup on top, hand entry underneath.

   It owns its own draft. Closing the panel unmounts it, which is the reset —
   App used to keep five pieces of half-typed state alive for a panel that was
   not on screen, and a closeAdd() that had to remember to clear each one. */
import { useState } from "react";

import { C, MINCHO, MONO, T, JP, RUBY, S, P } from "./theme.js";
import { detectType, TYPES } from "./engine.js";
import { lookupWord } from "./api.js";
import { JLPT } from "./settings.js";
import { Word, Chip } from "./ui.jsx";

const BLANK = { word: "", reading: "", meaning: "", type: "godan", typeTouched: false, jlpt: "", trans: "", common: null };

/* seed: whatever was typed in the deck search when the panel opened. The panel
   unmounts on close, so useState's initial value is enough — no sync needed. */
export default function AddWord({ onAdd, seed = "" }) {
  const [q2, setQ2] = useState(seed);
  const [looking, setLooking] = useState(false);
  const [hits, setHits] = useState(null);
  const [lookErr, setLookErr] = useState(null);
  const [draft, setDraft] = useState(BLANK);

  function updateDraft(patch) {
    setDraft((d) => {
      const next = { ...d, ...patch };
      if (!next.typeTouched && (patch.word !== undefined || patch.reading !== undefined)) {
        next.type = detectType(next.word, next.reading || next.word);
      }
      return next;
    });
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

  function addWord() {
    const word = draft.word.trim();
    if (!word) return;
    const tags = {};
    if (draft.jlpt) tags.jlpt = draft.jlpt;
    if (draft.trans) tags.trans = draft.trans;
    if (draft.common !== null) tags.common = draft.common;
    onAdd({
      id: "w" + Date.now(),
      word,
      reading: (draft.reading.trim() || word),
      meaning: draft.meaning.trim(),
      type: draft.type,
      ...tags,
      addedAt: Date.now(),
    });
  }

  return (
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
                display: "block", width: "100%", textAlign: "left", padding: P.row,
                borderBottom: i === hits.length - 1 ? "none" : "1px solid " + C.ruleSoft,
              }}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: S[2] }}>
                <span style={{ fontFamily: MINCHO, fontSize: JP.md }}>
                  <Word text={c.word} kana={c.reading} mode="furigana" ruby={RUBY.sm} />
                </span>
                <span style={{ fontFamily: MONO, fontSize: T.micro, letterSpacing: ".1em", color: C.aux, border: "1px solid " + C.aux, padding: P.tag }}>
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
            <Chip key={t.id} on={draft.type === t.id} ink title={t.hint}
              onClick={() => setDraft((d) => ({ ...d, type: t.id, typeTouched: true }))}>{t.label}</Chip>
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
      <button className="kd-btn" onClick={addWord} style={{ background: C.ink, color: C.panel, padding: P.wide, fontSize: T.base, letterSpacing: ".04em" }}>
        Add to deck
      </button>
    </div>
  );
}
