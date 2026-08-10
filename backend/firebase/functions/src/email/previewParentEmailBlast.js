"use strict";

/**
 * Renders a saved weekly-update draft for the composer's preview pane.
 *
 * The portal cannot import the renderer: `backend/firebase/functions` is
 * CommonJS, `apps/admin-portal` is an ESM Vite app, and the repo has no
 * workspace linking them. Copying the renderer across would repeat the pattern
 * used for the unsubscribe token (see `unsubscribeToken.js`) — acceptable for
 * 50 lines of HMAC that rarely changes, but not for a layout whose whole
 * purpose is to show the admin what will actually arrive. Rendering here means
 * the preview cannot drift from the send: they run the same code.
 *
 * This function is deliberately inert. It reads the draft and returns HTML —
 * no status transition, no `deliveryStartedAt`, no audit log, no mail.
 */

const { HttpsError, onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { requireAdminCallable } = require("../auth/requireAdmin");
const { toHttpsError } = require("../shared/errors");
const { assertString, validateShape } = require("../shared/validation");
const { DEFAULT_SITE_ORIGIN } = require("./unsubscribeToken");
const { buildBlastContent } = require("./blastContent");
const { logoUrlFor, renderWeeklyUpdateEmail } = require("./weeklyUpdateEmail");

const BLASTS_COLLECTION = "parentEmailBlasts";

/**
 * A deliberately invalid token. The real email carries a per-account one, and
 * minting one here would hand the admin previewing the draft a live one-click
 * link that unsubscribes *them*. `uidFromUnsubscribeToken` returns null for
 * junk without throwing, so the website's existing "bad link" page handles it
 * if anyone does click through.
 */
const PREVIEW_UNSUBSCRIBE_TOKEN = "preview";

function validatePreviewPayload(input) {
  const { blastId } = validateShape(input ?? {}, {
    blastId: (v) => assertString(v, "blastId", { max: 200 }),
  });
  return { blastId };
}

function previewUnsubscribeUrl(siteOrigin) {
  return `${String(siteOrigin).replace(
    /\/+$/,
    ""
  )}/unsubscribe?token=${PREVIEW_UNSUBSCRIBE_TOKEN}`;
}

/**
 * @returns {Promise<{blastId: string, subject: string, html: string,
 *   announcementCount: number, sectionCount: number}>}
 */
async function previewParentEmailBlastImpl({ payload, deps }) {
  const { db, siteOrigin = DEFAULT_SITE_ORIGIN } = deps;
  if (!db) throw new TypeError("previewParentEmailBlastImpl requires db");

  const { blastId } = payload;
  const snap = await db.collection(BLASTS_COLLECTION).doc(blastId).get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "That weekly update no longer exists.");
  }

  const blast = snap.data();
  const { subject, intro, announcements, sections } = await buildBlastContent({
    db,
    blast,
    blastId,
  });

  // An empty or subject-less draft still previews. The composer is showing a
  // work in progress; refusing to render it would make the pane blink out
  // exactly while someone is filling it in. The send path keeps its own
  // preconditions.
  const { html } = renderWeeklyUpdateEmail({
    subject,
    intro,
    announcements,
    sections,
    unsubscribeUrl: previewUnsubscribeUrl(siteOrigin),
    logoUrl: logoUrlFor(siteOrigin),
  });

  return {
    blastId,
    subject,
    html,
    announcementCount: announcements.length,
    sectionCount: sections.length,
  };
}

const previewParentEmailBlast = onCall(
  { region: "us-central1" },
  async (request) => {
    const actor = requireAdminCallable(request);
    let payload;
    try {
      payload = validatePreviewPayload(request.data);
    } catch (err) {
      throw toHttpsError(err);
    }
    try {
      return await previewParentEmailBlastImpl({
        payload,
        deps: {
          db: admin.firestore(),
          siteOrigin: process.env.PUBLIC_SITE_ORIGIN || DEFAULT_SITE_ORIGIN,
        },
      });
    } catch (err) {
      logger.error("[previewParentEmailBlast] failed", {
        errorMessage: err?.message,
        actorUid: actor.uid,
      });
      throw toHttpsError(err);
    }
  }
);

module.exports = {
  PREVIEW_UNSUBSCRIBE_TOKEN,
  previewParentEmailBlast,
  previewParentEmailBlastImpl,
  previewUnsubscribeUrl,
  validatePreviewPayload,
};
