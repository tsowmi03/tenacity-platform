"use strict";

/**
 * Turns a saved weekly-update draft into the content that gets rendered.
 *
 * This lives apart from the sender because two callers need it and they must
 * not drift: `sendParentEmailBlast` mails the result, and
 * `previewParentEmailBlast` shows it to the admin composing the draft. A
 * preview that filtered announcements differently from the send would be worse
 * than no preview — it would be a confident lie about what parents receive.
 */

const logger = require("firebase-functions/logger");

const {
  blockHasContent,
  blocksFromLegacy,
  normaliseBlocks,
} = require("./weeklyUpdateBlocks");

/**
 * Announcements written for tutors or admins never belong in a parent email,
 * and an archived announcement has been withdrawn — both are dropped at send
 * time even if they were selected when the draft was saved.
 */
const PARENT_VISIBLE_AUDIENCES = new Set(["parent", "all"]);

function announcementIsParentVisible(data) {
  return (
    Boolean(data) &&
    data.archived !== true &&
    PARENT_VISIBLE_AUDIENCES.has(String(data.audience ?? "all").toLowerCase())
  );
}

/**
 * The parent-visible announcements among the given ids, keyed by id.
 *
 * Read once per unique id even if two blocks reference the same announcement,
 * which a draft is free to do.
 */
async function loadAnnouncements({ db, ids, blastId }) {
  const unique = [...new Set(ids.filter(Boolean))];
  const snaps = await Promise.all(
    unique.map((id) => db.collection("announcements").doc(id).get())
  );

  const byId = new Map();
  snaps.forEach((snap, index) => {
    if (!snap.exists) return;
    const data = snap.data();
    if (!announcementIsParentVisible(data)) {
      logger.warn("[parentEmailBlast] skipping announcement", {
        blastId,
        announcementId: unique[index],
        reason: data.archived === true ? "archived" : "audience",
      });
      return;
    }
    byId.set(snap.id, {
      id: snap.id,
      title: String(data.title ?? ""),
      body: String(data.body ?? ""),
    });
  });

  return byId;
}

/** Structural blocks earn their place without carrying copy. */
const STRUCTURAL_TYPES = new Set(["divider", "spacer"]);

/**
 * Resolves a draft into the blocks the renderer draws.
 *
 * Deliberately does not enforce "the draft has something in it" — the sender
 * treats an empty draft as a failed precondition, while the preview has to
 * render one so an admin can watch the email fill in as they type.
 *
 * A draft saved before the block model existed is converted here rather than
 * rewritten in Firestore, so an update that has already been sent still reads
 * back as the email that went out.
 *
 * @param {object} input
 * @param {FirebaseFirestore.Firestore} input.db
 * @param {object} input.blast the draft document data
 * @param {string} [input.blastId] for log correlation only
 * @returns {Promise<{subject: string, preheader: string, masthead: object,
 *   cta: object|undefined, blocks: Array<object>,
 *   announcements: Array<{id: string, title: string, body: string}>}>}
 */
async function buildBlastContent({ db, blast, blastId }) {
  if (!db) throw new TypeError("buildBlastContent requires db");

  const stored = normaliseBlocks(blast?.blocks);
  const isLegacy = stored.length === 0;

  const referencedIds = isLegacy
    ? Array.isArray(blast?.announcementIds)
      ? blast.announcementIds
      : []
    : stored
        .filter((block) => block.type === "announcement")
        .map((block) => block.announcementId);

  const announcementsById = await loadAnnouncements({
    db,
    ids: referencedIds,
    blastId,
  });

  let blocks;
  if (isLegacy) {
    const announcements = referencedIds
      .map((id) => announcementsById.get(id))
      .filter(Boolean);
    const sections = Array.isArray(blast?.sections)
      ? blast.sections
          .map((section) => ({
            title: String(section?.title ?? "").trim(),
            body: String(section?.body ?? "").trim(),
          }))
          .filter((section) => section.title || section.body)
      : [];
    blocks = normaliseBlocks(
      blocksFromLegacy({
        intro: String(blast?.intro ?? ""),
        announcements,
        sections,
      })
    );
  } else {
    blocks = stored
      .map((block) => {
        if (block.type !== "announcement") return block;
        const announcement = announcementsById.get(block.announcementId);
        if (!announcement) return null;
        return { ...block, title: announcement.title, body: announcement.body };
      })
      .filter(Boolean)
      // An empty panel reads as a rendering fault rather than an empty field,
      // so a block with nothing in it is left out entirely.
      .filter((block) => STRUCTURAL_TYPES.has(block.type) || blockHasContent(block));
  }

  // What actually made it into the email, in order, for the sent snapshot.
  const announcements = blocks
    .filter((block) => block.type === "announcement")
    .map((block) => ({
      id: block.announcementId,
      title: block.title,
      body: block.body,
    }));

  return {
    subject: String(blast?.subject ?? "").trim(),
    preheader: String(blast?.preheader ?? ""),
    masthead: blast?.masthead ?? undefined,
    cta: blast?.cta ?? undefined,
    blocks,
    announcements,
  };
}

module.exports = {
  announcementIsParentVisible,
  buildBlastContent,
};
