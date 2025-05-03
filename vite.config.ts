
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./src/manifest";
import path from "path";
<<<<<<< HEAD
// import { crx } from "@crxjs/vite-plugin";   // <- NEW
import manifest from "./public/manifest.json";     // <- NEW
=======
>>>>>>> c60fcd8c11dd508e77ea9f1e2df8438fb16e647c
import { componentTagger } from "lovable-tagger";

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    mode === "development" && componentTagger(),
<<<<<<< HEAD
    // crx({ manifest })                         // <- NEW
=======
    crx({ manifest })
>>>>>>> c60fcd8c11dd508e77ea9f1e2df8438fb16e647c
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
