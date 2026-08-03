import { beforeEach, describe, expect, it, vi } from "vitest";

const firestore = vi.hoisted(() => ({
  getDocument: vi.fn(),
  listDocuments: vi.fn(),
  orderBy: vi.fn(() => ({ type: "orderBy", field: "createdAt", direction: "desc" })),
}));

vi.mock("./firestoreReads", () => ({
  getDocument: firestore.getDocument,
  listDocuments: firestore.listDocuments,
  orderBy: firestore.orderBy,
  timestampToIso: vi.fn(),
}));

import { getAnnouncement, listAnnouncements } from "./announcementsApi";
import { normalizeAnnouncement, normalizeUser } from "./schemas";

describe("announcementsApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists announcements newest first with the announcement normalizer", async () => {
    firestore.listDocuments.mockResolvedValue([]);

    await listAnnouncements();

    expect(firestore.orderBy).toHaveBeenCalledWith("createdAt", "desc");
    expect(firestore.listDocuments).toHaveBeenCalledWith("announcements", {
      constraints: [{ type: "orderBy", field: "createdAt", direction: "desc" }],
      normalize: normalizeAnnouncement,
    });
  });

  it("gets one announcement by id with the announcement normalizer", async () => {
    firestore.getDocument.mockResolvedValue(null);

    await getAnnouncement("announcement-1");

    expect(firestore.getDocument).toHaveBeenCalledWith("announcements", "announcement-1", {
      normalize: normalizeAnnouncement,
    });
  });
});

describe("announcement reporting schemas", () => {
  it("normalizes legacy announcement defaults", () => {
    expect(normalizeAnnouncement("announcement-1", {
      title: "  Notice  ",
      body: null,
      audience: "unsupported",
    })).toMatchObject({
      id: "announcement-1",
      title: "Notice",
      body: "",
      audience: "all",
      archived: false,
    });
  });

  it("keeps only string announcement ids on user records", () => {
    expect(normalizeUser("parent-1", {
      firstName: "Pat",
      lastName: "Parent",
      readAnnouncements: ["announcement-1", null, 42],
    }).readAnnouncements).toEqual(["announcement-1"]);
    expect(normalizeUser("parent-2", { readAnnouncements: null }).readAnnouncements).toEqual([]);
  });
});
