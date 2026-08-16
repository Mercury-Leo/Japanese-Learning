import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/* Relative base so the build works at a domain root (*.pages.dev, Netlify) and
   under a subpath (GitHub Pages project sites) without a rebuild. */
export default defineConfig({ base: "./", plugins: [react()] });
