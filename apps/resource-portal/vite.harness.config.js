import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The portal with sample data and no sign-in, for design work and
// screenshots: `npx vite --config vite.harness.config.js`. Add ?role=tutor for
// the tutor's view. The production build (vite.config.js) never sees this.
const here = path.dirname(fileURLToPath(import.meta.url));
const swaps = {
  [path.join(here, "src/backend/resourcesApi.js")]: path.join(here, "harness/mocks/resourcesApi.js"),
  [path.join(here, "src/AuthProvider.jsx")]: path.join(here, "harness/mocks/AuthProvider.jsx"),
  [path.join(here, "src/analytics.js")]: path.join(here, "harness/mocks/analytics.js"),
  [path.join(here, "src/firebaseConfig.js")]: path.join(here, "harness/mocks/firebaseConfig.js"),
  [path.join(here, "src/backend/studentsApi.js")]: path.join(here, "harness/mocks/studentsApi.js"),
};

function swapBackend() {
  return {
    name: "harness-swap-backend",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!importer || importer.includes("/harness/mocks/")) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      return resolved && swaps[resolved.id] ? swaps[resolved.id] : null;
    },
  };
}

export default defineConfig({
  // The harness is the site root, so every portal route falls back to its
  // index.html, never to the real one.
  root: path.join(here, "harness"),
  publicDir: path.join(here, "public"),
  plugins: [swapBackend(), react()],
  server: { fs: { allow: [here] } },
});
