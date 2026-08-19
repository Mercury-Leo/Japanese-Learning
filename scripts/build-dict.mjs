/* Builds src/dict.json — the offline lookup dictionary.
   Run: npm run dict   (the output is committed; rerun only to pick up a newer JMdict)

   Source: JMdict, by the Electronic Dictionary Research and Development Group,
   via github.com/scriptin/jmdict-simplified which publishes it as JSON so nothing
   here has to parse the 60MB XML. JMdict is CC BY-SA 4.0 — the attribution in
   README.md and the app footer is a licence condition, not a courtesy.

   We take the "common" subset (~22k entries, the words a learner actually meets)
   rather than the full 200k, because the whole file ships to a phone. */
import { writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const REPO = "https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest";

/* The archive holds exactly one file, so a full tar parser would be dead weight:
   the header is 512 bytes with the size as octal at offset 124. */
function untarSingle(buf) {
  const size = parseInt(buf.toString("ascii", 124, 136).replace(/\0.*$/, "").trim(), 8);
  return buf.toString("utf8", 512, 512 + size);
}

/* Which of the app's seven classes a JMdict part-of-speech list describes.
   Verb classes win over noun: 話 is a noun but 話す is what you conjugate, and an
   entry carrying both should land in the drill rather than the vocabulary pile. */
function wordClass(pos) {
  if (pos.includes("vk")) return "kuru";
  if (pos.some((p) => p.startsWith("v5"))) return "godan";
  if (pos.includes("v1") || pos.includes("v1-s")) return "ichidan";
  if (pos.includes("vs-i") || pos.includes("vs-s")) return "suru";
  if (pos.includes("adj-i") || pos.includes("adj-ix")) return "i-adj";
  if (pos.includes("adj-na")) return "na-adj";
  return null;
}

const trans = (pos) => (pos.includes("vt") ? "trans" : pos.includes("vi") ? "intrans" : "");

/* Glosses are a display string, not data — one line under a word in a list. The
   first sense is the one a learner wants; the rest are why paper dictionaries are
   thick. */
function gloss(sense) {
  const g = sense.gloss.map((x) => x.text).join("; ");
  return g.length > 62 ? g.slice(0, 60) + "…" : g;
}

const res = await fetch(REPO);
if (!res.ok) throw new Error("GitHub API returned " + res.status);
const rel = await res.json();
const asset = rel.assets.find((a) => /^jmdict-eng-common-.*\.json\.tgz$/.test(a.name));
if (!asset) throw new Error("no jmdict-eng-common tgz in release " + rel.tag_name);

console.log("fetching " + asset.name + " (" + (asset.size / 1048576).toFixed(1) + " MB)");
const tgz = await fetch(asset.browser_download_url);
if (!tgz.ok) throw new Error("download returned " + tgz.status);
const raw = JSON.parse(untarSingle(gunzipSync(Buffer.from(await tgz.arrayBuffer()))));

const out = [];
const tally = {};
const add = (word, reading, meaning, type, tr) => {
  out.push([word, reading, meaning, type, tr]);
  tally[type] = (tally[type] || 0) + 1;
};

for (const w of raw.words) {
  /* `sk` marks a search-only form — a spelling that exists so lookups hit, not one
     to show a learner. Same for `rK`, a rare kanji form. */
  const kana = w.kana.find((k) => !k.tags.includes("sk")) || w.kana[0];
  if (!kana) continue;
  const kanji = w.kanji.find((k) => k.common && !k.tags.includes("rK"));
  const head = kanji ? kanji.text : kana.text;

  let type = null;
  let tr = "";
  for (const s of w.sense) {
    const c = wordClass(s.partOfSpeech);
    if (c) { type = c; tr = trans(s.partOfSpeech); break; }
  }
  add(head, kana.text, gloss(w.sense[0]), type || "noun", tr);

  /* JMdict lists 勉強 as a noun tagged `vs` — "takes する" — never as 勉強する.
     Faithful to the dictionary, useless to a conjugation drill: without this the
     whole common subset yields 46 する-verbs. Emit the する form alongside the
     noun, which is the form buildSuru() expects and the form a learner drills. */
  if (w.sense.some((s) => s.partOfSpeech.includes("vs")) && !head.endsWith("する")) {
    add(head + "する", kana.text + "する", gloss(w.sense[0]), "suru", trans(w.sense[0].partOfSpeech));
  }
}

writeFileSync(new URL("../src/dict.json", import.meta.url), JSON.stringify(out));
console.log(rel.tag_name.split("+")[0] + " · " + out.length + " entries");
console.log(tally);
