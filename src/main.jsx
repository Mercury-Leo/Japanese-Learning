import React from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import App from "./App.jsx";
import { applyTheme } from "./theme.js";
import { readTheme } from "./storage.js";

/* Before render, not in an effect: an explicit light choice on a dark-preferring
   system would otherwise paint dark for a frame and then flip. */
applyTheme(readTheme());

/* Dev only ever gets the network, so no stale-bundle confusion while working.
   Registration fails on a plain-http LAN address — that is expected, and the app
   still runs, it just is not installable there. See README. The Android app skips
   it too: its files ship inside the APK, so there is no network to fall back from
   and an update arrives as a new APK, not as a new index.html. */
if (import.meta.env.PROD && !Capacitor.isNativePlatform() && "serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
