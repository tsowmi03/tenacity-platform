"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { manageQuestionBankImpl, validateUpdates } = require("../../src/questionBank/review");

// A small in-memory Firestore: enough for get/set/update, equality queries,
// batches and getAll.
function fakeDb(seed = {}) {
  const store = new Map(Object.entries(seed).map(([path, data]) => [path, { ...data }]));
  let auto = 0;
  const docRef = (path) => ({
    id: path.split("/").pop(),
    path,
    get: async () => snap(path),
  });
  const snap = (path) => ({
    id: path.split("/").pop(),
    ref: docRef(path),
    exists: store.has(path),
    data: () => store.get(path) && { ...store.get(path) },
    get: (field) => store.get(path)?.[field],
  });
  const apply = (path, data, merge) => {
    const current = merge ? { ...(store.get(path) || {}) } : {};
    for (const [key, value] of Object.entries(data)) {
      current[key] = value && value.__increment !== undefined ? (current[key] || 0) + value.__increment : value;
    }
    store.set(path, current);
  };
  const collection = (name) => {
    const filters = [];
    const query = {
      doc: (docId) => docRef(`${name}/${docId || `auto${++auto}`}`),
      where: (field, op, value) => {
        filters.push([field, value]);
        return query;
      },
      limit: () => query,
      get: async () => {
        const docs = [...store.keys()]
          .filter((path) => path.startsWith(`${name}/`) && filters.every(([f, v]) => store.get(path)[f] === v))
          .map(snap);
        return { docs, size: docs.length };
      },
    };
    return query;
  };
  return {
    store,
    collection: (name) => collection(name),
    getAll: async (...refs) => refs.map((ref) => snap(ref.path)),
    batch: () => {
      const ops = [];
      return {
        set: (ref, data) => ops.push(() => apply(ref.path, data, false)),
        update: (ref, data) => ops.push(() => apply(ref.path, data, true)),
        commit: async () => ops.forEach((op) => op()),
      };
    },
  };
}

// The real increment sentinel needs firebase-admin; tests swap in a plain marker.
const admin = require("firebase-admin");
admin.firestore.FieldValue.increment = (n) => ({ __increment: n });

const question = {
  status: "live",
  sourcePath: "Maths/Year 9/Book.pdf",
  pageNumber: 4,
  label: "Q2a",
  stem: "Find x.",
  text: "",
  diagramType: "right_triangle",
  skill: "find_hypotenuse",
  difficulty: "easy",
  figures: [{ storagePath: "questionBank/diagrams/q1_1.png" }],
};

function seed() {
  return {
    "resourceJobs/job1": { createdBy: "tutor1", questionBankUsage: { used: [{ questionNumber: 3, questionId: "q1", kind: "original" }] } },
    "questionBank/q1": { ...question },
  };
}

const bucket = { file: () => ({ download: async () => [Buffer.from("png")] }) };
const now = () => "2026-11-05T00:00:00.000Z";
const call = (db, role, data, uid = role === "admin" ? "admin1" : "tutor1") =>
  manageQuestionBankImpl({ request: { auth: { uid, token: { role, name: uid } }, data }, deps: { db, bucket, now } });

describe("manageQuestionBank", () => {
  it("shows a resource's bank questions with their crops", async () => {
    const db = fakeDb(seed());
    const { questions } = await call(db, "tutor", { action: "forJob", jobId: "job1" });
    assert.equal(questions.length, 1);
    assert.equal(questions[0].questionNumber, 3);
    assert.match(questions[0].image, /^data:image\/png;base64,/);
    assert.equal(questions[0].flaggedByMe, false);
  });

  it("lets staff flag only questions the resource used", async () => {
    const db = fakeDb(seed());
    await call(db, "tutor", { action: "flag", jobId: "job1", questionId: "q1", reason: "crop", note: "cut off" });
    assert.equal(db.store.get("questionBank/q1").flagCount, 1);
    const flags = [...db.store.entries()].filter(([path]) => path.startsWith("questionBankFlags/"));
    assert.equal(flags.length, 1);
    assert.equal(flags[0][1].status, "open");
    await assert.rejects(call(db, "tutor", { action: "flag", jobId: "job1", questionId: "other", reason: "crop" }), /not in this resource/);
    await assert.rejects(call(db, "tutor", { action: "flag", jobId: "job1", questionId: "q1", reason: "rude" }), /reason must be one of/);
    await assert.rejects(call(db, "parent", { action: "flag", jobId: "job1", questionId: "q1", reason: "crop" }), /Admin or tutor role required/);
  });

  it("lets only admins list and resolve flags", async () => {
    const db = fakeDb(seed());
    await call(db, "tutor", { action: "flag", jobId: "job1", questionId: "q1", reason: "tags" });
    await assert.rejects(call(db, "tutor", { action: "listFlags" }), /Admin role required/);
    const list = await call(db, "admin", { action: "listFlags" });
    assert.equal(list.flags.length, 1);
    assert.equal(list.questions.q1.skill, "find_hypotenuse");
    assert.ok(list.skills.right_triangle.includes("find_shorter_side"));
  });

  it("hides a question and closes every open flag on it", async () => {
    const db = fakeDb(seed());
    await call(db, "tutor", { action: "flag", jobId: "job1", questionId: "q1", reason: "crop" });
    await call(db, "tutor", { action: "flag", jobId: "job1", questionId: "q1", reason: "text" }, "tutor2");
    const { flags } = await call(db, "admin", { action: "listFlags" });
    const out = await call(db, "admin", { action: "resolve", flagId: flags[0].id, resolution: "hide" });
    assert.equal(out.closed, 2);
    assert.equal(db.store.get("questionBank/q1").status, "hidden");
    assert.equal((await call(db, "admin", { action: "listFlags" })).flags.length, 0);
  });

  it("updates tags and text an admin corrects", async () => {
    const db = fakeDb(seed());
    await call(db, "tutor", { action: "flag", jobId: "job1", questionId: "q1", reason: "tags" });
    const { flags } = await call(db, "admin", { action: "listFlags" });
    await call(db, "admin", { action: "resolve", flagId: flags[0].id, resolution: "update", updates: { skill: "find_shorter_side", difficulty: "medium" } });
    const updated = db.store.get("questionBank/q1");
    assert.equal(updated.skill, "find_shorter_side");
    assert.equal(updated.difficulty, "medium");
    assert.equal(updated.status, "live");
  });

  it("rejects edits outside the taxonomy or to fixed fields", () => {
    assert.throws(() => validateUpdates(question, { skill: "box_plot" }), /not a skill of right_triangle/);
    assert.throws(() => validateUpdates(question, { sourcePath: "x" }), /cannot be edited/);
    assert.throws(() => validateUpdates(question, { difficulty: "extreme" }), /difficulty must be one of/);
    assert.throws(() => validateUpdates(question, { diagramType: "non_right_triangle" }), /find_hypotenuse is not a skill of non_right_triangle/, "a new type needs a skill of its own");
    assert.deepEqual(validateUpdates(question, { diagramType: "non_right_triangle", skill: "cosine_rule_side" }), { diagramType: "non_right_triangle", skill: "cosine_rule_side" });
  });

  it("rejects an unknown action", async () => {
    await assert.rejects(call(fakeDb(), "admin", { action: "deleteEverything" }), /action must be one of/);
  });
});
