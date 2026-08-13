"use strict";

/*
 * Target guard for the staging seed script.
 *
 * This is the only thing standing between `node scripts/seedStaging.js` and
 * the production database, so it is deliberately paranoid and deliberately
 * boring:
 *
 *  - production is named explicitly in a deny list, so a future rename of the
 *    allow list can never silently re-admit it;
 *  - the allow list is a literal, not a lookup, so a corrupted or attacker-
 *    supplied config file cannot widen it;
 *  - there is NO fallback to `.firebaserc`. The other scripts in this
 *    directory resolve an omitted --projectId through
 *    `readFirebaseRcProjectId()`, which returns `projects.default` — and that
 *    is production. Inheriting that default is the single most plausible way
 *    this script destroys real data, so --projectId is required here.
 */

// `projects.default` in .firebaserc. Never seedable, under any flag.
const DENIED_PROJECT_IDS = Object.freeze(["tenacity-tutoring-b8eb2"]);

// Must stay in sync with the `staging` entry of
// backend/firebase/deployment-targets.json. Asserted by the unit test rather
// than read at runtime, so a malformed config file cannot widen the allow list.
const ALLOWED_PROJECT_IDS = Object.freeze(["tenacity-tutoring-staging"]);

// Firebase reserves the `demo-` prefix for projects that only ever exist
// inside the emulator suite; they have no cloud backing.
const EMULATOR_PROJECT_PATTERN = /^demo-[a-z0-9-]+$/;

function isEmulated(env = process.env) {
  return Boolean(env.FIRESTORE_EMULATOR_HOST);
}

/**
 * Throw unless `projectId` is a legitimate seed target.
 *
 * Returns the project id unchanged so call sites can write
 * `const projectId = assertSeedTarget(args.projectId);`.
 */
function assertSeedTarget(projectId, env = process.env) {
  const id = String(projectId || "").trim();

  if (!id) {
    throw new Error(
      "--projectId is required. This script refuses to infer a target from " +
        ".firebaserc, because the default project there is production."
    );
  }

  if (DENIED_PROJECT_IDS.includes(id)) {
    throw new Error(
      `Refusing to seed "${id}": that is the production project. ` +
        "The seed script may never write to production, with or without --commit."
    );
  }

  if (ALLOWED_PROJECT_IDS.includes(id)) return id;

  if (EMULATOR_PROJECT_PATTERN.test(id) && isEmulated(env)) return id;

  if (EMULATOR_PROJECT_PATTERN.test(id)) {
    throw new Error(
      `Refusing to seed "${id}": it looks like an emulator project, but ` +
        "FIRESTORE_EMULATOR_HOST is not set, so writes would go to the cloud."
    );
  }

  throw new Error(
    `Refusing to seed "${id}": not in the seed allow list ` +
      `(${ALLOWED_PROJECT_IDS.join(", ")}) and not an emulated demo- project.`
  );
}

/**
 * `--reset` deletes documents and Auth users, so it is restricted further than
 * seeding: only the real staging project and emulator projects, never anything
 * that merely passed `assertSeedTarget`.
 */
function assertResetTarget(projectId, env = process.env) {
  const id = assertSeedTarget(projectId, env);

  if (ALLOWED_PROJECT_IDS.includes(id)) return id;
  if (EMULATOR_PROJECT_PATTERN.test(id) && isEmulated(env)) return id;

  throw new Error(`Refusing to reset "${id}": reset is limited to staging and emulator projects.`);
}

module.exports = {
  ALLOWED_PROJECT_IDS,
  DENIED_PROJECT_IDS,
  assertResetTarget,
  assertSeedTarget,
  isEmulated,
};
