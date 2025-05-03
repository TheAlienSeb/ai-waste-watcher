
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { crx, ManifestV3Export } from "@crxjs/vite-plugin";
import rawManifest from "./public/manifest.json";
import { componentTagger } from "lovable-tagger";

// Cast the manifest to the expected type
const manifest = rawManifest as unknown as ManifestV3Export;

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
    // we let the plugin infer inputs from your manifest
  },

  server: {
    host: "::",
    port: 8080
  }
}));
