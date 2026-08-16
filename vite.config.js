import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/* Relative base so the build works at a domain root (*.pages.dev, Netlify) and
   under a subpath (GitHub Pages project sites) without a rebuild. */
export default defineConfig({
  base: "./",
  plugins: [react()],
  /* dict.json is 26k entries. As a JS array literal the phone pays a full
     JavaScript parse for it; as JSON.parse("…") it is roughly an order of
     magnitude cheaper, which is the difference between a snappy first lookup and
     a visible stall. */
  json: { stringify: true },
  /* The dictionary chunk is deliberately larger than the warning threshold — it
     is lazy-loaded and cached once, not part of the app bundle. */
  build: { chunkSizeWarningLimit: 2000 },
});
