/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // "prompt", not "autoUpdate": this portal holds half-filled invoice and
      // weekly-update forms, and autoUpdate reloads the page out from under
      // them the moment a deploy lands. src/pwa.js surfaces a toast instead.
      registerType: "prompt",
      injectRegister: null,
      includeAssets: ["favicon.png", "icons/*.png"],
      manifest: {
        name: "Tenacity Admin Portal",
        short_name: "Tenacity Admin",
        description: "Enrolments, people, classes and invoicing for Tenacity Tutoring.",
        id: "/",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        theme_color: "#FFFFFF",
        background_color: "#FFFFFF",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        // Firebase rewrites ** to /index.html, but these two are real static
        // pages the production deploy smoke-tests. Without the denylist the
        // navigation fallback would shadow both.
        navigateFallbackDenylist: [/^\/terms\.html$/, /^\/reset_password\.html$/],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.js"],
    css: false,
    include: ["src/**/*.{test,spec}.{js,jsx}"],
  },
});
