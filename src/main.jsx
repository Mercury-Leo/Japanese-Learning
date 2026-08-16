import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

/* Dev only ever gets the network, so no stale-bundle confusion while working.
   Registration fails on a plain-http LAN address — that is expected, and the app
   still runs, it just is not installable there. See README. */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
