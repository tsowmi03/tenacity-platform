"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDeactivateUpdate,
  planChatCleanup,
} = require("../../src/chats/chatCleanup");

describe("planChatCleanup", () => {
  it("deactivates a one-to-one thread when a real user is deleted", () => {
    const plan = planChatCleanup({
      participants: ["parent-1", "tutor-1"],
      deletedUid: "tutor-1",
      deleteHistory: false,
    });

    assert.equal(plan.action, "deactivate");
    assert.deepEqual(plan.remainingParticipants, ["parent-1"]);
  });

  it("deletes a one-to-one thread when an internal account is deleted", () => {
    const plan = planChatCleanup({
      participants: ["parent-1", "test-tutor"],
      deletedUid: "test-tutor",
      deleteHistory: true,
    });

    assert.equal(plan.action, "delete");
    assert.deepEqual(plan.remainingParticipants, ["parent-1"]);
  });

  it("prunes a group thread regardless of account type", () => {
    for (const deleteHistory of [true, false]) {
      const plan = planChatCleanup({
        participants: ["parent-1", "tutor-1", "tutor-2"],
        deletedUid: "tutor-2",
        deleteHistory,
      });

      assert.equal(plan.action, "prune");
      assert.deepEqual(plan.remainingParticipants, ["parent-1", "tutor-1"]);
    }
  });

  it("falls back to the one-to-one policy when a group drops to one member", () => {
    const plan = planChatCleanup({
      participants: ["parent-1", "tutor-1"],
      deletedUid: "tutor-1",
      deleteHistory: false,
    });

    assert.equal(plan.action, "deactivate");
  });

  it("skips a chat that no longer lists the deleted uid", () => {
    // The doc changed between the query and the plan. Leaving it alone beats
    // acting on a stale read.
    const plan = planChatCleanup({
      participants: ["parent-1", "tutor-1"],
      deletedUid: "someone-else",
      deleteHistory: true,
    });

    assert.equal(plan.action, "skip");
  });

  it("skips a malformed participant list", () => {
    const plan = planChatCleanup({
      participants: undefined,
      deletedUid: "tutor-1",
      deleteHistory: true,
    });

    assert.equal(plan.action, "skip");
  });

  it("requires a deletedUid", () => {
    assert.throws(
      () =>
        planChatCleanup({
          participants: ["a", "b"],
          deletedUid: "",
          deleteHistory: false,
        }),
      TypeError
    );
  });
});

describe("buildDeactivateUpdate", () => {
  it("flags the thread and stamps deletedFor for every participant", () => {
    const timestamp = { seconds: 1 };

    const update = buildDeactivateUpdate({
      participants: ["parent-1", "tutor-1"],
      deletedUids: ["tutor-1"],
      timestamp,
    });

    assert.equal(update.inactive, true);
    assert.equal(update.inactiveAt, timestamp);
    assert.equal(update.inactiveReason, "participant-deleted");
    assert.deepEqual(update.inactiveParticipants, ["tutor-1"]);

    // The deletedFor stamps are what reaches app builds already installed,
    // which know nothing about `inactive`.
    assert.equal(update["deletedFor.parent-1"], timestamp);
    assert.equal(update["deletedFor.tutor-1"], timestamp);

    // Otherwise the inbox badge keeps counting a thread nobody can open.
    assert.equal(update["unreadCounts.parent-1"], 0);
    assert.equal(update["unreadCounts.tutor-1"], 0);
  });

  it("records every departed participant, not just one", () => {
    // A thread remediated long after the fact may have lost several members
    // across separate deletions.
    const update = buildDeactivateUpdate({
      participants: ["parent-1", "tutor-1", "tutor-2"],
      deletedUids: ["tutor-1", "tutor-2"],
      timestamp: { seconds: 1 },
    });

    assert.deepEqual(update.inactiveParticipants, ["tutor-1", "tutor-2"]);
    assert.equal(update["deletedFor.parent-1"].seconds, 1);
  });

  it("requires a timestamp", () => {
    assert.throws(
      () =>
        buildDeactivateUpdate({
          participants: ["a"],
          deletedUids: ["a"],
          timestamp: null,
        }),
      TypeError
    );
  });

  it("requires at least one departed uid", () => {
    assert.throws(
      () =>
        buildDeactivateUpdate({
          participants: ["a", "b"],
          deletedUids: [],
          timestamp: { seconds: 1 },
        }),
      TypeError
    );
  });
});
