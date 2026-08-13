"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  buildPruneUpdate,
  classifyChat,
  PARTICIPANT_KEYED_FIELDS,
} = require("../../src/chats/orphanedChats");

const live = (...uids) => new Set(uids);

describe("classifyChat", () => {
  it("leaves a chat alone while every participant still exists", () => {
    const verdict = classifyChat({
      participants: ["parent-1", "tutor-1"],
      liveUids: live("parent-1", "tutor-1"),
    });

    assert.equal(verdict.action, "none");
    assert.deepEqual(verdict.deadUids, []);
  });

  it("deletes a one-to-one chat whose other party was deleted", () => {
    const verdict = classifyChat({
      participants: ["parent-1", "test-tutor"],
      liveUids: live("parent-1"),
    });

    assert.equal(verdict.action, "delete");
    assert.equal(verdict.reason, "one-to-one-with-deleted-user");
    assert.deepEqual(verdict.deadUids, ["test-tutor"]);
    assert.deepEqual(verdict.remainingParticipants, ["parent-1"]);
  });

  it("deletes a chat where nobody is left", () => {
    const verdict = classifyChat({
      participants: ["test-parent", "test-tutor"],
      liveUids: live("someone-else"),
    });

    assert.equal(verdict.action, "delete");
    assert.equal(verdict.reason, "no-live-participants");
    assert.deepEqual(verdict.deadUids, ["test-parent", "test-tutor"]);
  });

  it("prunes a deleted member from a group chat but keeps the thread", () => {
    const verdict = classifyChat({
      participants: ["parent-1", "tutor-1", "test-admin"],
      liveUids: live("parent-1", "tutor-1"),
    });

    assert.equal(verdict.action, "prune");
    assert.equal(verdict.reason, "group-with-deleted-member");
    assert.deepEqual(verdict.deadUids, ["test-admin"]);
    assert.deepEqual(verdict.remainingParticipants, ["parent-1", "tutor-1"]);
  });

  it("deletes a group chat that drops below two live members", () => {
    // One survivor cannot hold a conversation, so the thread goes rather than
    // leaving a dead row in that person's inbox.
    const verdict = classifyChat({
      participants: ["parent-1", "test-tutor", "test-admin"],
      liveUids: live("parent-1"),
    });

    assert.equal(verdict.action, "delete");
    assert.equal(verdict.reason, "one-to-one-with-deleted-user");
    assert.deepEqual(verdict.remainingParticipants, ["parent-1"]);
  });

  it("flags a malformed participant list under its own reason", () => {
    for (const participants of [undefined, "parent-1", ["parent-1", null], ["", "x"]]) {
      const verdict = classifyChat({ participants, liveUids: live("parent-1") });
      assert.equal(verdict.action, "delete");
      assert.equal(verdict.reason, "malformed-participants");
    }
  });

  it("refuses a liveUids argument that is not a Set", () => {
    // An array would make `.has` undefined and classify every chat as orphaned.
    assert.throws(
      () => classifyChat({ participants: ["a", "b"], liveUids: ["a", "b"] }),
      TypeError
    );
  });
});

describe("buildPruneUpdate", () => {
  it("rewrites participants and clears every per-uid map entry", () => {
    const sentinel = { __delete: true };
    const fieldValue = { delete: () => sentinel };

    const update = buildPruneUpdate({
      deadUids: ["test-admin"],
      remainingParticipants: ["parent-1", "tutor-1"],
      fieldValue,
    });

    assert.deepEqual(update.participants, ["parent-1", "tutor-1"]);
    for (const field of PARTICIPANT_KEYED_FIELDS) {
      assert.equal(update[`${field}.test-admin`], sentinel);
    }
  });

  it("clears entries for every dead uid", () => {
    const fieldValue = { delete: () => "DELETE" };

    const update = buildPruneUpdate({
      deadUids: ["a", "b"],
      remainingParticipants: ["c", "d"],
      fieldValue,
    });

    assert.equal(update["unreadCounts.a"], "DELETE");
    assert.equal(update["unreadCounts.b"], "DELETE");
    assert.equal(
      Object.keys(update).length,
      1 + 2 * PARTICIPANT_KEYED_FIELDS.length
    );
  });

  it("requires a FieldValue", () => {
    assert.throws(
      () =>
        buildPruneUpdate({
          deadUids: ["a"],
          remainingParticipants: ["b", "c"],
          fieldValue: {},
        }),
      TypeError
    );
  });
});
