"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  MAX_GROUP_MEMBERS,
  canCreateGroupChat,
  groupLabel,
  groupMemberKey,
  groupMembersFor,
  isGroupChat,
  memberFirstName,
  memberNameFrom,
} = require("../../src/chats/groupChat");

const names = {
  me: { firstName: "Tom", lastName: "Sowmi" },
  a: { firstName: "Sarah", lastName: "Jones" },
  b: { firstName: "Priya", lastName: "Shah" },
  c: { firstName: "Ana", lastName: "Lopez" },
  d: { firstName: "Ben", lastName: "Wu" },
};

describe("canCreateGroupChat", () => {
  it("lets admins and tutors start a group, and nobody else", () => {
    assert.equal(canCreateGroupChat("admin"), true);
    assert.equal(canCreateGroupChat("tutor"), true);
    assert.equal(canCreateGroupChat("parent"), false);
    assert.equal(canCreateGroupChat(undefined), false);
    assert.equal(canCreateGroupChat("Admin"), false);
  });
});

describe("groupMembersFor", () => {
  it("puts the creator first and keeps the picked order", () => {
    assert.deepEqual(
      groupMembersFor({ creatorId: "me", participantIds: ["b", "a"] }),
      ["me", "b", "a"]
    );
  });

  it("drops duplicates and the creator picking themselves", () => {
    assert.deepEqual(
      groupMembersFor({ creatorId: "me", participantIds: ["a", "me", "a", "b"] }),
      ["me", "a", "b"]
    );
  });

  it("needs at least two other people", () => {
    assert.throws(
      () => groupMembersFor({ creatorId: "me", participantIds: ["a"] }),
      RangeError
    );
    assert.throws(
      () => groupMembersFor({ creatorId: "me", participantIds: ["a", "a", "me"] }),
      RangeError
    );
  });

  it("allows 32 people including the creator, and no more", () => {
    const picks = (n) => Array.from({ length: n }, (_, i) => `u${i}`);
    assert.equal(
      groupMembersFor({ creatorId: "me", participantIds: picks(MAX_GROUP_MEMBERS - 1) })
        .length,
      MAX_GROUP_MEMBERS
    );
    assert.throws(
      () => groupMembersFor({ creatorId: "me", participantIds: picks(MAX_GROUP_MEMBERS) }),
      RangeError
    );
  });

  it("refuses anything that is not a user id", () => {
    for (const bad of [[1, "a"], ["", "a"], ["a/b", "c"], "a,b"]) {
      assert.throws(
        () => groupMembersFor({ creatorId: "me", participantIds: bad }),
        TypeError
      );
    }
  });
});

describe("groupMemberKey", () => {
  it("is the same for the same people in any order", () => {
    assert.equal(groupMemberKey(["me", "a", "b"]), groupMemberKey(["b", "me", "a"]));
  });

  it("differs when the people differ", () => {
    assert.notEqual(groupMemberKey(["me", "a", "b"]), groupMemberKey(["me", "a", "c"]));
  });
});

describe("groupLabel", () => {
  const label = (participants, viewerId = "me") =>
    groupLabel({ participants, participantNames: names, viewerId });

  it("names everyone but the viewer, by first name", () => {
    assert.equal(label(["me", "a"]), "Sarah");
    assert.equal(label(["me", "a", "b"]), "Sarah & Priya");
    assert.equal(label(["me", "a", "b", "c"]), "Sarah, Priya & Ana");
    assert.equal(label(["me", "a", "b", "c", "d"]), "Sarah, Priya & 2 others");
  });

  it("reads differently for each member", () => {
    assert.equal(label(["me", "a", "b"], "a"), "Tom & Priya");
  });

  it("falls back rather than showing a blank", () => {
    assert.equal(
      groupLabel({ participants: ["me", "x", "a"], participantNames: names, viewerId: "me" }),
      "Unknown & Sarah"
    );
    assert.equal(label(["me"]), "Just you");
  });
});

describe("memberFirstName / memberNameFrom", () => {
  it("uses the last name when there is no first name", () => {
    assert.equal(memberFirstName({ x: { firstName: " ", lastName: "Lee" } }, "x"), "Lee");
  });

  it("stores only the name fields, trimmed", () => {
    assert.deepEqual(
      memberNameFrom({ firstName: " Sarah ", lastName: "Jones", email: "s@example.com" }),
      { firstName: "Sarah", lastName: "Jones" }
    );
    assert.deepEqual(memberNameFrom(undefined), { firstName: "", lastName: "" });
  });
});

describe("isGroupChat", () => {
  it("is true only for an explicit flag", () => {
    assert.equal(isGroupChat({ isGroup: true }), true);
    assert.equal(isGroupChat({ participants: ["a", "b", "c"] }), false);
    assert.equal(isGroupChat(undefined), false);
  });
});
