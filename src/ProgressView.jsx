import { C, MINCHO, MONO, T, JP, S } from "./theme.js";
import { teRule } from "./engine.js";
import { byRule } from "./stats.js";

/* The nine godan endings, in the order a 五段 table lists them. Each maps to one
   euphonic rule, so this grid is the whole class seen at once — the generalised
   version of the per-verb Ladder in App.jsx. */
const ENDINGS = ["う", "つ", "る", "く", "ぐ", "す", "ぬ", "ぶ", "む"];

export default function ProgressView({ stats, words }) {
  const all = byRule(stats, words, 1);
  /* Deliberately "accuracy over the current deck", not "accuracy ever": stats
     for deleted words are retained on purpose so a later re-import can restore
     them, but a headline sitting above a list that excludes those words must
     not count them either — otherwise the two disagree, and an emptied deck
     shows a percentage over nothing. So the headline is derived from the same
     `all` the list below renders, not from raw stats. */
  const t = all.reduce((acc, r) => ({ n: acc.n + r.n, ok: acc.ok + r.ok }), { n: 0, ok: 0 });
  const pct = t.n ? Math.round((t.ok / t.n) * 100) : 0;
  const byId = new Map(all.map((r) => [r.id, r]));

  if (!t.n) {
    return (
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: S[4] }}>
        <div style={{ border: "1px solid " + C.rule, background: C.panel, padding: S[6] + S[2], textAlign: "center" }}>
          <div style={{ fontFamily: MINCHO, fontSize: JP.display, color: C.rule }}>未</div>
          <div style={{ fontSize: T.base, color: C.muted, marginTop: S[2], lineHeight: 1.6 }}>
            Nothing drilled yet. Take a quiz and this fills in — accuracy lands
            against the grammar rule, not just the word.
          </div>
        </div>
      </div>
    );
  }

  const bar = (p) => (
    <span style={{ flex: "0 0 72px", height: 4, background: C.ruleSoft, display: "flex" }}>
      <span style={{ width: p + "%", background: p < 60 ? C.stem : C.aux }} />
    </span>
  );

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: S[4] }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: S[3], marginBottom: S[5] }}>
        <span style={{ fontFamily: MINCHO, fontSize: JP.figure, lineHeight: 1, color: pct < 60 ? C.stem : C.aux }}>{pct}%</span>
        <span className="kd-micro">{t.ok} of {t.n} answered correctly</span>
      </div>

      <div className="kd-head">
        <span className="kd-micro">By rule</span>
        <span style={{ fontFamily: MINCHO, fontSize: T.sm, color: C.muted }}>弱点</span>
        <span className="kd-rail" />
      </div>
      <div style={{ display: "grid", gap: S[2], marginBottom: S[5] }}>
        {all.map((r) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: S[3] }}>
            <span style={{ fontSize: T.sm, flex: "1 1 auto", minWidth: 0 }}>
              {r.label}
              {r.jp && <span style={{ fontFamily: MINCHO, color: C.muted, marginLeft: S[1] + 1 }}>{r.jp}</span>}
            </span>
            {bar(r.pct)}
            <span style={{ fontFamily: MONO, fontSize: T.micro, color: C.muted }}>{r.pct}% · {r.n}</span>
          </div>
        ))}
      </div>

      <div className="kd-head">
        <span className="kd-micro">Godan endings</span>
        <span style={{ fontFamily: MINCHO, fontSize: T.sm, color: C.muted }}>五段</span>
        <span className="kd-rail" />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: S[2] }}>
        {ENDINGS.map((k) => {
          const r = byId.get((teRule({ word: "x" + k, reading: "x" + k, type: "godan" }) || {}).id);
          const p = r ? r.pct : null;
          return (
            <div key={k} style={{ textAlign: "center", width: 52 }}>
              <div style={{
                fontFamily: MINCHO, fontSize: JP.md, lineHeight: "44px", height: 44,
                color: p === null ? C.muted : C.panel,
                background: p === null ? "transparent" : p < 60 ? C.stem : C.aux,
                border: "1px solid " + (p === null ? C.ruleSoft : "transparent"),
              }}>{k}</div>
              <div className="kd-micro" style={{ marginTop: S[1] }}>{p === null ? "—" : p + "%"}</div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: T.fine, color: C.muted, lineHeight: 1.6, marginTop: S[3] }}>
        Endings sharing a rule share a score — う・つ・る all take って, and く・ぐ
        both take い. A dash means you have not drilled that ending's て or た form yet.
      </div>
    </div>
  );
}
