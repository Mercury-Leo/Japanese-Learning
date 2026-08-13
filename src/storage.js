/* The artifact ran on Claude's window.storage. Outside it, localStorage does the
   same job — kept behind the same async shape so App.jsx is unchanged. */
export const KEY = "kotoba-deck-v1";
export const SKEY = "kotoba-script-v1";

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
