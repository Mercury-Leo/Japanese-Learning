/* Builds src/dict.json and src/dict-rare.json — the offline lookup dictionary.
   Run: npm run dict   (the output is committed; rerun only to pick up a newer JMdict)

   Source: JMdict, by the Electronic Dictionary Research and Development Group,
   via github.com/scriptin/jmdict-simplified which publishes it as JSON so nothing
   here has to parse the 60MB XML. JMdict is CC BY-SA 4.0 — the attribution in
   README.md and the app footer is a licence condition, not a courtesy.

   Two files, because the whole of JMdict is 200k entries and a phone should not
   download all of it to look up 食べる. The common subset (~22k entries, the words
   a learner actually meets) is dict.json and loads on the first lookup; everything
   else is dict-rare.json and loads only when the common tier misses. Splitting
   here rather than downloading two assets keeps the two halves from drifting apart
   at different release tags. */
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
const asset = rel.assets.find((a) => /^jmdict-eng-\d.*\.json\.tgz$/.test(a.name));
if (!asset) throw new Error("no jmdict-eng tgz in release " + rel.tag_name);

console.log("fetching " + asset.name + " (" + (asset.size / 1048576).toFixed(1) + " MB)");
const tgz = await fetch(asset.browser_download_url);
if (!tgz.ok) throw new Error("download returned " + tgz.status);
const raw = JSON.parse(untarSingle(gunzipSync(Buffer.from(await tgz.arrayBuffer()))));

const common = [];
const rare = [];
const tally = {};
const add = (out, word, reading, meaning, type, tr) => {
  out.push([word, reading, meaning, type, tr]);
  if (out === common) tally[type] = (tally[type] || 0) + 1;
};

for (const w of raw.words) {
  /* `sk`/`sK` mark a search-only form — a spelling that exists so lookups hit, not
     one to show a learner. Dropping them costs a few lookups and saves showing a
     learner a spelling JMdict itself calls irregular.
     ponytail: if a miss ever turns out to be a search-only form, index them with a
     sixth column holding the form to display instead. */
  const kana = w.kana.filter((k) => !k.tags.includes("sk"));
  if (!kana.length) continue;
  const kanji = w.kanji.filter((k) => !k.tags.includes("sK"));
  /* The head is what the learner sees in the picker and adds to the deck, so a
     common everyday kanji beats a rare one (`rK`); a word with no common kanji at
     all still heads with kanji if it has any, or it is a kana word. */
  const head = (kanji.find((k) => k.common && !k.tags.includes("rK")) || kanji[0] || kana[0]).text;

  let type = null;
  let tr = "";
  for (const s of w.sense) {
    const c = wordClass(s.partOfSpeech);
    if (c) { type = c; tr = trans(s.partOfSpeech); break; }
  }
  const g = gloss(w.sense[0]);
  /* jmdict-simplified's own "common" release is exactly the entries with a form
     carrying a priority code, so splitting on that here reproduces it. */
  const out = w.kanji.some((k) => k.common) || w.kana.some((k) => k.common) ? common : rare;

  /* One row per surface form, not one per entry. 分かる, 解る and 判る are all
     わかる and a learner types whichever one they read; indexing only the head meant
     two of the three found nothing. Kanji forms pair with the first reading and
     extra readings pair with the head, rather than every kanji against every kana —
     the cross product triples the file to answer queries nobody types. */
  for (const k of new Set([head, ...kanji.map((k) => k.text)]))
    add(out, k, kana[0].text, g, type || "noun", tr);
  for (const k of kana.slice(1))
    add(out, head === kana[0].text ? k.text : head, k.text, g, type || "noun", tr);

  /* JMdict lists 勉強 as a noun tagged `vs` — "takes する" — never as 勉強する.
     Faithful to the dictionary, useless to a conjugation drill: without this the
     whole common subset yields 46 する-verbs. Emit the する form alongside the
     noun, which is the form buildSuru() expects and the form a learner drills. */
  if (w.sense.some((s) => s.partOfSpeech.includes("vs")) && !head.endsWith("する"))
    add(out, head + "する", kana[0].text + "する", g, "suru", trans(w.sense[0].partOfSpeech));
}

for (const [name, rows] of [["dict", common], ["dict-rare", rare]]) {
  const json = JSON.stringify(rows);
  writeFileSync(new URL(`../src/${name}.json`, import.meta.url), json);
  console.log(name + ".json · " + rows.length + " rows · " + (json.length / 1048576).toFixed(1) + " MB");
}
console.log(rel.tag_name.split("+")[0]);
console.log(tally);
