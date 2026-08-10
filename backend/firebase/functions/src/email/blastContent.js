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
 * Resolves a draft's referenced announcements and normalises its sections.
 *
 * Deliberately does not enforce "the draft has something in it" — the sender
 * treats an empty draft as a failed precondition, while the preview has to
 * render one so an admin can watch the email fill in as they type.
 *
 * @param {object} input
 * @param {FirebaseFirestore.Firestore} input.db
 * @param {object} input.blast the draft document data
 * @param {string} [input.blastId] for log correlation only
 * @returns {Promise<{subject: string, intro: string,
 *   announcements: Array<{id: string, title: string, body: string}>,
 *   sections: Array<{title: string, body: string}>}>}
 */
async function buildBlastContent({ db, blast, blastId }) {
  if (!db) throw new TypeError("buildBlastContent requires db");

  const announcementIds = Array.isArray(blast?.announcementIds)
    ? blast.announcementIds
    : [];
  const announcementSnaps = await Promise.all(
    announcementIds.map((id) => db.collection("announcements").doc(id).get())
  );

  const announcements = [];
  announcementSnaps.forEach((snap, index) => {
    if (!snap.exists) return;
    const data = snap.data();
    if (!announcementIsParentVisible(data)) {
      logger.warn("[parentEmailBlast] skipping announcement", {
        blastId,
        announcementId: announcementIds[index],
        reason: data.archived === true ? "archived" : "audience",
      });
      return;
    }
    announcements.push({
      id: snap.id,
      title: String(data.title ?? ""),
      body: String(data.body ?? ""),
    });
  });

  const sections = Array.isArray(blast?.sections)
    ? blast.sections
        .map((section) => ({
          title: String(section?.title ?? "").trim(),
          body: String(section?.body ?? "").trim(),
        }))
        .filter((section) => section.title || section.body)
    : [];

  return {
    subject: String(blast?.subject ?? "").trim(),
    intro: String(blast?.intro ?? ""),
    announcements,
    sections,
  };
}

module.exports = {
  announcementIsParentVisible,
  buildBlastContent,
};
