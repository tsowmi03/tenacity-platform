#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .design-sync/generated
printf '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n' > .design-sync/generated/.tailwind-input.css
npx tailwindcss -i .design-sync/generated/.tailwind-input.css -o .design-sync/generated/tailwind-compiled.css --config .design-sync/tailwind.sync.config.ts
{
  echo "/* Combined entry for Claude Design sync: claude-design.css brand tokens first, then compiled Tailwind utilities so existing common/components render. */"
  cat src/styles/claude-design.css
  echo ""
  echo "/* ---- Compiled Tailwind utilities (used by src/modules/common/components) ---- */"
  cat .design-sync/generated/tailwind-compiled.css
} > .design-sync/generated/styles-entry.css
