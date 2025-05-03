import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { crx } from "@crxjs/vite-plugin";   // <- NEW
import manifest from "public/manifest.json";     // <- NEW
import { componentTagger } from "lovable-tagger";


export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    crx({ manifest })                         // <- NEW
  ].filter(Boolean),

  resolve: {
    alias: { "@": path.resolve(__dirname, "src") }
  },

  build: {
    outDir: "dist",                           // where Chrome will load from
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: "public/background.ts",
        content: "public/content.ts"
      },
      output: {
        // keep stable names (no hashes) so manifest matches
        entryFileNames: "[name].js",
        assetFileNames: "[name][extname]"
      }
    }
  },

  server: {
    host: "::",
    port: 8080
  }
}));