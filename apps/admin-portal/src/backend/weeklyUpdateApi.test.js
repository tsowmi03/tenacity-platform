import { beforeEach, describe, expect, it, vi } from "vitest";

const firestore = vi.hoisted(() => ({
  createDocument: vi.fn(),
  updateDocument: vi.fn(),
  getDocument: vi.fn(),
  serverTimestamp: vi.fn(() => "SERVER_TS"),
}));

vi.mock("./firestoreWrites", () => ({
  createDocument: firestore.createDocument,
  updateDocument: firestore.updateDocument,
  deleteDocument: vi.fn(),
  serverTimestamp: firestore.serverTimestamp,
}));

vi.mock("./firestoreReads", () => ({
  getDocument: firestore.getDocument,
  listDocuments: vi.fn(),
  orderBy: vi.fn(),
  timestampToIso: vi.fn(() => null),
}));

import { duplicateWeeklyUpdate, saveWeeklyUpdate } from "./weeklyUpdateApi";
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

  it("writes a stored callout as the text block that replaced it", async () => {
    // Callouts were merged into text. Nothing was backfilled, so a draft can
    // still arrive holding the old type — but a save must not put it back, or
    // the merge would never finish for the drafts that are actually edited.
    await saveWeeklyUpdate("blast-1", {
      subject: "Week of 4 August",
      blocks: [{ id: "c1", type: "callout", tone: "warn", title: "Fees", body: "Friday" }],
    });

    expect(savedFields().blocks[0]).toEqual({
      id: "c1",
      type: "text",
      tone: "warn",
      eyebrow: "",
      title: "Fees",
      body: "Friday",
    });
  });

  it("never writes undefined, which Firestore rejects", async () => {
    await saveWeeklyUpdate("blast-1", { subject: "Week of 4 August", blocks: [{}] });

    const fields = savedFields();
    expect(JSON.stringify(fields)).not.toContain("undefined");
    Object.values(fields).forEach((value) => expect(value).not.toBeUndefined());
  });
});

describe("duplicateWeeklyUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestore.createDocument.mockResolvedValue({ id: "new-id" });
  });

  it("carries the shape of the update across but not what dates it", async () => {
    firestore.getDocument.mockResolvedValue({
      id: "blast-1",
      subject: "Week of 4 August",
      preheader: "Last week's snippet",
      masthead: { eyebrow: "Term 3", title: "" },
      cta: { eyebrow: "Stay connected", title: "T", body: "B", label: "", url: "" },
      blocks: [
        { id: "b1", type: "heading", eyebrow: "At a glance", title: "This week" },
        { id: "b2", type: "announcement", announcementId: "ann-1", eyebrow: "" },
        { id: "b3", type: "signature", name: "Jess", role: "Head", body: "Thanks" },
      ],
    });

    await duplicateWeeklyUpdate("blast-1");

    const [, fields] = firestore.createDocument.mock.calls[0];
    // A copy sent still wearing last week's subject is the mistake this must
    // not make easy.
    expect(fields.subject).toBe("");
    expect(fields.status).toBe("draft");
    expect(fields.masthead.eyebrow).toBe("Term 3");
    // Last week's announcements are exactly the ones this week should not
    // repeat, so they do not come along.
    expect(fields.blocks.map((block) => block.type)).toEqual(["heading", "signature"]);
    expect(fields.announcementIds).toEqual([]);
  });

  it("says so rather than creating an empty draft when the source is gone", async () => {
    firestore.getDocument.mockResolvedValue(null);

    await expect(duplicateWeeklyUpdate("blast-1")).rejects.toThrow(/no longer exists/i);
    expect(firestore.createDocument).not.toHaveBeenCalled();
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

  it("reads a stored callout as the text style that replaced it", () => {
    expect(
      normalizeWeeklyUpdate("blast-1", {
        subject: "x",
        blocks: [{ id: "c1", type: "callout", tone: "success", title: "Done" }],
      }).blocks
    ).toEqual([
      { id: "c1", type: "text", tone: "success", eyebrow: "", title: "Done" },
    ]);
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
