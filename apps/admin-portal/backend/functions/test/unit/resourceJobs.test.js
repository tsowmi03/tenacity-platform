"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { HttpsError } = require("firebase-functions/v2/https");
const {
  createResourceJobImpl,
  requireResourceStaffCallable,
  validateSubmitResourceJobPayload,
} = require("../../src/resources");

const clock = () => new Date("2026-05-23T00:00:00Z");

function snap(data) {
  return {
    exists: Boolean(data),
    data: () => data,
  };
}

function fakeDb({ student, user } = {}) {
  const writes = [];
  return {
    writes,
    collection(name) {
      return {
        doc(id) {
          const ref = {
            id: id || "job_123",
            async get() {
              if (name === "students") return snap(student);
              if (name === "users") return snap(user);
              return snap(null);
            },
            async set(data) {
              writes.push({ path: `${name}/${ref.id}`, data });
            },
          };
          return ref;
        },
      };
    },
  };
}

describe("requireResourceStaffCallable", () => {
  it("accepts admin and tutor roles", () => {
    assert.equal(
      requireResourceStaffCallable({
        auth: { uid: "admin-1", token: { role: "admin", email: "a@example.com" } },
      }).role,
      "admin"
    );
    assert.equal(
      requireResourceStaffCallable({
        auth: { uid: "tutor-1", token: { role: "tutor", email: "t@example.com" } },
      }).role,
      "tutor"
    );
  });

  it("rejects signed-in non-staff roles", () => {
    assert.throws(
      () => requireResourceStaffCallable({ auth: { uid: "p1", token: { role: "parent" } } }),
      (err) => err instanceof HttpsError && err.code === "permission-denied"
    );
  });
});

describe("validateSubmitResourceJobPayload", () => {
  const base = {
    studentId: "student-1",
    subject: "maths",
    year: 8,
    resourceType: "worksheet",
    includeWorking: false,
    customPrompt: "",
    uploadedFilePath: null,
    uploadedFileName: null,
  };

  it("normalises a valid worksheet payload", () => {
    const out = validateSubmitResourceJobPayload(base);
    assert.deepEqual(out, base);
  });

  it("defaults includeWorking to false when omitted", () => {
    const { includeWorking: _, ...withoutFlag } = base;
    const out = validateSubmitResourceJobPayload(withoutFlag);
    assert.equal(out.includeWorking, false);
  });

  it("accepts includeWorking: true", () => {
    const out = validateSubmitResourceJobPayload({ ...base, includeWorking: true });
    assert.equal(out.includeWorking, true);
  });

  it("rejects non-boolean includeWorking", () => {
    assert.throws(
      () => validateSubmitResourceJobPayload({ ...base, includeWorking: "yes" }),
      (err) => err instanceof HttpsError && err.code === "invalid-argument"
    );
  });

  it("rejects English-only resources for maths", () => {
    assert.throws(
      () => validateSubmitResourceJobPayload({ ...base, resourceType: "essay-scaffold" }),
      (err) => err instanceof HttpsError && err.code === "invalid-argument"
    );
  });

  it("requires upload path and file name together", () => {
    assert.throws(
      () => validateSubmitResourceJobPayload({ ...base, uploadedFilePath: "resources/uploads/u1/file.pdf" }),
      (err) => err instanceof HttpsError && err.code === "invalid-argument"
    );
    assert.throws(
      () => validateSubmitResourceJobPayload({ ...base, uploadedFileName: "file.pdf" }),
      (err) => err instanceof HttpsError && err.code === "invalid-argument"
    );
  });

  it("rejects years outside the first supported range", () => {
    assert.throws(
      () => validateSubmitResourceJobPayload({ ...base, year: 11 }),
      /year must be <= 10/
    );
  });
});

describe("createResourceJobImpl", () => {
  const payload = validateSubmitResourceJobPayload({
    studentId: "student-1",
    subject: "english",
    year: 7,
    resourceType: "annotation-task",
    customPrompt: "Persuasive language task.",
    uploadedFilePath: "resources/uploads/tutor-1/ref.docx",
    uploadedFileName: "ref.docx",
  });
  const actor = {
    uid: "tutor-1",
    email: "tutor@example.com",
    role: "tutor",
    claims: { role: "tutor", email: "tutor@example.com" },
  };

  it("creates a pending resourceJobs document", async () => {
    const db = fakeDb({
      student: { firstName: "Mei", lastName: "Tanaka" },
      user: { firstName: "Maya", lastName: "Lawson" },
    });

    const result = await createResourceJobImpl({
      payload,
      actor,
      deps: { db, clock },
    });

    assert.deepEqual(result, { jobId: "job_123" });
    assert.equal(db.writes.length, 1);
    assert.equal(db.writes[0].path, "resourceJobs/job_123");
    assert.equal(db.writes[0].data.studentName, "Mei Tanaka");
    assert.equal(db.writes[0].data.createdByName, "Maya Lawson");
    assert.equal(db.writes[0].data.model, "claude-sonnet-4-6");
    assert.equal(db.writes[0].data.status, "pending");
    assert.deepEqual(db.writes[0].data.warnings, []);
    assert.equal(db.writes[0].data.errorCode, null);
    assert.equal(db.writes[0].data.createdAt.toDate().toISOString(), "2026-05-23T00:00:00.000Z");
  });

  it("rejects missing students", async () => {
    const db = fakeDb({ student: null, user: null });
    await assert.rejects(
      () => createResourceJobImpl({ payload, actor, deps: { db, clock } }),
      (err) => err instanceof HttpsError && err.code === "not-found"
    );
  });

  it("rejects uploaded references owned by another user", async () => {
    const db = fakeDb({ student: { firstName: "Mei" }, user: null });
    await assert.rejects(
      () =>
        createResourceJobImpl({
          payload: { ...payload, uploadedFilePath: "resources/uploads/other/ref.docx" },
          actor,
          deps: { db, clock },
        }),
      (err) => err instanceof HttpsError && err.code === "permission-denied"
    );
  });
});
