// Tailwind config used ONLY for the Claude Design sync's compiled CSS
// (.design-sync/build-styles.sh) — never referenced by the real app build.
// Extends the real tailwind.config.ts's theme/plugins verbatim but adds
// .design-sync/previews/**/*.tsx to `content`, so Tailwind classes used only
// in authored preview files (never in src/) still get compiled. Without
// this, such classes exist in the HTML with zero matching CSS and silently
// have no effect (e.g. an arbitrary-value class like `h-[360px]` used only
// in a preview collapses to 0 height) — see .design-sync/NOTES.md.
const base = require("../tailwind.config.ts");

module.exports = {
  ...base,
  content: [...base.content, "./.design-sync/previews/**/*.{ts,tsx}"],
};
