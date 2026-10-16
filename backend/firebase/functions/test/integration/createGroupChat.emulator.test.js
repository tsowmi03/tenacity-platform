"use strict";

const { describe, it, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");

const { getAdmin, clearCollection } = require("../helpers/emulator");
const { installMessagingSpy } = require("../helpers/messagingSpy");
const { createGroupChatImpl } = require("../../src/chats/createGroupChat");
const { sendChatMessage } = require("../../lib/notifications/chat");

/**
 * MOB-54: groups are created only through this callable, so it carries the
 * staff-only rule, the roster of names, and "same people, same group".
 */
describe("createGroupChat (firestore emulator)", () => {
  let db;
  let admin;

  const create = (uid, participantIds) =>
    createGroupChatImpl({
      uid,
      participantIds,
      deps: {
        db,
        serverTimestamp: () => admin.firestore.FieldValue.serverTimestamp(),
      },
    });

  before(() => {
    ({ db, admin } = getAdmin());
  });

  beforeEach(async () => {
    await Promise.all([
      clearCollection(db, "users"),
      clearCollection(db, "chats"),
      clearCollection(db, "userTokens"),
      clearCollection(db, "notifications"),
    ]);
    const users = {
      "tutor-1": { role: "tutor", firstName: "Tess", lastName: "Tutor" },
      "admin-1": { role: "admin", firstName: "Ada", lastName: "Admin" },
      "parent-1": { role: "parent", firstName: "Pat", lastName: "Parent" },
      "parent-2": { role: "parent", firstName: "Pia", lastName: "Parker" },
    };
    await Promise.all(
      Object.entries(users).map(([uid, data]) =>
        db.collection("users").doc(uid).set({ ...data, email: `${uid}@example.com` })
      )
    );
  });

  after(async () => {
    await Promise.all([
      clearCollection(db, "users"),
      clearCollection(db, "chats"),
      clearCollection(db, "userTokens"),
      clearCollection(db, "notifications"),
    ]);
  });

  it("creates a group a tutor starts, with every member's name and nothing else", async () => {
    const result = await create("tutor-1", ["parent-1", "parent-2"]);

    assert.equal(result.created, true);
    const chat = (await db.collection("chats").doc(result.chatId).get()).data();
    assert.equal(chat.isGroup, true);
    assert.equal(chat.createdBy, "tutor-1");
    assert.deepEqual(chat.participants, ["tutor-1", "parent-1", "parent-2"]);
    assert.deepEqual(chat.participantNames, {
      "tutor-1": { firstName: "Tess", lastName: "Tutor" },
      "parent-1": { firstName: "Pat", lastName: "Parent" },
      "parent-2": { firstName: "Pia", lastName: "Parker" },
    });
    assert.deepEqual(chat.unreadCounts, { "tutor-1": 0, "parent-1": 0, "parent-2": 0 });
    assert.equal(chat.lastMessage, "");
    assert.equal(chat.inactive, false);
  });

  it("refuses a parent", async () => {
    await assert.rejects(create("parent-1", ["tutor-1", "parent-2"]), {
      code: "permission-denied",
    });
    assert.equal((await db.collection("chats").get()).size, 0);
  });

  it("refuses too few people, and people who do not exist", async () => {
    await assert.rejects(create("tutor-1", ["parent-1"]), { code: "invalid-argument" });
    await assert.rejects(create("tutor-1", ["parent-1", "nobody"]), {
      code: "invalid-argument",
    });
    assert.equal((await db.collection("chats").get()).size, 0);
  });

  it("opens the existing group when the same people are picked again, in any order", async () => {
    const first = await create("tutor-1", ["parent-1", "parent-2"]);
    const again = await create("tutor-1", ["parent-2", "parent-1"]);
    const byOtherStaff = await create("admin-1", ["parent-1", "parent-2"]);

    assert.deepEqual(again, { chatId: first.chatId, created: false });
    // A different creator is a different set of people.
    assert.equal(byOtherStaff.created, true);
    assert.notEqual(byOtherStaff.chatId, first.chatId);
  });

  it("does not reopen a retired group", async () => {
    const first = await create("tutor-1", ["parent-1", "parent-2"]);
    await db.collection("chats").doc(first.chatId).update({ inactive: true });

    const next = await create("tutor-1", ["parent-1", "parent-2"]);
    assert.equal(next.created, true);
    assert.notEqual(next.chatId, first.chatId);
  });

  it("sends each member a push labelled from their side, with the sender in the body", async () => {
    const spy = installMessagingSpy();
    try {
      const { chatId } = await create("tutor-1", ["parent-1", "parent-2"]);
      for (const uid of ["parent-1", "parent-2"]) {
        await db
          .collection("userTokens")
          .doc(uid)
          .collection("tokens")
          .doc("t")
          .set({ token: `${uid}-token` });
      }

      await sendChatMessage.run({
        auth: { uid: "tutor-1" },
        data: { chatId, text: "Class is moved to 5pm" },
      });

      const byToken = Object.fromEntries(
        spy.sent.map((message) => [message.tokens[0], message])
      );
      assert.equal(spy.sent.length, 2);
      assert.equal(byToken["parent-1-token"].notification.title, "Tess & Pia");
      assert.equal(byToken["parent-2-token"].notification.title, "Tess & Pat");
      assert.equal(byToken["parent-1-token"].notification.body, "Tess: Class is moved to 5pm");
      assert.equal(byToken["parent-1-token"].data.isGroup, "true");
      assert.equal(byToken["parent-1-token"].data.otherUserName, "Tess & Pia");

      const chat = (await db.collection("chats").doc(chatId).get()).data();
      assert.deepEqual(chat.unreadCounts, { "tutor-1": 0, "parent-1": 1, "parent-2": 1 });
      assert.equal((await db.collection("notifications").get()).size, 2);
    } finally {
      spy.restore();
    }
  });
});
