"use strict";

const { HttpsError, onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
// Guarded shim, not @sendgrid/mail directly. See ./sendGuard.js.
const sgMail = require("./sendGuard");

const { requireAdminCallable } = require("../auth/requireAdmin");
const { toHttpsError } = require("../shared/errors");
const { writeAuditLog } = require("../shared/auditLog");
const { now } = require("../shared/timestamps");
const {
  assertArray,
  assertEmail,
  assertString,
  validateShape,
} = require("../shared/validation");
const { sendgridApiKey } = require("./sendgridSecret");
const {
  DEFAULT_SITE_ORIGIN,
  unsubscribeSecret,
  unsubscribeOneClickUrlFor,
  unsubscribePageUrlFor,
} = require("./unsubscribeToken");
const { buildBlastContent } = require("./blastContent");
const { logoUrlFor, renderWeeklyUpdateEmail } = require("./weeklyUpdateEmail");

const BLASTS_COLLECTION = "parentEmailBlasts";
const FROM_ADDRESS = "no-reply@tenacitytutoring.com";
const MAX_TEST_RECIPIENTS = 5;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateSendPayload(input) {
  const { blastId, testEmails } = validateShape(input ?? {}, {
    blastId: (v) => assertString(v, "blastId", { max: 200 }),
    // `min: 1` matters: an empty array would otherwise be a supplied-but-falsy
    // test request, which the `isTest` check reads as a real send — one stray
    // `testEmails: []` would mail every parent instead of nobody.
    testEmails: (v) =>
      v === undefined || v === null
        ? undefined
        : assertArray(v, "testEmails", {
            itemAssert: (item, field) => assertEmail(item, field),
            unique: true,
            min: 1,
            max: MAX_TEST_RECIPIENTS,
          }),
  });
  return { blastId, testEmails: testEmails ?? null };
}

function normaliseEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  return EMAIL_RE.test(email) ? email : "";
}

/**
 * Parents with a usable email who have not opted out, deduped by address so a
 * shared family email is not mailed twice. The uid is kept because the
 * unsubscribe token is per-account.
 *
 * An opt-out suppresses the *address*, not just the account that clicked it.
 * Two parent records can share one inbox and the unsubscribe token names only
 * the uid it was minted for, so honouring the flag per-record would let the
 * other record keep mailing an inbox that has already unsubscribed — the
 * winner being whichever record the query happened to return first.
 *
 * @param {Array<{id: string, data: object}>} userRecords
 * @returns {{ recipients: Array<{uid: string, email: string, firstName: string}>, optedOut: number, unusable: number }}
 */
function resolveParentRecipients(userRecords) {
  const recipients = [];
  const seen = new Set();
  let optedOut = 0;
  let unusable = 0;

  const suppressed = new Set();
  for (const { data } of userRecords) {
    if (data?.emailBlastOptOut !== true) continue;
    const email = normaliseEmail(data?.email);
    if (email) suppressed.add(email);
  }

  for (const { id, data } of userRecords) {
    const email = normaliseEmail(data?.email);
    if (data?.emailBlastOptOut === true || (email && suppressed.has(email))) {
      optedOut += 1;
      continue;
    }
    if (!email) {
      unusable += 1;
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);
    recipients.push({
      uid: id,
      email,
      firstName: String(data?.firstName ?? "").trim(),
    });
  }

  return { recipients, optedOut, unusable };
}

/** Run `worker` over `items`, at most `limit` in flight, preserving order. */
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  const runners = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    run
  );
  await Promise.all(runners);
  return results;
}

function defaultSendEmail(message) {
  const apiKey = sendgridApiKey.value();
  if (!apiKey) throw new Error("Missing SENDGRID_API_KEY secret");
  sgMail.setApiKey(apiKey);
  return sgMail.send(message);
}

/**
 * Send a saved draft to every eligible parent.
 *
 * One request per recipient rather than SendGrid `personalizations`: the
 * unsubscribe link is per-account, recipients never see each other, and a
 * single bad address cannot fail the batch. At this list size the extra
 * requests cost nothing.
 *
 * A `testEmails` send delivers the same rendered email to named addresses and
 * leaves the draft in `draft` so the real send still has to be triggered
 * deliberately.
 */
async function sendParentEmailBlastImpl({ payload, actor, deps }) {
  const {
    db,
    sendEmail = defaultSendEmail,
    secret,
    siteOrigin = DEFAULT_SITE_ORIGIN,
    clock,
    concurrency = 20,
  } = deps;
  if (!db) throw new TypeError("sendParentEmailBlastImpl requires db");
  if (!actor?.uid) throw new TypeError("sendParentEmailBlastImpl requires actor.uid");
  if (!secret) throw new Error("Missing EMAIL_BLAST_UNSUBSCRIBE_SECRET secret");

  const { blastId, testEmails } = payload;
  const isTest = Array.isArray(testEmails) && testEmails.length > 0;
  const blastRef = db.collection(BLASTS_COLLECTION).doc(blastId);

  // Claim the draft before doing any work so a double-click cannot mail the
  // list twice. Test sends skip the claim; they never change status.
  const blast = await db.runTransaction(async (tx) => {
    const snap = await tx.get(blastRef);
    if (!snap.exists) {
      throw new HttpsError("not-found", "That weekly update no longer exists.");
    }
    const data = snap.data();
    if (!isTest) {
      if (data.status === "sending") {
        throw new HttpsError(
          "failed-precondition",
          "That weekly update is already being sent."
        );
      }
      if (data.status === "sent") {
        throw new HttpsError(
          "failed-precondition",
          "That weekly update has already been sent."
        );
      }
      // Status alone is not enough to make a re-send safe. If the recipient
      // loop finished but writing the outcome failed, the blast lands in
      // `failed` with every parent already emailed; retrying it would mail
      // them all a second time. This marker is written before the first
      // message goes out and is never cleared, so a blast that has begun
      // delivering can never be sent again whatever its status says.
      if (data.deliveryStartedAt) {
        throw new HttpsError(
          "failed-precondition",
          "That weekly update has already begun sending and cannot be sent again."
        );
      }
      tx.update(blastRef, { status: "sending", updatedAt: now(clock) });
    }
    return data;
  });

  const subject = String(blast.subject ?? "").trim();
  if (!subject) {
    if (!isTest) {
      await blastRef.update({ status: "draft", updatedAt: now(clock) });
    }
    throw new HttpsError("failed-precondition", "Add a subject before sending.");
  }

  try {
    const { intro, announcements, sections } = await buildBlastContent({
      db,
      blast,
      blastId,
    });

    if (!intro.trim() && !announcements.length && !sections.length) {
      throw new HttpsError(
        "failed-precondition",
        "Add an intro, an announcement or a section before sending."
      );
    }

    let targets;
    let optedOut = 0;
    if (isTest) {
      targets = testEmails.map((email) => ({
        uid: actor.uid,
        email,
        firstName: "",
      }));
    } else {
      const usersSnap = await db
        .collection("users")
        .where("role", "==", "parent")
        .get();
      const resolved = resolveParentRecipients(
        usersSnap.docs.map((doc) => ({ id: doc.id, data: doc.data() }))
      );
      targets = resolved.recipients;
      optedOut = resolved.optedOut;
      if (!targets.length) {
        throw new HttpsError(
          "failed-precondition",
          "No parents are eligible to receive this update."
        );
      }
    }

    // Pin the point of no return before the first message leaves, so a crash
    // anywhere in the loop below still leaves evidence that parents were mailed.
    if (!isTest) {
      await blastRef.update({ deliveryStartedAt: now(clock) });
    }

    const logoUrl = logoUrlFor(siteOrigin);

    const outcomes = await mapWithConcurrency(targets, concurrency, async (target) => {
      const { html, text } = renderWeeklyUpdateEmail({
        subject,
        intro,
        announcements,
        sections,
        unsubscribeUrl: unsubscribePageUrlFor(target.uid, secret, siteOrigin),
        logoUrl,
      });
      try {
        await sendEmail({
          to: target.email,
          from: FROM_ADDRESS,
          subject,
          html,
          text,
          headers: {
            "List-Unsubscribe": `<${unsubscribeOneClickUrlFor(
              target.uid,
              secret,
              siteOrigin
            )}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        });
        return { ok: true };
      } catch (err) {
        logger.warn("[parentEmailBlast] recipient send failed", {
          blastId,
          errorMessage: err?.message,
        });
        return { ok: false };
      }
    });

    const successCount = outcomes.filter((outcome) => outcome.ok).length;
    const failureCount = outcomes.length - successCount;

    if (isTest) {
      await blastRef.update({
        lastTestSentAt: now(clock),
        lastTestRecipientCount: targets.length,
        updatedAt: now(clock),
      });
    } else {
      await blastRef.update({
        status: failureCount === outcomes.length ? "failed" : "sent",
        sentAt: now(clock),
        sentBy: actor.uid,
        recipientCount: targets.length,
        successCount,
        failureCount,
        optedOutCount: optedOut,
        // Announcements can be edited or archived later; the email that went
        // out cannot, so keep what was actually mailed.
        announcementSnapshots: announcements,
        error: null,
        updatedAt: now(clock),
      });

      await writeAuditLog(
        db,
        {
          actorUid: actor.uid,
          actorEmail: actor.email,
          actorRole: "admin",
          action: "parentEmailBlast.send",
          targetType: "parentEmailBlast",
          targetId: blastId,
          targetName: subject,
          payloadSummary: {
            recipientCount: targets.length,
            successCount,
            failureCount,
            optedOutCount: optedOut,
            announcementIds: announcements.map((item) => item.id),
            sectionCount: sections.length,
          },
        },
        { logger, clock }
      );
    }

    return {
      blastId,
      test: isTest,
      recipientCount: targets.length,
      successCount,
      failureCount,
      optedOutCount: optedOut,
      announcementCount: announcements.length,
    };
  } catch (err) {
    if (!isTest) {
      await blastRef
        .update({
          status: "failed",
          error: err?.message ?? "send failed",
          updatedAt: now(clock),
        })
        .catch(() => {});
    }
    throw err;
  }
}

const sendParentEmailBlast = onCall(
  {
    region: "us-central1",
    secrets: [sendgridApiKey, unsubscribeSecret],
    timeoutSeconds: 540,
  },
  async (request) => {
    const actor = requireAdminCallable(request);
    let payload;
    try {
      payload = validateSendPayload(request.data);
    } catch (err) {
      throw toHttpsError(err);
    }
    try {
      return await sendParentEmailBlastImpl({
        payload,
        actor,
        deps: {
          db: admin.firestore(),
          secret: unsubscribeSecret.value(),
          siteOrigin: process.env.PUBLIC_SITE_ORIGIN || DEFAULT_SITE_ORIGIN,
        },
      });
    } catch (err) {
      logger.error("[sendParentEmailBlast] failed", {
        errorMessage: err?.message,
        actorUid: actor.uid,
      });
      throw toHttpsError(err);
    }
  }
);

module.exports = {
  BLASTS_COLLECTION,
  mapWithConcurrency,
  resolveParentRecipients,
  sendParentEmailBlast,
  sendParentEmailBlastImpl,
  validateSendPayload,
};
