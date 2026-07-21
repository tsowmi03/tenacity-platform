"use strict";

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const { purgeOldInvoicesImpl } = require("../purgeOldInvoices");

function parseArgs(argv) {
  const args = {
    logSample: 0,
    batchSize: 500,
    projectId: "",
    commit: false,
    yes: false,
  };

  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--logSample=")) {
      const n = Number(raw.split("=")[1]);
      args.logSample = Number.isFinite(n) ? n : 0;
    } else if (raw.startsWith("--batchSize=")) {
      const n = Number(raw.split("=")[1]);
      args.batchSize = Number.isFinite(n) ? n : 500;
    } else if (raw.startsWith("--projectId=")) {
      args.projectId = String(raw.split("=")[1] || "").trim();
    } else if (raw === "--commit") {
      args.commit = true;
    } else if (raw === "--yes" || raw === "-y") {
      args.yes = true;
    }
  }

  return args;
}

function readFirebaseRcProjectId() {
  try {
    const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
    const firebaseRcPath = path.join(repoRoot, ".firebaserc");
    if (!fs.existsSync(firebaseRcPath)) return "";

    const raw = fs.readFileSync(firebaseRcPath, "utf8");
    const parsed = JSON.parse(raw);
    const projectId = parsed?.projects?.default;
    return typeof projectId === "string" ? projectId.trim() : "";
  } catch {
    return "";
  }
}

function resolveProjectId(cliProjectId) {
  const candidates = [
    String(cliProjectId || "").trim(),
    String(process.env.GCLOUD_PROJECT || "").trim(),
    String(process.env.GOOGLE_CLOUD_PROJECT || "").trim(),
    String(process.env.FIREBASE_PROJECT_ID || "").trim(),
    readFirebaseRcProjectId(),
  ].filter(Boolean);

  return candidates[0] || "";
}

async function main() {
  const {
    logSample,
    batchSize,
    projectId: cliProjectId,
    commit,
    yes,
  } = parseArgs(process.argv);

  const projectId = resolveProjectId(cliProjectId);
  if (!projectId) {
    throw new Error(
      "Missing project id. Provide --projectId=<id> or set GCLOUD_PROJECT/GOOGLE_CLOUD_PROJECT, or ensure .firebaserc has projects.default"
    );
  }

  // Help Google libraries discover project id.
  process.env.GCLOUD_PROJECT = projectId;
  process.env.GOOGLE_CLOUD_PROJECT = projectId;

  // Uses GOOGLE_APPLICATION_CREDENTIALS / ADC if available.
  // For local testing against emulators, set FIRESTORE_EMULATOR_HOST.
  const usingEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
  admin.initializeApp(
    usingEmulator
      ? { projectId }
      : { projectId, credential: admin.credential.applicationDefault() }
  );

  const db = admin.firestore();

  const logger = {
    info: (msg, meta) => console.log(msg, meta || ""),
    warn: (msg, meta) => console.warn(msg, meta || ""),
    error: (msg, meta) => console.error(msg, meta || ""),
  };

  if (commit && !yes) {
    throw new Error(
      "Refusing to delete without confirmation. Re-run with --commit --yes (or omit --commit for dry-run)."
    );
  }

  await purgeOldInvoicesImpl({
    db,
    admin,
    logger,
    dryRun: !commit,
    batchSize,
    logSample,
  });
}

main().catch((err) => {
  console.error("dryRunPurgeOldInvoices failed", err);
  process.exitCode = 1;
});
