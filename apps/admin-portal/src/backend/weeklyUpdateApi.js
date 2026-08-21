import { callFunction } from "./callable";
import { getDocument, listDocuments, orderBy } from "./firestoreReads";
import {
  createDocument,
  deleteDocument,
  serverTimestamp,
  updateDocument,
} from "./firestoreWrites";
import { normalizeWeeklyUpdate } from "./schemas";
import { announcementIdsFromBlocks, blockForEditing } from "./weeklyUpdateBlocks";

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

/**
 * A new draft with an existing update's content.
 *
 * Most weeks are last week with different words in it, and rebuilding the same
 * skeleton of heading, announcements, note and signature from an empty page was
 * the largest single piece of work the composer asked for.
 *
 * Announcement blocks are dropped rather than carried over: they point at
 * specific announcements, and last week's are exactly the ones this week's
 * update should not repeat. Everything that shapes the email — the running
 * order, the styles, the closing panel — is what survives. The subject does
 * not, so a copy cannot be sent still wearing the previous week's date.
 */
export async function duplicateWeeklyUpdate(blastId) {
  const source = await getWeeklyUpdate(blastId);
  if (!source) throw new Error("That weekly update no longer exists.");

  return createWeeklyUpdate({
    ...source,
    subject: "",
    blocks: (source.blocks ?? []).filter((block) => block?.type !== "announcement"),
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

/**
 * The saved draft rendered as the email HTML, for the composer's preview.
 *
 * Rendered on the backend rather than here on purpose: the renderer lives in
 * the Functions package, which this app cannot import, and a copy kept in step
 * by hand would eventually show an email that is not the one parents get.
 * Sends nothing and changes nothing.
 */
export function previewWeeklyUpdate(blastId) {
  return callFunction("previewParentEmailBlast", { blastId });
}

const str = (value) => String(value ?? "");

/**
 * One block, whitelisted per type.
 *
 * Whitelisting rather than spreading matters for announcement blocks: the
 * composer holds the announcement's title so it can label the block, and
 * persisting that would freeze a copy that stops tracking the announcement it
 * came from. The renderer merges the live copy at send time instead.
 */
function blockFields(source = {}) {
  // A draft loaded from before callouts were merged into text still holds the
  // old type until it is saved. Converting here rather than trusting the caller
  // means a save can never write back a type the composer no longer edits.
  const block = blockForEditing(source) ?? {};
  const base = { id: str(block.id), type: str(block.type) };
  switch (block.type) {
    case "text":
      return {
        ...base,
        tone: str(block.tone) || "plain",
        eyebrow: str(block.eyebrow),
        title: str(block.title),
        body: str(block.body),
      };
    case "announcement":
      return {
        ...base,
        announcementId: str(block.announcementId).trim(),
        eyebrow: str(block.eyebrow),
      };
    case "heading":
      return { ...base, eyebrow: str(block.eyebrow), title: str(block.title) };
    case "button":
      return {
        ...base,
        label: str(block.label),
        url: str(block.url).trim(),
        align: str(block.align) || "left",
      };
    case "linkList":
      return {
        ...base,
        title: str(block.title),
        links: (Array.isArray(block.links) ? block.links : [])
          .map((link) => ({ label: str(link?.label), url: str(link?.url).trim() }))
          .filter((link) => link.label || link.url),
      };
    case "signature":
      return {
        ...base,
        name: str(block.name),
        role: str(block.role),
        body: str(block.body),
      };
    case "spacer":
      return { ...base, size: str(block.size) || "md" };
    default:
      return base;
  }
}

/**
 * The stored draft.
 *
 * Saving retires the pre-block fields: `blocks` is the only content the renderer
 * reads once it is present, and leaving `intro` and `sections` populated would
 * keep a copy of the old draft that no longer matches the email. Derived
 * `announcementIds` is the exception — the reporting views and the digest
 * helpers key off it, so it stays as a mirror of the announcement blocks.
 */
function draftFields(draft = {}) {
  const blocks = (Array.isArray(draft.blocks) ? draft.blocks : []).map(blockFields);

  return {
    subject: str(draft.subject).trim(),
    preheader: str(draft.preheader).trim(),
    // An empty headline is meaningful: the renderer falls back to the subject,
    // so clearing it is how you put the two back in step.
    masthead: {
      eyebrow: str(draft.masthead?.eyebrow),
      title: str(draft.masthead?.title),
    },
    cta: {
      eyebrow: str(draft.cta?.eyebrow),
      title: str(draft.cta?.title),
      body: str(draft.cta?.body),
      label: str(draft.cta?.label),
      url: str(draft.cta?.url).trim(),
    },
    blocks,
    announcementIds: announcementIdsFromBlocks(blocks),
    intro: "",
    sections: [],
  };
}
