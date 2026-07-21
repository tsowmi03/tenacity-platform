"use strict";

const { defineSecret } = require("firebase-functions/params");

/**
 * Single source of truth for the SendGrid secret binding. `defineSecret` is
 * idempotent on the secret name, but importing from one place makes it easier
 * to find every function that depends on SendGrid.
 *
 * Pass `sendgridApiKey` in the `secrets: [...]` array of every function that
 * sends email.
 */
const sendgridApiKey = defineSecret("SENDGRID_API_KEY");

module.exports = { sendgridApiKey };
