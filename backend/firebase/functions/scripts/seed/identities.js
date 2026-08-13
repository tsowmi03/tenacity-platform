"use strict";

/*
 * Auth provisioning for the seed scenario.
 *
 * Two deliberate differences from src/auth/authUsers.js#ensureAuthUser:
 *
 *  1. The password is RESET on every run to the known seed password, so a
 *     seeded account is always loggable-in even if someone changed it while
 *     testing.
 *  2. setCustomUserClaims THROWS on failure rather than logging and
 *     continuing. The production callables are right to be lenient — a failed
 *     claim write should not fail user creation for a real customer — but here
 *     a missing claim produces a confusing half-broken account:
 *     firestore.rules accepts EITHER the custom claim or the users/{uid}.role
 *     doc, while storage.rules accepts ONLY the claim. A tutor missing the
 *     claim can read Firestore fine and then fails every file upload with a
 *     bare permission error.
 */

/**
 * Create or update one seed Auth user and set its role claim.
 *
 * @returns {Promise<{uid: string, created: boolean}>}
 */
async function ensureSeedAuthUser({ auth, email, password, displayName, role }) {
  let user = null;
  let created = false;

  try {
    user = await auth.getUserByEmail(email);
  } catch (err) {
    if (err.code !== "auth/user-not-found") throw err;
    user = await auth.createUser({
      email,
      password,
      displayName,
      emailVerified: true,
    });
    created = true;
  }

  if (!created) {
    await auth.updateUser(user.uid, {
      password,
      displayName,
      emailVerified: true,
    });
  }

  // Not best-effort. See the module comment.
  await auth.setCustomUserClaims(user.uid, { role });

  return { uid: user.uid, created };
}

/**
 * Provision every user in the scenario and return the symbolic -> uid map that
 * writers.js needs.
 *
 * In dry-run mode no Auth call is made; placeholder uids are returned so the
 * rest of the plan can still be built and printed.
 *
 * @returns {Promise<{uidBySymbolicId: Map<string,string>, created: number,
 *                    reused: number, credentials: Array}>}
 */
async function provisionIdentities({ auth, users, password, commit, logger }) {
  const uidBySymbolicId = new Map();
  const credentials = [];
  let created = 0;
  let reused = 0;

  for (const user of users) {
    if (!commit) {
      uidBySymbolicId.set(user.symbolicId, `dry-run-uid:${user.symbolicId}`);
      credentials.push({
        email: user.email,
        role: user.role,
        uid: "(dry run)",
      });
      continue;
    }

    const { uid, created: wasCreated } = await ensureSeedAuthUser({
      auth,
      email: user.email,
      password,
      displayName: user.displayName,
      role: user.role,
    });

    uidBySymbolicId.set(user.symbolicId, uid);
    credentials.push({ email: user.email, role: user.role, uid });
    if (wasCreated) created += 1;
    else reused += 1;

    logger?.(
      `  ${wasCreated ? "created" : "updated"} ${user.role.padEnd(6)} ${user.email} -> ${uid}`
    );
  }

  return { uidBySymbolicId, created, reused, credentials };
}

module.exports = { ensureSeedAuthUser, provisionIdentities };
