"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const fs = require("node:fs");
const path = require("node:path");
function getEnv(name) {
    const value = process.env[name];
    return value && value.trim().length > 0 ? value.trim() : undefined;
}
function detectProjectId() {
    var _a, _b, _c, _d;
    const fromEnv = (_c = (_b = (_a = getEnv('GOOGLE_CLOUD_PROJECT')) !== null && _a !== void 0 ? _a : getEnv('GCLOUD_PROJECT')) !== null && _b !== void 0 ? _b : getEnv('FIREBASE_PROJECT')) !== null && _c !== void 0 ? _c : getEnv('PROJECT_ID');
    if (fromEnv)
        return fromEnv;
    // When run from repo root: `node functions/lib/...`, cwd is repo root.
    // When run from `functions/`, cwd is functions dir, so step up one.
    const candidates = [
        path.resolve(process.cwd(), '.firebaserc'),
        path.resolve(process.cwd(), '..', '.firebaserc'),
    ];
    for (const candidate of candidates) {
        try {
            if (!fs.existsSync(candidate))
                continue;
            const raw = fs.readFileSync(candidate, 'utf8');
            const parsed = JSON.parse(raw);
            const projectId = (_d = parsed === null || parsed === void 0 ? void 0 : parsed.projects) === null || _d === void 0 ? void 0 : _d.default;
            if (typeof projectId === 'string' && projectId.trim().length > 0) {
                return projectId.trim();
            }
        }
        catch (_e) {
            // ignore and try next candidate
        }
    }
    return undefined;
}
function trimOptionalString(value) {
    if (typeof value !== 'string')
        return {};
    const trimmed = value.trim();
    return { original: value, trimmed };
}
async function processCollection(collectionName) {
    var _a, _b;
    const firestore = admin.firestore();
    const pageSize = Number((_a = getEnv('FIRESTORE_PAGE_SIZE')) !== null && _a !== void 0 ? _a : '500');
    const maxDocs = Number((_b = getEnv('MAX_DOCS')) !== null && _b !== void 0 ? _b : '0');
    const dryRun = getEnv('DRY_RUN') === '1' || getEnv('DRY_RUN') === 'true';
    let scanned = 0;
    let docsUpdated = 0;
    let fieldsUpdated = 0;
    let skipped = 0;
    let failed = 0;
    let batch = firestore.batch();
    let batchWrites = 0;
    const commitBatch = async () => {
        if (batchWrites === 0)
            return;
        if (dryRun) {
            batch = firestore.batch();
            batchWrites = 0;
            return;
        }
        await batch.commit();
        batch = firestore.batch();
        batchWrites = 0;
    };
    let query = firestore
        .collection(collectionName)
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(pageSize);
    let lastDoc;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        if (maxDocs > 0 && scanned >= maxDocs)
            break;
        const pageQuery = lastDoc ? query.startAfter(lastDoc) : query;
        const snap = await pageQuery.get();
        if (snap.empty)
            break;
        for (const doc of snap.docs) {
            if (maxDocs > 0 && scanned >= maxDocs)
                break;
            scanned++;
            try {
                const data = doc.data();
                const { original: firstOriginal, trimmed: firstTrimmed } = trimOptionalString(data.firstName);
                const { original: lastOriginal, trimmed: lastTrimmed } = trimOptionalString(data.lastName);
                const updates = {};
                if (firstOriginal !== undefined && firstTrimmed !== undefined && firstOriginal !== firstTrimmed) {
                    updates.firstName = firstTrimmed;
                }
                if (lastOriginal !== undefined && lastTrimmed !== undefined && lastOriginal !== lastTrimmed) {
                    updates.lastName = lastTrimmed;
                }
                const updateKeys = Object.keys(updates);
                if (updateKeys.length === 0) {
                    skipped++;
                    continue;
                }
                docsUpdated++;
                fieldsUpdated += updateKeys.length;
                if (dryRun) {
                    continue;
                }
                batch.update(doc.ref, updates);
                batchWrites++;
                // Firestore batch limit is 500 writes; keep a safety margin.
                if (batchWrites >= 450) {
                    await commitBatch();
                }
            }
            catch (e) {
                failed++;
                const message = e instanceof Error ? e.message : String(e);
                console.log(`FAIL ${collectionName}/${doc.id}: ${message}`);
            }
        }
        lastDoc = snap.docs[snap.docs.length - 1];
        if (snap.size < pageSize)
            break;
    }
    await commitBatch();
    return {
        collection: collectionName,
        scanned,
        docsUpdated,
        fieldsUpdated,
        skipped,
        failed,
    };
}
async function main() {
    var _a, _b;
    const dryRun = getEnv('DRY_RUN') === '1' || getEnv('DRY_RUN') === 'true';
    const projectId = detectProjectId();
    if (!admin.apps.length) {
        if (!projectId) {
            throw new Error('Unable to detect a Firebase project id. Set GOOGLE_CLOUD_PROJECT=<your-project-id> (or ensure .firebaserc is present).');
        }
        admin.initializeApp({ projectId });
    }
    console.log(JSON.stringify({
        dryRun,
        projectId: projectId !== null && projectId !== void 0 ? projectId : null,
        firestorePageSize: Number((_a = getEnv('FIRESTORE_PAGE_SIZE')) !== null && _a !== void 0 ? _a : '500'),
        maxDocs: Number((_b = getEnv('MAX_DOCS')) !== null && _b !== void 0 ? _b : '0') || null,
    }, null, 2));
    const results = await Promise.all([processCollection('users'), processCollection('students')]);
    const summary = results.reduce((acc, r) => {
        acc.scanned += r.scanned;
        acc.docsUpdated += r.docsUpdated;
        acc.fieldsUpdated += r.fieldsUpdated;
        acc.skipped += r.skipped;
        acc.failed += r.failed;
        return acc;
    }, { scanned: 0, docsUpdated: 0, fieldsUpdated: 0, skipped: 0, failed: 0 });
    console.log('RESULTS');
    console.log(JSON.stringify({ perCollection: results, summary }, null, 2));
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=trim_user_student_names.js.map