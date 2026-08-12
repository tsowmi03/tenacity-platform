"use strict";

/*
 * Seeds a coherent set of synthetic data into the staging Firebase project so
 * the mobile app can be driven through real user flows without touching
 * production.
 *
 * Usage:
 *   node scripts/seedStaging.js --projectId=tenacity-tutoring-staging
 *   node scripts/seedStaging.js --projectId=tenacity-tutoring-staging --commit --yes
 *   node scripts/seedStaging.js --projectId=tenacity-tutoring-staging --reset --commit --yes
 *
 *   # against the local emulator suite
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 \
 *     node scripts/seedStaging.js --projectId=demo-tenacity-seed --commit --yes
 *
 * Flags:
 *   --projectId=ID       REQUIRED. Never inferred — see scripts/seed/guard.js.
 *   --commit             Write. Omit for a dry run (the default).
 *   --yes                Required with --commit.
 *   --reset              Delete previously seeded data first.
 *   --resetOnly          Delete and stop, without reseeding.
 *   --seedTag=TAG        Scope tag stamped on every doc. Default "seed-v1".
 *   --password=PW        Password for every seeded account.
 *   --weeks=N            Weeks in the active term. Default 10.
 *   --emailTemplate=T    "{key}" placeholder. Default "{key}@staging.tenacity.invalid".
 *
 * The default email domain is the reserved .invalid TLD, so a stray SendGrid
 * send from a staging function cannot reach a real person. Override it only if
 * you specifically want deliverable addresses, e.g.
 *   --emailTemplate='you+{key}@gmail.com'
 */

const admin = require("firebase-admin");

const { assertResetTarget, assertSeedTarget, isEmulated } = require("./seed/guard");
const { buildScenario } = require("./seed/scenario");
const { provisionIdentities } = require("./seed/identities");
const { writeScenario } = require("./seed/writers");
const { resetSeededData } = require("./seed/reset");

const DEFAULT_SEED_TAG = "seed-v1";
const DEFAULT_PASSWORD = "StagingPass123!";
const DEFAULT_EMAIL_TEMPLATE = "{key}@staging.tenacity.invalid";

function parseArgs(argv) {
  const args = {
    projectId: "",
    commit: false,
    yes: false,
    reset: false,
    resetOnly: false,
    seedTag: DEFAULT_SEED_TAG,
    password: DEFAULT_PASSWORD,
    weeks: 10,
    emailTemplate: DEFAULT_EMAIL_TEMPLATE,
  };

  for (const raw of argv.slice(2)) {
    if (raw === "--commit") args.commit = true;
    else if (raw === "--yes" || raw === "-y") args.yes = true;
    else if (raw === "--reset") args.reset = true;
    else if (raw === "--resetOnly") {
      args.reset = true;
      args.resetOnly = true;
    } else if (raw.startsWith("--projectId=")) {
      args.projectId = String(raw.split("=")[1] || "").trim();
    } else if (raw.startsWith("--seedTag=")) {
      args.seedTag = String(raw.split("=")[1] || "").trim();
    } else if (raw.startsWith("--password=")) {
      args.password = String(raw.split("=")[1] || "");
    } else if (raw.startsWith("--emailTemplate=")) {
      args.emailTemplate = String(raw.split("=")[1] || "").trim();
    } else if (raw.startsWith("--weeks=")) {
      const n = Number(raw.split("=")[1]);
      if (!Number.isInteger(n)) throw new Error(`Invalid --weeks value: ${raw}`);
      args.weeks = n;
    } else {
      throw new Error(`Unrecognised argument: ${raw}`);
    }
  }

  if (!args.seedTag) throw new Error("--seedTag may not be empty");
  if (args.commit && !args.yes) {
    throw new Error("--commit requires --yes. Refusing to write unconfirmed.");
  }
  if (args.password.length < 8) {
    throw new Error("--password must be at least 8 characters (Firebase minimum is 6).");
  }

  return args;
}

/** Turn the email template into a matcher reset can use to identify its own users. */
function emailPatternFor(template) {
  const escaped = template
    .split("{key}")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[a-z0-9-]+");
  return new RegExp(`^${escaped}$`, "i");
}

function banner(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

async function main() {
  const args = parseArgs(process.argv);

  // The guard runs before anything is initialised, so a bad target cannot even
  // open a connection.
  const projectId = args.reset
    ? assertResetTarget(args.projectId)
    : assertSeedTarget(args.projectId);

  const emulated = isEmulated();

  banner({
    script: "seedStaging",
    projectId,
    commit: args.commit,
    reset: args.reset,
    resetOnly: args.resetOnly,
    usingEmulator: emulated,
    seedTag: args.seedTag,
    weeks: args.weeks,
    emailTemplate: args.emailTemplate,
    mode: args.commit ? "COMMIT" : "DRY RUN (no writes)",
  });

  process.env.GCLOUD_PROJECT ||= projectId;
  process.env.GOOGLE_CLOUD_PROJECT ||= projectId;

  if (admin.apps.length === 0) {
    admin.initializeApp(
      emulated
        ? { projectId }
        : { projectId, credential: admin.credential.applicationDefault() }
    );
  }

  const db = admin.firestore();
  const auth = admin.auth();
  const log = (line) => console.log(line);

  if (args.reset) {
    console.log("\n== reset ==");
    const result = await resetSeededData({
      db,
      auth,
      seedTag: args.seedTag,
      emailPattern: emailPatternFor(args.emailTemplate),
      commit: args.commit,
      logger: log,
    });
    banner({ phase: "reset", ...result });

    if (args.resetOnly) {
      console.log(
        args.commit ? "\nReset complete." : "\nDry run complete — nothing was deleted."
      );
      return;
    }
  }

  const scenario = buildScenario({
    now: new Date(),
    seedTag: args.seedTag,
    weeks: args.weeks,
    emailTemplate: args.emailTemplate,
  });

  console.log("\n== identities ==");
  const identities = await provisionIdentities({
    auth,
    users: scenario.users,
    password: args.password,
    commit: args.commit,
    logger: log,
  });

  console.log("\n== firestore ==");
  const written = await writeScenario({
    db,
    scenario,
    uidBySymbolicId: identities.uidBySymbolicId,
    seedTag: args.seedTag,
    commit: args.commit,
    logger: log,
  });

  banner({
    phase: "seed",
    activeTermId: scenario.activeTermId,
    currentWeek: scenario.currentWeek,
    authCreated: identities.created,
    authReused: identities.reused,
    invoiceNumbers: written.invoiceNumbers,
    writesByCollection: written.writesByCollection,
    totalWrites: written.total,
  });

  console.log("\n== accounts ==");
  console.log(`  password for every account: ${args.password}`);
  for (const credential of identities.credentials) {
    console.log(`  ${credential.role.padEnd(6)} ${credential.email}`);
  }

  console.log(
    args.commit
      ? "\nSeed complete."
      : "\nDry run complete — nothing was written. Re-run with --commit --yes."
  );
}

main().catch((err) => {
  console.error(`\nseedStaging failed: ${err.message}`);
  process.exitCode = 1;
});
