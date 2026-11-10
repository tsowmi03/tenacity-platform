"use strict";

// RES-104. What the admin "Question bank" page does: browse the whole bank,
// open a record, hide or restore it, and correct it. Every action is admin
// only and is served by the manageQuestionBank callable in review.js.
//
// Browsing uses equality and array-contains filters ordered by document ID,
// which Firestore serves by merging its single-field indexes, so no composite
// indexes are needed. Filters Firestore can't run (theme, length) are applied
// while walking the results, up to SCAN_LIMIT records per request.

const { HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { lazyRequire } = require("../shared/lazyRequire");
const { BANKS, FILTER_OPTIONS, MATHS_COLLECTION } = require("./banks");
const { GUIDES_COLLECTION, QUESTIONS_COLLECTION: ENGLISH_QUESTIONS_COLLECTION, STIMULI_COLLECTION } = require("../englishBank/collections");
const { id, invalid, oneOf, requireAdmin, text } = require("./validate");

const loadSharp = lazyRequire(() => require("sharp"));

const FLAGS_COLLECTION = "questionBankFlags";
const AUDIT_COLLECTION = "questionBankAudit";
const STATUSES = ["live", "hidden", "all"];
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 50;
const SCAN_BATCH = 200;
const SCAN_LIMIT = 2000;
const MAX_IMAGE_IDS = 8;
const THUMBNAIL_PIXELS = 144;
const MAX_OPEN_FLAGS = 500;
const HISTORY_LIMIT = 20;
const WRITE_CHUNK = 400;
const FIRESTORE_IN_LIMIT = 30;

function bankOf(payload) {
  const name = oneOf(payload.bank, "bank", Object.keys(BANKS));
  return { name, bank: BANKS[name] };
}

function cleanFilters(filters) {
  if (filters === undefined || filters === null) return {};
  if (typeof filters !== "object" || Array.isArray(filters)) throw invalid("filters must be an object");
  const clean = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === "" || value === null || value === undefined) continue;
    if (key === "year") {
      if (!Number.isInteger(value) || value < 1 || value > 12) throw invalid("year must be from 1 to 12");
      clean.year = value;
    } else {
      clean[key] = text(value, key, 120);
      if (!clean[key]) delete clean[key];
    }
  }
  return clean;
}

function summarise(bank, doc, extra = {}) {
  const data = doc.data() || {};
  return { id: doc.id, status: data.status || null, ...bank.summary(data), openFlags: 0, ...extra };
}

/** A clause's check, for records Firestore did not filter itself. */
function passes(data, [field, op, value]) {
  return op === "array-contains" ? (data[field] || []).includes(value) : data[field] === value;
}

/** How many open flags each maths question has. */
async function openFlagCounts(db, questionIds) {
  const counts = new Map();
  for (let start = 0; start < questionIds.length; start += FIRESTORE_IN_LIMIT) {
    const chunk = questionIds.slice(start, start + FIRESTORE_IN_LIMIT);
    const snapshot = await db.collection(FLAGS_COLLECTION).where("status", "==", "open").where("questionId", "in", chunk).get();
    for (const doc of snapshot.docs) counts.set(doc.get("questionId"), (counts.get(doc.get("questionId")) || 0) + 1);
  }
  return counts;
}

async function withOpenFlags(db, bank, records) {
  if (!bank.flaggable || !records.length) return records;
  const counts = await openFlagCounts(db, records.map((record) => record.id));
  return records.map((record) => ({ ...record, openFlags: counts.get(record.id) || 0 }));
}

/** Flagged maths questions: there are few, so they are read and filtered here. */
async function browseFlagged({ db, bank, clauses, keep, pageSize, cursor }) {
  const flags = await db.collection(FLAGS_COLLECTION).where("status", "==", "open").limit(MAX_OPEN_FLAGS).get();
  const counts = new Map();
  for (const doc of flags.docs) counts.set(doc.get("questionId"), (counts.get(doc.get("questionId")) || 0) + 1);
  const ids = [...counts.keys()].sort();
  const docs = ids.length ? await db.getAll(...ids.map((questionId) => db.collection(bank.collection).doc(questionId))) : [];
  const matching = docs.filter((doc) => {
    if (!doc.exists) return false;
    const data = doc.data();
    return clauses.every((clause) => passes(data, clause)) && (!keep || keep(data));
  });
  const start = cursor ? matching.findIndex((doc) => doc.id > cursor) : 0;
  const from = start === -1 ? matching.length : start;
  const page = matching.slice(from, from + pageSize);
  return {
    records: page.map((doc) => summarise(bank, doc, { openFlags: counts.get(doc.id) })),
    nextCursor: from + pageSize < matching.length ? page[page.length - 1].id : null,
    total: matching.length,
  };
}

async function countOf(query) {
  try {
    const snapshot = await query.count().get();
    return snapshot.data().count;
  } catch (err) {
    // The count is a nicety; the page still works without it.
    logger.warn("[questionBank] count failed", { error: err?.message });
    return null;
  }
}

async function browse({ db, actor, payload }) {
  requireAdmin(actor);
  const { bank } = bankOf(payload);
  const status = oneOf(payload.status || "live", "status", bank.flaggable ? [...STATUSES, "flagged"] : STATUSES);
  const requested = payload.pageSize === undefined ? DEFAULT_PAGE_SIZE : payload.pageSize;
  if (!Number.isInteger(requested) || requested < 1) throw invalid("pageSize must be a positive whole number");
  const pageSize = Math.min(requested, MAX_PAGE_SIZE);
  const cursor = payload.cursor ? id(payload.cursor, "cursor") : null;
  const { clauses, keep } = bank.filters(cleanFilters(payload.filters));

  if (status === "flagged") return browseFlagged({ db, bank, clauses, keep, pageSize, cursor });

  // "All" still leaves out merged duplicates and records of retired files.
  let filtered = status === "all"
    ? db.collection(bank.collection).where("status", "in", ["live", "hidden"])
    : db.collection(bank.collection).where("status", "==", status);
  for (const [field, op, value] of clauses) filtered = filtered.where(field, op, value);
  const ordered = filtered.orderBy(admin.firestore.FieldPath.documentId()).select(...bank.listFields);

  const batchSize = keep ? SCAN_BATCH : pageSize + 1;
  const matches = [];
  let last = cursor;
  let scanned = 0;
  let exhausted = false;
  while (matches.length < pageSize && scanned < SCAN_LIMIT && !exhausted) {
    const page = last ? ordered.startAfter(last) : ordered;
    const snapshot = await page.limit(batchSize).get();
    let consumed = 0;
    for (const doc of snapshot.docs) {
      consumed += 1;
      scanned += 1;
      last = doc.id;
      if (!keep || keep(doc.data())) matches.push(doc);
      if (matches.length === pageSize) break;
    }
    if (snapshot.docs.length < batchSize && consumed === snapshot.docs.length) exhausted = true;
  }

  const records = await withOpenFlags(db, bank, matches.map((doc) => summarise(bank, doc)));
  return {
    records,
    nextCursor: exhausted ? null : last,
    // A count isn't possible for filters applied while walking.
    total: !cursor && !keep ? await countOf(filtered) : null,
  };
}

async function options({ db, actor }) {
  requireAdmin(actor);
  // Questions, not flags, so it matches the length of the flagged list.
  const flags = await db.collection(FLAGS_COLLECTION).where("status", "==", "open").limit(MAX_OPEN_FLAGS).select("questionId").get();
  return { ...FILTER_OPTIONS(), openFlags: new Set(flags.docs.map((doc) => doc.get("questionId"))).size };
}

async function downloadImage(bucket, storagePath) {
  try {
    const [bytes] = await bucket.file(storagePath).download();
    return `data:image/png;base64,${bytes.toString("base64")}`;
  } catch (err) {
    logger.warn("[questionBank] crop not found", { storagePath, error: err?.message });
    return null;
  }
}

/** A crop shrunk for the list: a full-size visual stimulus can exceed 1 MB. */
async function downloadThumbnail(bucket, storagePath) {
  try {
    const [bytes] = await bucket.file(storagePath).download();
    const small = await loadSharp()(bytes)
      .resize(THUMBNAIL_PIXELS, THUMBNAIL_PIXELS, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 70 })
      .toBuffer();
    return `data:image/webp;base64,${small.toString("base64")}`;
  } catch (err) {
    logger.warn("[questionBank] thumbnail failed", { storagePath, error: err?.message });
    return null;
  }
}

/** Thumbnails for a page of results, which the page asks for a few at a time. */
async function images({ db, bucket, actor, payload }) {
  requireAdmin(actor);
  const { bank } = bankOf(payload);
  if (!Array.isArray(payload.ids) || payload.ids.length > MAX_IMAGE_IDS) throw invalid(`ids must be a list of at most ${MAX_IMAGE_IDS}`);
  const ids = payload.ids.map((value) => id(value, "ids"));
  if (!ids.length) return { images: {} };
  const docs = await db.getAll(...ids.map((recordId) => db.collection(bank.collection).doc(recordId)));
  const entries = await Promise.all(docs.map(async (doc) => {
    const [storagePath] = doc.exists ? bank.crops(doc.data()) : [];
    return [doc.id, storagePath ? await downloadThumbnail(bucket, storagePath) : null];
  }));
  return { images: Object.fromEntries(entries) };
}

function linkedQuestion(doc) {
  const q = doc.data();
  return { id: doc.id, status: q.status || null, label: q.label || null, text: q.text || "", marks: q.marks ?? null };
}

function linkedGuide(doc) {
  const g = doc.data();
  return { id: doc.id, status: g.status || null, questionId: g.questionId || null, criteria: g.criteria || "", sampleAnswer: g.sampleAnswer || "" };
}

async function guidesFor(db, questionIds) {
  const guides = [];
  for (let start = 0; start < questionIds.length; start += FIRESTORE_IN_LIMIT) {
    const snapshot = await db.collection(GUIDES_COLLECTION).where("questionId", "in", questionIds.slice(start, start + FIRESTORE_IN_LIMIT)).get();
    guides.push(...snapshot.docs);
  }
  return guides;
}

/** The English records joined to this one. A stimulus's questions and guides include hidden ones, unlike a generator search. */
async function linksOf(db, name, doc) {
  const data = doc.data();
  if (name === "stimuli") {
    const questions = await db.collection(ENGLISH_QUESTIONS_COLLECTION).where("stimulusIds", "array-contains", doc.id).get();
    const guides = await guidesFor(db, questions.docs.map((question) => question.id));
    return { questions: questions.docs.map(linkedQuestion), guides: guides.map(linkedGuide) };
  }
  if (name === "englishQuestions") {
    const ids = data.stimulusIds || [];
    const stimuli = ids.length ? await db.getAll(...ids.map((stimulusId) => db.collection(STIMULI_COLLECTION).doc(stimulusId))) : [];
    const guides = await guidesFor(db, [doc.id]);
    return {
      stimuli: stimuli.filter((entry) => entry.exists).map((entry) => ({ id: entry.id, status: entry.get("status") || null, title: entry.get("title") || entry.get("label") || null, type: entry.get("type") || null })),
      guides: guides.map(linkedGuide),
    };
  }
  if (name === "guides" && data.questionId) {
    const question = await db.collection(ENGLISH_QUESTIONS_COLLECTION).doc(data.questionId).get();
    return { questions: question.exists ? [linkedQuestion(question)] : [] };
  }
  return {};
}

function isoOf(value) {
  return value?.toDate ? value.toDate().toISOString() : value || null;
}

async function historyOf(db, name, recordId) {
  // Read in full and sorted here: a limit before sorting could drop the newest
  // entries, and one record only ever gathers a handful.
  const snapshot = await db.collection(AUDIT_COLLECTION).where("recordId", "==", recordId).where("bank", "==", name).get();
  return snapshot.docs
    .map((doc) => {
      const entry = doc.data();
      return { id: doc.id, action: entry.action, fields: entry.fields || [], cascade: entry.cascade || 0, actorName: entry.actorName || null, at: isoOf(entry.at) };
    })
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, HISTORY_LIMIT);
}

async function openFlagsOf(db, questionId) {
  const snapshot = await db.collection(FLAGS_COLLECTION).where("questionId", "==", questionId).where("status", "==", "open").get();
  return snapshot.docs
    .map((doc) => {
      const flag = doc.data();
      return { id: doc.id, reason: flag.reason, note: flag.note || "", createdByName: flag.createdByName || null, createdAt: isoOf(flag.createdAt), jobId: flag.jobId || null };
    })
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

async function detailOf({ db, bucket, name, bank, recordId }) {
  const doc = await db.collection(bank.collection).doc(recordId).get();
  if (!doc.exists) throw new HttpsError("not-found", "Record not found");
  const data = doc.data();
  const [flags, links, history, crops] = await Promise.all([
    bank.flaggable ? openFlagsOf(db, recordId) : [],
    linksOf(db, name, doc),
    historyOf(db, name, recordId),
    Promise.all(bank.crops(data).map((storagePath) => downloadImage(bucket, storagePath))),
  ]);
  return {
    record: {
      ...summarise(bank, doc, { openFlags: flags.length }),
      ...bank.detail(data),
      hiddenBecauseOfStimulus: Boolean(data.hiddenWith),
    },
    images: crops.filter(Boolean),
    flags,
    links,
    history,
  };
}

async function record({ db, bucket, actor, payload }) {
  requireAdmin(actor);
  const { name, bank } = bankOf(payload);
  return detailOf({ db, bucket, name, bank, recordId: id(payload.id, "id") });
}

/** A batch that splits itself to stay under Firestore's write limit. */
function chunkedWrites(db) {
  const writes = [];
  return {
    update: (ref, data) => writes.push(["update", ref, data]),
    set: (ref, data) => writes.push(["set", ref, data]),
    commit: async () => {
      for (let start = 0; start < writes.length; start += WRITE_CHUNK) {
        const batch = db.batch();
        for (const [kind, ref, data] of writes.slice(start, start + WRITE_CHUNK)) batch[kind](ref, data);
        await batch.commit();
      }
    },
  };
}

function audit(db, writes, { name, recordId, action, fields = [], cascade = 0, actor, at }) {
  writes.set(db.collection(AUDIT_COLLECTION).doc(), { bank: name, recordId, action, fields, cascade, actorUid: actor.uid, actorName: actor.name, at });
}

async function closeOpenFlags(db, writes, { questionId, resolution, actor, at }) {
  const open = await db.collection(FLAGS_COLLECTION).where("questionId", "==", questionId).where("status", "==", "open").get();
  for (const doc of open.docs) writes.update(doc.ref, { status: "resolved", resolution, resolvedBy: actor.uid, resolvedAt: at });
  return open.size;
}

/**
 * Hiding a stimulus takes out its questions and their guides too. A question
 * that still has another live stimulus stays in use. Each record hidden this
 * way is marked hiddenWith, so restoring the stimulus brings back only those
 * and not ones an admin hid separately.
 */
async function hideLinked(db, writes, { stimulusId, actor, at }) {
  const questions = await db.collection(ENGLISH_QUESTIONS_COLLECTION).where("stimulusIds", "array-contains", stimulusId).get();
  const live = questions.docs.filter((doc) => doc.get("status") === "live");
  const otherIds = [...new Set(live.flatMap((doc) => doc.get("stimulusIds") || []).filter((other) => other !== stimulusId))];
  const others = otherIds.length ? await db.getAll(...otherIds.map((other) => db.collection(STIMULI_COLLECTION).doc(other))) : [];
  const stillLive = new Set(others.filter((doc) => doc.exists && doc.get("status") === "live").map((doc) => doc.id));
  const orphaned = live.filter((doc) => !(doc.get("stimulusIds") || []).some((other) => stillLive.has(other)));
  const stamp = { status: "hidden", hiddenBy: actor.uid, hiddenAt: at, hiddenWith: stimulusId };
  for (const doc of orphaned) writes.update(doc.ref, stamp);
  const guides = (await guidesFor(db, orphaned.map((doc) => doc.id))).filter((doc) => doc.get("status") === "live");
  for (const doc of guides) writes.update(doc.ref, stamp);
  return orphaned.length + guides.length;
}

async function restoreLinked(db, writes, { stimulusId, actor, at }) {
  const questions = await db.collection(ENGLISH_QUESTIONS_COLLECTION).where("stimulusIds", "array-contains", stimulusId).get();
  const hiddenAlong = questions.docs.filter((doc) => doc.get("status") === "hidden" && doc.get("hiddenWith"));
  const stamp = { status: "live", hiddenBy: null, hiddenAt: null, hiddenWith: null, restoredBy: actor.uid, restoredAt: at };
  for (const doc of hiddenAlong) writes.update(doc.ref, stamp);
  // Includes questions already restored on their own, whose guides are still hidden.
  const inUse = [...hiddenAlong, ...questions.docs.filter((doc) => doc.get("status") === "live")];
  const guides = (await guidesFor(db, inUse.map((doc) => doc.id))).filter((doc) => doc.get("status") === "hidden" && doc.get("hiddenWith"));
  for (const doc of guides) writes.update(doc.ref, stamp);
  return hiddenAlong.length + guides.length;
}

async function loadForChange(db, payload) {
  const { name, bank } = bankOf(payload);
  const recordId = id(payload.id, "id");
  const ref = db.collection(bank.collection).doc(recordId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "Record not found");
  return { name, bank, recordId, ref, snapshot };
}

async function hide({ db, bucket, actor, payload, now }) {
  requireAdmin(actor);
  const { name, bank, recordId, ref, snapshot } = await loadForChange(db, payload);
  if (snapshot.get("status") !== "live") throw new HttpsError("failed-precondition", "Only a live record can be hidden");
  const at = now();
  const writes = chunkedWrites(db);
  writes.update(ref, { status: "hidden", hiddenBy: actor.uid, hiddenAt: at, hiddenWith: null });
  const cascade = name === "stimuli" ? await hideLinked(db, writes, { stimulusId: recordId, actor, at }) : 0;
  if (bank.flaggable) await closeOpenFlags(db, writes, { questionId: recordId, resolution: "hide", actor, at });
  audit(db, writes, { name, recordId, action: "hide", cascade, actor, at });
  await writes.commit();
  return { ...(await detailOf({ db, bucket, name, bank, recordId })), cascade };
}

async function restore({ db, bucket, actor, payload, now }) {
  requireAdmin(actor);
  const { name, bank, recordId, ref, snapshot } = await loadForChange(db, payload);
  if (snapshot.get("status") !== "hidden") throw new HttpsError("failed-precondition", "Only a hidden record can be restored");
  const at = now();
  const writes = chunkedWrites(db);
  writes.update(ref, { status: "live", hiddenBy: null, hiddenAt: null, hiddenWith: null, restoredBy: actor.uid, restoredAt: at });
  const cascade = name === "stimuli" ? await restoreLinked(db, writes, { stimulusId: recordId, actor, at }) : 0;
  audit(db, writes, { name, recordId, action: "restore", cascade, actor, at });
  await writes.commit();
  return { ...(await detailOf({ db, bucket, name, bank, recordId })), cascade };
}

/** The bookkeeping written with any admin correction, so later extraction runs keep it. */
function editStamp(current, fields, actor, at) {
  return {
    adminEditedFields: [...new Set([...(current.adminEditedFields || []), ...Object.keys(fields)])],
    editedBy: actor.uid,
    editedAt: at,
  };
}

async function edit({ db, bucket, actor, payload, now }) {
  requireAdmin(actor);
  const { name, bank, recordId, ref, snapshot } = await loadForChange(db, payload);
  const current = snapshot.data();
  if (!["live", "hidden"].includes(current.status)) throw new HttpsError("failed-precondition", "Only a live or hidden record can be edited");
  const fields = bank.edit(current, payload.updates);
  const at = now();
  const writes = chunkedWrites(db);
  writes.update(ref, { ...fields, ...editStamp(current, fields, actor, at) });
  if (bank.flaggable) await closeOpenFlags(db, writes, { questionId: recordId, resolution: "update", actor, at });
  audit(db, writes, { name, recordId, action: "edit", fields: Object.keys(fields), actor, at });
  await writes.commit();
  return detailOf({ db, bucket, name, bank, recordId });
}

const ADMIN_ACTIONS = Object.freeze({
  bankOptions: options,
  browseBank: browse,
  bankRecord: record,
  bankImages: images,
  hideRecord: hide,
  restoreRecord: restore,
  editRecord: edit,
});

module.exports = { ADMIN_ACTIONS, AUDIT_COLLECTION, FLAGS_COLLECTION, MATHS_COLLECTION, audit, closeOpenFlags, editStamp };
