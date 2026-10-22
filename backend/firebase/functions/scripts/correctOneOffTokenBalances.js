"use strict";

/*
 * One-off remediation (MOB-64): take back the lesson tokens that one-off
 * bookings never took. See `src/users/correctOneOffTokenBalances.js` for how
 * a token booking is told apart from a paid or admin one.
 *
 * Run it after the server-side fix is live, so no new uncharged bookings
 * appear behind it. It recomputes from production data each time.
 *
 * Usage:
 *   node scripts/correctOneOffTokenBalances.js --projectId=tenacity-tutoring-b8eb2
 *   node scripts/correctOneOffTokenBalances.js --projectId=tenacity-tutoring-b8eb2 --commit --yes
 *
 * Flags:
 *   --projectId=ID    REQUIRED. Never inferred.
 *   --commit          Write. Omit for a dry run (the default).
 *   --yes             Required with --commit.
 */

const admin = require("firebase-admin");

const {
  applyTokenCorrection,
  loadCorrectionInputs,
  planTokenCorrections,
} = require("../src/users/correctOneOffTokenBalances");

function parseArgs(argv) {
  const args = { projectId: "", commit: false, yes: false };
  for (const raw of argv.slice(2)) {
    if (raw === "--commit") args.commit = true;
    else if (raw === "--yes" || raw === "-y") args.yes = true;
    else if (raw.startsWith("--projectId=")) {
      args.projectId = String(raw.split("=")[1] || "").trim();
    } else {
      throw new Error(`Unrecognised argument: ${raw}`);
    }
  }
  if (!args.projectId) {
    throw new Error("--projectId is required and is never inferred.");
  }
  if (args.commit && !args.yes) {
    throw new Error("--commit needs --yes.");
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  admin.initializeApp({ projectId: args.projectId });
  const db = admin.firestore();

  const plan = planTokenCorrections(await loadCorrectionInputs(db));
  const pending = plan.filter((c) => !c.alreadyCorrected);

  console.log(`Project: ${args.projectId}  (${args.commit ? "COMMIT" : "dry run"})`);
  console.table(
    plan.map((c) => ({
      parent: c.name,
      tokenBookings: c.tokenBookings,
      tokensNow: c.current,
      correctedTo: c.target,
      writtenOff: c.writtenOff,
      alreadyCorrected: c.alreadyCorrected,
    }))
  );
  const sum = (key) => pending.reduce((total, c) => total + c[key], 0);
  console.log(
    `${pending.length} parents to correct, ` +
      `${sum("current") - sum("target")} tokens removed, ${sum("writtenOff")} written off.`
  );

  if (!args.commit) {
    console.log("Dry run: nothing written.");
    return;
  }
  for (const correction of pending) {
    const result = await applyTokenCorrection({ db, correction });
    console.log(
      result.skipped
        ? `${correction.name}: already corrected, skipped`
        : `${correction.name}: ${result.before} -> ${result.after}`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
