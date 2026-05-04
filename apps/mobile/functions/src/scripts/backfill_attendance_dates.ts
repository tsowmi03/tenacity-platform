import * as admin from "firebase-admin";
import { FieldPath, Timestamp } from "firebase-admin/firestore";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  attendanceTermIdForDoc,
  attendanceWeekNumberForDoc,
  buildAttendanceDateBackfillPlan,
} from "../attendance_doc_dates";
import { SYDNEY_TZ } from "../class_schedule_dates";
import { DateTime } from "luxon";

type CliOptions = {
  apply: boolean;
  classId?: string;
  fromDate: Date;
  limit: number;
  pageSize: number;
};

type TermCacheEntry = {
  startDate: Date;
};

type Summary = {
  classesScanned: number;
  attendanceDocsScanned: number;
  plannedUpdates: number;
  appliedUpdates: number;
  skipped: Record<string, number>;
  failed: number;
};

function getEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function detectProjectId(): string | undefined {
  const fromEnv =
    getEnv("GOOGLE_CLOUD_PROJECT") ??
    getEnv("GCLOUD_PROJECT") ??
    getEnv("FIREBASE_PROJECT") ??
    getEnv("PROJECT_ID");

  if (fromEnv) return fromEnv;

  const candidates = [
    path.resolve(process.cwd(), ".firebaserc"),
    path.resolve(process.cwd(), "..", ".firebaserc"),
  ];

  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const raw = fs.readFileSync(candidate, "utf8");
      const parsed = JSON.parse(raw) as {
        projects?: { default?: string };
      };
      const projectId = parsed?.projects?.default;
      if (typeof projectId === "string" && projectId.trim().length > 0) {
        return projectId.trim();
      }
    } catch {
      // Try the next candidate.
    }
  }

  return undefined;
}

function usage(): string {
  return [
    "Usage:",
    "  npm run backfill:attendance-dates -- [--apply] [--from-date=YYYY-MM-DD] [--class-id=CLASS_ID] [--limit=N]",
    "",
    "Defaults to dry-run. Future scope includes attendance docs whose current or corrected date is on/after --from-date in Australia/Sydney.",
    "",
    "Examples:",
    "  npm run backfill:attendance-dates",
    "  npm run backfill:attendance-dates -- --apply",
    "  npm run backfill:attendance-dates -- --from-date=2026-05-05 --class-id=abc123",
  ].join("\n");
}

function parseDateArg(value: string): Date {
  const parsed = DateTime.fromISO(value, { zone: SYDNEY_TZ }).startOf("day");
  if (!parsed.isValid) {
    throw new Error(`Invalid --from-date value: ${value}. Expected YYYY-MM-DD.`);
  }
  return parsed.toJSDate();
}

function parseArgs(argv: string[]): CliOptions {
  const todaySydney = DateTime.now().setZone(SYDNEY_TZ).startOf("day");
  const options: CliOptions = {
    apply: false,
    fromDate: parseDateArg(todaySydney.toISODate() ?? ""),
    limit: 0,
    pageSize: Number(getEnv("FIRESTORE_PAGE_SIZE") ?? "300"),
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--dry-run") {
      options.apply = false;
    } else if (arg.startsWith("--from-date=")) {
      options.fromDate = parseDateArg(arg.slice("--from-date=".length));
    } else if (arg.startsWith("--class-id=")) {
      const classId = arg.slice("--class-id=".length).trim();
      if (!classId) throw new Error("--class-id cannot be empty");
      options.classId = classId;
    } else if (arg.startsWith("--limit=")) {
      const limit = Number(arg.slice("--limit=".length));
      if (!Number.isInteger(limit) || limit < 0) {
        throw new Error("--limit must be a non-negative integer");
      }
      options.limit = limit;
    } else if (arg.startsWith("--page-size=")) {
      const pageSize = Number(arg.slice("--page-size=".length));
      if (!Number.isInteger(pageSize) || pageSize <= 0 || pageSize > 500) {
        throw new Error("--page-size must be an integer between 1 and 500");
      }
      options.pageSize = pageSize;
    } else {
      throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
    }
  }

  return options;
}

function timestampToDate(value: unknown): Date | null {
  if (value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

function formatSydney(date: Date): string {
  return DateTime
    .fromJSDate(date, { zone: SYDNEY_TZ })
    .toFormat("yyyy-LL-dd HH:mm ZZZZ");
}

function incrementSkipped(summary: Summary, reason: string): void {
  summary.skipped[reason] = (summary.skipped[reason] ?? 0) + 1;
}

async function initializeAdmin(): Promise<void> {
  if (admin.apps.length) return;

  const projectId = detectProjectId();
  if (!projectId) {
    throw new Error(
      "Unable to detect a Firebase project id. Set GOOGLE_CLOUD_PROJECT or ensure .firebaserc is present."
    );
  }

  admin.initializeApp({ projectId });
}

async function getTerm(
  termId: string,
  termCache: Map<string, TermCacheEntry>
): Promise<TermCacheEntry | null> {
  const cached = termCache.get(termId);
  if (cached) return cached;

  const termSnap = await admin.firestore().collection("terms").doc(termId).get();
  if (!termSnap.exists) return null;

  const termData = termSnap.data() ?? {};
  const startDate = timestampToDate(termData.startDate);
  if (!startDate) return null;

  const term = { startDate };
  termCache.set(termId, term);
  return term;
}

async function commitBatch(
  batchState: {
    batch: FirebaseFirestore.WriteBatch;
    count: number;
  },
  summary: Summary
): Promise<void> {
  if (batchState.count === 0) return;
  await batchState.batch.commit();
  summary.appliedUpdates += batchState.count;
  batchState.batch = admin.firestore().batch();
  batchState.count = 0;
}

async function processClass(
  classSnap: FirebaseFirestore.DocumentSnapshot,
  options: CliOptions,
  termCache: Map<string, TermCacheEntry>,
  batchState: {
    batch: FirebaseFirestore.WriteBatch;
    count: number;
  },
  summary: Summary
): Promise<void> {
  const classData = classSnap.data() ?? {};
  const classRef = classSnap.ref;
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const baseQuery = classRef
      .collection("attendance")
      .orderBy(FieldPath.documentId())
      .limit(options.pageSize);
    const pageQuery = lastDoc ? baseQuery.startAfter(lastDoc) : baseQuery;
    const attendanceSnap = await pageQuery.get();
    if (attendanceSnap.empty) break;

    for (const attendanceDoc of attendanceSnap.docs) {
      summary.attendanceDocsScanned++;

      const data = attendanceDoc.data() as Record<string, unknown>;
      const termId = attendanceTermIdForDoc(attendanceDoc.id, data);
      if (!termId) {
        incrementSkipped(summary, "missing-term");
        continue;
      }

      const term = await getTerm(termId, termCache);
      if (!term) {
        incrementSkipped(summary, "missing-term-doc");
        continue;
      }

      const weekNumber = attendanceWeekNumberForDoc(attendanceDoc.id, data);
      const plan = buildAttendanceDateBackfillPlan({
        existingDate: timestampToDate(data.date),
        termStart: term.startDate,
        classDay: classData.day,
        startTime: classData.startTime,
        weekNumber,
        fromDate: options.fromDate,
      });

      if (plan.action === "skip") {
        incrementSkipped(summary, plan.reason);
        continue;
      }

      summary.plannedUpdates++;
      const label = `${classSnap.id}/attendance/${attendanceDoc.id}`;
      console.log(
        `${options.apply ? "UPDATE" : "DRY_RUN"} ${label}: ${formatSydney(plan.existingDate)} -> ${formatSydney(plan.correctedDate)}`
      );

      if (options.apply) {
        batchState.batch.update(attendanceDoc.ref, {
          date: Timestamp.fromDate(plan.correctedDate),
          updatedAt: Timestamp.now(),
          updatedBy: "backfill_attendance_dates",
        });
        batchState.count++;

        if (batchState.count >= 450) {
          await commitBatch(batchState, summary);
        }
      }

      if (options.limit > 0 && summary.plannedUpdates >= options.limit) {
        return;
      }
    }

    lastDoc = attendanceSnap.docs[attendanceSnap.docs.length - 1];
    if (attendanceSnap.size < options.pageSize) break;
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  await initializeAdmin();

  const summary: Summary = {
    classesScanned: 0,
    attendanceDocsScanned: 0,
    plannedUpdates: 0,
    appliedUpdates: 0,
    skipped: {},
    failed: 0,
  };
  const termCache = new Map<string, TermCacheEntry>();
  const firestore = admin.firestore();
  const batchState = {
    batch: firestore.batch(),
    count: 0,
  };

  console.log(
    `${options.apply ? "Applying" : "Dry-running"} attendance date backfill from ${formatSydney(options.fromDate)}`
  );

  if (options.classId) {
    const classSnap = await firestore.collection("classes").doc(options.classId).get();
    if (!classSnap.exists) {
      throw new Error(`Class not found: ${options.classId}`);
    }
    summary.classesScanned++;
    await processClass(classSnap, options, termCache, batchState, summary);
  } else {
    const classesSnap = await firestore.collection("classes").get();
    for (const classSnap of classesSnap.docs) {
      summary.classesScanned++;
      await processClass(classSnap, options, termCache, batchState, summary);
      if (options.limit > 0 && summary.plannedUpdates >= options.limit) {
        break;
      }
    }
  }

  if (options.apply) {
    try {
      await commitBatch(batchState, summary);
    } catch (error) {
      summary.failed += batchState.count;
      throw error;
    }
  }

  console.log(JSON.stringify(summary, null, 2));
  if (!options.apply) {
    console.log("No writes were made. Re-run with --apply to update Firestore.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
