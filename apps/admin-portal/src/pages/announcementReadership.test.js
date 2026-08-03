import { describe, expect, it } from "vitest";
import {
  announcementAudienceLabel,
  buildAnnouncementReadership,
  userKind,
} from "./announcementReadership";

const users = [
  {
    uid: "parent-1",
    firstName: "Zoe",
    lastName: "Able",
    email: "zoe@example.com",
    role: "parent",
    readAnnouncements: ["announcement-1"],
  },
  {
    uid: "parent-2",
    firstName: "Alex",
    lastName: "Baker",
    email: "alex@example.com",
    role: "parent",
    readAnnouncements: [],
  },
  {
    uid: "tutor-1",
    firstName: "Taylor",
    lastName: "Tutor",
    email: "taylor@example.com",
    role: "tutor",
    readAnnouncements: ["announcement-1"],
  },
  {
    uid: "admin-1",
    firstName: "Ada",
    lastName: "Admin",
    email: "ada@example.com",
    role: "admin",
    readAnnouncements: ["announcement-1"],
  },
];

describe("buildAnnouncementReadership", () => {
  it("partitions only current users in the selected audience", () => {
    const result = buildAnnouncementReadership(
      { id: "announcement-1", audience: "parent" },
      users,
    );

    expect(result.eligible.map((user) => user.uid)).toEqual(["parent-1", "parent-2"]);
    expect(result.opened.map((user) => user.uid)).toEqual(["parent-1"]);
    expect(result.notOpened.map((user) => user.uid)).toEqual(["parent-2"]);
  });

  it("includes every supported user role for an all-users announcement", () => {
    const result = buildAnnouncementReadership(
      { id: "announcement-1", audience: "all" },
      users,
    );

    expect(result.eligible).toHaveLength(4);
    expect(result.opened).toHaveLength(3);
    expect(result.notOpened).toHaveLength(1);
  });

  it("treats malformed read state as not opened and de-duplicates user ids", () => {
    const result = buildAnnouncementReadership(
      { id: "announcement-1", audience: "parent" },
      [
        { ...users[0], readAnnouncements: null },
        { ...users[0], firstName: "Replacement", readAnnouncements: [] },
        { id: "unknown-1", role: "unknown", readAnnouncements: ["announcement-1"] },
      ],
    );

    expect(result.eligible).toHaveLength(1);
    expect(result.opened).toHaveLength(0);
    expect(result.notOpened[0].firstName).toBe("Replacement");
  });
});

describe("announcement readership labels", () => {
  it("uses safe labels and People route kinds", () => {
    expect(announcementAudienceLabel("parent")).toBe("Parents");
    expect(announcementAudienceLabel("legacy-value")).toBe("All users");
    expect(userKind({ role: "tutor" })).toBe("tutors");
    expect(userKind({ role: "unknown" })).toBeNull();
  });
});
