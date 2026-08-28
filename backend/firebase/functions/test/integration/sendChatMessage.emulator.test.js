"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const { getAdmin, clearCollection } = require("../helpers/emulator");
const { sendChatMessage } = require("../../lib/notifications/chat");

/**
 * MOB-31: the app now picks the message id so that the copy it is already
 * showing and the document written here are one message. That makes the id a
 * caller-supplied path segment and an idempotency key, both of which are
 * exercised here.
 */
describe("sendChatMessage (firestore emulator)", () => {
  let db;

  const call = (data, uid = "me") =>
    sendChatMessage.run({ auth: { uid }, data });

  async function seedChat(participants = ["me", "them"]) {
    const chatId = randomUUID();
    await db.collection("chats").doc(chatId).set({
      participants,
      lastMessage: "",
      unreadCounts: { me: 0, them: 0 },
    });
    return chatId;
  }

  const messagesOf = (chatId) =>
    db.collection("chats").doc(chatId).collection("messages").get();

  before(() => {
    ({ db } = getAdmin());
  });

  after(async () => {
    await clearCollection(db, "chats");
  });

  it("writes the message at the id the client chose", async () => {
    const chatId = await seedChat();
    const clientMessageId = randomUUID();

    const result = await call({
      chatId,
      clientMessageId,
      text: "Are you free Thursday?",
    });

    assert.equal(result.messageId, clientMessageId);
    const messages = await messagesOf(chatId);
    assert.equal(messages.size, 1);
    assert.equal(messages.docs[0].id, clientMessageId);
    assert.equal(messages.docs[0].data().text, "Are you free Thursday?");
  });

  it("leaves one message when the same send is retried", async () => {
    const chatId = await seedChat();
    const clientMessageId = randomUUID();
    const payload = { chatId, clientMessageId, text: "Are you free Thursday?" };

    const first = await call(payload);
    const second = await call(payload);

    assert.equal(second.messageId, first.messageId);
    assert.equal((await messagesOf(chatId)).size, 1);
    // A completed send already cleared notificationAction (see the `finally`
    // in sendChatMessage); the retry above must not have re-touched it.
    const doc = await db
      .collection("chats")
      .doc(chatId)
      .collection("messages")
      .doc(clientMessageId)
      .get();
    assert.equal(doc.data().notificationAction, undefined);
  });

  it("finishes notifying on retry if the original call never got that far", async () => {
    // Simulates a crash between the transaction commit and the notify-and-
    // clear step: the message document exists, with notificationAction still
    // on it, exactly as the transaction alone would leave it. `onMessageReceived`
    // already fired once at creation and suppressed itself because of that
    // field, so this retry is the only remaining chance to notify.
    const chatId = await seedChat();
    const clientMessageId = randomUUID();
    await db
      .collection("chats")
      .doc(chatId)
      .collection("messages")
      .doc(clientMessageId)
      .set({
        senderId: "me",
        text: "Are you free Thursday?",
        type: "text",
        timestamp: new Date(),
        readBy: {},
        isPending: false,
        notificationAction: { type: "send_chat_message", actorId: "me" },
      });

    const result = await call({
      chatId,
      clientMessageId,
      text: "Are you free Thursday?",
    });

    assert.equal(result.messageId, clientMessageId);
    assert.equal((await messagesOf(chatId)).size, 1);
    const doc = await db
      .collection("chats")
      .doc(chatId)
      .collection("messages")
      .doc(clientMessageId)
      .get();
    assert.equal(doc.data().notificationAction, undefined);
  });

  it("refuses an id another participant already wrote", async () => {
    const chatId = await seedChat();
    const clientMessageId = randomUUID();
    await call({ chatId, clientMessageId, text: "Mine" }, "me");

    await assert.rejects(
      () => call({ chatId, clientMessageId, text: "Not yours" }, "them"),
      (error) => error.code === "permission-denied"
    );
    assert.equal((await messagesOf(chatId)).size, 1);
  });

  it("rejects an id Firestore could not use as a document id", async () => {
    const chatId = await seedChat();

    await assert.rejects(
      () => call({ chatId, clientMessageId: "chats/elsewhere", text: "Hi" }),
      (error) => error.code === "invalid-argument"
    );
    assert.equal((await messagesOf(chatId)).size, 0);
  });

  it("still auto-assigns an id for builds that send none", async () => {
    const chatId = await seedChat();

    const result = await call({ chatId, text: "From an older build" });

    const messages = await messagesOf(chatId);
    assert.equal(messages.size, 1);
    assert.equal(messages.docs[0].id, result.messageId);
  });
});
