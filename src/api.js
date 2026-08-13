import { TYPES } from "./engine.js";

/* In the Claude artifact these calls needed no credentials. Outside it they do.
   NOTE: a key in a browser bundle is visible to anyone who opens devtools. Fine
   for a local tool on your own machine; put a tiny server proxy in front of it
   before this goes anywhere else. */
const API_KEY = import.meta.env?.VITE_ANTHROPIC_API_KEY;
const MODEL = "claude-sonnet-4-6";

async function ask(prompt) {
  if (!API_KEY) {
    throw new Error("No API key. Copy .env.example to .env, add VITE_ANTHROPIC_API_KEY, and restart the dev server.");
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
  const { jlpt, transitivity, common, ...rest } = c;
  return { ...rest, ...tagsFromLookup({ jlpt, transitivity, common }) };
}

export async function lookupWord(query) {
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
