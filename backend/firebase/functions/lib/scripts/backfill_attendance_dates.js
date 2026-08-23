"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const firestore_1 = require("firebase-admin/firestore");
const fs = require("node:fs");
const path = require("node:path");
const attendance_doc_dates_1 = require("../attendance_doc_dates");
const class_schedule_dates_1 = require("../class_schedule_dates");
const google_auth_errors_1 = require("../google_auth_errors");
const luxon_1 = require("luxon");
function getEnv(name) {
    const value = process.env[name];
    return value && value.trim().length > 0 ? value.trim() : undefined;
}
function detectProjectId() {
    var _a, _b, _c, _d;
    const fromEnv = (_c = (_b = (_a = getEnv("GOOGLE_CLOUD_PROJECT")) !== null && _a !== void 0 ? _a : getEnv("GCLOUD_PROJECT")) !== null && _b !== void 0 ? _b : getEnv("FIREBASE_PROJECT")) !== null && _c !== void 0 ? _c : getEnv("PROJECT_ID");
    if (fromEnv)
        return fromEnv;
    const candidates = [
        path.resolve(process.cwd(), ".firebaserc"),
        path.resolve(process.cwd(), "..", ".firebaserc"),
        path.resolve(process.cwd(), "..", "..", ".firebaserc"),
        path.resolve(process.cwd(), "..", "..", "..", ".firebaserc"),
    ];
    for (const candidate of candidates) {
        try {
            if (!fs.existsSync(candidate))
                continue;
            const raw = fs.readFileSync(candidate, "utf8");
            const parsed = JSON.parse(raw);
            const projectId = (_d = parsed === null || parsed === void 0 ? void 0 : parsed.projects) === null || _d === void 0 ? void 0 : _d.default;
            if (typeof projectId === "string" && projectId.trim().length > 0) {
                return projectId.trim();
            }
        }
        catch (_e) {
            // Try the next candidate.
        }
    }
    return undefined;
}
function usage() {
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
function parseDateArg(value) {
    const parsed = luxon_1.DateTime.fromISO(value, { zone: class_schedule_dates_1.SYDNEY_TZ }).startOf("day");
    if (!parsed.isValid) {
        throw new Error(`Invalid --from-date value: ${value}. Expected YYYY-MM-DD.`);
    }
    return parsed.toJSDate();
}
function parseArgs(argv) {
    var _a, _b;
    const todaySydney = luxon_1.DateTime.now().setZone(class_schedule_dates_1.SYDNEY_TZ).startOf("day");
    const options = {
        apply: false,
        fromDate: parseDateArg((_a = todaySydney.toISODate()) !== null && _a !== void 0 ? _a : ""),
        limit: 0,
        pageSize: Number((_b = getEnv("FIRESTORE_PAGE_SIZE")) !== null && _b !== void 0 ? _b : "300"),
    };
    for (const arg of argv) {
        if (arg === "--help" || arg === "-h") {
            console.log(usage());
            process.exit(0);
        }
        else if (arg === "--apply") {
            options.apply = true;
        }
        else if (arg === "--dry-run") {
            options.apply = false;
        }
        else if (arg.startsWith("--from-date=")) {
            options.fromDate = parseDateArg(arg.slice("--from-date=".length));
        }
        else if (arg.startsWith("--class-id=")) {
            const classId = arg.slice("--class-id=".length).trim();
            if (!classId)
                throw new Error("--class-id cannot be empty");
            options.classId = classId;
        }
        else if (arg.startsWith("--limit=")) {
            const limit = Number(arg.slice("--limit=".length));
            if (!Number.isInteger(limit) || limit < 0) {
                throw new Error("--limit must be a non-negative integer");
            }
            options.limit = limit;
        }
        else if (arg.startsWith("--page-size=")) {
            const pageSize = Number(arg.slice("--page-size=".length));
            if (!Number.isInteger(pageSize) || pageSize <= 0 || pageSize > 500) {
                throw new Error("--page-size must be an integer between 1 and 500");
            }
            options.pageSize = pageSize;
        }
        else {
            throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
        }
    }
    return options;
}
function timestampToDate(value) {
    if (value && typeof value.toDate === "function") {
        return value.toDate();
    }
    return null;
}
function formatSydney(date) {
    return luxon_1.DateTime
        .fromJSDate(date, { zone: class_schedule_dates_1.SYDNEY_TZ })
        .toFormat("yyyy-LL-dd HH:mm ZZZZ");
}
function incrementSkipped(summary, reason) {
    var _a;
    summary.skipped[reason] = ((_a = summary.skipped[reason]) !== null && _a !== void 0 ? _a : 0) + 1;
}
async function initializeAdmin() {
    if (admin.apps.length)
        return;
    const projectId = detectProjectId();
    if (!projectId) {
        throw new Error("Unable to detect a Firebase project id. Set GOOGLE_CLOUD_PROJECT or ensure .firebaserc is present.");
    }
    admin.initializeApp({ projectId });
}
async function getTerm(termId, termCache) {
    var _a;
    const cached = termCache.get(termId);
    if (cached)
        return cached;
    const termSnap = await admin.firestore().collection("terms").doc(termId).get();
    if (!termSnap.exists)
        return null;
    const termData = (_a = termSnap.data()) !== null && _a !== void 0 ? _a : {};
    const startDate = timestampToDate(termData.startDate);
    if (!startDate)
        return null;
    const term = { startDate };
    termCache.set(termId, term);
    return term;
}
async function commitBatch(batchState, summary) {
    if (batchState.count === 0)
        return;
    await batchState.batch.commit();
    summary.appliedUpdates += batchState.count;
    batchState.batch = admin.firestore().batch();
    batchState.count = 0;
}
async function processClass(classSnap, options, termCache, batchState, summary) {
    var _a;
    const classData = (_a = classSnap.data()) !== null && _a !== void 0 ? _a : {};
    const classRef = classSnap.ref;
    let lastDoc;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const baseQuery = classRef
            .collection("attendance")
            .orderBy(firestore_1.FieldPath.documentId())
            .limit(options.pageSize);
        const pageQuery = lastDoc ? baseQuery.startAfter(lastDoc) : baseQuery;
        const attendanceSnap = await pageQuery.get();
        if (attendanceSnap.empty)
            break;
        for (const attendanceDoc of attendanceSnap.docs) {
            summary.attendanceDocsScanned++;
            const data = attendanceDoc.data();
            const termId = (0, attendance_doc_dates_1.attendanceTermIdForDoc)(attendanceDoc.id, data);
            if (!termId) {
                incrementSkipped(summary, "missing-term");
                continue;
            }
            const term = await getTerm(termId, termCache);
            if (!term) {
                incrementSkipped(summary, "missing-term-doc");
                continue;
            }
            const weekNumber = (0, attendance_doc_dates_1.attendanceWeekNumberForDoc)(attendanceDoc.id, data);
            const plan = (0, attendance_doc_dates_1.buildAttendanceDateBackfillPlan)({
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
            console.log(`${options.apply ? "UPDATE" : "DRY_RUN"} ${label}: ${formatSydney(plan.existingDate)} -> ${formatSydney(plan.correctedDate)}`);
            if (options.apply) {
                batchState.batch.update(attendanceDoc.ref, {
                    date: firestore_1.Timestamp.fromDate(plan.correctedDate),
                    updatedAt: firestore_1.Timestamp.now(),
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
        if (attendanceSnap.size < options.pageSize)
            break;
    }
}
async function main() {
    const options = parseArgs(process.argv.slice(2));
    await initializeAdmin();
    const summary = {
        classesScanned: 0,
        attendanceDocsScanned: 0,
        plannedUpdates: 0,
        appliedUpdates: 0,
        skipped: {},
        failed: 0,
    };
    const termCache = new Map();
    const firestore = admin.firestore();
    const batchState = {
        batch: firestore.batch(),
        count: 0,
    };
    console.log(`${options.apply ? "Applying" : "Dry-running"} attendance date backfill from ${formatSydney(options.fromDate)}`);
    if (options.classId) {
        const classSnap = await firestore.collection("classes").doc(options.classId).get();
        if (!classSnap.exists) {
            throw new Error(`Class not found: ${options.classId}`);
        }
        summary.classesScanned++;
        await processClass(classSnap, options, termCache, batchState, summary);
    }
    else {
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
        }
        catch (error) {
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
    if ((0, google_auth_errors_1.isApplicationDefaultCredentialsReauthError)(err)) {
        console.error((0, google_auth_errors_1.applicationDefaultCredentialsMessage)(detectProjectId()));
        process.exit(1);
    }
    console.error(err);
    process.exit(1);
});
