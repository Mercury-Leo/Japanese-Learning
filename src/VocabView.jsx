import { useState, useMemo } from "react";
import { Plus, Trash2, Search } from "lucide-react";

import { C, MINCHO, SANS, MONO, T, JP, RUBY, S, P } from "./theme.js";
import { romaji, typeLabel } from "./engine.js";
import { wordAccuracy } from "./stats.js";
import { Word, Chip, ConfirmModal } from "./ui.jsx";
import Say from "./Say.jsx";

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

const inGroup = (w, g) => !g.types || g.types.includes(w.type);

function VocabView({ words, scopedCount, script, settings, stats, onOpen, onAdd, onDelete }) {
  const [grp, setGrp] = useState("all");
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState(null);

  const need = q.trim().toLowerCase();
  const group = VOCAB_GROUPS.find((x) => x.id === grp) || VOCAB_GROUPS[0];

  /* Romanising the whole deck on every keystroke is the expensive half of this
     view, so it happens once per query rather than once per render. */
  const list = useMemo(() => words.filter((w) =>
    inGroup(w, group) &&
    (!need || (w.word + w.reading + w.meaning + romaji(w.reading)).toLowerCase().includes(need))),
    [words, group, need]);

  /* One walk for all four counts. Each chip used to run its own filter over the
     whole deck, so the header cost four passes to print four numbers. */
  const counts = useMemo(() => {
    const n = Object.fromEntries(VOCAB_GROUPS.map((g) => [g.id, 0]));
    for (const w of words) for (const g of VOCAB_GROUPS) if (inGroup(w, g)) n[g.id] += 1;
    return n;
  }, [words]);
  const doomed = confirm ? words.find((w) => w.id === confirm) : null;

  const tag = { fontFamily: MONO, fontSize: T.micro, letterSpacing: ".12em", padding: P.tag, border: "1px solid " + C.ruleSoft, color: C.muted };

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
            return (
              <Chip key={g.id} on={on} ink onClick={() => setGrp(g.id)}>
                {g.label}
                <span style={{ fontFamily: MINCHO, fontSize: T.micro, marginLeft: S[1], opacity: .7 }}>{g.jp}</span>
                <span style={{ fontFamily: MONO, fontSize: T.micro, marginLeft: S[1], opacity: .7 }}>{counts[g.id]}</span>
              </Chip>
            );
          })}
        </div>
        <button className="kd-btn" onClick={onAdd}
          style={{ background: C.stem, color: C.panel, padding: P.btn, fontSize: T.sm, display: "flex", alignItems: "center", gap: S[1] }}>
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
              display: "flex", alignItems: "center", gap: S[4], padding: P.row, cursor: "pointer",
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
              {(() => {
                const a = wordAccuracy(stats, w);
                /* An undrilled word shows nothing rather than a demoralising 0%. */
                if (!a.n) return null;
                const p = Math.round((a.ok / a.n) * 100);
                return (
                  <span style={{ ...tag, color: p < 60 ? C.stem : C.aux, borderColor: p < 60 ? C.stem : C.aux }}
                        title={a.ok + " of " + a.n + " correct"}>
                    {p}%
                  </span>
                );
              })()}
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

export default VocabView;
