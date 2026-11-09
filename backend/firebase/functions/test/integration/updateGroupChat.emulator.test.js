"use strict";

const { describe, it, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");

const { getAdmin, clearCollection } = require("../helpers/emulator");
const {
  getGroupChatAccessImpl,
  updateGroupChatImpl,
} = require("../../src/chats/updateGroupChat");
const { groupMemberKey } = require("../../src/chats/groupChat");
const { installMessagingSpy } = require("../helpers/messagingSpy");
const { sendChatMessage } = require("../../lib/notifications/chat");

/** MOB-70: renaming a group and changing who is in it. */
describe("updateGroupChat (firestore emulator)", () => {
  let db;
  let admin;

  const users = {
    "admin-1": { role: "admin", firstName: "Ada", lastName: "Admin" },
    "tutor-1": { role: "tutor", firstName: "Tess", lastName: "Tutor" },
    "tutor-2": { role: "tutor", firstName: "Theo", lastName: "Teach" },
    "parent-1": { role: "parent", firstName: "Pat", lastName: "Parent" },
    "parent-2": { role: "parent", firstName: "Pia", lastName: "Parker" },
    "parent-3": { role: "parent", firstName: "Paz", lastName: "Page" },
  };

  const deps = () => ({
    db,
    serverTimestamp: () => admin.firestore.FieldValue.serverTimestamp(),
    fieldValue: admin.firestore.FieldValue,
  });

  const update = (uid, data) =>
    updateGroupChatImpl({ uid, data: { chatId: "g", ...data }, deps: deps() });

  const group = async (participants, extra = {}, id = "g") => {
    const participantNames = {};
    for (const uid of participants) {
      participantNames[uid] = {
        firstName: users[uid].firstName,
        lastName: users[uid].lastName,
      };
    }
    await db.collection("chats").doc(id).set({
      isGroup: true,
      participants,
      participantNames,
      memberKey: groupMemberKey(participants),
      lastMessage: "Hello",
      unreadCounts: Object.fromEntries(participants.map((uid) => [uid, 2])),
      deletedFor: {},
      inactive: false,
      ...extra,
    });
  };

  const chat = async (id = "g") =>
    (await db.collection("chats").doc(id).get()).data();

  const lines = async () => {
    const snap = await db.collection("chats").doc("g").collection("messages").get();
    return snap.docs.map((doc) => doc.data());
  };

  const refused = (code) => (error) => {
    assert.equal(error.code, code);
    return true;
  };

  const clearAll = () =>
    Promise.all([
      clearCollection(db, "users"),
      clearCollection(db, "userTokens"),
      clearCollection(db, "notifications"),
      // Recursive, so one test's thread lines do not reach the next.
      db.recursiveDelete(db.collection("chats")),
    ]);

  before(() => {
    ({ db, admin } = getAdmin());
  });

  beforeEach(async () => {
    await clearAll();
    await Promise.all(
      Object.entries(users).map(([uid, data]) =>
        db.collection("users").doc(uid).set(data)
      )
    );
  });

  after(clearAll);

  describe("rename", () => {
    it("names the group and records it in the thread", async () => {
      await group(["tutor-1", "parent-1", "parent-2"]);

      await update("tutor-1", { action: "rename", name: " Year 7 " });

      const after = await chat();
      assert.equal(after.name, "Year 7");
      assert.equal(after.lastMessage, "Tess renamed the group to Year 7");
      const [line] = await lines();
      assert.equal(line.type, "system");
      assert.equal(line.senderId, "tutor-1");
    });

    it("refuses a parent", async () => {
      await group(["tutor-1", "parent-1", "parent-2"]);
      await assert.rejects(
        update("parent-1", { action: "rename", name: "Mine" }),
        refused("permission-denied")
      );
    });

    it("lets a tutor rename even when the group has an admin", async () => {
      await group(["admin-1", "tutor-1", "parent-1"]);
      await update("tutor-1", { action: "rename", name: "Year 7" });
      assert.equal((await chat()).name, "Year 7");
    });

    it("clears the name when given a blank one", async () => {
      await group(["tutor-1", "parent-1", "parent-2"], { name: "Year 7" });
      await update("tutor-1", { action: "rename", name: "  " });
      assert.equal("name" in (await chat()), false);
    });

    it("adds no line when the name has not changed", async () => {
      await group(["tutor-1", "parent-1", "parent-2"], { name: "Year 7" });
      const result = await update("tutor-1", { action: "rename", name: "Year 7" });
      assert.equal(result.changed, false);
      assert.equal((await lines()).length, 0);
    });

    it("does not start a group nobody has written in", async () => {
      await group(["tutor-1", "parent-1", "parent-2"], { lastMessage: "" });
      await update("tutor-1", { action: "rename", name: "Year 7" });
      assert.equal((await chat()).lastMessage, "");
    });
  });

  describe("who can change members", () => {
    it("is only admins when the group has an admin", async () => {
      await group(["admin-1", "tutor-1", "parent-1", "parent-2"]);
      await assert.rejects(
        update("tutor-1", { action: "remove", userId: "parent-1" }),
        refused("permission-denied")
      );
      await update("admin-1", { action: "remove", userId: "parent-1" });
      assert.equal((await chat()).participants.includes("parent-1"), false);
    });

    it("is any tutor when the group has no admin", async () => {
      await group(["tutor-1", "tutor-2", "parent-1"]);
      await update("tutor-2", { action: "add", userIds: ["parent-2"] });
      assert.equal((await chat()).participants.includes("parent-2"), true);
    });

    it("is never a parent", async () => {
      await group(["tutor-1", "parent-1", "parent-2"]);
      await assert.rejects(
        update("parent-1", { action: "add", userIds: ["parent-3"] }),
        refused("permission-denied")
      );
    });

    it("refuses someone outside the group", async () => {
      await group(["tutor-1", "parent-1", "parent-2"]);
      await assert.rejects(
        update("tutor-2", { action: "add", userIds: ["parent-3"] }),
        refused("permission-denied")
      );
    });

    it("uses current roles, so a promoted member gains control", async () => {
      await group(["tutor-1", "tutor-2", "parent-1"]);
      await db.collection("users").doc("tutor-2").update({ role: "admin" });
      await assert.rejects(
        update("tutor-1", { action: "remove", userId: "parent-1" }),
        refused("permission-denied")
      );
    });
  });

  describe("add", () => {
    it("adds someone with their name and a clean slate", async () => {
      await group(["tutor-1", "parent-1", "parent-2"]);

      await update("tutor-1", { action: "add", userIds: ["parent-3"] });

      const after = await chat();
      assert.deepEqual(after.participants, [
        "tutor-1", "parent-1", "parent-2", "parent-3",
      ]);
      assert.equal(after.participantNames["parent-3"].firstName, "Paz");
      assert.equal(after.unreadCounts["parent-3"], 0);
      assert.equal(after.memberKey, groupMemberKey(after.participants));
      assert.equal(after.lastMessage, "Tess added Paz");
    });

    it("names everyone added in one line", async () => {
      await group(["tutor-1", "parent-1", "parent-2"]);
      await update("tutor-1", {
        action: "add",
        userIds: ["parent-3", "tutor-2"],
      });
      assert.equal((await chat()).lastMessage, "Tess added Paz and Theo");
    });

    it("refuses going over the limit", async () => {
      const crowd = Array.from({ length: 30 }, (_, i) => `extra-${i}`);
      for (const uid of crowd) users[uid] = { role: "parent", firstName: uid, lastName: "" };
      await Promise.all(
        crowd.map((uid) => db.collection("users").doc(uid).set(users[uid]))
      );
      await group(["tutor-1", "parent-1", ...crowd]);
      for (const uid of crowd) delete users[uid];

      await assert.rejects(
        update("tutor-1", { action: "add", userIds: ["parent-2"] }),
        refused("invalid-argument")
      );
    });

    it("refuses a change matching another active group", async () => {
      await group(["tutor-1", "parent-1", "parent-2"]);
      await group(["tutor-1", "parent-1", "parent-2", "parent-3"], {}, "other");
      await assert.rejects(
        update("tutor-1", { action: "add", userIds: ["parent-3"] }),
        refused("failed-precondition")
      );
    });

    it("ignores an inactive group with the same members", async () => {
      await group(["tutor-1", "parent-1", "parent-2"]);
      await group(
        ["tutor-1", "parent-1", "parent-2", "parent-3"],
        { inactive: true },
        "other"
      );
      await update("tutor-1", { action: "add", userIds: ["parent-3"] });
      assert.equal((await chat()).participants.length, 4);
    });
  });

  describe("remove", () => {
    it("takes the person out but keeps their name for old messages", async () => {
      await group(["tutor-1", "parent-1", "parent-2", "parent-3"]);

      await update("tutor-1", { action: "remove", userId: "parent-3" });

      const after = await chat();
      assert.equal(after.participants.includes("parent-3"), false);
      assert.equal(after.unreadCounts["parent-3"], undefined);
      assert.equal(after.participantNames["parent-3"].firstName, "Paz");
      assert.equal(after.lastMessage, "Tess removed Paz");
    });

    it("can take a group down to two, and it stays a group", async () => {
      await group(["tutor-1", "parent-1", "parent-2"]);
      await update("tutor-1", { action: "remove", userId: "parent-2" });
      const after = await chat();
      assert.equal(after.participants.length, 2);
      assert.equal(after.isGroup, true);
      assert.equal(after.inactive, false);
    });

    it("refuses leaving one person", async () => {
      await group(["tutor-1", "parent-1"]);
      await assert.rejects(
        update("tutor-1", { action: "remove", userId: "parent-1" }),
        refused("failed-precondition")
      );
    });

    it("refuses a change matching another active group", async () => {
      await group(["tutor-1", "parent-1", "parent-2", "parent-3"]);
      await group(["tutor-1", "parent-1", "parent-2"], {}, "other");
      await assert.rejects(
        update("tutor-1", { action: "remove", userId: "parent-3" }),
        refused("failed-precondition")
      );
    });

    it("refuses removing yourself", async () => {
      await group(["tutor-1", "parent-1", "parent-2"]);
      await assert.rejects(
        update("tutor-1", { action: "remove", userId: "tutor-1" }),
        refused("invalid-argument")
      );
    });
  });

  describe("leave", () => {
    it("lets a parent leave", async () => {
      await group(["tutor-1", "parent-1", "parent-2"]);
      await update("parent-1", { action: "leave" });
      const after = await chat();
      assert.deepEqual(after.participants, ["tutor-1", "parent-2"]);
      assert.equal(after.lastMessage, "Pat left the group");
    });

    it("goes through even when it matches another group", async () => {
      await group(["tutor-1", "parent-1", "parent-2", "parent-3"]);
      await group(["tutor-1", "parent-1", "parent-2"], {}, "other");
      await update("parent-3", { action: "leave" });
      assert.equal((await chat()).participants.length, 3);
    });

    it("retires a group left with one person", async () => {
      await group(["tutor-1", "parent-1"]);
      await update("parent-1", { action: "leave" });
      const after = await chat();
      assert.deepEqual(after.participants, ["tutor-1"]);
      assert.equal(after.inactive, true);
    });
  });

  it("titles a push with the group's name", async () => {
    const spy = installMessagingSpy();
    try {
      await group(["tutor-1", "parent-1", "parent-2"], { name: "Year 7" });
      await db
        .collection("userTokens")
        .doc("parent-1")
        .collection("tokens")
        .doc("t")
        .set({ token: "parent-1-token" });

      await sendChatMessage.run({
        auth: { uid: "tutor-1" },
        data: { chatId: "g", text: "Moved to 5pm" },
      });

      assert.equal(spy.sent[0].notification.title, "Year 7");
    } finally {
      spy.restore();
    }
  });

  it("does not let a client write an activity line", async () => {
    await group(["tutor-1", "parent-1", "parent-2"]);
    await assert.rejects(
      sendChatMessage.run({
        auth: { uid: "parent-1" },
        data: { chatId: "g", text: "Tess removed Pia", messageType: "system" },
      }),
      refused("invalid-argument")
    );
  });

  it("refuses a one-to-one thread", async () => {
    await group(["tutor-1", "parent-1"], { isGroup: false });
    await assert.rejects(
      update("tutor-1", { action: "rename", name: "Nope" }),
      refused("not-found")
    );
  });

  describe("getGroupChatAccess", () => {
    const access = (uid) =>
      getGroupChatAccessImpl({ uid, chatId: "g", deps: deps() });

    it("reports what each member can do in a group with an admin", async () => {
      await group(["admin-1", "tutor-1", "parent-1"]);
      assert.deepEqual(await access("admin-1"), {
        canRename: true,
        canManageMembers: true,
      });
      assert.deepEqual(await access("tutor-1"), {
        canRename: true,
        canManageMembers: false,
      });
      assert.deepEqual(await access("parent-1"), {
        canRename: false,
        canManageMembers: false,
      });
    });

    it("gives a tutor member control when there is no admin", async () => {
      await group(["tutor-1", "parent-1", "parent-2"]);
      assert.equal((await access("tutor-1")).canManageMembers, true);
    });

    it("refuses someone outside the group", async () => {
      await group(["tutor-1", "parent-1", "parent-2"]);
      await assert.rejects(access("tutor-2"), refused("permission-denied"));
    });
  });
});
