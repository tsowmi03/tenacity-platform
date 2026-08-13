"use strict";

const { createdMeta } = require("../shared/timestamps");
const { DEFAULT_VISIBILITY } = require("./userSchemas");

/**
 * Build an app-compatible `users/{uid}` document.
 *
 * The Flutter app's `AppUser.fromFirestore` reads several fields without null
 * fallbacks (see PLAN.md "Compatibility notes"), so the factory ALWAYS writes
 * every shared field, even when empty. Parent-only fields are only written
 * when role === "parent".
 *
 * Inputs are assumed to be normalised by `validateCreateUserInput`.
 */
function buildUserDoc(input, { actorUid, clock } = {}) {
  if (!input || typeof input !== "object") {
    throw new TypeError("buildUserDoc requires a normalised input object");
  }
  if (!actorUid) {
    throw new TypeError("buildUserDoc requires actorUid for audit metadata");
  }

  const base = {
    firstName: input.firstName,
    lastName: input.lastName,
    role: input.role,
    email: input.email,
    phone: input.phone,
    fcmTokens: [],
    unreadChats: {},
    activeChats: [],
    termsAccepted: false,
    acceptedTermsVersion: null,
    acceptedTermsAt: null,
    readAnnouncements: [],
    // Always written, never left absent. The contact-list query filters on
    // `visibility == 'standard'`, and Firestore equality filters do not match
    // documents missing the field — an account created without it would be
    // invisible to everyone rather than merely non-internal.
    visibility: input.visibility || DEFAULT_VISIBILITY,
    ...createdMeta(actorUid, clock),
  };

  if (input.role === "parent") {
    base.students = [];
    base.lessonTokens =
      typeof input.lessonTokens === "number" ? input.lessonTokens : 0;
  }

  return base;
}

module.exports = { buildUserDoc };
