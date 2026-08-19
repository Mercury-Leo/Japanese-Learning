import { useState, useRef } from "react";
import { Download, Upload } from "lucide-react";

import { C, S } from "./theme.js";
import { TYPES, detectType } from "./engine.js";
import { mergeStored } from "./stats.js";
import { JLPT } from "./settings.js";

/* ============================================================
   EXPORT / IMPORT
   ============================================================ */
function DeckTools({ words, stats, onImport }) {
  const [note, setNote] = useState(null);
  const fileRef = useRef(null);

  function exportDeck() {
    const payload = JSON.stringify({ format: "kotoba-deck", version: 1, exportedAt: new Date().toISOString(), words, stats }, null, 2);
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
    const payload = JSON.stringify({ format: "kotoba-deck", version: 1, words, stats }, null, 2);
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
        /* Sanitised through the same gate as stored values — an import file is just as
           untrusted as localStorage. */
        const incomingStats = parsed && parsed.stats ? mergeStored(parsed.stats) : null;
        const added = onImport(clean, incomingStats);
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

export default DeckTools;
