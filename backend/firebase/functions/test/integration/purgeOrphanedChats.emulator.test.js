"use strict";

const { describe, it, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");

const admin = require("firebase-admin");
const {
  purgeOrphanedChatsImpl,
} = require("../../src/chats/purgeOrphanedChats");
const {
  getAdmin,
  clearCollection,
  clearCollectionGroup,
} = require("../helpers/emulator");

const silentLogger = { info: () => {}, warn: () => {}, error: () => {} };

describe("purgeOrphanedChatsImpl (firestore emulator)", () => {
  let db;

  before(() => {
    ({ db } = getAdmin());
  });

  beforeEach(async () => {
    await clearCollectionGroup(db, "messages");
    await Promise.all([
      clearCollection(db, "users"),
      clearCollection(db, "chats"),
    ]);
  });

  after(async () => {
    await clearCollectionGroup(db, "messages");
    await Promise.all([
      clearCollection(db, "users"),
      clearCollection(db, "chats"),
    ]);
  });

  async function seedUser(uid) {
    await db.collection("users").doc(uid).set({ role: "parent", email: `${uid}@e.com` });
  }

  async function seedChat(id, participants, messageCount = 1) {
    const ref = db.collection("chats").doc(id);
    await ref.set({
      participants,
      lastMessage: "hi",
      updatedAt: admin.firestore.Timestamp.now(),
      unreadCounts: Object.fromEntries(participants.map((p) => [p, 3])),
      deletedFor: {},
      typingStatus: {},
    });
    for (let i = 0; i < messageCount; i += 1) {
      await ref.collection("messages").doc(`m${i}`).set({ text: `m${i}` });
    }
    return ref;
  }

  function run(overrides = {}) {
    return purgeOrphanedChatsImpl({
      db,
      fieldValue: admin.firestore.FieldValue,
      timestamp: admin.firestore.Timestamp.now(),
      logger: silentLogger,
      dryRun: false,
      ...overrides,
    });
  }

  it("refuses to run when there are no users at all", async () => {
    await seedChat("c1", ["a", "b"]);
    // A wrong project or a failed read looks exactly like this, and would
    // otherwise classify every chat in the database as orphaned.
    await assert.rejects(() => run(), /no users found/i);
  });

  it("deactivates an orphaned one-to-one thread without touching messages", async () => {
    await seedUser("live-1");
    await seedChat("c1", ["live-1", "gone-1"], 2);

    const out = await run();

    assert.equal(out.deactivated, 1);
    assert.equal(out.deleted, 0);

    const chat = (await db.collection("chats").doc("c1").get()).data();
    assert.equal(chat.inactive, true);
    assert.deepEqual(chat.inactiveParticipants, ["gone-1"]);
    assert.ok(chat.deletedFor["live-1"], "hidden from the survivor");
    assert.equal(chat.unreadCounts["live-1"], 0, "badge cleared");

    const messages = await db
      .collection("chats")
      .doc("c1")
      .collection("messages")
      .get();
    assert.equal(messages.size, 2, "messages preserved");
  });

  it("is idempotent — a second run reports and does nothing", async () => {
    await seedUser("live-1");
    await seedChat("c1", ["live-1", "gone-1"]);

    const first = await run();
    assert.equal(first.deactivated, 1);

    const stampedAt = (
      await db.collection("chats").doc("c1").get()
    ).data().inactiveAt;

    const second = await run();
    assert.equal(second.deactivated, 0, "no repeat work");
    assert.equal(second.alreadyInactive, 1);

    // Re-stamping would push the retirement time forward on every run.
    const after = (await db.collection("chats").doc("c1").get()).data();
    assert.equal(after.inactiveAt.isEqual(stampedAt), true, "timestamp stable");
  });

  it("leaves an unreachable malformed doc alone by default", async () => {
    await seedUser("live-1");
    await db.collection("chats").doc("broken").set({});

    const out = await run();

    assert.equal(out.unreachableLeft, 1);
    assert.equal(out.deactivated, 0);
    assert.equal(
      (await db.collection("chats").doc("broken").get()).exists,
      true
    );
  });

  it("hard-delete mode removes the thread and its messages", async () => {
    await seedUser("live-1");
    await seedChat("c1", ["live-1", "gone-1"], 3);

    const out = await run({ mode: "hard-delete" });

    assert.equal(out.deleted, 1);
    assert.equal(out.messagesDeleted, 3);
    assert.equal((await db.collection("chats").doc("c1").get()).exists, false);

    // Firestore does not cascade — the subcollection must go explicitly.
    const messages = await db
      .collection("chats")
      .doc("c1")
      .collection("messages")
      .get();
    assert.equal(messages.size, 0);
  });

  it("prunes a departed member from a group thread and leaves it usable", async () => {
    await seedUser("live-1");
    await seedUser("live-2");
    await seedChat("c1", ["live-1", "live-2", "gone-1"]);

    const out = await run();

    assert.equal(out.pruned, 1);
    const chat = (await db.collection("chats").doc("c1").get()).data();
    assert.deepEqual(chat.participants, ["live-1", "live-2"]);
    assert.equal(chat.inactive, undefined, "group thread stays active");
    assert.equal(chat.unreadCounts["gone-1"], undefined);
  });

  it("writes nothing in dry-run mode", async () => {
    await seedUser("live-1");
    await seedChat("c1", ["live-1", "gone-1"]);

    const out = await run({ dryRun: true });

    assert.equal(out.deactivated, 1, "still reports what it would do");
    const chat = (await db.collection("chats").doc("c1").get()).data();
    assert.equal(chat.inactive, undefined, "but changed nothing");
  });
});
