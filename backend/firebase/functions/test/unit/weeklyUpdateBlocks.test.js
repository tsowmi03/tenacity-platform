"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

require("firebase-admin");

const {
  isEmptyRichText,
  richTextToHtml,
  richTextToPlain,
  safeUrl,
} = require("../../src/email/richText");
const {
  blockHasContent,
  blocksFromLegacy,
  normaliseBlock,
  normaliseBlocks,
  resolveCta,
  resolveMasthead,
} = require("../../src/email/weeklyUpdateBlocks");
const { renderWeeklyUpdateEmail } = require("../../src/email/weeklyUpdateEmail");

const UNSUBSCRIBE = "https://example.com/unsubscribe?token=abc";

function render(overrides) {
  return renderWeeklyUpdateEmail({
    subject: "Week of 4 August",
    unsubscribeUrl: UNSUBSCRIBE,
    ...overrides,
  });
}

/**
 * The one fixture that pins the two copies of the legacy conversion together.
 * `apps/admin-portal/src/backend/weeklyUpdateBlocks.test.js` asserts the same
 * expected structure, so changing one conversion without the other fails there.
 */
const LEGACY_FIXTURE = {
  intro: "Hi parents",
  announcements: [
    { id: "ann-1", title: "Timetable change", body: "Tuesday moves to 5pm" },
  ],
  sections: [{ title: "Fee reminder", body: "Invoices due Friday" }],
};

const LEGACY_EXPECTED_SHAPE = [
  { type: "text", tone: "note" },
  { type: "heading", title: "This week's announcements" },
  { type: "announcement", announcementId: "ann-1" },
  { type: "spacer", size: "sm" },
  { type: "heading", title: "In this week's update" },
  { type: "text", tone: "card" },
];

describe("safeUrl", () => {
  it("accepts the protocols an email can link to", () => {
    assert.equal(safeUrl("https://tenacity.test/x"), "https://tenacity.test/x");
    assert.equal(safeUrl("http://tenacity.test"), "http://tenacity.test");
    assert.equal(safeUrl("mailto:hi@tenacity.test"), "mailto:hi@tenacity.test");
    assert.equal(safeUrl("  https://tenacity.test  "), "https://tenacity.test");
  });

  it("rejects everything else, including scheme tricks", () => {
    assert.equal(safeUrl("javascript:alert(1)"), "");
    assert.equal(safeUrl("JavaScript:alert(1)"), "");
    assert.equal(safeUrl("data:text/html,<script>"), "");
    assert.equal(safeUrl("/relative/path"), "");
    assert.equal(safeUrl("tenacity.test"), "");
    assert.equal(safeUrl(""), "");
    assert.equal(safeUrl(null), "");
  });
});

describe("richTextToHtml", () => {
  it("renders plain text exactly as the pre-rich-text renderer did", () => {
    // This is what makes every existing draft and announcement body render
    // unchanged: plain text is already valid input.
    assert.equal(
      richTextToHtml("One\nTwo\n\nThree"),
      '<p style="margin:0 0 12px;line-height:1.65;">One<br />Two</p>' +
        '<p style="margin:0;line-height:1.65;">Three</p>'
    );
  });

  it("renders bold, italic and links", () => {
    const html = richTextToHtml(
      "A **bold** and *italic* line with [a link](https://tenacity.test)."
    );
    assert.ok(html.includes("<strong>bold</strong>"));
    assert.ok(html.includes("<em>italic</em>"));
    assert.ok(
      html.includes(
        '<a href="https://tenacity.test" style="color:#1C71AF;text-decoration:underline;">a link</a>'
      )
    );
  });

  it("renders bullet lines as a list", () => {
    const html = richTextToHtml("Bring:\n- a pen\n- a laptop");
    assert.ok(html.includes('<p style="margin:0 0 12px;line-height:1.65;">Bring:</p>'));
    assert.ok(html.includes("<ul "));
    assert.equal((html.match(/<li /g) ?? []).length, 2);
  });

  it("escapes author content, marked up or not", () => {
    const html = richTextToHtml("Hi <parents> & **<friends>**");
    assert.ok(html.includes("Hi &lt;parents&gt; &amp;"));
    assert.ok(html.includes("<strong>&lt;friends&gt;</strong>"));
    assert.ok(!html.includes("<parents>"));
  });

  it("keeps the label but drops the link when the URL is not one we allow", () => {
    // Losing the text as well would hide the mistake from whoever wrote it.
    const html = richTextToHtml("[Click me](javascript:alert(1))");
    assert.ok(html.includes("Click me"));
    assert.ok(!html.includes("javascript:"));
    assert.ok(!html.includes("<a "));
  });

  it("treats whitespace-only and marker-only bodies as empty", () => {
    assert.equal(isEmptyRichText("   \n\n  "), true);
    assert.equal(isEmptyRichText(""), true);
    assert.equal(isEmptyRichText("something"), false);
  });
});

describe("richTextToPlain", () => {
  it("strips marks and keeps link destinations", () => {
    assert.equal(
      richTextToPlain("A **bold** [link](https://tenacity.test) here"),
      "A bold link (https://tenacity.test) here"
    );
  });

  it("keeps bullets legible", () => {
    assert.equal(richTextToPlain("Bring:\n- a pen\n- a laptop"), "Bring:\n\n- a pen\n- a laptop");
  });
});

describe("blocksFromLegacy", () => {
  it("converts the fixed slots in the order the old layout rendered them", () => {
    const blocks = blocksFromLegacy(LEGACY_FIXTURE);
    assert.deepEqual(
      blocks.map((block) => {
        const shape = { type: block.type };
        if (block.tone) shape.tone = block.tone;
        if (block.type === "heading") shape.title = block.title;
        if (block.type === "announcement") shape.announcementId = block.announcementId;
        if (block.type === "spacer") shape.size = block.size;
        return shape;
      }),
      LEGACY_EXPECTED_SHAPE
    );
  });

  it("leaves out slots that were never filled in", () => {
    assert.deepEqual(blocksFromLegacy({}), []);
    assert.deepEqual(
      blocksFromLegacy({ intro: "   " }).map((block) => block.type),
      []
    );
  });
});

describe("legacy rendering parity", () => {
  it("renders a converted draft byte-identically to the fixed slots", () => {
    // The renderer still accepts the fixed slots, converts them itself, and this
    // asserts that the conversion is what the old layout produced. An old draft
    // that has already been sent must read back as the email that went out.
    const viaSlots = render(LEGACY_FIXTURE).html;
    const viaBlocks = render({ blocks: blocksFromLegacy(LEGACY_FIXTURE) }).html;
    assert.equal(viaBlocks, viaSlots);
  });

  it("still carries every part of the old layout", () => {
    const { html } = render(LEGACY_FIXTURE);
    assert.ok(html.includes("Weekly family update"));
    assert.ok(html.includes("A note from Tenacity"));
    assert.ok(html.includes("Important information"));
    assert.ok(html.includes("At a glance"));
    assert.ok(html.includes("Everything else, all in one place"));
  });

  it("names the same blocks in the plain-text part", () => {
    const { text } = render(LEGACY_FIXTURE);
    ["Hi parents", "Timetable change", "Fee reminder", "Invoices due Friday"].forEach(
      (fragment) => assert.ok(text.includes(fragment), `missing ${fragment}`)
    );
  });
});

describe("block rendering", () => {
  it("renders each block type and skips the unknown ones", () => {
    const { html } = render({
      blocks: [
        { id: "1", type: "heading", eyebrow: "This week", title: "Coming up" },
        { id: "2", type: "text", tone: "note", body: "A note" },
        { id: "3", type: "callout", tone: "warn", title: "Fees due", body: "Friday" },
        { id: "4", type: "button", label: "Book now", url: "https://tenacity.test" },
        {
          id: "5",
          type: "linkList",
          title: "Handy links",
          links: [{ label: "Timetable", url: "https://tenacity.test/t" }],
        },
        { id: "6", type: "signature", name: "Jess", role: "Head of Tutoring" },
        { id: "7", type: "divider" },
        { id: "8", type: "notARealBlock", body: "should vanish" },
      ],
    });

    ["Coming up", "A note", "Fees due", "Book now", "Handy links", "Jess"].forEach(
      (fragment) => assert.ok(html.includes(fragment), `missing ${fragment}`)
    );
    assert.ok(!html.includes("should vanish"));
  });

  it("gives each callout tone its own colour", () => {
    const toneOf = (tone) =>
      render({ blocks: [{ id: "1", type: "callout", tone, body: "x" }] }).html;
    assert.ok(toneOf("warn").includes("#B7791F"));
    assert.ok(toneOf("success").includes("#2F7A4B"));
    assert.ok(toneOf("info").includes("#1C71AF"));
  });

  it("renders a button unlinked rather than hiding it when the URL is rejected", () => {
    // The composer blocks the send separately; the preview should still show the
    // button that was added.
    const { html } = render({
      blocks: [
        { id: "1", type: "button", label: "Book now", url: "javascript:alert(1)" },
      ],
    });
    assert.ok(html.includes("Book now"));
    assert.ok(!html.includes("javascript:"));
    assert.ok(html.includes('href="#"'));
  });

  it("keeps every block inside tables with inline styles only", () => {
    const { html } = render({
      blocks: [
        { id: "1", type: "callout", tone: "info", body: "x" },
        { id: "2", type: "button", label: "Go", url: "https://tenacity.test" },
        { id: "3", type: "signature", name: "Jess" },
        { id: "4", type: "spacer", size: "lg" },
      ],
    });
    assert.ok(!html.includes("<style"));
    assert.ok(!html.includes("<div style=\"font-family:Arial"));
    assert.ok(html.includes('style="width:100%;max-width:600px;'));
  });
});

describe("editable chrome", () => {
  it("uses the masthead defaults until a draft overrides them", () => {
    assert.deepEqual(resolveMasthead(undefined, "Week of 4 August"), {
      eyebrow: "Weekly family update",
      title: "Week of 4 August",
    });
    assert.deepEqual(resolveMasthead({ eyebrow: "Term 3, week 4" }, "Subject"), {
      eyebrow: "Term 3, week 4",
      title: "Subject",
    });
  });

  it("drops the masthead label when it is cleared, keeping the headline", () => {
    const { html } = render({ masthead: { eyebrow: "" }, blocks: [] });
    assert.ok(!html.includes("Weekly family update"));
    assert.ok(html.includes("Week of 4 August"));
  });

  it("renders an overridden closing panel, with a button when one is set", () => {
    const { html, text } = render({
      cta: {
        eyebrow: "Next term",
        title: "Enrolments are open",
        body: "Secure a spot for Term 4.",
        label: "Enrol now",
        url: "https://tenacity.test/enrol",
      },
    });
    assert.ok(html.includes("Enrolments are open"));
    assert.ok(html.includes('href="https://tenacity.test/enrol"'));
    assert.ok(text.includes("Enrol now: https://tenacity.test/enrol"));
    assert.ok(!html.includes("Everything else, all in one place"));
  });

  it("leaves the closing panel out when every field is cleared", () => {
    assert.equal(resolveCta({ eyebrow: "", title: "", body: "", label: "" }), null);
    const { html } = render({
      cta: { eyebrow: "", title: "", body: "", label: "", url: "" },
    });
    assert.ok(!html.includes("Everything else, all in one place"));
    assert.ok(!html.includes("Stay connected"));
  });
});

describe("normaliseBlock", () => {
  it("drops unknown types rather than guessing at them", () => {
    assert.equal(normaliseBlock({ type: "carousel" }), null);
    assert.deepEqual(
      normaliseBlocks([{ type: "divider" }, { type: "carousel" }]).map((b) => b.type),
      ["divider"]
    );
  });

  it("falls back to a known value for an unrecognised tone or size", () => {
    assert.equal(normaliseBlock({ type: "text", tone: "neon" }).tone, "plain");
    assert.equal(normaliseBlock({ type: "callout", tone: "neon" }).tone, "info");
    assert.equal(normaliseBlock({ type: "spacer", size: "enormous" }).size, "md");
  });
});

describe("blockHasContent", () => {
  it("counts copy and ignores structure", () => {
    assert.equal(blockHasContent({ type: "text", body: "hello" }), true);
    assert.equal(blockHasContent({ type: "text", body: "   " }), false);
    assert.equal(blockHasContent({ type: "heading", title: "Hi" }), true);
    assert.equal(blockHasContent({ type: "divider" }), false);
    assert.equal(blockHasContent({ type: "spacer", size: "lg" }), false);
  });

  it("needs a usable link before a button or link list counts", () => {
    assert.equal(blockHasContent({ type: "button", label: "Go", url: "nope" }), false);
    assert.equal(
      blockHasContent({ type: "button", label: "Go", url: "https://tenacity.test" }),
      true
    );
    assert.equal(
      blockHasContent({
        type: "linkList",
        links: [{ label: "Go", url: "javascript:alert(1)" }],
      }),
      false
    );
  });
});
