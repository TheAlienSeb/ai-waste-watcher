
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./public/manifest.json";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    crx({ manifest: manifest })
  ].filter(Boolean),

  resolve: {
    alias: { "@": path.resolve(__dirname, "src") }
  },

  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: "index.html",
        background: "public/background.js",
        content: "public/content.js"
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name][extname]"
      }
    }
  },

  server: {
    host: "::",
    port: 8080
  }
}));
