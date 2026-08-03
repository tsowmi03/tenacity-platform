import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getAnnouncement: vi.fn(),
  listAnnouncements: vi.fn(),
  listUsers: vi.fn(),
}));

vi.mock("./announcementsApi", () => ({
  getAnnouncement: api.getAnnouncement,
  listAnnouncements: api.listAnnouncements,
}));

vi.mock("./usersApi", () => ({
  listUsers: api.listUsers,
}));

import {
  ANNOUNCEMENT_REPORTING_CACHE_MS,
  getCachedAnnouncement,
  getCachedAnnouncements,
  getCachedUsers,
  loadAnnouncementReportingOverview,
  loadCachedAnnouncement,
  loadCachedUsers,
  resetAnnouncementReportingCache,
} from "./announcementReportingCache";

const announcement = { id: "announcement-1", title: "Notice", audience: "parent" };
const users = [{ uid: "parent-1", role: "parent", readAnnouncements: [] }];

describe("announcementReportingCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAnnouncementReportingCache();
    api.listAnnouncements.mockResolvedValue([announcement]);
    api.getAnnouncement.mockResolvedValue(announcement);
    api.listUsers.mockResolvedValue(users);
  });

  it("reuses overview announcements and users when opening a fresh detail page", async () => {
    await loadAnnouncementReportingOverview();

    expect(getCachedAnnouncements()).toEqual([announcement]);
    expect(getCachedUsers()).toEqual(users);
    expect(getCachedAnnouncement("announcement-1")).toEqual(announcement);

    await Promise.all([
      loadCachedAnnouncement("announcement-1"),
      loadCachedUsers(),
    ]);

    expect(api.listAnnouncements).toHaveBeenCalledTimes(1);
    expect(api.listUsers).toHaveBeenCalledTimes(1);
    expect(api.getAnnouncement).not.toHaveBeenCalled();
  });

  it("de-duplicates simultaneous overview requests", async () => {
    await Promise.all([
      loadAnnouncementReportingOverview(),
      loadAnnouncementReportingOverview(),
    ]);

    expect(api.listAnnouncements).toHaveBeenCalledTimes(1);
    expect(api.listUsers).toHaveBeenCalledTimes(1);
  });

  it("refreshes stale detail data while leaving it available synchronously", async () => {
    let now = 10_000;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => now);
    await loadAnnouncementReportingOverview();

    now += ANNOUNCEMENT_REPORTING_CACHE_MS + 1;
    api.getAnnouncement.mockResolvedValue({ ...announcement, title: "Updated notice" });
    api.listUsers.mockResolvedValue([{ ...users[0], readAnnouncements: ["announcement-1"] }]);

    expect(getCachedAnnouncement("announcement-1").title).toBe("Notice");
    await Promise.all([
      loadCachedAnnouncement("announcement-1"),
      loadCachedUsers(),
    ]);

    expect(api.getAnnouncement).toHaveBeenCalledTimes(1);
    expect(api.listUsers).toHaveBeenCalledTimes(2);
    expect(getCachedAnnouncement("announcement-1").title).toBe("Updated notice");
    expect(getCachedUsers()[0].readAnnouncements).toEqual(["announcement-1"]);
    nowSpy.mockRestore();
  });

  it("uses the direct Firestore fallback when no overview has been loaded", async () => {
    await loadCachedAnnouncement("announcement-1");

    expect(api.getAnnouncement).toHaveBeenCalledWith("announcement-1");
    expect(getCachedAnnouncement("announcement-1")).toEqual(announcement);
    expect(api.listAnnouncements).not.toHaveBeenCalled();
  });
});
