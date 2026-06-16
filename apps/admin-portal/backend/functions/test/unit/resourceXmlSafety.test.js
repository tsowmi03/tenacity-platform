"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { stripXmlIllegalChars, cleanText } = require("../../src/resources/builder/shared");

const FORM_FEED = String.fromCharCode(0x0c); // what an unescaped \frac decoded to
const BACKSPACE = String.fromCharCode(0x08); // what an unescaped \beta decoded to
const NO_XML_ILLEGAL = /^[^\x00-\x08\x0B\x0C\x0E-\x1F]*$/; // eslint-disable-line no-control-regex

// Last-line defence: even if a control character slips past parseAiJsonResponse
// (e.g. via uploaded-file extraction or a future code path), the docx renderer
// must never emit a byte that XML 1.0 forbids, or Word rejects the whole file.
describe("XML-illegal control character safety net", () => {
  it("strips the form-feed and backspace that broke real resources", () => {
    assert.equal(stripXmlIllegalChars(`Simplify ${FORM_FEED}rac{x}{3}`), "Simplify rac{x}{3}");
    assert.equal(stripXmlIllegalChars(`${BACKSPACE}eta`), "eta");
  });

  it("strips every control char below U+0020 except tab, LF and CR", () => {
    for (let code = 0x00; code <= 0x1f; code++) {
      const ch = String.fromCharCode(code);
      const stripped = stripXmlIllegalChars(`a${ch}b`);
      if (code === 0x09 || code === 0x0a || code === 0x0d) {
        assert.equal(stripped, `a${ch}b`, `0x${code.toString(16)} (tab/LF/CR) must be preserved`);
      } else {
        assert.equal(stripped, "ab", `0x${code.toString(16)} must be stripped`);
      }
    }
  });

  it("leaves ordinary text and valid unicode untouched", () => {
    assert.equal(stripXmlIllegalChars("café × π ≤ ∞"), "café × π ≤ ∞");
  });

  it("cleanText removes control chars so rendered text is always XML-safe", () => {
    const out = cleanText(`Simplify ${FORM_FEED}rac{x}{3} and ${BACKSPACE}eta`);
    assert.match(out, NO_XML_ILLEGAL);
    assert.equal(out, "Simplify rac{x}{3} and eta");
  });
});
