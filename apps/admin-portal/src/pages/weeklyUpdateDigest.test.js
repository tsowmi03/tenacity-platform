import { describe, expect, it } from "vitest";
import {
  DEFAULT_DIGEST_WINDOW,
  digestCandidates,
  digestWindow,
  draftBlockers,
  isParentVisibleAnnouncement,
  recipientSummary,
  statusLabel,
  statusTone,
} from "./weeklyUpdateDigest";

const NOW = Date.parse("2026-08-06T00:00:00Z");

function announcement(id, overrides = {}) {
  return {
    id,
    title: id,
    audience: "parent",
    archived: false,
    createdAtIso: "2026-08-05T00:00:00.000Z",
    ...overrides,
  };
}

describe("isParentVisibleAnnouncement", () => {
  it("accepts parent and all audiences only, and never archived", () => {
    expect(isParentVisibleAnnouncement(announcement("a"))).toBe(true);
    expect(isParentVisibleAnnouncement(announcement("b", { audience: "all" }))).toBe(true);
    expect(isParentVisibleAnnouncement(announcement("c", { audience: "tutor" }))).toBe(false);
    expect(isParentVisibleAnnouncement(announcement("d", { audience: "admin" }))).toBe(false);
    expect(isParentVisibleAnnouncement(announcement("e", { archived: true }))).toBe(false);
    expect(isParentVisibleAnnouncement(null)).toBe(false);
  });
});

describe("digestCandidates", () => {
  const rows = [
    announcement("recent", { createdAtIso: "2026-08-05T00:00:00.000Z" }),
    announcement("older", { createdAtIso: "2026-07-01T00:00:00.000Z" }),
    announcement("staff", { audience: "tutor" }),
    announcement("gone", { archived: true }),
  ];

  it("keeps parent-visible announcements inside the window, newest first", () => {
    const result = digestCandidates(rows, { windowId: "7", now: NOW });
    expect(result.map((row) => row.id)).toEqual(["recent"]);
  });

  it("widens with the window", () => {
    expect(
      digestCandidates(rows, { windowId: "all", now: NOW }).map((row) => row.id)
    ).toEqual(["recent", "older"]);
  });

  it("keeps an already-selected announcement even once it ages out", () => {
    const result = digestCandidates(rows, {
      windowId: "7",
      selectedIds: ["older"],
      now: NOW,
    });
    expect(result.map((row) => row.id)).toEqual(["recent", "older"]);
  });

  it("never resurfaces staff-only or archived announcements, even if selected", () => {
    const result = digestCandidates(rows, {
      windowId: "all",
      selectedIds: ["staff", "gone"],
      now: NOW,
    });
    expect(result.map((row) => row.id)).toEqual(["recent", "older"]);
  });

  it("tolerates missing input", () => {
    expect(digestCandidates(undefined, { now: NOW })).toEqual([]);
  });
});

describe("digestWindow", () => {
  it("falls back to the default for an unknown id", () => {
    expect(digestWindow("nonsense").id).toBe(DEFAULT_DIGEST_WINDOW);
  });
});

describe("recipientSummary", () => {
  it("counts eligible parents, opt-outs and unusable addresses", () => {
    const summary = recipientSummary([
      { role: "parent", email: "a@example.com" },
      { role: "parent", email: "A@example.com" },
      { role: "parent", email: "b@example.com", emailBlastOptOut: true },
      { role: "parent", email: "" },
      { role: "parent", email: "not-an-email" },
      { role: "tutor", email: "t@example.com" },
      { role: "admin", email: "admin@example.com" },
    ]);

    expect(summary).toEqual({
      total: 5,
      eligible: 1,
      optedOut: 1,
      unusable: 2,
    });
  });

  it("suppresses a shared inbox when either account opted out", () => {
    // Must match the backend: the opt-out belongs to the address, so the
    // preview cannot promise a delivery the send will not make.
    const summary = recipientSummary([
      { role: "parent", email: "shared@example.com" },
      { role: "parent", email: "Shared@Example.com", emailBlastOptOut: true },
    ]);

    expect(summary.eligible).toBe(0);
    expect(summary.optedOut).toBe(2);
  });

  it("tolerates missing input", () => {
    expect(recipientSummary(undefined).eligible).toBe(0);
  });
});

describe("draftBlockers", () => {
  const ready = {
    subject: "Week of 4 August",
    blocks: [{ id: "b1", type: "text", tone: "note", body: "Hi parents" }],
  };

  it("passes a ready draft with recipients", () => {
    expect(draftBlockers(ready, { eligible: 12 })).toEqual([]);
  });

  it("requires a subject", () => {
    expect(draftBlockers({ ...ready, subject: "  " }, { eligible: 12 })).toContain(
      "Add a subject."
    );
  });

  it("requires a block with something in it", () => {
    expect(draftBlockers({ ...ready, blocks: [] }, { eligible: 12 })).toContain(
      "Add a block with something in it."
    );
    expect(
      draftBlockers(
        { ...ready, blocks: [{ id: "b1", type: "spacer", size: "lg" }] },
        { eligible: 12 }
      )
    ).toContain("Add a block with something in it.");
  });

  it("accepts an announcement block as content", () => {
    expect(
      draftBlockers(
        { ...ready, blocks: [{ id: "b1", type: "announcement", announcementId: "a" }] },
        { eligible: 1 }
      )
    ).toEqual([]);
  });

  it("names the block that needs fixing", () => {
    expect(
      draftBlockers(
        {
          ...ready,
          blocks: [
            ...ready.blocks,
            { id: "b2", type: "button", label: "Book", url: "tenacity.test" },
          ],
        },
        { eligible: 1 }
      )
    ).toContain("Block 2 (Button): add a link starting with https://.");
  });

  it("blocks a send with nobody to send to", () => {
    expect(draftBlockers(ready, { eligible: 0 })).toContain(
      "No parents are eligible to receive this update."
    );
  });
});

describe("status presentation", () => {
  it("maps statuses to labels and tones", () => {
    expect([statusLabel("draft"), statusTone("draft")]).toEqual(["Draft", "neutral"]);
    expect([statusLabel("sending"), statusTone("sending")]).toEqual(["Sending", "warn"]);
    expect([statusLabel("sent"), statusTone("sent")]).toEqual(["Sent", "success"]);
    expect([statusLabel("failed"), statusTone("failed")]).toEqual(["Failed", "danger"]);
  });
});
