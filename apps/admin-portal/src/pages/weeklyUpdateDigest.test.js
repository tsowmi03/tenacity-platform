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

  it("tolerates missing input", () => {
    expect(recipientSummary(undefined).eligible).toBe(0);
  });
});

describe("draftBlockers", () => {
  const ready = {
    subject: "Week of 4 August",
    intro: "Hi parents",
    announcementIds: [],
    sections: [],
  };

  it("passes a ready draft with recipients", () => {
    expect(draftBlockers(ready, { eligible: 12 })).toEqual([]);
  });

  it("requires a subject", () => {
    expect(draftBlockers({ ...ready, subject: "  " }, { eligible: 12 })).toContain(
      "Add a subject."
    );
  });

  it("requires some content", () => {
    expect(
      draftBlockers({ ...ready, intro: "   " }, { eligible: 12 })
    ).toContain("Add an intro, an announcement or a section.");
  });

  it("accepts an announcement or a section as content", () => {
    expect(
      draftBlockers({ ...ready, intro: "", announcementIds: ["a"] }, { eligible: 1 })
    ).toEqual([]);
    expect(
      draftBlockers(
        { ...ready, intro: "", sections: [{ title: "Fees", body: "Due Friday" }] },
        { eligible: 1 }
      )
    ).toEqual([]);
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
