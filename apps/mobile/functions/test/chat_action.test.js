const assert = require("node:assert/strict");
const test = require("node:test");

const {
  canSendChatMessage,
  chatMessagePreview,
  chatRecipientIds,
  chatSenderDisplayName,
  shouldSuppressChatMessageNotification,
  truncateChatMessagePreview,
} = require("../lib/notifications/chat_action");

test("chat message send is limited to chat participants", () => {
  assert.equal(canSendChatMessage("userA", ["userA", "userB"]), true);
  assert.equal(canSendChatMessage("userC", ["userA", "userB"]), false);
  assert.equal(canSendChatMessage("userA", undefined), false);
});

test("chat recipients exclude sender and non-string participants", () => {
  assert.deepEqual(
    chatRecipientIds(["userA", "userB", 12, "userC"], "userA"),
    ["userB", "userC"],
  );
});

test("chat message preview preserves existing attachment copy", () => {
  assert.equal(chatMessagePreview({ text: "Hello", type: "text" }), "Hello");
  assert.equal(chatMessagePreview({ text: "", type: "image" }), "[Image]");
  assert.equal(chatMessagePreview({ text: "", type: "file" }), "[Media]");
  assert.equal(chatMessagePreview({}), "[Media]");
});

test("chat message preview truncates over 100 characters", () => {
  assert.equal(truncateChatMessagePreview("x".repeat(100)), "x".repeat(100));
  assert.equal(
    truncateChatMessagePreview("x".repeat(101)),
    `${"x".repeat(97)}...`,
  );
});

test("chat sender display name preserves existing fallback", () => {
  assert.equal(
    chatSenderDisplayName({ firstName: "Jane", lastName: "Tutor" }),
    "Jane Tutor",
  );
  assert.equal(chatSenderDisplayName({}), "Unknown");
});

test("chat send action suppresses fallback trigger", () => {
  assert.equal(
    shouldSuppressChatMessageNotification({ type: "send_chat_message" }),
    true,
  );
  assert.equal(
    shouldSuppressChatMessageNotification({ type: "other" }),
    false,
  );
  assert.equal(shouldSuppressChatMessageNotification(), false);
});
