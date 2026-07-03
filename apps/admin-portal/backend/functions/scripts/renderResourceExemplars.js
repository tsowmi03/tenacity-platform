"use strict";

// Renders the committed per-type exemplar PDFs the portal shows as template
// previews ("what does a Practice Paper look like?") before a tutor generates
// anything. Reuses the render-and-read fixtures so the exemplars exercise the
// exact same DOCX builders as real generations, then converts to PDF via
// LibreOffice and copies the results into the frontend's static assets:
//
//   public/resource-exemplars/<subject>-<resource-type>.pdf
//   src/components/resources/exemplarManifest.json
//
// Re-run after changing any DOCX builder or fixture so the committed
// exemplars stay in sync with real output:
//
//   node backend/functions/scripts/renderResourceExemplars.js

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { FIXTURES, renderFixtures } = require("./renderResourceFixtures");

const REPO_ROOT = path.join(__dirname, "..", "..", "..");
const EXEMPLAR_DIR = path.join(REPO_ROOT, "public", "resource-exemplars");
const MANIFEST_PATH = path.join(
  REPO_ROOT,
  "src",
  "components",
  "resources",
  "exemplarManifest.json"
);

async function main() {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "tenacity-exemplars-"));
  try {
    await renderFixtures(workDir, { pdf: true });

    fs.rmSync(EXEMPLAR_DIR, { recursive: true, force: true });
    fs.mkdirSync(EXEMPLAR_DIR, { recursive: true });

    const manifest = [];
    for (const [resourceType, resource] of FIXTURES) {
      const baseName = `${resource.subject}-${resourceType}`;
      const pdfPath = path.join(workDir, `${baseName}.pdf`);
      if (!fs.existsSync(pdfPath)) {
        throw new Error(
          `Missing PDF for ${baseName} — is LibreOffice (soffice) installed?`
        );
      }
      fs.copyFileSync(pdfPath, path.join(EXEMPLAR_DIR, `${baseName}.pdf`));
      manifest.push({
        resourceType,
        subject: resource.subject,
        file: `${baseName}.pdf`,
      });
      console.log(`${baseName}.pdf`);
    }

    fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Wrote ${manifest.length} exemplars to ${EXEMPLAR_DIR}`);
    console.log(`Wrote manifest to ${MANIFEST_PATH}`);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err?.stack || err);
  process.exit(1);
});
