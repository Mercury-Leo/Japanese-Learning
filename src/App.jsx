/* The shell: what is loaded, what is on screen, and the deck view itself.
   Everything else is a component file — see ui.jsx for the shared parts. */
import { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, X, Search, Settings as Cog } from "lucide-react";

import { C, ROLE_COLOR, MINCHO, SANS, MONO, T, JP, RUBY, S, P, applyTheme } from "./theme.js";
import { APP_CSS } from "./app-css.js";
import { storage, KEY, SKEY, GKEY, PKEY, readTheme, writeTheme, readSeenVersion, writeSeenVersion } from "./storage.js";
import { EMPTY, record, mergeStats, mergeStored } from "./stats.js";
import { useSpeechStatus, setAudioReporter } from "./speech.js";
import { warmDict } from "./api.js";
import { romaji, conjugate, TYPES, typeLabel, GROUPS, SEED, FORM_HINT } from "./engine.js";
import { DEFAULTS, mergeSettings, visibleForms, wordInScope, SCRIPTS } from "./settings.js";
import { Word, Ladder, Strip, Chip, ConfirmModal, WhatsNew } from "./ui.jsx";
import AddWord from "./AddWord.jsx";
import DeckTools from "./DeckTools.jsx";
import StackPanel from "./StackPanel.jsx";
import ExamplesPanel from "./ExamplesPanel.jsx";
import VocabView from "./VocabView.jsx";
import Quiz from "./Quiz.jsx";
import SettingsView from "./SettingsView.jsx";
import ProgressView from "./ProgressView.jsx";
import ChartsView from "./ChartsView.jsx";
import Say from "./Say.jsx";
import Install from "./Install.jsx";
import { CHANGELOG } from "./changelog.js";

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
  const [pendingDelete, setPendingDelete] = useState(null);
  const [view, setView] = useState("deck");
  const [audioNote, setAudioNote] = useState(null);
  const speech = useSpeechStatus();
  const [quizRun, setQuizRun] = useState({ running: false, done: 0, total: 0 });
  const [pendingLeave, setPendingLeave] = useState(false);
  /* main.jsx already applied this before first paint; state just mirrors it so
     the Settings control has something to render against. */
  const [theme, setTheme] = useState(readTheme);
  /* An update announces itself once. Every launch stamps this build's version on
     the device; a launch that finds an older stamp says so, and dismissing it is
     the end of it until the next bump. A device with no stamp — first run, or
     first run since this shipped — is stamped in silence, because arriving is not
     an update. */
  const [lastVersion] = useState(readSeenVersion);
  const [updateSeen, setUpdateSeen] = useState(false);
  /* Everything above the entry this device last ran: three skipped builds read as
     three sections. A stamp older than the changelog itself shows the lot, and a
     bump with nothing written about it shows nothing at all. */
  const notes = (() => {
    if (!lastVersion || lastVersion === __VERSION__ || updateSeen) return [];
    const i = CHANGELOG.findIndex((e) => e.version === lastVersion);
    return i === -1 ? CHANGELOG : CHANGELOG.slice(0, i);
  })();

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
    if (lastVersion !== __VERSION__) writeSeenVersion(__VERSION__);
  }, [lastVersion]);

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
  const readingOut = form ? form.segs.map((s) => s.kana).join("") : "";
  const activeSeg = form && segIdx != null ? form.segs[segIdx] : null;

  /* The romaji fold means every keystroke re-romanises the whole deck, so this
     runs once per query rather than once per render — and the query is folded
     once rather than once per word, which is where it used to sit. */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return scopedWords;
    return scopedWords.filter((w) => (w.word + w.reading + w.meaning + romaji(w.reading)).toLowerCase().includes(q));
  }, [scopedWords, query]);

  /** On a narrow screen the deck sits above the stage, so selecting a word has
   *  to bring the breakdown into view or the tap looks like it did nothing. */
  function revealStage() {
    if (!window.matchMedia || !window.matchMedia("(max-width: 820px)").matches) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.querySelector(".kd-stage")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
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

  function addWord(entry) {
    setWords((ws) => [entry, ...ws]);
    setSelId(entry.id);
    setAdding(false);
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

  /** Merge an imported deck, skipping entries already present, and merge in
   *  the imported stats (if any) alongside them. */
  function importWords(incoming, incomingStats) {
    const have = new Set(words.map((w) => w.word + "|" + w.reading));
    const seen = new Set();
    const fresh = incoming.filter((w) => {
      const k = w.word + "|" + w.reading;
      if (have.has(k) || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (fresh.length) setWords((ws) => [...fresh, ...ws]);
    /* Stats key on word|reading, the same pair used for dedup above, so they line
       up with no id mapping. mergeStats is idempotent (max, not sum), so this is
       safe whether the import restores progress onto an already-intact deck or
       repeats a prior import by accident. */
    if (incomingStats) setStats((s) => mergeStats(s, incomingStats));
    return fresh.length;
  }

  function setType(id, t) {
    setWords((ws) => ws.map((w) => (w.id === id ? { ...w, type: t } : w)));
  }

  const godanRow = selected?.type === "godan" ? (selected.reading || selected.word).slice(-1) : null;
  const ladderActive = activeSeg && activeSeg.role === "stem" ? activeSeg.kana : null;

  return (
    <div className="kd-app" style={{ background: C.ground, color: C.ink, fontFamily: SANS }}>
      <style>{APP_CSS}</style>

      {/* masthead */}
      <header style={{ borderBottom: "1px solid " + C.rule, background: C.panel }}>
        {/* Two rows. Identity and the settings cog own the top one; the four
            destinations sit centred beneath, which is what makes them read as
            the bar rather than as one more control crowded against the edge.
            Settings is a cog and not a fifth tab because it is somewhere you
            visit occasionally, not a peer of the things you work in — and
            Script moved in there with it, being the one masthead control that
            changed what you were looking at rather than where you were. */}
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "12px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: S[3] }}>
            {/* Title and tagline share a baseline. */}
            <div style={{ display: "flex", alignItems: "baseline", gap: S[3], minWidth: 0, marginRight: "auto" }}>
              <div style={{ fontFamily: MINCHO, fontSize: 26, letterSpacing: ".08em", lineHeight: 1 }}>言葉帳</div>
              <div className="kd-tagline kd-micro" style={{ letterSpacing: ".22em" }}>
                Kotoba-chō · word deck &amp; morphology
              </div>
            </div>
            <span className="kd-tagline kd-micro" style={{ letterSpacing: ".16em" }}>
              {scopedWords.length} ENTR{scopedWords.length === 1 ? "Y" : "IES"}
            </span>
            <button className="kd-btn kd-cog" onClick={() => goto("settings")}
              title="Settings" aria-label="Settings"
              aria-current={view === "settings" ? "page" : undefined}
              style={{
                background: view === "settings" ? C.stem : "transparent",
                color: view === "settings" ? C.panel : C.muted,
                border: "1px solid " + (view === "settings" ? C.stem : C.rule),
              }}>
              <Cog size={15} />
            </button>
          </div>

          <div style={{ display: "flex", justifyContent: "center", marginTop: S[3] }}>
            <nav className="kd-seg" aria-label="Views">
              {[["deck", "Deck"], ["vocab", "Vocab"], ["quiz", "Quiz"], ["charts", "Charts"], ["progress", "Progress"]].map(([id, label]) => {
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
            </nav>
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
          <Quiz words={scopedWords} allWords={words} script={script} onProgress={setQuizRun}
                settings={settings} stats={stats} onRecord={recordAnswer} />
        </div>
      )}

      {view === "vocab" && (
        <VocabView
          words={words}
          scopedCount={scopedWords.length}
          script={script}
          settings={settings}
          stats={stats}
          onOpen={(id) => { setSelId(id); setView("deck"); }}
          onAdd={() => { warmDict(); setAdding(true); setView("deck"); }}
          onDelete={removeWord}
        />
      )}

      {view === "charts" && <ChartsView audio={settings.show.audio} />}

      {view === "progress" && <ProgressView stats={stats} words={words} />}

      {view === "settings" && (
        <SettingsView
          settings={settings}
          onChange={setSettings}
          wordCount={scopedWords.length}
          formCount={settings.formIds.length}
          theme={theme}
          onTheme={setTheme}
          script={script}
          onScript={setScript}
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
            <button className="kd-btn" onClick={() => { if (!adding) warmDict(); setAdding(!adding); }} title="Add a word"
              style={{ background: adding ? C.ink : C.stem, color: C.panel, width: 38, display: "grid", placeItems: "center" }}>
              {adding ? <X size={15} /> : <Plus size={15} />}
            </button>
          </div>

          {adding && <AddWord onAdd={addWord} seed={query} />}

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
                    padding: P.row, borderBottom: "1px solid " + C.ruleSoft,
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
                        style={{ background: C.stem, color: C.panel, padding: P.btn, fontSize: T.fine }}>
                        Delete
                      </button>
                      <button className="kd-btn" onClick={() => setPendingDelete(null)} autoFocus
                        style={{ border: "1px solid " + C.rule, color: C.muted, padding: P.btn, fontSize: T.fine, background: C.panel }}>
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
                    display: "flex", alignItems: "center", gap: S[3], padding: P.row, cursor: "pointer",
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
                    style={{ padding: S[1] + 2, margin: -2, lineHeight: 0 }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
          <DeckTools words={words} stats={stats} onImport={importWords} />
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
              {/* Gloss on the word's own baseline, classes on a line of their own
                  beneath. Stacked in a right-hand column the gloss rode up level
                  with the romaji, reading as a caption for nothing. */}
              <div style={{ marginBottom: S[1] }}>
                {settings.show.romaji && (
                  <div className="kd-micro">{romaji(selected.reading).toUpperCase()}</div>
                )}
                <div style={{ display: "flex", alignItems: "flex-end", gap: S[3], flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: S[1] }}>
                    <div style={{ fontFamily: MINCHO, fontSize: JP.lg }}>
                      <Word text={selected.word} kana={selected.reading} mode={script} ruby={RUBY.lg} />
                    </div>
                    <Say text={selected.reading} size={15} label="Play the word" enabled={settings.show.audio} />
                  </div>
                  <div style={{ fontSize: T.base, color: C.ink, paddingBottom: S[2] }}>
                    {selected.meaning || <span style={{ color: C.muted }}>no gloss</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: S[1], marginTop: S[2], flexWrap: "wrap" }}>
                  {classChoices.map((t) => (
                    <Chip key={t.id} on={selected.type === t.id} onClick={() => setType(selected.id, t.id)} title={t.hint}
                      style={{ fontFamily: MONO, fontSize: T.micro, letterSpacing: ".08em" }}>
                      {t.label.toUpperCase()}
                    </Chip>
                  ))}
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

                    {/* Keyed on the form so switching forms replays the fade, and the
                        same Strip the stack builder and the quiz reveal draw — three
                        hand-rolled copies of it had drifted to three border widths. */}
                    <div key={form.id} className="kd-swap">
                      <Strip segs={form.segs} script={script} onPick={setSegIdx} activeIdx={segIdx}
                             glosses={settings.show.glosses} romaji={settings.show.romaji} />
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
                              aria-pressed={on} title={FORM_HINT[f.id]}
                              style={{
                                border: "1px solid " + (on ? C.ink : C.rule),
                                background: on ? C.ink : C.panel,
                                color: on ? C.panel : C.ink,
                                padding: P.chip, textAlign: "left", minWidth: 84,
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

      {notes.length > 0 && (
        <WhatsNew version={__VERSION__} entries={notes} onClose={() => setUpdateSeen(true)} />
      )}

      <Install offset={!!audioNote} />

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
