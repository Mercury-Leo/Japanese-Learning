/* The artifact ran on Claude's window.storage. Outside it, localStorage does the
   same job — kept behind the same async shape so App.jsx is unchanged. */
export const KEY = "kotoba-deck-v1";
export const SKEY = "kotoba-script-v1";
export const GKEY = "kotoba-settings-v1";
export const TKEY = "kotoba-theme-v1";
export const PKEY = "kotoba-stats-v1";
export const IKEY = "kotoba-install-v1";
export const VKEY = "kotoba-version-v1";
export const BKEY = "kotoba-brief-v1";

/* Theme is the one preference that has to be known before the first paint, so it
   gets a synchronous pair rather than going through the async shape below. It is
   deliberately not part of `settings`: that object is what deck export writes
   out, and which theme this device uses is nobody else's business. */
export function readTheme() {
  try {
    const v = localStorage.getItem(TKEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}
export function writeTheme(pref) {
  try { localStorage.setItem(TKEY, pref); } catch { /* session-only */ }
}

/* The version this device last ran. Synchronous like the theme pair, and for the
   same reason as it being separate from `settings`: which build a phone last
   booted is not part of the deck anyone exports. */
export function readSeenVersion() {
  try { return localStorage.getItem(VKEY); } catch { return null; }
}
export function writeSeenVersion(v) {
  try { localStorage.setItem(VKEY, v); } catch { /* session-only */ }
}

/* When this device last read a brief. Synchronous like the two pairs above, and
   separate from `settings` for the same reason: which words this phone has been
   shown is not part of the deck anyone exports, and a device that imports a deck
   should get its own brief rather than inheriting the exporter's. */
export function readBriefAt() {
  try { return Number(localStorage.getItem(BKEY)) || 0; } catch { return 0; }
}
export function writeBriefAt(t) {
  try { localStorage.setItem(BKEY, String(t)); } catch { /* session-only */ }
}

export const storage = {
  async get(key) {
    const v = localStorage.getItem(key);
    if (v === null) throw new Error("no value for " + key);
    return { key, value: v };
  },
  async set(key, value) {
    localStorage.setItem(key, value);
    return { key, value };
  },
  async remove(key) {
    localStorage.removeItem(key);
    return { key, deleted: true };
  },
};
