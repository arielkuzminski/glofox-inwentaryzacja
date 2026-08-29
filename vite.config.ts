/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // GitHub Pages serwuje projekt z podścieżki repo, nie z roota domeny.
  base: "/glofox-inwentaryzacja/",
  plugins: [react()],
  test: {
    globals: true,
    environment: "node",
  },
});
