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

describe("resource portal / admin portal separation", () => {
  it("imports nothing from the admin portal application", () => {
    // The shared shell here is a deliberate copy, not a dependency. If this
    // fails, the two applications have been re-coupled. Matches import
    // specifiers only — prose mentioning the admin portal is fine.
    const importsAdmin = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\(\s*)["'][^"']*admin-portal[^"']*["']/;
    const offenders = files.filter(({ text }) => importsAdmin.test(text));
    expect(offenders.map((f) => f.rel)).toEqual([]);
  });

  it("does not link to the admin portal", () => {
    const offenders = files.filter(({ text }) => /admin\.tenacitytutoring/.test(text));
    expect(offenders.map((f) => f.rel)).toEqual([]);
  });

  it("carries no host-detection logic", () => {
    // Which portal this is, is decided by which application was built and
    // deployed — never by inspecting the hostname at runtime.
    const offenders = files.filter(({ text }) =>
      /isResourcePortalHost|resourcePortalHome|adminPortalHome|location\.hostname/.test(text)
    );
    expect(offenders.map((f) => f.rel)).toEqual([]);
  });
});
