"use strict";

/**
 * Welcome email helper.
 *
 * The existing `lib/email_functions.js` already exports `sendParentWelcomeEmail`
 * with the deployed SendGrid template (`d-ffc33c8494504aa0a1a98615011aa59c`).
 * We reuse it instead of duplicating the template ID — same email goes out to
 * parents whether they were created by enrolment acceptance or directly by an
 * admin in the portal.
 *
 * `sendWelcomeEmailSafe` swallows errors and logs them so a SendGrid failure
 * never rolls back a successful user creation. The admin can resend manually
 * later via `sendCustomPasswordResetEmail`.
 */

const logger = require("firebase-functions/logger");
const { sendParentWelcomeEmail } = require("../../lib/email_functions");

async function sendWelcomeEmailSafe(email, firstName) {
  if (!email) return { sent: false, reason: "missing-email" };
  try {
    await sendParentWelcomeEmail(email, firstName || "");
    return { sent: true };
  } catch (err) {
    logger.warn("[welcomeEmail] send failed (continuing)", {
      email,
      errorMessage: err?.message,
    });
    return { sent: false, reason: "send-failed", error: err };
  }
}

module.exports = { sendWelcomeEmailSafe };
