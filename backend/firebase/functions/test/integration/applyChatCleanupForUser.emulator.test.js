"use strict";

const { describe, it, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");

const admin = require("firebase-admin");
const {
  applyChatCleanupForUser,
} = require("../../src/chats/chatCleanup");
const {
  getAdmin,
  clearCollection,
  clearCollectionGroup,
} = require("../helpers/emulator");

const silentLogger = { info: () => {}, warn: () => {}, error: () => {} };

/**
 * Covers the cleanup used by `deleteUserByUidV2`, the path the mobile app
 * actually takes when an admin removes someone or a user deletes their own
 * account. `deleteUserImpl` has its own tests; this is the standalone variant.
 */
describe("applyChatCleanupForUser (firestore emulator)", () => {
  let db;

  before(() => {
    ({ db } = getAdmin());
  });

  beforeEach(async () => {
    await clearCollectionGroup(db, "messages");
    await clearCollection(db, "chats");
  });

  after(async () => {
    await clearCollectionGroup(db, "messages");
    await clearCollection(db, "chats");
  });

  async function seedChat(id, participants, messageCount = 1) {
    const ref = db.collection("chats").doc(id);
    await ref.set({
      participants,
      lastMessage: "hi",
      updatedAt: admin.firestore.Timestamp.now(),
      unreadCounts: Object.fromEntries(participants.map((p) => [p, 4])),
      deletedFor: {},
      typingStatus: {},
    });
    for (let i = 0; i < messageCount; i += 1) {
      await ref.collection("messages").doc(`m${i}`).set({ text: `m${i}` });
    }
    return ref;
  }

  function run(uid, overrides = {}) {
    return applyChatCleanupForUser({
      db,
      fieldValue: admin.firestore.FieldValue,
      uid,
      timestamp: admin.firestore.Timestamp.now(),
      logger: silentLogger,
      ...overrides,
    });
  }

  it("deactivates a one-to-one thread and keeps its messages", async () => {
    await seedChat("c1", ["parent-1", "gone-1"], 3);

    const stats = await run("gone-1");

    assert.deepEqual(stats, {
      chatsDeleted: 0,
      chatsDeactivated: 1,
      chatsPruned: 0,
    });

    const chat = (await db.collection("chats").doc("c1").get()).data();
    assert.equal(chat.inactive, true);
    assert.deepEqual(chat.inactiveParticipants, ["gone-1"]);
    assert.ok(chat.deletedFor["parent-1"], "hidden from the survivor");
    assert.equal(chat.unreadCounts["parent-1"], 0, "badge cleared");

    const messages = await db
      .collection("chats")
      .doc("c1")
      .collection("messages")
      .get();
    assert.equal(messages.size, 3, "history preserved");
  });

  it("prunes a group thread and leaves it usable", async () => {
    await seedChat("c1", ["parent-1", "tutor-1", "gone-1"]);

    const stats = await run("gone-1");

    assert.equal(stats.chatsPruned, 1);
    const chat = (await db.collection("chats").doc("c1").get()).data();
    assert.deepEqual(chat.participants, ["parent-1", "tutor-1"]);
    assert.equal(chat.inactive, undefined, "group thread stays active");
    assert.equal(chat.unreadCounts["gone-1"], undefined);
  });

  it("hard-deletes with messages when deleteHistory is set", async () => {
    await seedChat("c1", ["parent-1", "gone-1"], 2);

    const stats = await run("gone-1", { deleteHistory: true });

    assert.equal(stats.chatsDeleted, 1);
    assert.equal((await db.collection("chats").doc("c1").get()).exists, false);
    const messages = await db
      .collection("chats")
      .doc("c1")
      .collection("messages")
      .get();
    assert.equal(messages.size, 0, "subcollection removed, not stranded");
  });

  it("leaves chats the user was never part of alone", async () => {
    await seedChat("c1", ["parent-1", "tutor-1"]);

    const stats = await run("gone-1");

    assert.deepEqual(stats, {
      chatsDeleted: 0,
      chatsDeactivated: 0,
      chatsPruned: 0,
    });
    const chat = (await db.collection("chats").doc("c1").get()).data();
    assert.equal(chat.inactive, undefined);
  });

  it("handles a user across many threads in more than one batch", async () => {
    // Exercises the chunking: this path serves self-service deletion and so
    // cannot refuse an oversized cleanup the way deleteUserImpl can.
    const ids = [];
    for (let i = 0; i < 25; i += 1) {
      ids.push(`c${i}`);
      await seedChat(`c${i}`, [`parent-${i}`, "gone-1"], 0);
    }

    const stats = await run("gone-1");

    assert.equal(stats.chatsDeactivated, 25);
    for (const id of ids) {
      const chat = (await db.collection("chats").doc(id).get()).data();
      assert.equal(chat.inactive, true, `${id} deactivated`);
    }
  });

  it("is idempotent enough to run twice without corrupting a thread", async () => {
    await seedChat("c1", ["parent-1", "gone-1"], 1);

    await run("gone-1");
    const first = (await db.collection("chats").doc("c1").get()).data();
    await run("gone-1");
    const second = (await db.collection("chats").doc("c1").get()).data();

    assert.equal(second.inactive, true);
    assert.deepEqual(second.participants, first.participants);
    assert.equal(
      (await db.collection("chats").doc("c1").collection("messages").get()).size,
      1
    );
  });

  it("rejects a missing uid or timestamp rather than acting on everything", async () => {
    // Async, so these reject rather than throw synchronously.
    await assert.rejects(
      applyChatCleanupForUser({
        db,
        fieldValue: admin.firestore.FieldValue,
        uid: "",
        timestamp: admin.firestore.Timestamp.now(),
      }),
      TypeError
    );
    await assert.rejects(
      applyChatCleanupForUser({
        db,
        fieldValue: admin.firestore.FieldValue,
        uid: "gone-1",
        timestamp: null,
      }),
      TypeError
    );
  });
});
