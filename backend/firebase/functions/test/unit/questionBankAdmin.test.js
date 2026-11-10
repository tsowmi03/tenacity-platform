"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { manageQuestionBankImpl } = require("../../src/questionBank/review");
const { keepAdminChanges, withAdminChanges } = require("../../src/questionBank/adminChanges");
const { findDuplicateGroups } = require("../../src/questionBank/dedupe");

// A small in-memory Firestore: enough for the queries the admin page makes.
function fakeDb(seed = {}) {
  const store = new Map(Object.entries(seed).map(([path, data]) => [path, { ...data }]));
  const queries = [];
  let auto = 0;
  const snap = (path) => ({
    id: path.split("/").pop(),
    ref: docRef(path),
    exists: store.has(path),
    data: () => store.get(path) && { ...store.get(path) },
    get: (field) => store.get(path)?.[field],
  });
  function docRef(path) {
    return { id: path.split("/").pop(), path, get: async () => snap(path) };
  }
  const matches = (data, [field, op, value]) => {
    if (op === "in") return value.includes(data[field]);
    if (op === "array-contains") return (data[field] || []).includes(value);
    return data[field] === value;
  };
  const query = (name, state = { clauses: [], after: null, max: Infinity, selected: null }) => {
    const next = (patch) => query(name, { ...state, ...patch });
    const run = () => [...store.keys()]
      .filter((path) => path.startsWith(`${name}/`) && state.clauses.every((clause) => matches(store.get(path), clause)))
      .sort()
      .filter((path) => !state.after || path.split("/").pop() > state.after);
    return {
      doc: (docId) => docRef(`${name}/${docId || `auto${++auto}`}`),
      where: (field, op, value) => next({ clauses: [...state.clauses, [field, op, value]] }),
      orderBy: () => next({}),
      select: (...fields) => next({ selected: fields }),
      startAfter: (id) => next({ after: id }),
      limit: (max) => next({ max }),
      count: () => ({ get: async () => ({ data: () => ({ count: run().length }) }) }),
      get: async () => {
        queries.push({ name, ...state });
        const docs = run().slice(0, state.max).map(snap);
        return { docs, size: docs.length };
      },
    };
  };
  const apply = (path, data, merge) => {
    const current = merge ? { ...(store.get(path) || {}) } : {};
    store.set(path, { ...current, ...data });
  };
  return {
    store,
    queries,
    collection: (name) => query(name),
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

// firebase-admin's FieldPath works without an initialised app; only the shape matters here.
const ONE_PIXEL_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const bucket = { file: () => ({ download: async () => [ONE_PIXEL_PNG] }) };
const adminAuth = { auth: { uid: "a1", token: { role: "admin", name: "Admin One" } } };
const tutorAuth = { auth: { uid: "t1", token: { role: "tutor" } } };
const call = (db, data, auth = adminAuth) => manageQuestionBankImpl({ request: { ...auth, data }, deps: { db, bucket, now: () => "NOW" } });

const question = (extra = {}) => ({
  status: "live", sourcePath: "Maths/Year 9/Book.pdf", pageNumber: 4, label: "Q1", stem: "Find x.", text: "", topic: "Pythagoras",
  yearLevel: "Year 9", years: [9], diagramType: "right_triangle", skill: "find_hypotenuse", difficulty: "easy", kind: "question",
  figures: [{ storagePath: "crops/q.png" }], ...extra,
});
const stimulus = (extra = {}) => ({
  status: "live", sourcePath: "English/Paper.pdf", pages: [2], label: "Text 1", type: "poem", medium: "written", title: "The Road", text: "two roads",
  wordCount: 2, techniqueIds: ["imagery"], themes: ["choice"], years: [10], yearLevel: "Year 10", ...extra,
});

describe("browsing the bank (RES-104)", () => {
  it("is admin only", async () => {
    const db = fakeDb();
    for (const action of ["bankOptions", "browseBank", "bankRecord", "bankImages", "hideRecord", "restoreRecord", "editRecord"]) {
      await assert.rejects(call(db, { action, bank: "maths", id: "q1" }, tutorAuth), { code: "permission-denied" });
    }
  });

  it("filters live maths questions in Firestore and leaves merged copies out", async () => {
    const db = fakeDb({
      "questionBank/a": question(),
      "questionBank/b": question({ years: [7] }),
      "questionBank/c": question({ status: "duplicate" }),
      "questionBank/d": question({ status: "hidden" }),
    });
    const all = await call(db, { action: "browseBank", bank: "maths", status: "all" });
    assert.deepEqual(all.records.map((r) => r.id), ["a", "b", "d"]);
    const year9 = await call(db, { action: "browseBank", bank: "maths", filters: { year: 9 } });
    assert.deepEqual(year9.records.map((r) => r.id), ["a"]);
    assert.equal(year9.total, 1);
    assert.ok(db.queries.find((q) => q.name === "questionBank" && q.clauses.some(([f]) => f === "years")));
    assert.equal(year9.records[0].hasImage, true);
  });

  it("pages by cursor without loading the bank", async () => {
    const seed = Object.fromEntries(["a", "b", "c", "d", "e"].map((id) => [`questionBank/${id}`, question()]));
    const db = fakeDb(seed);
    const first = await call(db, { action: "browseBank", bank: "maths", pageSize: 2 });
    assert.deepEqual(first.records.map((r) => r.id), ["a", "b"]);
    assert.equal(first.nextCursor, "b");
    assert.equal(first.total, 5);
    const last = await call(db, { action: "browseBank", bank: "maths", pageSize: 3, cursor: "b" });
    assert.deepEqual(last.records.map((r) => r.id), ["c", "d", "e"]);
    assert.equal(last.nextCursor, null);
    assert.ok(db.queries.every((q) => q.max <= 4 || q.name === "questionBankFlags"));
  });

  it("lists flagged questions with their open flag counts and applies filters", async () => {
    const db = fakeDb({
      "questionBank/a": question(),
      "questionBank/b": question({ difficulty: "hard" }),
      "questionBank/c": question(),
      "questionBankFlags/f1": { questionId: "a", status: "open" },
      "questionBankFlags/f2": { questionId: "a", status: "open" },
      "questionBankFlags/f3": { questionId: "b", status: "open" },
      "questionBankFlags/f4": { questionId: "c", status: "resolved" },
    });
    const flagged = await call(db, { action: "browseBank", bank: "maths", status: "flagged" });
    assert.deepEqual(flagged.records.map((r) => [r.id, r.openFlags]), [["a", 2], ["b", 1]]);
    assert.equal(flagged.total, 2);
    const easy = await call(db, { action: "browseBank", bank: "maths", status: "flagged", filters: { difficulty: "easy" } });
    assert.deepEqual(easy.records.map((r) => r.id), ["a"]);
    const options = await call(db, { action: "bankOptions" });
    assert.equal(options.openFlags, 2);
    assert.ok(options.diagramTypes.right_triangle.includes("find_hypotenuse"));
  });

  it("rejects the flagged status for a bank that cannot be flagged", async () => {
    await assert.rejects(call(fakeDb(), { action: "browseBank", bank: "stimuli", status: "flagged" }), { code: "invalid-argument" });
  });

  it("filters stimuli by theme, length and technique together with a year", async () => {
    const db = fakeDb({
      "englishStimuli/a": stimulus({ themes: ["loss of innocence"], wordCount: 900 }),
      "englishStimuli/b": stimulus({ themes: ["war"], wordCount: 900 }),
      "englishStimuli/c": stimulus({ themes: ["loss"], wordCount: 100 }),
      "englishStimuli/d": stimulus({ themes: ["loss"], wordCount: 900, techniqueIds: ["simile"] }),
    });
    const result = await call(db, { action: "browseBank", bank: "stimuli", filters: { year: 10, technique: "imagery", theme: "Loss", length: "long" } });
    assert.deepEqual(result.records.map((r) => r.id), ["a"]);
    assert.equal(result.total, null);
  });

  it("returns a thumbnail only for a record with a crop", async () => {
    const db = fakeDb({ "questionBank/a": question(), "questionBank/b": question({ figures: [] }) });
    const { images } = await call(db, { action: "bankImages", bank: "maths", ids: ["a", "b"] });
    assert.match(images.a, /^data:image\/webp;base64,/);
    assert.equal(images.b, null);
  });

  it("opens a stimulus with its questions, guides and history", async () => {
    const db = fakeDb({
      "englishStimuli/s1": stimulus(),
      "englishQuestions/q1": { status: "live", stimulusIds: ["s1"], label: "1", text: "Why?" },
      "englishGuides/g1": { status: "hidden", questionId: "q1", criteria: "Explains" },
      "questionBankAudit/x": { bank: "stimuli", recordId: "s1", action: "edit", fields: ["title"], actorName: "Admin One", at: "2026-11-10" },
    });
    const detail = await call(db, { action: "bankRecord", bank: "stimuli", id: "s1" });
    assert.equal(detail.record.title, "The Road");
    assert.deepEqual(detail.links.questions.map((q) => q.id), ["q1"]);
    assert.deepEqual(detail.links.guides.map((g) => g.status), ["hidden"]);
    assert.equal(detail.history[0].action, "edit");
  });
});

describe("hiding and restoring (RES-104)", () => {
  it("hides a maths question, closes its flags and records who did it", async () => {
    const db = fakeDb({ "questionBank/a": question(), "questionBankFlags/f1": { questionId: "a", status: "open" } });
    const result = await call(db, { action: "hideRecord", bank: "maths", id: "a" });
    assert.equal(result.record.status, "hidden");
    const saved = db.store.get("questionBank/a");
    assert.equal(saved.hiddenBy, "a1");
    assert.equal(saved.hiddenAt, "NOW");
    assert.equal(db.store.get("questionBankFlags/f1").resolution, "hide");
    const auditEntry = [...db.store].find(([path]) => path.startsWith("questionBankAudit/"))[1];
    assert.equal(auditEntry.action, "hide");
    assert.equal(auditEntry.actorName, "Admin One");
  });

  it("restores a hidden question and refuses to hide one twice", async () => {
    const db = fakeDb({ "questionBank/a": question({ status: "hidden", hiddenBy: "x" }) });
    await assert.rejects(call(db, { action: "hideRecord", bank: "maths", id: "a" }), { code: "failed-precondition" });
    await call(db, { action: "restoreRecord", bank: "maths", id: "a" });
    const saved = db.store.get("questionBank/a");
    assert.equal(saved.status, "live");
    assert.equal(saved.hiddenBy, null);
    assert.equal(saved.restoredBy, "a1");
  });

  it("will not touch a merged duplicate", async () => {
    const db = fakeDb({ "questionBank/a": question({ status: "duplicate" }) });
    await assert.rejects(call(db, { action: "restoreRecord", bank: "maths", id: "a" }), { code: "failed-precondition" });
    await assert.rejects(call(db, { action: "editRecord", bank: "maths", id: "a", updates: { difficulty: "hard" } }), { code: "failed-precondition" });
  });

  function linkedBank() {
    return fakeDb({
      "englishStimuli/s1": stimulus(),
      "englishStimuli/s2": stimulus(),
      "englishQuestions/only": { status: "live", stimulusIds: ["s1"], label: "1", text: "a" },
      "englishQuestions/shared": { status: "live", stimulusIds: ["s1", "s2"], label: "2", text: "b" },
      "englishQuestions/already": { status: "hidden", stimulusIds: ["s1"], label: "3", text: "c" },
      "englishGuides/g1": { status: "live", questionId: "only", criteria: "x" },
      "englishGuides/g2": { status: "live", questionId: "shared", criteria: "y" },
    });
  }

  it("hiding a stimulus takes out its questions and guides, but not one another stimulus still uses", async () => {
    const db = linkedBank();
    const result = await call(db, { action: "hideRecord", bank: "stimuli", id: "s1" });
    assert.equal(result.cascade, 2);
    assert.equal(db.store.get("englishQuestions/only").status, "hidden");
    assert.equal(db.store.get("englishQuestions/only").hiddenWith, "s1");
    assert.equal(db.store.get("englishGuides/g1").status, "hidden");
    assert.equal(db.store.get("englishQuestions/shared").status, "live");
    assert.equal(db.store.get("englishGuides/g2").status, "live");
  });

  it("restoring a stimulus brings back only what it took out", async () => {
    const db = linkedBank();
    await call(db, { action: "hideRecord", bank: "stimuli", id: "s1" });
    const result = await call(db, { action: "restoreRecord", bank: "stimuli", id: "s1" });
    assert.equal(result.cascade, 2);
    assert.equal(db.store.get("englishQuestions/only").status, "live");
    assert.equal(db.store.get("englishGuides/g1").status, "live");
    assert.equal(db.store.get("englishQuestions/already").status, "hidden");
  });
});

describe("review findings (RES-104)", () => {
  it("restores the guide of a question that was restored on its own first", async () => {
    const db = fakeDb({
      "englishStimuli/s1": stimulus(),
      "englishQuestions/q1": { status: "live", stimulusIds: ["s1"], label: "1", text: "a" },
      "englishGuides/g1": { status: "live", questionId: "q1", criteria: "x" },
    });
    await call(db, { action: "hideRecord", bank: "stimuli", id: "s1" });
    await call(db, { action: "restoreRecord", bank: "englishQuestions", id: "q1" });
    assert.equal(db.store.get("englishGuides/g1").status, "hidden");
    await call(db, { action: "restoreRecord", bank: "stimuli", id: "s1" });
    assert.equal(db.store.get("englishGuides/g1").status, "live");
  });

  it("leaves a guide an admin hid on its own", async () => {
    const db = fakeDb({
      "englishStimuli/s1": stimulus({ status: "hidden" }),
      "englishQuestions/q1": { status: "live", stimulusIds: ["s1"], label: "1", text: "a" },
      "englishGuides/g1": { status: "hidden", questionId: "q1", criteria: "x", hiddenWith: null },
    });
    await call(db, { action: "restoreRecord", bank: "stimuli", id: "s1" });
    assert.equal(db.store.get("englishGuides/g1").status, "hidden");
  });

  it("shows the newest history however many entries a record has", async () => {
    const seed = { "questionBank/a": question() };
    for (let i = 0; i < 30; i += 1) {
      const day = String(i + 1).padStart(2, "0");
      // Document IDs run opposite to time, so the newest sort last by ID.
      seed[`questionBankAudit/${String(99 - i)}`] = { bank: "maths", recordId: "a", action: "edit", at: `2026-11-${day}T00:00:00Z` };
    }
    const { history } = await call(fakeDb(seed), { action: "bankRecord", bank: "maths", id: "a" });
    assert.equal(history.length, 20);
    assert.equal(history[0].at, "2026-11-30T00:00:00Z");
  });
});

describe("correcting a record (RES-104)", () => {
  it("edits a maths question, updates its years and records the fields", async () => {
    const db = fakeDb({ "questionBank/a": question(), "questionBankFlags/f1": { questionId: "a", status: "open" } });
    await call(db, { action: "editRecord", bank: "maths", id: "a", updates: { yearLevel: "Year 8", difficulty: "hard" } });
    const saved = db.store.get("questionBank/a");
    assert.deepEqual(saved.years, [8]);
    assert.equal(saved.editedBy, "a1");
    assert.deepEqual(saved.adminEditedFields.sort(), ["difficulty", "yearLevel", "years"]);
    assert.equal(db.store.get("questionBankFlags/f1").resolution, "update");
  });

  it("keeps a stimulus's word count in step with its text and blocks a change of medium", async () => {
    const db = fakeDb({ "englishStimuli/s": stimulus() });
    await call(db, { action: "editRecord", bank: "stimuli", id: "s", updates: { text: "one two three", themes: ["Hope", "hope"] } });
    const saved = db.store.get("englishStimuli/s");
    assert.equal(saved.wordCount, 3);
    assert.deepEqual(saved.themes, ["hope"]);
    await assert.rejects(call(db, { action: "editRecord", bank: "stimuli", id: "s", updates: { type: "poster" } }), { code: "invalid-argument" });
  });

  it("refuses a field that cannot be edited and a blank question", async () => {
    const db = fakeDb({ "englishQuestions/q": { status: "live", text: "a" } });
    await assert.rejects(call(db, { action: "editRecord", bank: "englishQuestions", id: "q", updates: { sourcePath: "x" } }), { code: "invalid-argument" });
    await assert.rejects(call(db, { action: "editRecord", bank: "englishQuestions", id: "q", updates: { text: "  " } }), { code: "invalid-argument" });
  });

  it("keeps the flag popup's corrections safe from later extraction too", async () => {
    const db = fakeDb({ "questionBank/a": question(), "questionBankFlags/f1": { questionId: "a", status: "open" } });
    await call(db, { action: "resolve", flagId: "f1", resolution: "update", updates: { yearLevel: "Year 8" } });
    const saved = db.store.get("questionBank/a");
    assert.deepEqual(saved.years, [8]);
    assert.ok(saved.adminEditedFields.includes("yearLevel"));
  });
});

describe("sync runs keep admin changes (RES-104)", () => {
  it("keeps a hide and every corrected field, and takes the rest from extraction", () => {
    const merged = keepAdminChanges(
      { status: "live", text: "new extraction", difficulty: "easy", sourceVersion: "v2" },
      { status: "hidden", text: "admin wording", difficulty: "medium", sourceVersion: "v1", adminEditedFields: ["text"], editedBy: "a1", hiddenBy: "a1" },
    );
    assert.equal(merged.status, "hidden");
    assert.equal(merged.text, "admin wording");
    assert.equal(merged.difficulty, "easy");
    assert.equal(merged.sourceVersion, "v2");
    assert.equal(merged.editedBy, "a1");
  });

  it("does not re-hide a restored record", () => {
    assert.equal(keepAdminChanges({ status: "live" }, { status: "live", restoredBy: "a1" }).status, "live");
  });

  it("leaves a brand new record alone", () => {
    const fresh = { status: "live" };
    assert.equal(keepAdminChanges(fresh, null), fresh);
  });

  it("merges across collections before a write", async () => {
    const db = fakeDb({ "englishStimuli/s": { status: "hidden" } });
    const merged = await withAdminChanges(db, [
      { collection: "englishStimuli", id: "s", data: { status: "live" } },
      { collection: "englishGuides", id: "new", data: { status: "live" } },
    ]);
    assert.deepEqual(merged.map((record) => record.data.status), ["hidden", "live"]);
  });

  it("keeps a corrected or restored copy when duplicates merge", () => {
    const copy = (id, modified, extra = {}) => ({
      id, status: "live", sourceId: id, sourcePath: `Maths/${id}.pdf`, pageNumber: 1, label: "1", kind: "question", diagramType: "right_triangle", skill: "find_hypotenuse",
      stem: "Find the length of the hypotenuse in this triangle with sides 3 and 4", text: "", figures: [{ type: "right_triangle" }], sourceModifiedTime: modified, ...extra,
    });
    const [plain] = findDuplicateGroups([copy("older", "2020-01-01"), copy("newer", "2024-01-01")]);
    assert.equal(plain.keep.id, "newer");
    const [corrected] = findDuplicateGroups([copy("older", "2020-01-01", { editedAt: "x" }), copy("newer", "2024-01-01")]);
    assert.equal(corrected.keep.id, "older");
  });
});
