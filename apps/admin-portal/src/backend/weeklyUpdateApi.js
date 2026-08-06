import { callFunction } from "./callable";
import { getDocument, listDocuments, orderBy } from "./firestoreReads";
import {
  createDocument,
  deleteDocument,
  serverTimestamp,
  updateDocument,
} from "./firestoreWrites";
import { normalizeWeeklyUpdate } from "./schemas";

const COLLECTION = "parentEmailBlasts";

/**
 * Weekly parent email drafts, newest first.
 *
 * Drafts are read and written directly: the rules already restrict the whole
 * collection to admins, and composing needs no server-side logic. Sending does,
 * so it goes through the `sendParentEmailBlast` callable.
 */
export function listWeeklyUpdates() {
  return listDocuments(COLLECTION, {
    constraints: [orderBy("createdAt", "desc")],
    normalize: normalizeWeeklyUpdate,
  });
}

export function getWeeklyUpdate(blastId) {
  return getDocument(COLLECTION, blastId, { normalize: normalizeWeeklyUpdate });
}

export function createWeeklyUpdate(draft) {
  return createDocument(COLLECTION, {
    ...draftFields(draft),
    status: "draft",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function saveWeeklyUpdate(blastId, draft) {
  return updateDocument(COLLECTION, blastId, {
    ...draftFields(draft),
    updatedAt: serverTimestamp(),
  });
}

export function deleteWeeklyUpdate(blastId) {
  return deleteDocument(COLLECTION, blastId);
}

/** Sends the saved draft to every eligible parent. */
export function sendWeeklyUpdate(blastId) {
  return callFunction("sendParentEmailBlast", { blastId });
}

/** Sends the saved draft to named addresses only, leaving it a draft. */
export function sendWeeklyUpdateTest(blastId, testEmails) {
  return callFunction("sendParentEmailBlast", { blastId, testEmails });
}

function draftFields(draft = {}) {
  return {
    subject: String(draft.subject || "").trim(),
    intro: String(draft.intro || ""),
    announcementIds: Array.isArray(draft.announcementIds)
      ? draft.announcementIds.filter((value) => typeof value === "string")
      : [],
    sections: (Array.isArray(draft.sections) ? draft.sections : [])
      .map((section) => ({
        title: String(section?.title || "").trim(),
        body: String(section?.body || "").trim(),
      }))
      .filter((section) => section.title || section.body),
  };
}
