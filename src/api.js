import { TYPES, toKana, settleKana } from "./engine.js";

/* In the Claude artifact these calls needed no credentials. Outside it they do.
   The key is entered in Settings and lives in this browser's localStorage, so it
   is never in the bundle and never leaves the device except in the API call
   itself. VITE_ANTHROPIC_API_KEY still works as a build-time fallback for desktop
   dev. Anyone holding the phone (or its devtools) can still read it — the only
   way to truly hide it is a server proxy that keeps the key server-side. */
const AKEY = "kotoba-api-key-v1";
const MODEL = "claude-sonnet-4-6";

export const getKey = () => localStorage.getItem(AKEY) || import.meta.env?.VITE_ANTHROPIC_API_KEY || "";

export function setKey(v) {
  const k = (v || "").trim();
  if (k) localStorage.setItem(AKEY, k);
  else localStorage.removeItem(AKEY);
}

async function ask(prompt) {
  const API_KEY = getKey();
  if (!API_KEY) {
    throw new Error("No API key. Add one under Settings → API key.");
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error("API returned " + res.status + ". Check the key and your credit balance.");
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

const LOOKUP_PROMPT = `You are a Japanese dictionary lookup. The input may be romaji, kana, or kanji.
Reply with ONLY a JSON object. No markdown fences, no preamble:
{"candidates":[{"word":"行く","reading":"いく","meaning":"to go","type":"godan","jlpt":"N5","transitivity":"intransitive","common":true}]}
Rules:
- word: the standard written form, in kanji if the word is normally written that way
- reading: hiragana only (katakana only for loanwords)
- meaning: short English gloss, under 60 characters, senses separated by semicolons
- type: exactly one of godan, ichidan, suru, kuru, i-adj, na-adj, noun
- jlpt: the JLPT level, exactly one of N5, N4, N3, N2, N1 — omit if unsure
- transitivity: exactly one of transitive, intransitive, n/a (use n/a for adjectives and nouns) — omit if unsure
- common: true if the word is in everyday use, false if rare or literary
- If the input is ambiguous (romaji matching several words, e.g. "kaeru"), return up to 3 candidates, most common first
- If you cannot identify it, return {"candidates":[]}
Input: `;

const TRANS = { transitive: "trans", intransitive: "intrans", "n/a": "na" };

/** Keep only values we recognise. An unrecognised tag is dropped rather than stored,
 *  because an absent tag is never used to hide a word but a wrong one would be. */
export function tagsFromLookup(raw) {
  const c = raw && typeof raw === "object" ? raw : {};
  const out = {};
  if (["N5", "N4", "N3", "N2", "N1"].includes(c.jlpt)) out.jlpt = c.jlpt;
  if (TRANS[c.transitivity]) out.trans = TRANS[c.transitivity];
  if (typeof c.common === "boolean") out.common = c.common;
  return out;
}

/** Strip the raw wire tag fields, then re-add only validated ones. A plain merge is not
 *  enough: jlpt and common collide with the wire field names, so an invalid value would
 *  survive and hide the word from every scope with no way to undo it. */
export function candidateWithTags(c) {
  const { jlpt, transitivity, common, trans, ...rest } = c;
  return { ...rest, ...tagsFromLookup({ jlpt, transitivity, common }) };
}

/* ---------- offline dictionary ---------- */
/* JMdict, built into src/dict.json by scripts/build-dict.mjs. Loaded on the first
   lookup rather than imported at the top: it is bigger than the rest of the app
   put together, and a learner drilling forms may never open the add-word panel.
   Vite emits it as its own fingerprinted chunk, so the service worker caches it
   once and every later lookup is offline and free. */
let dictP = null;
const dict = () => (dictP ||= import("./dict.json").then((m) => m.default));

/** Start the download when the learner opens the add-word panel rather than when
 *  they hit Look up, so the fetch overlaps with them typing instead of stalling
 *  behind it. Opening the panel is the intent signal — prefetching on load would
 *  spend 600KB of somebody's mobile data on a feature they may never touch. */
export const warmDict = () => { dict(); };

const toCandidate = (r) => ({
  word: r[0],
  reading: r[1],
  meaning: r[2],
  type: r[3],
  ...(r[4] ? { transitivity: r[4] === "trans" ? "transitive" : "intransitive" } : {}),
  common: true,
});

/** Japanese in, candidates out: the written form, then the reading, then a prefix.
 *  Romaji folds in by running the query through the same kana IME the quiz uses,
 *  so `iku`, `いく` and `行く` all land on 行く.
 *
 *  English in is deliberately not handled here. Matching a gloss is easy; ordering
 *  the matches is not — "quiet" hits 静か, 安静, 穏やか and a dozen others, and
 *  picking the one a learner means needs frequency data that JMdict's nf/news
 *  priority codes carry and the simplified JSON drops. A list that answers "quiet"
 *  without 静か in it looks broken, so English falls through to the model below,
 *  which is good at exactly that fuzziness.
 *
 *  Takes rows rather than reading the dictionary itself so the ranking is
 *  reachable from the test suite without loading 26k entries. */
const conjugable = (r) => (r[3] === "noun" ? 0 : 1);

export function rankMatches(rows, query) {
  const q = query.trim();
  if (!q) return [];
  /* settleKana finalises a trailing bare n — without it `toshokan` converts to
     としょかn and matches nothing. Spaces go first so `benkyou suru` reaches
     べんきょうする. */
  const kana = settleKana(toKana(q.toLowerCase().replace(/\s+/g, "")));
  /* One character prefix-matches half the dictionary. */
  const wantPrefix = q.length >= 2 || kana.length >= 2;

  const tiers = [[], [], []];
  for (const r of rows) {
    if (r[0] === q || r[0] === kana) tiers[0].push(r);
    else if (r[1] === q || r[1] === kana) tiers[1].push(r);
    else if (wantPrefix && (r[0].startsWith(q) || (kana.length >= 2 && r[1].startsWith(kana)))) tiers[2].push(r);
  }
  /* Sort inside each tier, never across, so an exact reading always outranks a
     prefix. Within a tier the dictionary's own order is meaningless — 幾 precedes
     行く for いく purely by entry id — and this is a conjugation drill, so the word
     you can take apart wins.
     ponytail: one tie-breaker, not a frequency ranker. The picker shows three
     candidates with class and gloss, so being in the three is what matters. If the
     order ever needs to be right, parse the full JMdict XML for nf01–nf48. */
  return tiers
    .flatMap((t) => t.sort((a, b) => conjugable(b) - conjugable(a)))
    .slice(0, 3)
    .map((r) => candidateWithTags(toCandidate(r)));
}

const lookupLocal = async (query) => rankMatches(await dict(), query);

/** The dictionary first — it is offline, exact, and needs no key. The model only
 *  sees what the common subset does not carry, and only when a key exists; with no
 *  key an unknown word falls through to the add-word form, which is where it would
 *  have ended up anyway. */
export async function lookupWord(query) {
  const local = await lookupLocal(query);
  if (local.length) return local;
  if (!getKey()) return [];
  const parsed = await ask(LOOKUP_PROMPT + query);
  return (parsed.candidates || [])
    .filter((c) => c && c.word && c.reading && TYPES.some((t) => t.id === c.type))
    .slice(0, 3)
    .map(candidateWithTags);
}

export async function fetchExamples(w) {
  const parsed = await ask(`Give 3 short natural Japanese example sentences using ${w.word} (${w.reading}), meaning "${w.meaning || "?"}".
Use a DIFFERENT conjugated form of the word in each one, varying tense and politeness.
Reply with ONLY a JSON object, no markdown fences:
{"examples":[{"ja":"明日学校に行きます。","kana":"あしたがっこうにいきます。","en":"I will go to school tomorrow."}]}
- ja: the sentence written normally, with kanji, under 12 words
- kana: the SAME sentence written entirely in hiragana/katakana
- en: a natural English translation`);
  return (parsed.examples || []).filter((e) => e && e.ja && e.kana).slice(0, 3);
}
