import { C, MINCHO, MONO, T, S, P, THEMES } from "./theme.js";
import { TYPES, MODS, GROUPS, typeLabel, FORM_HINT } from "./engine.js";
import { allForms, PRESET_NAMES, applyPreset, contentOf, isContentPatch, sameContent, JLPT, SCRIPTS } from "./settings.js";
import { getKey, setKey } from "./api.js";
import { Chip } from "./ui.jsx";

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

/* One option per line: the toggle itself, with what it means beside it. An
   explanation runs one line or six depending on the form, so the rows cannot
   share a height — the rule between them is what keeps the column readable
   instead of looking like drift. Same list idiom as the vocabulary rows. */
function Options({ items, on, onToggle }) {
  return (
    <div style={{ width: "100%", borderTop: "1px solid " + C.ruleSoft }}>
      {items.map((it) => (
        <div key={it.id} style={{
          display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: S[2],
          padding: S[2] + "px 0", borderBottom: "1px solid " + C.ruleSoft,
        }}>
          <Chip on={on(it.id)} onClick={() => onToggle(it.id)} style={{ flex: "0 0 170px" }}>
            {it.label}
            <span style={{ fontFamily: MONO, fontSize: T.micro, marginLeft: S[1], opacity: .7 }}>{it.jp}</span>
          </Chip>
          {/* No offset: the explanation's first line starts level with the chip's
              top edge, so the two columns begin on the same line. */}
          <span style={{ flex: "1 1 150px", fontSize: T.fine, color: C.muted, lineHeight: 1.5 }}>{it.hint}</span>
        </div>
      ))}
    </div>
  );
}

const THEME_LABEL = { system: "System", light: "Light", dark: "Dark" };

export default function SettingsView({ settings, onChange, wordCount, formCount, theme, onTheme, script, onScript }) {
  /* Touching what is learnt drops you into Custom — the named preset no longer
     describes the screen, so it must stop claiming to. Display, script and theme
     edits are not content and leave the preset alone. */
  const set = (patch) =>
    onChange({ ...settings, ...patch, ...(isContentPatch(patch) ? { preset: "Custom" } : null) });
  const toggle = (key, id) =>
    set({ [key]: settings[key].includes(id) ? settings[key].filter((x) => x !== id) : [...settings[key], id] });
  const forms = allForms();

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: S[4] }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: S[3], marginBottom: S[4], flexWrap: "wrap" }}>
        <span className="kd-micro">Preset</span>
        {PRESET_NAMES.map((name) => {
          const on = settings.preset === name;
          return (
            <Chip key={name} on={on} ink onClick={() => onChange(applyPreset(name, settings))}
              title={name === "Custom" ? "Your own saved setup" : undefined}>
              {name}
            </Chip>
          );
        })}
        {/* Only offered once there is something to save: on Custom, with edits that
            the saved slot does not already hold. */}
        {settings.preset === "Custom" && !sameContent(settings, settings.custom) && (
          <button className="kd-btn kd-act" onClick={() => set({ custom: contentOf(settings) })}
            title="Save these forms, modifiers, word classes and JLPT levels as your Custom preset">
            OVERRIDE CUSTOM
          </button>
        )}
        <span className="kd-micro" style={{ marginLeft: "auto", color: C.stem }}>
          {wordCount} words · {formCount} forms
        </span>
      </div>

      <Section label="Script">
        {SCRIPTS.map((s) => (
          <Chip key={s.id} on={script === s.id} ink onClick={() => onScript(s.id)} title={s.hint}
            style={{ fontFamily: MINCHO, fontSize: T.md }}>{s.label}</Chip>
        ))}
        <span style={{ fontSize: T.fine, color: C.muted, lineHeight: 1.5, flex: "1 1 200px", alignSelf: "center" }}>
          How every word is written across the app — the deck, the breakdown and the quiz all follow it.
        </span>
      </Section>

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
            <Options items={items.map((f) => ({ ...f, hint: FORM_HINT[f.id] }))}
              on={(id) => settings.formIds.includes(id)} onToggle={(id) => toggle("formIds", id)} />
          </Section>
        );
      })}

      <Section label="Stack modifiers"
        onAll={() => set({ modIds: MODS.map((m) => m.id) })}
        onNone={() => set({ modIds: [] })}>
        <Options items={MODS} on={(id) => settings.modIds.includes(id)} onToggle={(id) => toggle("modIds", id)} />
      </Section>

      <Section label="Word classes"
        onAll={() => set({ types: TYPES.map((t) => t.id) })}
        onNone={() => set({ types: [] })}>
        <Options items={TYPES.map((t) => ({ ...t, jp: typeLabel(t.id) }))}
          on={(id) => settings.types.includes(id)} onToggle={(id) => toggle("types", id)} />
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
              width: "100%", maxWidth: 420, padding: P.btn, fontFamily: MONO, fontSize: T.sm,
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
