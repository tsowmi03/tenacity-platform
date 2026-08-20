import { beforeEach, describe, expect, it, vi } from "vitest";

const firestore = vi.hoisted(() => ({
  createDocument: vi.fn(),
  updateDocument: vi.fn(),
  serverTimestamp: vi.fn(() => "SERVER_TS"),
}));

vi.mock("./firestoreWrites", () => ({
  createDocument: firestore.createDocument,
  updateDocument: firestore.updateDocument,
  deleteDocument: vi.fn(),
  serverTimestamp: firestore.serverTimestamp,
}));

vi.mock("./firestoreReads", () => ({
  getDocument: vi.fn(),
  listDocuments: vi.fn(),
  orderBy: vi.fn(),
  timestampToIso: vi.fn(() => null),
}));

import { saveWeeklyUpdate } from "./weeklyUpdateApi";
import { normalizeWeeklyUpdate } from "./schemas";

function savedFields() {
  return firestore.updateDocument.mock.calls[0][2];
}

describe("saveWeeklyUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestore.updateDocument.mockResolvedValue(undefined);
  });

  it("stores blocks and mirrors the announcement ids in order", async () => {
    await saveWeeklyUpdate("blast-1", {
      subject: "  Week of 4 August  ",
      blocks: [
        { id: "b1", type: "announcement", announcementId: " ann-2 " },
        { id: "b2", type: "text", tone: "note", body: "Hi parents" },
        { id: "b3", type: "announcement", announcementId: "ann-1" },
      ],
    });

    const fields = savedFields();
    expect(fields.subject).toBe("Week of 4 August");
    expect(fields.announcementIds).toEqual(["ann-2", "ann-1"]);
    expect(fields.blocks).toHaveLength(3);
  });

  it("retires the pre-block fields so only one copy of the content is stored", async () => {
    await saveWeeklyUpdate("blast-1", {
      subject: "Week of 4 August",
      intro: "Hi parents",
      sections: [{ title: "Fees", body: "Due Friday" }],
      blocks: [{ id: "b1", type: "text", tone: "note", body: "Hi parents" }],
    });

    const fields = savedFields();
    expect(fields.intro).toBe("");
    expect(fields.sections).toEqual([]);
  });

  it("does not persist the announcement copy the composer holds for labelling", async () => {
    // Freezing a copy here would stop the email tracking edits to the
    // announcement itself, which is resolved at send time instead.
    await saveWeeklyUpdate("blast-1", {
      subject: "Week of 4 August",
      blocks: [
        {
          id: "b1",
          type: "announcement",
          announcementId: "ann-1",
          title: "Timetable change",
          body: "Tuesday moves to 5pm",
        },
      ],
    });

    expect(savedFields().blocks[0]).toEqual({
      id: "b1",
      type: "announcement",
      announcementId: "ann-1",
      eyebrow: "",
    });
  });

  it("stores an overridden banner headline, which the preview can now set", async () => {
    // Editing the headline in the preview writes `masthead.title`. A whitelist
    // that only carried the eyebrow would drop that edit at the last step, with
    // nothing on screen to say so.
    await saveWeeklyUpdate("blast-1", {
      subject: "Week of 4 August",
      masthead: { eyebrow: "Term 3", title: "A different headline" },
      blocks: [],
    });

    expect(savedFields().masthead).toEqual({
      eyebrow: "Term 3",
      title: "A different headline",
    });
  });

  it("stores an empty headline, which is how it goes back to following the subject", async () => {
    await saveWeeklyUpdate("blast-1", {
      subject: "Week of 4 August",
      masthead: { eyebrow: "Term 3" },
      blocks: [],
    });

    expect(savedFields().masthead.title).toBe("");
  });

  it("drops link rows that were never filled in", async () => {
    await saveWeeklyUpdate("blast-1", {
      subject: "Week of 4 August",
      blocks: [
        {
          id: "b1",
          type: "linkList",
          title: "Handy links",
          links: [
            { label: "Timetable", url: "https://tenacity.test/t" },
            { label: "", url: "" },
          ],
        },
      ],
    });

    expect(savedFields().blocks[0].links).toEqual([
      { label: "Timetable", url: "https://tenacity.test/t" },
    ]);
  });

  it("never writes undefined, which Firestore rejects", async () => {
    await saveWeeklyUpdate("blast-1", { subject: "Week of 4 August", blocks: [{}] });

    const fields = savedFields();
    expect(JSON.stringify(fields)).not.toContain("undefined");
    Object.values(fields).forEach((value) => expect(value).not.toBeUndefined());
  });
});

describe("normalizeWeeklyUpdate", () => {
  it("converts a pre-block draft into blocks so it can be edited", () => {
    const normalized = normalizeWeeklyUpdate("blast-1", {
      subject: "Week of 4 August",
      intro: "Hi parents",
      announcementIds: ["ann-1"],
      sections: [{ title: "Fees", body: "Due Friday" }],
    });

    expect(normalized.blocks.map((block) => block.type)).toEqual([
      "text",
      "heading",
      "announcement",
      "spacer",
      "heading",
      "text",
    ]);
  });

  it("leaves a stored block list alone", () => {
    const blocks = [{ id: "b1", type: "divider" }];
    expect(
      normalizeWeeklyUpdate("blast-1", { subject: "x", intro: "ignored", blocks })
        .blocks
    ).toEqual(blocks);
  });

  it("seeds the chrome defaults so the copy is visible in the composer", () => {
    const normalized = normalizeWeeklyUpdate("blast-1", { subject: "x" });
    expect(normalized.masthead.eyebrow).toBe("Weekly family update");
    expect(normalized.cta.title).toBe("Everything else, all in one place");
    expect(normalized.preheader).toBe("");
  });

  it("reads a stored headline back, and reports no headline as empty not missing", () => {
    expect(
      normalizeWeeklyUpdate("blast-1", { subject: "x", masthead: { title: "Set" } })
        .masthead.title
    ).toBe("Set");
    expect(normalizeWeeklyUpdate("blast-1", { subject: "x" }).masthead.title).toBe("");
  });

  it("keeps a cleared chrome field cleared rather than restoring the default", () => {
    // An admin who empties the banner label means it, and the renderer honours
    // the same distinction.
    const normalized = normalizeWeeklyUpdate("blast-1", {
      subject: "x",
      masthead: { eyebrow: "" },
      cta: { title: "" },
    });
    expect(normalized.masthead.eyebrow).toBe("");
    expect(normalized.cta.title).toBe("");
  });
});
