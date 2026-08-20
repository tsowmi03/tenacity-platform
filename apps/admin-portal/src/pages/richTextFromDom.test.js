import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { plainTextFromDom, richTextFromDom } from "./richTextFromDom";

/**
 * The other half of the pin described in the fixture file. The backend suite
 * asserts the renderer produces this HTML from this source; here we assert the
 * composer reads the same HTML back as the same source. The path is long on
 * purpose — the fixture belongs to neither app, and reaching for it is what
 * keeps the two directions honest.
 */
const FIXTURE = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      "../../backend/firebase/functions/test/fixtures/richTextRoundTrip.json"
    ),
    "utf8"
  )
);

function regionFrom(html) {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
}

describe("richTextFromDom", () => {
  for (const testCase of FIXTURE.cases) {
    it(`reads back ${testCase.name}`, () => {
      expect(richTextFromDom(regionFrom(testCase.html))).toBe(testCase.source);
    });
  }

  it("returns nothing for an empty or missing region", () => {
    expect(richTextFromDom(null)).toBe("");
    expect(richTextFromDom(regionFrom(""))).toBe("");
    expect(richTextFromDom(regionFrom("<p></p><p>  </p>"))).toBe("");
  });

  describe("markup a browser inserts while you type", () => {
    it("treats a div as a paragraph, which is what contentEditable produces", () => {
      expect(richTextFromDom(regionFrom("<div>One</div><div>Two</div>"))).toBe(
        "One\n\nTwo"
      );
    });

    it("reads b and i as bold and italic", () => {
      expect(richTextFromDom(regionFrom("<p><b>Bold</b> and <i>italic</i></p>"))).toBe(
        "**Bold** and *italic*"
      );
    });

    it("drops styling it cannot store rather than keeping it as text", () => {
      expect(
        richTextFromDom(
          regionFrom('<p><span style="color:red;font-size:40px">Loud</span></p>')
        )
      ).toBe("Loud");
    });

    it("collapses a non-breaking space, which typing at a line end inserts", () => {
      expect(richTextFromDom(regionFrom("<p>Ends here&nbsp;</p>"))).toBe("Ends here");
    });

    it("collapses whitespace runs the way the browser renders them", () => {
      expect(richTextFromDom(regionFrom("<p>Too    many\n   spaces</p>"))).toBe(
        "Too many spaces"
      );
    });

    it("keeps the outermost mark when the browser nests them, since the model cannot", () => {
      // Bolding a selection that already holds a link produces this. Emitting
      // `[**x**](url)` would read back as a link labelled `**x**`.
      expect(
        richTextFromDom(
          regionFrom('<p><strong><a href="https://t.test">Link</a></strong></p>')
        )
      ).toBe("**Link**");
      expect(
        richTextFromDom(regionFrom('<p><a href="https://t.test"><b>Link</b></a></p>'))
      ).toBe("[Link](https://t.test)");
    });

    it("keeps the label but drops a link the renderer would not follow", () => {
      expect(
        richTextFromDom(regionFrom('<p><a href="javascript:alert(1)">Click</a></p>'))
      ).toBe("Click");
    });

    it("ignores a stray comment node", () => {
      expect(richTextFromDom(regionFrom("<p>Text</p><!-- note -->"))).toBe("Text");
    });
  });

});

describe("plainTextFromDom", () => {
  it("reads a heading's text", () => {
    expect(plainTextFromDom(regionFrom("<h2>This week</h2>"))).toBe("This week");
  });

  it("flattens a pasted newline so it cannot split a single-line field", () => {
    expect(plainTextFromDom(regionFrom("<h2>Two<br />lines</h2>"))).toBe("Two lines");
  });

  it("strips markup rather than storing it as text", () => {
    expect(plainTextFromDom(regionFrom("<h2>Very <b>bold</b></h2>"))).toBe("Very bold");
  });

  it("returns nothing for a missing region", () => {
    expect(plainTextFromDom(null)).toBe("");
  });
});
