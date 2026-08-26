/* Which words arrived since the last brief, grouped by the day they arrived on.
   Pure policy: no React, no storage, no DOM, so test/engine.test.mjs reaches it.

   `now` is a parameter rather than a Date.now() in here, for the same reason
   record() in stats.js takes one — "Today" has to be assertable without moving
   the clock. */

/** Local midnight of the day `t` falls in. Local, not UTC: the labels below say
 *  "Today", so the grouping has to agree with the learner's calendar. */
const midnight = (t) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/* Yesterday is the previous calendar day, not `today - 86400000` — those differ
   by an hour on the two days a year the clocks move, and on one of them the
   subtraction lands back inside today. */
function dayLabel(day, now) {
  const today = midnight(now);
  if (day === today) return "Today";
  const d = new Date(today);
  d.setDate(d.getDate() - 1);
  if (day === d.getTime()) return "Yesterday";
  return new Date(day).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** Newest day first, newest word first within each day. A word with no addedAt
 *  counts as old: only hand-edited or truncated storage produces one, and
 *  flooding the brief is worse than leaving it out. */
export function newSince(words, since, now) {
  const fresh = words
    .filter((w) => (Number(w.addedAt) || 0) > since)
    .sort((a, b) => b.addedAt - a.addedAt);

  const days = [];
  for (const w of fresh) {
    const day = midnight(w.addedAt);
    const last = days[days.length - 1];
    /* The sort means one day's words are contiguous, so the tail is the only
       group this word can belong to. */
    if (last && last.day === day) last.words.push(w);
    else days.push({ day, label: dayLabel(day, now), words: [w] });
  }
  return days;
}

export const briefCount = (days) => days.reduce((n, g) => n + g.words.length, 0);
