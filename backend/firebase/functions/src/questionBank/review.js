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
// plus the admin "Question bank" page's actions, in admin.js (RES-104).

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

// extraction.js loads the PDF libraries; a callable must not pay for them at
// cold start (see lazyRequire.test.js).
const QUESTIONS_COLLECTION = "questionBank";
const { DIAGRAM_TYPES, skillsFor } = require("./taxonomy");
const { yearsOf } = require("./search");
const { ADMIN_ACTIONS, FLAGS_COLLECTION, audit, closeOpenFlags, editStamp } = require("./admin");
const { validateUpdates } = require("./banks");
const { id, invalid, oneOf, requireAdmin, requireStaff, text } = require("./validate");

const FLAG_REASONS = ["crop", "tags", "text", "answer", "other"];
const RESOLUTIONS = ["hide", "update", "dismiss"];
const MAX_NOTE = 1000;
const LIST_LIMIT = 50;

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

/**
 * RES-63. A flag the resource generator raises itself, when a textbook
 * question's printed answer disagrees with independent solves (a likely
 * misprint or a wrong answer link). Never throws: a lost flag must not fail
 * the resource that found it.
 */
async function systemFlag({ db, questionId, jobId, note, now = () => new Date() }) {
  try {
    const batch = db.batch();
    batch.set(db.collection(FLAGS_COLLECTION).doc(), {
      questionId, jobId: jobId || null, reason: "answer", note: String(note || "").slice(0, MAX_NOTE), status: "open",
      createdBy: "resource-generator", createdByName: "Resource generator", createdAt: now(),
      resolvedBy: null, resolvedAt: null, resolution: null,
    });
    batch.update(db.collection(QUESTIONS_COLLECTION).doc(questionId), { flagCount: admin.firestore.FieldValue.increment(1), lastFlaggedAt: now() });
    await batch.commit();
    return true;
  } catch {
    return false;
  }
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

  const at = now();
  const writes = db.batch();
  const fields = action === "update" ? validateUpdates(questionSnap.data(), payload.updates) : null;
  if (action === "hide") {
    writes.update(questionRef, { status: "hidden", hiddenBy: actor.uid, hiddenAt: at });
  } else if (action === "update") {
    // Years follow the year level, because search filters on them. A changed
    // question is re-embedded by the next questionBankEmbed run, because its
    // embeddingHash no longer matches its text.
    if (Object.hasOwn(fields, "yearLevel")) fields.years = yearsOf(fields.yearLevel, questionSnap.get("sourcePath"));
    writes.update(questionRef, { ...fields, ...editStamp(questionSnap.data(), fields, actor, at) });
  }
  const closed = await closeOpenFlags(db, writes, { questionId, resolution: action, actor, at });
  audit(db, writes, { name: "maths", recordId: questionId, action: action === "update" ? "edit" : action, fields: fields ? Object.keys(fields) : [], actor, at });
  await writes.commit();
  return { questionId, action, closed };
}

const ACTIONS = { forJob, flag, listFlags, resolve, ...ADMIN_ACTIONS };

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

module.exports = { FLAGS_COLLECTION, FLAG_REASONS, manageQuestionBank, manageQuestionBankImpl, systemFlag, validateUpdates };
