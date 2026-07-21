"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { generateDiagram } = require("../src/resources/diagramGenerator");
const {
  fixtureDiagramEntries,
} = require("../src/resources/diagramRegistry");

const DEFAULT_OUTPUT_DIR = path.join("/tmp", "tenacity-resource-diagram-fixtures");

function outputPathFor(entry, outputDir) {
  return path.join(outputDir, entry.status, `${entry.type}.png`);
}

async function renderFixtures(outputDir) {
  const entries = fixtureDiagramEntries({
    promptVisibleOnly: true,
    imageBackedOnly: true,
  });

  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  const rendered = [];
  for (const entry of entries) {
    const result = await generateDiagram(entry.fixture);
    if (!result?.buffer) {
      throw new Error(`Diagram fixture did not render: ${entry.type}`);
    }

    const filePath = outputPathFor(entry, outputDir);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, result.buffer);
    rendered.push({ entry, filePath, width: result.width, height: result.height });
  }

  return rendered;
}

async function main() {
  const outputDir = process.argv[2] || process.env.DIAGRAM_FIXTURE_OUTPUT_DIR || DEFAULT_OUTPUT_DIR;
  const rendered = await renderFixtures(outputDir);

  for (const item of rendered) {
    console.log(
      `${item.entry.type} -> ${item.filePath} (${item.width}x${item.height}, ${item.entry.status})`
    );
  }
  console.log(`Rendered ${rendered.length} diagram fixture PNGs to ${outputDir}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err?.stack || err);
    process.exit(1);
  });
}

module.exports = {
  renderFixtures,
};
