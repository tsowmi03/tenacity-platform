import { describe, expect, it } from "vitest";
import {
  announcementIdsFromBlocks,
  blockHasContent,
  blockForEditing,
  blockProblems,
  blockSummary,
  blockTypeLabel,
  blocksForEditing,
  blocksFromLegacy,
  describeBlockProblem,
  moveBlock,
  newBlock,
  safeUrl,
} from "./weeklyUpdateBlocks";

/**
 * The legacy fixture and expected structure are duplicated from
 * `backend/firebase/functions/test/unit/weeklyUpdateBlocks.test.js` on purpose:
 * they are what pins this app's copy of the conversion to the renderer's. If one
 * side changes, the other side's assertion is what fails.
 */
const LEGACY_FIXTURE = {
  intro: "Hi parents",
  announcementIds: ["ann-1"],
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

function shapeOf(blocks) {
  return blocks.map((block) => {
    const shape = { type: block.type };
    if (block.tone) shape.tone = block.tone;
    if (block.type === "heading") shape.title = block.title;
    if (block.type === "announcement") shape.announcementId = block.announcementId;
    if (block.type === "spacer") shape.size = block.size;
    return shape;
  });
}

describe("blocksFromLegacy", () => {
  it("converts the fixed slots in the order the old layout rendered them", () => {
    expect(shapeOf(blocksFromLegacy(LEGACY_FIXTURE))).toEqual(LEGACY_EXPECTED_SHAPE);
  });

  it("carries the intro and section copy across", () => {
    const blocks = blocksFromLegacy(LEGACY_FIXTURE);
    expect(blocks[0].body).toBe("Hi parents");
    expect(blocks[5]).toMatchObject({
      title: "Fee reminder",
      body: "Invoices due Friday",
    });
  });

  it("leaves out slots that were never filled in", () => {
    expect(blocksFromLegacy({})).toEqual([]);
    expect(blocksFromLegacy({ intro: "   " })).toEqual([]);
  });
});

describe("safeUrl", () => {
  it("accepts only the protocols an email can link to", () => {
    expect(safeUrl("https://tenacity.test")).toBe("https://tenacity.test");
    expect(safeUrl("mailto:hi@tenacity.test")).toBe("mailto:hi@tenacity.test");
    expect(safeUrl("javascript:alert(1)")).toBe("");
    expect(safeUrl("tenacity.test")).toBe("");
    expect(safeUrl("")).toBe("");
  });
});

describe("newBlock", () => {
  it("creates each known type with a unique id", () => {
    const first = newBlock("text");
    const second = newBlock("text");
    expect(first.type).toBe("text");
    expect(first.tone).toBe("plain");
    expect(first.id).not.toBe(second.id);
  });

  it("refuses an unknown type", () => {
    expect(newBlock("carousel")).toBeNull();
  });
});

describe("moveBlock", () => {
  const blocks = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("swaps a block with its neighbour", () => {
    expect(moveBlock(blocks, 1, -1).map((b) => b.id)).toEqual(["b", "a", "c"]);
    expect(moveBlock(blocks, 1, 1).map((b) => b.id)).toEqual(["a", "c", "b"]);
  });

  it("leaves the list alone at either end", () => {
    expect(moveBlock(blocks, 0, -1)).toBe(blocks);
    expect(moveBlock(blocks, 2, 1)).toBe(blocks);
  });
});

describe("announcementIdsFromBlocks", () => {
  it("mirrors the announcement blocks in order, skipping unchosen ones", () => {
    expect(
      announcementIdsFromBlocks([
        { type: "announcement", announcementId: "b" },
        { type: "text", body: "x" },
        { type: "announcement", announcementId: "" },
        { type: "announcement", announcementId: "a" },
      ])
    ).toEqual(["b", "a"]);
  });

  it("tolerates missing input", () => {
    expect(announcementIdsFromBlocks(undefined)).toEqual([]);
  });
});

describe("blockHasContent", () => {
  it("counts copy and ignores structure", () => {
    expect(blockHasContent({ type: "text", body: "hello" })).toBe(true);
    expect(blockHasContent({ type: "text", body: "   " })).toBe(false);
    expect(blockHasContent({ type: "divider" })).toBe(false);
    expect(blockHasContent({ type: "spacer", size: "lg" })).toBe(false);
    expect(blockHasContent(undefined)).toBe(false);
  });

  it("needs a chosen announcement", () => {
    expect(blockHasContent({ type: "announcement", announcementId: "" })).toBe(false);
    expect(blockHasContent({ type: "announcement", announcementId: "a" })).toBe(true);
  });
});

describe("blockProblems", () => {
  it("keys each problem to the block and field it belongs to", () => {
    // The id and field are what let the composer show the mistake on the block
    // itself; without them an admin reads "Block 4 needs a label" at the top of
    // the page and counts down the list to find it.
    const blocks = [
      { id: "b1", type: "announcement", announcementId: "" },
      { id: "b2", type: "button", label: "", url: "nope" },
    ];
    expect(blockProblems(blocks)).toEqual([
      { id: "b1", index: 0, field: "announcementId", message: "Choose an announcement." },
      { id: "b2", index: 1, field: "label", message: "Add a label." },
      {
        id: "b2",
        index: 1,
        field: "url",
        message: "Add a link starting with https://.",
      },
    ]);
  });

  it("reads back as one sentence for the send blockers", () => {
    const blocks = [{ id: "b1", type: "button", label: "", url: "nope" }];
    expect(
      blockProblems(blocks).map((problem) => describeBlockProblem(problem, blocks[0]))
    ).toEqual([
      "Block 1 (Button): add a label.",
      "Block 1 (Button): add a link starting with https://.",
    ]);
  });

  it("ignores a link row that has not been started", () => {
    expect(
      blockProblems([{ type: "linkList", links: [{ label: "", url: "" }] }])
    ).toEqual([]);
  });

  it("says nothing about a well-formed draft", () => {
    expect(
      blockProblems([
        { type: "text", body: "hello" },
        { type: "button", label: "Book", url: "https://tenacity.test" },
        { type: "divider" },
      ])
    ).toEqual([]);
  });
});

describe("blockTypeLabel", () => {
  it("names a text block by its style, so the list reads as the email's shape", () => {
    expect(blockTypeLabel({ type: "text", tone: "plain" })).toBe("Plain");
    expect(blockTypeLabel({ type: "text", tone: "note" })).toBe("Note");
    expect(blockTypeLabel({ type: "text", tone: "warn" })).toBe("Warning");
  });

  it("falls back for a type this build does not know", () => {
    expect(blockTypeLabel({ type: "heading" })).toBe("Heading");
    expect(blockTypeLabel({ type: "carousel" })).toBe("Block");
    expect(blockTypeLabel("carousel")).toBe("Block");
  });
});

/**
 * Callouts became three more tones of `text`. The stored documents were not
 * rewritten, so the composer has to read the old type — and must not write it
 * back, which is what `weeklyUpdateApi` relies on.
 */
describe("blockForEditing", () => {
  it("reads a stored callout as the equivalent text block", () => {
    expect(
      blockForEditing({ id: "c1", type: "callout", tone: "warn", title: "T", body: "B" })
    ).toEqual({ id: "c1", type: "text", tone: "warn", eyebrow: "", title: "T", body: "B" });
  });

  it("keeps a callout's own fallback tone, so it cannot lose its panel", () => {
    expect(blockForEditing({ type: "callout", tone: "neon" }).tone).toBe("info");
  });

  it("leaves every other block exactly as it found it", () => {
    const block = { id: "b1", type: "text", tone: "note", body: "x" };
    expect(blockForEditing(block)).toBe(block);
    expect(blocksForEditing([block])).toEqual([block]);
  });

  it("names a stored callout by its style too", () => {
    expect(blockTypeLabel({ type: "callout", tone: "success" })).toBe("Positive");
  });
});

describe("blockSummary", () => {
  it("prefers the heading, then the first line of the copy", () => {
    expect(blockSummary({ type: "text", title: "Fees", body: "Due Friday" })).toBe("Fees");
    expect(blockSummary({ type: "text", body: "Due Friday" })).toBe("Due Friday");
  });

  it("strips the markdown so the row reads as words", () => {
    expect(blockSummary({ type: "text", body: "- **Bring** a [pen](https://t.test)" })).toBe(
      "Bring a pen"
    );
  });

  it("uses the announcement's own title, which the block does not store", () => {
    expect(
      blockSummary(
        { type: "announcement", announcementId: "a1" },
        { announcementTitle: "Parking changes" }
      )
    ).toBe("Parking changes");
  });

  it("is empty for a block with nothing in it, so the caller can say so", () => {
    expect(blockSummary({ type: "text", body: "   " })).toBe("");
    expect(blockSummary({ type: "divider" })).toBe("");
  });
});
