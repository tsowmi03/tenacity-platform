"use strict";

// RES-61. Tutors flag a bank question that came out wrong in a resource; admins
// fix its tags or text, hide it, or dismiss the flag. A hidden question is
// never searched again (search.js only returns live questions).
//
// One callable, manageQuestionBank, with an action:
//   forJob   (staff)  the bank questions a resource used, with their crops
//   flag     (staff)  report one of them
//   listFlags (admin) open flags, with each question and its crop
//   resolve  (admin)  hide, update or dismiss; closes every open flag on that question

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

// extraction.js loads the PDF libraries; a callable must not pay for them at
// cold start (see lazyRequire.test.js).
const QUESTIONS_COLLECTION = "questionBank";
const { DIAGRAM_TYPES, skillsFor } = require("./taxonomy");

const FLAGS_COLLECTION = "questionBankFlags";
const STAFF_ROLES = ["admin", "tutor"];
const FLAG_REASONS = ["crop", "tags", "text", "answer", "other"];
const RESOLUTIONS = ["hide", "update", "dismiss"];
const MAX_NOTE = 1000;
const LIST_LIMIT = 50;

// What an admin may correct on a question. The source, crop and ids stay as extracted.
const EDITABLE = {
  stem: (v) => (v === null ? null : text(v, "stem", 4000)),
  text: (v) => text(v, "text", 4000),
  description: (v) => text(v, "description", 500),
  topic: (v) => text(v, "topic", 200),
  yearLevel: (v) => (v === null ? null : text(v, "yearLevel", 60)),
  context: (v) => oneOf(v, "context", ["abstract", "real_world"]),
  steps: (v) => oneOf(v, "steps", ["single", "multi"]),
  difficulty: (v) => oneOf(v, "difficulty", ["easy", "medium", "hard"]),
  kind: (v) => oneOf(v, "kind", ["question", "worked_example"]),
  diagramType: (v) => oneOf(v, "diagramType", Object.keys(DIAGRAM_TYPES)),
  skill: (v) => text(v, "skill", 80),
};

function invalid(message) {
  return new HttpsError("invalid-argument", message);
}

function text(value, field, max) {
  if (typeof value !== "string" || value.length > max) throw invalid(`${field} must be text of at most ${max} characters`);
  return value.trim();
}

function oneOf(value, field, allowed) {
  if (!allowed.includes(value)) throw invalid(`${field} must be one of: ${allowed.join(", ")}`);
  return value;
}

function id(value, field) {
  if (typeof value !== "string" || !value || value.length > 200 || value.includes("/")) throw invalid(`${field} is required`);
  return value;
}

function requireStaff(request) {
  const uid = request?.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign-in required");
  const role = request.auth.token?.role || null;
  if (!STAFF_ROLES.includes(role)) throw new HttpsError("permission-denied", "Admin or tutor role required");
  return { uid, role, name: request.auth.token?.name || request.auth.token?.email || null };
}

function requireAdmin(actor) {
  if (actor.role !== "admin") throw new HttpsError("permission-denied", "Admin role required");
}

/** Checks an admin's edits and returns the fields to write. */
function validateUpdates(question, updates) {
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) throw invalid("updates are required");
  const fields = {};
  for (const [field, value] of Object.entries(updates)) {
    if (!EDITABLE[field]) throw invalid(`${field} cannot be edited`);
    fields[field] = EDITABLE[field](value);
  }
  if (!Object.keys(fields).length) throw invalid("updates are required");
  const diagramType = fields.diagramType || question.diagramType;
  if (fields.diagramType || fields.skill) {
    const skill = fields.skill || question.skill;
    if (!skillsFor(diagramType).includes(skill)) throw invalid(`${skill} is not a skill of ${diagramType}`);
    if (fields.diagramType && !fields.skill) fields.skill = skill;
  }
  return fields;
}

function questionSummary(doc) {
  const q = doc.data() || {};
  return {
    id: doc.id,
    status: q.status || null,
    sourcePath: q.sourcePath || null,
    pageNumber: q.pageNumber || null,
    label: q.label || null,
    stem: q.stem || null,
    text: q.text || "",
    description: q.description || "",
    topic: q.topic || "",
    yearLevel: q.yearLevel || null,
    diagramType: q.diagramType || null,
    skill: q.skill || null,
    difficulty: q.difficulty || null,
    context: q.context || null,
    steps: q.steps || null,
    kind: q.kind || null,
    flagCount: q.flagCount || 0,
    storagePath: q.figures?.[0]?.storagePath || null,
  };
}

async function withImages(bucket, questions) {
  return Promise.all(questions.map(async (question) => {
    if (!question.storagePath) return { ...question, image: null };
    try {
      const [bytes] = await bucket.file(question.storagePath).download();
      return { ...question, image: `data:image/png;base64,${bytes.toString("base64")}` };
    } catch (err) {
      logger.warn("[questionBank] crop not found", { storagePath: question.storagePath, error: err?.message });
      return { ...question, image: null };
    }
  }));
}

async function loadJob(db, jobId) {
  const snap = await db.collection("resourceJobs").doc(id(jobId, "jobId")).get();
  if (!snap.exists) throw new HttpsError("not-found", "Resource not found");
  return snap.data() || {};
}

async function forJob({ db, bucket, actor, payload }) {
  const job = await loadJob(db, payload.jobId);
  const used = job.questionBankUsage?.used || [];
  if (!used.length) return { questions: [] };
  const refs = used.map((entry) => db.collection(QUESTIONS_COLLECTION).doc(entry.questionId));
  const docs = await db.getAll(...refs);
  const flags = await db.collection(FLAGS_COLLECTION).where("jobId", "==", payload.jobId).where("createdBy", "==", actor.uid).get();
  const flagged = new Set(flags.docs.map((doc) => doc.get("questionId")));
  const questions = docs.filter((doc) => doc.exists).map((doc) => {
    const entry = used.find((u) => u.questionId === doc.id);
    // RES-71: a bank question can sit on a part or in a booklet section.
    return { ...questionSummary(doc), questionNumber: entry.questionNumber, partLabel: entry.partLabel || null, section: entry.section || null, use: entry.kind, flaggedByMe: flagged.has(doc.id) };
  });
  return { questions: await withImages(bucket, questions) };
}

async function flag({ db, actor, payload, now }) {
  const job = await loadJob(db, payload.jobId);
  const questionId = id(payload.questionId, "questionId");
  if (!(job.questionBankUsage?.used || []).some((entry) => entry.questionId === questionId)) {
    throw invalid("That question is not in this resource");
  }
  const reason = oneOf(payload.reason, "reason", FLAG_REASONS);
  const note = payload.note ? text(payload.note, "note", MAX_NOTE) : "";
  const flagRef = db.collection(FLAGS_COLLECTION).doc();
  const batch = db.batch();
  batch.set(flagRef, {
    questionId,
    jobId: payload.jobId,
    reason,
    note,
    status: "open",
    createdBy: actor.uid,
    createdByName: actor.name,
    createdAt: now(),
    resolvedBy: null,
    resolvedAt: null,
    resolution: null,
  });
  batch.update(db.collection(QUESTIONS_COLLECTION).doc(questionId), {
    flagCount: admin.firestore.FieldValue.increment(1),
    lastFlaggedAt: now(),
  });
  await batch.commit();
  return { flagId: flagRef.id };
}

async function listFlags({ db, bucket, actor }) {
  requireAdmin(actor);
  const snap = await db.collection(FLAGS_COLLECTION).where("status", "==", "open").limit(LIST_LIMIT).get();
  const flags = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const questionIds = [...new Set(flags.map((f) => f.questionId))];
  const docs = questionIds.length ? await db.getAll(...questionIds.map((qid) => db.collection(QUESTIONS_COLLECTION).doc(qid))) : [];
  const questions = await withImages(bucket, docs.filter((doc) => doc.exists).map(questionSummary));
  const byId = new Map(questions.map((q) => [q.id, q]));
  return {
    flags: flags
      .map((f) => ({
        id: f.id,
        questionId: f.questionId,
        jobId: f.jobId,
        reason: f.reason,
        note: f.note,
        createdByName: f.createdByName || null,
        createdAt: f.createdAt?.toDate ? f.createdAt.toDate().toISOString() : f.createdAt || null,
      }))
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))),
    questions: Object.fromEntries(byId),
    skills: Object.fromEntries(Object.keys(DIAGRAM_TYPES).map((type) => [type, skillsFor(type)])),
  };
}

async function resolve({ db, actor, payload, now }) {
  requireAdmin(actor);
  const flagRef = db.collection(FLAGS_COLLECTION).doc(id(payload.flagId, "flagId"));
  const flagSnap = await flagRef.get();
  if (!flagSnap.exists) throw new HttpsError("not-found", "Flag not found");
  const questionId = flagSnap.get("questionId");
  const questionRef = db.collection(QUESTIONS_COLLECTION).doc(questionId);
  const questionSnap = await questionRef.get();
  if (!questionSnap.exists) throw new HttpsError("not-found", "Question not found");
  const action = oneOf(payload.action, "action", RESOLUTIONS);

  const batch = db.batch();
  if (action === "hide") {
    batch.update(questionRef, { status: "hidden", hiddenBy: actor.uid, hiddenAt: now() });
  } else if (action === "update") {
    // A changed question is re-embedded by the next questionBankEmbed run,
    // because its embeddingHash no longer matches its text.
    batch.update(questionRef, { ...validateUpdates(questionSnap.data(), payload.updates), editedBy: actor.uid, editedAt: now() });
  }
  const open = await db.collection(FLAGS_COLLECTION).where("questionId", "==", questionId).where("status", "==", "open").get();
  for (const doc of open.docs) {
    batch.update(doc.ref, { status: "resolved", resolution: action, resolvedBy: actor.uid, resolvedAt: now() });
  }
  await batch.commit();
  return { questionId, action, closed: open.size };
}

const ACTIONS = { forJob, flag, listFlags, resolve };

async function manageQuestionBankImpl({ request, deps }) {
  const actor = requireStaff(request);
  const payload = request.data || {};
  const handler = Object.hasOwn(ACTIONS, payload.action) ? ACTIONS[payload.action] : null;
  if (!handler) throw invalid(`action must be one of: ${Object.keys(ACTIONS).join(", ")}`);
  const resolution = payload.action === "resolve" ? { ...payload, action: payload.resolution } : payload;
  return handler({ ...deps, actor, payload: resolution });
}

const manageQuestionBank = onCall({ region: "us-central1", memory: "512MiB", timeoutSeconds: 60 }, async (request) => {
  try {
    return await manageQuestionBankImpl({
      request,
      deps: {
        db: admin.firestore(),
        bucket: admin.storage().bucket(),
        now: () => admin.firestore.FieldValue.serverTimestamp(),
      },
    });
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    logger.error("[manageQuestionBank] failed", { action: request?.data?.action, error: err?.message });
    throw new HttpsError("internal", "Question bank request failed");
  }
});

module.exports = { FLAGS_COLLECTION, FLAG_REASONS, manageQuestionBank, manageQuestionBankImpl, validateUpdates };
