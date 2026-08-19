/* The artifact ran on Claude's window.storage. Outside it, localStorage does the
   same job — kept behind the same async shape so App.jsx is unchanged. */
export const KEY = "kotoba-deck-v1";
export const SKEY = "kotoba-script-v1";
export const GKEY = "kotoba-settings-v1";
export const TKEY = "kotoba-theme-v1";
export const PKEY = "kotoba-stats-v1";
export const IKEY = "kotoba-install-v1";

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
