import { C, MONO, T, S, THEMES } from "./theme.js";
import { TYPES, MODS, GROUPS, typeLabel } from "./engine.js";
import { allForms, PRESETS, applyPreset, JLPT } from "./settings.js";
import { getKey, setKey } from "./api.js";

function Chip({ on, onClick, accent = C.aux, children }) {
  return (
    <button className="kd-btn kd-form-chip" onClick={onClick} aria-pressed={on}
      style={{
        border: "1px solid " + (on ? accent : C.rule),
        background: on ? accent : "transparent",
        color: on ? C.panel : C.ink,
        padding: "6px 9px", fontSize: T.fine, textAlign: "left",
      }}>{children}</button>
  );
}

function Section({ label, onAll, onNone, children }) {
  return (
    <div style={{ marginBottom: S[4] + 2 }}>
      <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[2] }}>
        <span className="kd-micro">{label}</span>
        <span style={{ flex: 1, height: 1, background: C.rule }} />
        {onAll && <button className="kd-btn kd-act" onClick={onAll}>ALL</button>}
        {onNone && <button className="kd-btn kd-act" onClick={onNone}>NONE</button>}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: S[1] }}>{children}</div>
    </div>
  );
}

const THEME_LABEL = { system: "System", light: "Light", dark: "Dark" };

export default function SettingsView({ settings, onChange, wordCount, formCount, theme, onTheme }) {
  const set = (patch) => onChange({ ...settings, ...patch });
  const toggle = (key, id) =>
    set({ [key]: settings[key].includes(id) ? settings[key].filter((x) => x !== id) : [...settings[key], id] });
  const forms = allForms();

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: S[4] }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: S[3], marginBottom: S[4], flexWrap: "wrap" }}>
        <span className="kd-micro">Preset</span>
        {Object.keys(PRESETS).map((name) => (
          <button key={name} className="kd-btn kd-form-chip" onClick={() => onChange(applyPreset(name, settings))}
            style={{ border: "1px solid " + C.ink, background: "transparent", color: C.ink, padding: "6px 11px", fontSize: T.fine }}>
            {name}
          </button>
        ))}
        <span className="kd-micro" style={{ marginLeft: "auto", color: C.stem }}>
          {wordCount} words · {formCount} forms
        </span>
      </div>

      <Section label="Appearance">
        {THEMES.map((t) => (
          <Chip key={t} on={theme === t} onClick={() => onTheme(t)}>{THEME_LABEL[t]}</Chip>
        ))}
        <span style={{ fontSize: T.fine, color: C.muted, lineHeight: 1.5, flex: "1 1 200px", alignSelf: "center" }}>
          System follows your device. Stored on this device only — it is not part of the deck you export.
        </span>
      </Section>

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
                <span style={{ fontFamily: MONO, fontSize: T.micro, marginLeft: S[1], opacity: .7 }}>{f.jp}</span>
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
            <span style={{ fontFamily: MONO, fontSize: T.micro, marginLeft: S[1], opacity: .7 }}>{m.jp}</span>
          </Chip>
        ))}
      </Section>

      <Section label="Word classes"
        onAll={() => set({ types: TYPES.map((t) => t.id) })}
        onNone={() => set({ types: [] })}>
        {TYPES.map((t) => (
          <Chip key={t.id} on={settings.types.includes(t.id)} onClick={() => toggle("types", t.id)}>
            {t.label}
            <span style={{ fontFamily: MONO, fontSize: T.micro, marginLeft: S[1], opacity: .7 }}>{typeLabel(t.id)}</span>
          </Chip>
        ))}
      </Section>

      <Section label="Word scope">
        {JLPT.map((lv) => (
          <Chip key={lv} on={settings.jlpt.includes(lv)} onClick={() => toggle("jlpt", lv)}>{lv}</Chip>
        ))}
        <span style={{ width: S[4] }} />
        <Chip on={settings.trans.includes("trans")} onClick={() => toggle("trans", "trans")}>他動詞</Chip>
        <Chip on={settings.trans.includes("intrans")} onClick={() => toggle("trans", "intrans")}>自動詞</Chip>
        <span style={{ width: S[4] }} />
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

      {/* Deliberately not part of `settings`: that object is what Export JSON writes out,
          and a key does not belong in a file you hand to someone else. It stays in this
          browser's localStorage only, so each device is entered once. */}
      <Section label="API key">
        <div style={{ width: "100%" }}>
          <input type="password" defaultValue={getKey()} onChange={(e) => setKey(e.target.value)}
            autoComplete="off" spellCheck={false} aria-label="Anthropic API key"
            placeholder="sk-ant-..."
            style={{
              width: "100%", maxWidth: 420, padding: "8px 10px", fontFamily: MONO, fontSize: T.sm,
              border: "1px solid " + C.rule, background: "transparent", color: C.ink,
            }} />
          <div style={{ fontSize: T.fine, color: C.muted, lineHeight: 1.6, marginTop: S[2] }}>
            Optional. Lookup uses the built-in JMdict dictionary and needs no key — a key only
            adds example sentences, and lookup for words outside the common 26,000. Stored on
            this device, not in the deck you export. Anyone with this phone unlocked can read it
            back, so use a key you can revoke.
          </div>
        </div>
      </Section>

      <div style={{ fontSize: T.fine, color: C.muted, lineHeight: 1.6, borderTop: "1px solid " + C.ruleSoft, paddingTop: S[3] }}>
        Word scope only filters words that carry the matching tag. A word with no JLPT level,
        no transitivity or no frequency is never hidden, so nothing you have already added
        can disappear here.
      </div>
    </div>
  );
}
