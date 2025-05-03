
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./public/manifest.json";
import path from "path";
import { componentTagger } from "lovable-tagger";

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    crx({ manifest })
  ].filter(Boolean),

  resolve: {
    alias: { "@": path.resolve(__dirname, "src") }
  },

  build: {
    outDir: "dist",
    emptyOutDir: true
    // Let the plugin infer inputs from your manifest
  },

  server: {
    host: "::",
    port: 8080
  }
}));
