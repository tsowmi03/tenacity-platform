import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

function sourceFiles(dir = SRC, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, acc);
    else if (/\.(jsx?|css)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

const SELF = path.basename(fileURLToPath(import.meta.url));

// This file names the things it forbids, so it must not scan itself.
const files = sourceFiles()
  .map((file) => ({
    rel: path.relative(SRC, file),
    text: fs.readFileSync(file, "utf8"),
  }))
  .filter(({ rel }) => rel !== SELF);

describe("admin portal / resource portal separation", () => {
  it("imports nothing from the resource portal application", () => {
    // Matches import specifiers only — prose mentioning the resource portal
    // is fine.
    const importsResource = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\(\s*)["'][^"']*resource-portal[^"']*["']/;
    const offenders = files.filter(({ text }) => importsResource.test(text));
    expect(offenders.map((f) => f.rel)).toEqual([]);
  });

  it("has no resource surface modules left behind", () => {
    const offenders = files.filter(({ rel }) =>
      /components\/resources\//.test(rel) ||
      /ResourcesPage|ResourcePortalShell|resourcesApi|topicTaxonomy|portalMode/.test(rel)
    );
    expect(offenders.map((f) => f.rel)).toEqual([]);
  });

  it("does not link or redirect to the resource portal", () => {
    // Strict separation: the admin application carries no route, link, or
    // host-detection path into the resource portal.
    const offenders = files.filter(({ text }) =>
      /resources\.tenacitytutoring/.test(text) ||
      /isResourcePortalHost|resourcePortalHome|adminPortalHome/.test(text)
    );
    expect(offenders.map((f) => f.rel)).toEqual([]);
  });

  it("keeps no resource-only styles in the admin stylesheet", () => {
    const css = files.filter(({ rel }) => rel.endsWith(".css"));
    const offenders = css.filter(({ text }) => /\.(rg-|resource-portal-)/.test(text));
    expect(offenders.map((f) => f.rel)).toEqual([]);
  });
});
