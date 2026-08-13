import { C, MONO } from "./theme.js";
import { TYPES, MODS, GROUPS, typeLabel } from "./engine.js";
import { allForms, PRESETS, applyPreset, JLPT } from "./settings.js";

const micro = { fontFamily: MONO, fontSize: 9, letterSpacing: ".2em", textTransform: "uppercase", color: C.muted };

function Chip({ on, onClick, accent = C.aux, children }) {
  return (
    <button className="kd-btn kd-form-chip" onClick={onClick}
      style={{
        border: "1px solid " + (on ? accent : C.rule),
        background: on ? accent : "transparent",
        color: on ? C.panel : C.ink,
        padding: "6px 9px", fontSize: 11.5, textAlign: "left",
      }}>{children}</button>
  );
}

function Section({ label, onAll, onNone, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
        <span style={micro}>{label}</span>
        <span style={{ flex: 1, height: 1, background: C.rule }} />
        {onAll && (
          <button className="kd-btn" onClick={onAll} style={{ ...micro, fontSize: 8.5, color: C.aux }}>ALL</button>
        )}
        {onNone && (
          <button className="kd-btn" onClick={onNone} style={{ ...micro, fontSize: 8.5, color: C.aux }}>NONE</button>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>{children}</div>
    </div>
  );
}

export default function SettingsView({ settings, onChange, wordCount, formCount }) {
  const set = (patch) => onChange({ ...settings, ...patch });
  const toggle = (key, id) =>
    set({ [key]: settings[key].includes(id) ? settings[key].filter((x) => x !== id) : [...settings[key], id] });
  const forms = allForms();

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "18px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={micro}>Preset</span>
        {Object.keys(PRESETS).map((name) => (
          <button key={name} className="kd-btn kd-form-chip" onClick={() => onChange(applyPreset(name, settings))}
            style={{ border: "1px solid " + C.ink, background: "transparent", color: C.ink, padding: "6px 11px", fontSize: 11.5 }}>
            {name}
          </button>
        ))}
        <span style={{ ...micro, marginLeft: "auto", color: C.stem }}>
          {wordCount} words · {formCount} forms
        </span>
      </div>

      {GROUPS.map((grp) => {
        const items = forms.filter((f) => f.group === grp);
        if (!items.length) return null;
        const ids = items.map((f) => f.id);
        return (
          <Section key={grp} label={"Forms · " + grp}
            onAll={() => set({ formIds: [...new Set([...settings.formIds, ...ids])] })}
            onNone={() => set({ formIds: settings.formIds.filter((id) => !ids.includes(id)) })}>
            {items.map((f) => (
              <Chip key={f.id} on={settings.formIds.includes(f.id)} onClick={() => toggle("formIds", f.id)}>
                {f.label}
                <span style={{ fontFamily: MONO, fontSize: 8.5, marginLeft: 5, opacity: .7 }}>{f.jp}</span>
              </Chip>
            ))}
          </Section>
        );
      })}

      <Section label="Stack modifiers"
        onAll={() => set({ modIds: MODS.map((m) => m.id) })}
        onNone={() => set({ modIds: [] })}>
        {MODS.map((m) => (
          <Chip key={m.id} on={settings.modIds.includes(m.id)} onClick={() => toggle("modIds", m.id)}>
            {m.label}
            <span style={{ fontFamily: MONO, fontSize: 8.5, marginLeft: 5, opacity: .7 }}>{m.jp}</span>
          </Chip>
        ))}
      </Section>

      <Section label="Word classes"
        onAll={() => set({ types: TYPES.map((t) => t.id) })}
        onNone={() => set({ types: [] })}>
        {TYPES.map((t) => (
          <Chip key={t.id} on={settings.types.includes(t.id)} onClick={() => toggle("types", t.id)}>
            {t.label}
            <span style={{ fontFamily: MONO, fontSize: 8.5, marginLeft: 5, opacity: .7 }}>{typeLabel(t.id)}</span>
          </Chip>
        ))}
      </Section>

      <Section label="Word scope">
        {JLPT.map((lv) => (
          <Chip key={lv} on={settings.jlpt.includes(lv)} onClick={() => toggle("jlpt", lv)}>{lv}</Chip>
        ))}
        <span style={{ width: 14 }} />
        <Chip on={settings.trans.includes("trans")} onClick={() => toggle("trans", "trans")}>他動詞</Chip>
        <Chip on={settings.trans.includes("intrans")} onClick={() => toggle("trans", "intrans")}>自動詞</Chip>
        <span style={{ width: 14 }} />
        <Chip accent={C.stem} on={settings.commonOnly} onClick={() => set({ commonOnly: !settings.commonOnly })}>
          Common words only
        </Chip>
      </Section>

      <Section label="Display">
        {[["romaji", "Romaji"], ["glosses", "Morpheme glosses"], ["ladder", "五段 ladder"],
          ["audio", "Audio buttons"], ["examples", "Example sentences"]].map(([k, label]) => (
          <Chip key={k} accent={C.extra} on={settings.show[k]}
            onClick={() => set({ show: { ...settings.show, [k]: !settings.show[k] } })}>{label}</Chip>
        ))}
      </Section>

      <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.6, borderTop: "1px solid " + C.ruleSoft, paddingTop: 12 }}>
        Word scope only filters words that carry the matching tag. A word with no JLPT level,
        no transitivity or no frequency is never hidden, so nothing you have already added
        can disappear here.
      </div>
    </div>
  );
}
