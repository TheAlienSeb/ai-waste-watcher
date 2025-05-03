
import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "AI Waste Watcher",
  version: "1.0.0",
  description: "Track the environmental impact of your AI interactions",

  action: {
    default_popup: "src/popup.html"
  },

  background: {
    service_worker: "src/background.ts",
    type: "module"
  },

  content_scripts: [
    {
      matches: [
        "https://chat.openai.com/*",
        "https://claude.ai/*",
        "https://perplexity.ai/*",
        "https://bard.google.com/*",
        "https://cohere.ai/*",
        "https://www.anthropic.com/*"
      ],
      js: ["src/content.ts"]
    }
  ],

  permissions: ["storage", "tabs", "webNavigation"],

  icons: {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
});
