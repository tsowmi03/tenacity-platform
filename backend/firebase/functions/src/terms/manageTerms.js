"use strict";

const { HttpsError, onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { requireAdminCallable } = require("../auth/requireAdmin");
const { toHttpsError } = require("../shared/errors");
const { writeAuditLog } = require("../shared/auditLog");
const { fromDate, updatedMeta } = require("../shared/timestamps");
const {
  validateCreateTermsForYearPayload,
  validateUpdateTermPayload,
  termIdFor,
  buildTermDoc,
  normaliseTermDoc,
  termSummaryFromDoc,
} = require("./termSchemas");

async function createTermsForYearImpl({ payload, actor, deps }) {
  const { db, clock } = deps;
  if (!db) throw new TypeError("createTermsForYearImpl requires db");
  if (!actor?.uid) throw new TypeError("createTermsForYearImpl requires actor.uid");

  const termsWithIds = payload.terms.map((term) => ({
    ...term,
    year: term.year || payload.year,
    id: term.id || termIdFor(payload.year, term.termNum),
  }));
  const termDocs = termsWithIds.map((term) =>
    buildTermDoc(term, { actorUid: actor.uid, clock })
  );
  const created = termsWithIds.map((term, index) =>
    termSummaryFromDoc(term.id, termDocs[index])
  );

  await db.runTransaction(async (txn) => {
    const refs = termsWithIds.map((term) => db.collection("terms").doc(term.id));
    const snaps = await Promise.all(refs.map((ref) => txn.get(ref)));
    const existing = snaps.find((snap) => snap.exists);
    if (existing) {
      throw new HttpsError(
        "already-exists",
        `Term already exists: ${existing.id}`
      );
    }

    termsWithIds.forEach((term, index) => {
      txn.set(refs[index], termDocs[index]);
    });
  });

  await writeAuditLog(
    db,
    {
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.claims?.role || actor.role || null,
      action: "terms.createForYear",
      targetType: "terms",
      targetId: payload.year,
      targetName: `${payload.year} terms`,
      payloadSummary: {
        year: payload.year,
        termIds: created.map((term) => term.id),
        count: created.length,
      },
      after: created,
    },
    { logger, clock }
  );

  return { year: payload.year, terms: created };
}

async function updateTermImpl({ payload, actor, deps }) {
  const { db, clock } = deps;
  if (!db) throw new TypeError("updateTermImpl requires db");
  if (!actor?.uid) throw new TypeError("updateTermImpl requires actor.uid");

  const ref = db.collection("terms").doc(payload.termId);
  const beforeSnap = await ref.get();
  if (!beforeSnap.exists) {
    throw new HttpsError("not-found", `Term not found: ${payload.termId}`);
  }
  const beforeData = beforeSnap.data() || {};
  const before = termSummaryFromDoc(payload.termId, beforeData);

  const patch = {};
  if (payload.updates.startDate !== undefined) {
    patch.startDate = fromDate(payload.updates.startDate);
  }
  if (payload.updates.endDate !== undefined) {
    patch.endDate = fromDate(payload.updates.endDate);
  }
  if (payload.updates.weeksNum !== undefined) {
    patch.weeksNum = payload.updates.weeksNum;
  }
  if (payload.updates.status !== undefined) {
    patch.status = payload.updates.status;
  }

  const candidate = { ...beforeData, ...patch };
  const normalisedCandidate = normaliseTermDoc(candidate, payload.termId);
  const after = termSummaryFromDoc(payload.termId, candidate);
  if (normalisedCandidate.startDate >= normalisedCandidate.endDate) {
    throw new HttpsError("invalid-argument", "endDate must be after startDate");
  }

  await ref.update({ ...patch, ...updatedMeta(actor.uid, clock) });

  await writeAuditLog(
    db,
    {
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.claims?.role || actor.role || null,
      action: "term.update",
      targetType: "term",
      targetId: payload.termId,
      targetName: `Term ${after.termNum} ${after.year}`,
      payloadSummary: { fields: Object.keys(payload.updates) },
      before,
      after,
    },
    { logger, clock }
  );

  return { termId: payload.termId, term: after };
}

const adminCreateTermsForYear = onCall(
  { region: "us-central1" },
  async (request) => {
    const actor = requireAdminCallable(request);
    let payload;
    try {
      payload = validateCreateTermsForYearPayload(request.data);
    } catch (err) {
      throw toHttpsError(err);
    }
    try {
      return await createTermsForYearImpl({
        payload,
        actor,
        deps: { db: admin.firestore() },
      });
    } catch (err) {
      logger.error("[adminCreateTermsForYear] failed", {
        errorMessage: err?.message,
        actorUid: actor.uid,
      });
      throw toHttpsError(err);
    }
  }
);

const adminUpdateTerm = onCall(
  { region: "us-central1" },
  async (request) => {
    const actor = requireAdminCallable(request);
    let payload;
    try {
      payload = validateUpdateTermPayload(request.data);
    } catch (err) {
      throw toHttpsError(err);
    }
    try {
      return await updateTermImpl({
        payload,
        actor,
        deps: { db: admin.firestore() },
      });
    } catch (err) {
      logger.error("[adminUpdateTerm] failed", {
        errorMessage: err?.message,
        actorUid: actor.uid,
      });
      throw toHttpsError(err);
    }
  }
);

module.exports = {
  createTermsForYearImpl,
  updateTermImpl,
  adminCreateTermsForYear,
  adminUpdateTerm,
};
