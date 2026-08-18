import { useState } from "react";
import { C, MINCHO, MONO, T, JP, S } from "./theme.js";
import { CHARTS, GROUPS, cell, read } from "./charts.js";
import { speak } from "./speech.js";
import Say from "./Say.jsx";

/* Renders the tables in charts.js. Two shapes: a list of [kanji, reading, gloss]
   rows, and a matrix for the sets where the grid itself is the lesson — counter
   × number, distance × series, own family × someone else's.

   Audio differs by shape on purpose. A list carries the app's play button, same
   as every other row in the app; a matrix would need 112 of them, so the cell
   itself is the button. */

/* Colour alone must not carry the flag, so an irregular reading is underlined as
   well — C.stem is already "the kana that shifts" everywhere else in the app. */
const irrStyle = (irr) => (irr ? { color: C.stem, borderBottom: "1px dotted " + C.stem } : null);

/* Numbers, so React appends px; a string here would silently drop the unit. */
const CELL = { paddingTop: S[2], paddingBottom: S[2], paddingRight: S[2] };

/* The row label has to survive a horizontal scroll — the counter grid is 785px
   wide and a phone shows 343 of them, so without this you scroll to 何 and can
   no longer see whether you are reading 階 or 杯. Opaque, or the cells slide
   visibly underneath it. */
const STUCK = { position: "sticky", left: 0, background: C.ground, borderRight: "1px solid " + C.ruleSoft };

/* Ruby over kanji, plain kana when there is no kanji to sit above — a reading
   rubied over itself is just a smaller duplicate. */
function Ja({ ja, kana, irr, size = JP.sm }) {
  const tint = irr ? C.stem : undefined;
  if (!ja || ja === kana) return <span style={{ fontFamily: MINCHO, fontSize: size, color: tint }}>{kana}</span>;
  return (
    <span style={{ fontFamily: MINCHO, fontSize: size, color: tint }}>
      <ruby>{ja}<rt style={{ fontFamily: MINCHO, fontSize: T.micro, color: irr ? C.stem : C.muted }}>{kana}</rt></ruby>
    </span>
  );
}

function ListChart({ rows, audio }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
      <tbody>
        {rows.map(([ja, raw, en]) => {
          const { kana, irr } = cell(raw);
          return (
            <tr key={ja} style={{ borderTop: "1px solid " + C.ruleSoft }}>
              {/* The Japanese is the row header, so a screen reader announces it
                  with every cell in the row. */}
              <th scope="row" style={{ ...CELL, fontWeight: 400, textAlign: "left", width: "32%" }}>
                <Ja ja={ja} kana={kana} irr={irr} />
              </th>
              <td style={{ ...CELL, fontFamily: MONO, fontSize: T.fine, color: C.muted, letterSpacing: ".05em", width: "30%" }}>
                <span style={irrStyle(irr)}>{read(kana)}</span>
              </td>
              <td style={{ ...CELL, fontSize: T.base }}>{en}</td>
              <td style={{ ...CELL, paddingRight: 0, width: 34, textAlign: "right" }}>
                <Say text={kana} label={"Play " + ja} enabled={audio} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function GridChart({ cols, rows, audio }) {
  /* One reading per cell, so the cell is the play target when audio is on. */
  const Reading = ({ ja, kana, irr }) => (
    <>
      <div style={irrStyle(irr)}><Ja ja={ja} kana={kana} irr={irr} /></div>
      <div style={{ fontFamily: MONO, fontSize: T.micro, letterSpacing: ".05em", color: irr ? C.stem : C.muted, marginTop: 2 }}>
        {read(kana)}
      </div>
    </>
  );

  return (
    /* Eight columns of kana will not fit a phone, and a squeezed matrix is
       unreadable in a way a scrolled one is not. */
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", minWidth: "100%" }}>
        <thead>
          <tr>
            {/* Above the sticky column, so it needs the same treatment plus a
                layer, or the first data column scrolls over it. */}
            <th style={{ ...STUCK, zIndex: 2 }} />
            {cols.map((n) => (
              <th key={n} scope="col" className="kd-micro" style={{ ...CELL, textAlign: "left", fontWeight: 400 }}>
                {n}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.k} style={{ borderTop: "1px solid " + C.ruleSoft }}>
              <th scope="row" style={{ ...CELL, ...STUCK, zIndex: 1, textAlign: "left", fontWeight: 400, whiteSpace: "nowrap" }}>
                <span style={{ fontFamily: MINCHO, fontSize: JP.sm }}>{r.k}</span>
                <span className="kd-micro" style={{ marginLeft: S[2] }}>{r.gloss}</span>
              </th>
              {r.cells.map((raw, i) => {
                const { ja, kana, irr } = cell(raw);
                return (
                  <td key={cols[i]} style={{ ...CELL, whiteSpace: "nowrap", padding: audio ? 0 : undefined }}>
                    {audio ? (
                      <button className="kd-btn kd-cell-say" onClick={() => speak(kana)}
                        title={"Play " + (ja || kana)} style={{ ...CELL, width: "100%", textAlign: "left" }}>
                        <Reading ja={ja} kana={kana} irr={irr} />
                      </button>
                    ) : <Reading ja={ja} kana={kana} irr={irr} />}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ChartsView({ audio = true }) {
  /* Twelve charts on one page meant scrolling past the months to reach the
     counters. Subject comes from the data, so this is a filter, not a router —
     nothing is deep-linked and nothing needs to survive leaving the view. */
  const [group, setGroup] = useState(GROUPS[0]);

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: S[4] }}>
      <style>{`.kd-cell-say { transition: background .15s; } .kd-cell-say:hover { background: ${C.panelAlt}; }`}</style>

      {/* Same segmented control as the masthead, one level down — and centred
          for the same reason the destinations up there are. */}
      <nav className="kd-seg" aria-label="Chart subjects"
        style={{ width: "fit-content", marginLeft: "auto", marginRight: "auto", marginBottom: S[4] }}>
        {GROUPS.map((g) => {
          const on = g === group;
          return (
            <button key={g} className="kd-btn kd-form-chip" onClick={() => setGroup(g)}
              aria-current={on ? "true" : undefined}
              style={{
                fontFamily: MONO, fontSize: T.micro, letterSpacing: ".16em",
                background: on ? C.stem : "transparent", color: on ? C.panel : C.muted,
              }}>{g.toUpperCase()}</button>
          );
        })}
      </nav>

      <div style={{ fontSize: T.sm, color: C.muted, lineHeight: 1.6, marginBottom: S[5] }}>
        Closed sets, for looking up rather than drilling. A reading shown{" "}
        <span style={{ color: C.stem, borderBottom: "1px dotted " + C.stem }}>like this</span>{" "}
        breaks the pattern of the chart it sits in — those are the ones worth the trouble.
        {audio && " Readings play on tap: the button on a list row, the cell itself in a grid."}
      </div>

      {CHARTS.filter((c) => c.group === group).map((c) => (
        <section key={c.title} style={{ marginBottom: S[6] }}>
          <div className="kd-head">
            <span className="kd-micro">{c.title}</span>
            <span style={{ fontFamily: MINCHO, fontSize: T.sm, color: C.muted }}>{c.jp}</span>
            <span className="kd-rail" />
          </div>

          {c.cols
            ? <GridChart cols={c.cols} rows={c.rows} audio={audio} />
            : <ListChart rows={c.rows} audio={audio} />}

          <div className="kd-note" style={{ marginTop: S[3] }}>{c.note}</div>
        </section>
      ))}
    </div>
  );
}
