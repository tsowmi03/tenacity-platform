import { describe, expect, it } from "vitest";
import {
  announcementIdsFromBlocks,
  blockHasContent,
  blockProblems,
  blockTypeLabel,
  blocksFromLegacy,
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
  it("names the block and what is wrong with it", () => {
    expect(
      blockProblems([
        { type: "announcement", announcementId: "" },
        { type: "button", label: "", url: "nope" },
      ])
    ).toEqual([
      "Block 1 (Announcement): choose an announcement.",
      "Block 2 (Button): add a label.",
      "Block 2 (Button): add a link starting with https://.",
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
  it("falls back for a type this build does not know", () => {
    expect(blockTypeLabel("text")).toBe("Text");
    expect(blockTypeLabel("carousel")).toBe("Block");
  });
});
