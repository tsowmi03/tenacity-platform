"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const stripe_1 = require("stripe");
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
    // Search the current directory and its ancestors for the root project alias.
    const candidates = [
        path.resolve(process.cwd(), '.firebaserc'),
        path.resolve(process.cwd(), '..', '.firebaserc'),
        path.resolve(process.cwd(), '..', '..', '.firebaserc'),
        path.resolve(process.cwd(), '..', '..', '..', '.firebaserc'),
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
function toOptionalString(value) {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
async function fetchInvoicesWithPaymentIntentIds() {
    var _a;
    const firestore = admin.firestore();
    const pageSize = Number((_a = getEnv('FIRESTORE_PAGE_SIZE')) !== null && _a !== void 0 ? _a : '500');
    // Use a paged query to avoid loading everything at once.
    let query = firestore
        .collection('invoices')
        .where('stripePaymentIntentId', '>', '')
        .orderBy('stripePaymentIntentId')
        .limit(pageSize);
    const all = [];
    let lastDoc;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const pageQuery = lastDoc ? query.startAfter(lastDoc) : query;
        const snap = await pageQuery.get();
        if (snap.empty)
            break;
        for (const doc of snap.docs) {
            all.push({ invoiceId: doc.id, data: doc.data() });
        }
        lastDoc = snap.docs[snap.docs.length - 1];
        if (snap.size < pageSize)
            break;
    }
    return all;
}
async function main() {
    var _a, _b, _c;
    const dryRun = getEnv('DRY_RUN') === '1' || getEnv('DRY_RUN') === 'true';
    const maxPaymentIntents = Number((_a = getEnv('MAX_PAYMENTINTENTS')) !== null && _a !== void 0 ? _a : '0');
    // Help Admin SDK resolve a project when running locally.
    const projectId = detectProjectId();
    if (!admin.apps.length) {
        if (!projectId) {
            throw new Error('Unable to detect a Firebase project id. Set GOOGLE_CLOUD_PROJECT=tenacity-tutoring-b8eb2 (or ensure .firebaserc is present).');
        }
        admin.initializeApp({ projectId });
    }
    const invoices = await fetchInvoicesWithPaymentIntentIds();
    const grouped = new Map();
    for (const inv of invoices) {
        const paymentIntentId = toOptionalString(inv.data.stripePaymentIntentId);
        if (!paymentIntentId)
            continue;
        const arr = (_b = grouped.get(paymentIntentId)) !== null && _b !== void 0 ? _b : [];
        arr.push(inv);
        grouped.set(paymentIntentId, arr);
    }
    const paymentIntentIds = Array.from(grouped.keys());
    console.log(`Found ${paymentIntentIds.length} PaymentIntent(s) linked to invoices`);
    // Only require Stripe key if we will actually update Stripe.
    const stripeKey = dryRun ? undefined : getEnv('STRIPE_KEY');
    if (!dryRun && !stripeKey) {
        throw new Error('Missing required env var: STRIPE_KEY');
    }
    const stripe = !dryRun && stripeKey ? new stripe_1.default(stripeKey, { apiVersion: '2025-02-24.acacia' }) : null;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    for (const paymentIntentId of paymentIntentIds) {
        if (maxPaymentIntents > 0 && updated + skipped + failed >= maxPaymentIntents) {
            console.log(`Stopping due to MAX_PAYMENTINTENTS=${maxPaymentIntents}`);
            break;
        }
        const groupInvoices = (_c = grouped.get(paymentIntentId)) !== null && _c !== void 0 ? _c : [];
        if (groupInvoices.length === 0) {
            skipped++;
            continue;
        }
        const first = groupInvoices[0].data;
        const parentId = toOptionalString(first.parentId);
        const parentEmail = toOptionalString(first.parentEmail);
        const parentName = toOptionalString(first.parentName);
        if (!parentId) {
            console.log(`SKIP ${paymentIntentId}: missing parentId on invoice ${groupInvoices[0].invoiceId}`);
            skipped++;
            continue;
        }
        const consistent = groupInvoices.every((inv) => {
            const d = inv.data;
            return (toOptionalString(d.parentId) === parentId &&
                toOptionalString(d.parentEmail) === parentEmail &&
                toOptionalString(d.parentName) === parentName);
        });
        if (!consistent) {
            console.log(`SKIP ${paymentIntentId}: inconsistent parent fields across invoices`);
            skipped++;
            continue;
        }
        const invoiceIds = groupInvoices.map((i) => i.invoiceId).sort();
        if (dryRun) {
            console.log(`DRY_RUN ${paymentIntentId}: would update metadata for ${invoiceIds.length} invoice(s)`);
            updated++;
            continue;
        }
        try {
            if (!stripe) {
                throw new Error('Stripe client not initialized');
            }
            await stripe.paymentIntents.update(paymentIntentId, {
                receipt_email: parentEmail,
                metadata: {
                    parentId,
                    parentEmail: parentEmail !== null && parentEmail !== void 0 ? parentEmail : '',
                    parentName: parentName !== null && parentName !== void 0 ? parentName : '',
                    invoiceIds: invoiceIds.join(','),
                    source: 'tenacity_tutoring',
                    backfilledAt: new Date().toISOString(),
                },
            });
            console.log(`OK ${paymentIntentId}: updated metadata for ${invoiceIds.length} invoice(s)`);
            updated++;
        }
        catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            console.log(`FAIL ${paymentIntentId}: ${message}`);
            failed++;
        }
    }
    console.log(JSON.stringify({ updated, skipped, failed }, null, 2));
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=backfill_stripe_metadata.js.map
