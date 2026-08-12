"use strict";

/*
 * Drop-in replacement for `require("@sendgrid/mail")` that makes it impossible
 * for a non-production deployment to email a real person.
 *
 * Why a shim rather than a wrapper function: there are 11 `sgMail.send(...)`
 * call sites across four files (lib/email_functions.js,
 * lib/notifications/invoices.js, lib/portal/overrides.js,
 * src/email/parentEmailBlast.js). Swapping the import in those four files
 * leaves every call site untouched and automatically covers any new one added
 * later, which a per-call-site wrapper would not.
 *
 * Policy, applied only when the runtime project is NOT production:
 *
 *   STAGING_EMAIL_SINK set    -> every to/cc/bcc is replaced by the sink
 *                                address, the subject is prefixed, and the
 *                                original recipients are preserved in an
 *                                X-Original-To header so the mail is still
 *                                useful for testing.
 *   STAGING_EMAIL_SINK unset  -> the send is DROPPED and logged. Failing
 *                                closed here is deliberate: throwing would
 *                                break the calling flow, and sending would
 *                                defeat the entire point of the guard.
 *
 * Production is identified by project id, not by a flag, so forgetting to set
 * something cannot accidentally put staging into production mode.
 */

const sgMail = require("@sendgrid/mail");
const logger = require("firebase-functions/logger");

const PRODUCTION_PROJECT_ID = "tenacity-tutoring-b8eb2";

function currentProjectId() {
  return (
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.FIREBASE_PROJECT_ID ||
    ""
  );
}

function isProduction() {
  return currentProjectId() === PRODUCTION_PROJECT_ID;
}

function sinkAddress() {
  return String(process.env.STAGING_EMAIL_SINK || "").trim();
}

/** Flatten SendGrid's several recipient shapes into plain addresses. */
function describeRecipients(message) {
  const collect = (field) => {
    const value = message?.[field];
    if (!value) return [];
    const list = Array.isArray(value) ? value : [value];
    return list.map((entry) =>
      typeof entry === "string" ? entry : entry?.email
    );
  };
  return [...collect("to"), ...collect("cc"), ...collect("bcc")].filter(Boolean);
}

function redirectMessage(message, sink) {
  const originals = describeRecipients(message);
  const rewritten = { ...message, to: sink };

  // cc/bcc are dropped rather than redirected, so one staging send produces
  // exactly one email at the sink instead of three.
  delete rewritten.cc;
  delete rewritten.bcc;

  // personalizations carry their own recipient lists and would override `to`.
  delete rewritten.personalizations;

  if (typeof rewritten.subject === "string") {
    rewritten.subject = `[STAGING] ${rewritten.subject}`;
  }

  rewritten.headers = {
    ...(message.headers || {}),
    "X-Original-To": originals.join(", ") || "(none)",
    "X-Tenacity-Environment": currentProjectId() || "unknown",
  };

  return { rewritten, originals };
}

function setApiKey(apiKey) {
  return sgMail.setApiKey(apiKey);
}

/**
 * Same signature as sgMail.send: accepts one message or an array of messages.
 */
async function send(payload, isMultiple, callback) {
  if (isProduction()) {
    return sgMail.send(payload, isMultiple, callback);
  }

  const messages = Array.isArray(payload) ? payload : [payload];
  const sink = sinkAddress();

  if (!sink) {
    for (const message of messages) {
      logger.warn(
        "sendGuard: dropped an outbound email because STAGING_EMAIL_SINK is unset.",
        {
          projectId: currentProjectId() || "unknown",
          subject: message?.subject ?? "(no subject)",
          intendedRecipients: describeRecipients(message),
        }
      );
    }
    // Shaped like a SendGrid success so callers that inspect the response do
    // not take an error path over a deliberately suppressed send.
    return [{ statusCode: 200, body: "", headers: {} }, {}];
  }

  const redirected = messages.map((message) => {
    const { rewritten, originals } = redirectMessage(message, sink);
    logger.info("sendGuard: redirected an outbound email to the staging sink.", {
      projectId: currentProjectId() || "unknown",
      sink,
      subject: message?.subject ?? "(no subject)",
      intendedRecipients: originals,
    });
    return rewritten;
  });

  return sgMail.send(
    Array.isArray(payload) ? redirected : redirected[0],
    isMultiple,
    callback
  );
}

module.exports = {
  PRODUCTION_PROJECT_ID,
  currentProjectId,
  describeRecipients,
  isProduction,
  redirectMessage,
  send,
  setApiKey,
};
