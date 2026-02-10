import * as admin from 'firebase-admin';
import Stripe from 'stripe';
import * as fs from 'node:fs';
import * as path from 'node:path';

type InvoiceDoc = {
  parentId?: unknown;
  parentEmail?: unknown;
  parentName?: unknown;
  stripePaymentIntentId?: unknown;
};

function getEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function detectProjectId(): string | undefined {
  const fromEnv =
    getEnv('GOOGLE_CLOUD_PROJECT') ??
    getEnv('GCLOUD_PROJECT') ??
    getEnv('FIREBASE_PROJECT') ??
    getEnv('PROJECT_ID');

  if (fromEnv) return fromEnv;

  // When run from repo root: `node functions/lib/...`, cwd is repo root.
  // When run from `functions/`, cwd is functions dir, so step up one.
  const candidates = [
    path.resolve(process.cwd(), '.firebaserc'),
    path.resolve(process.cwd(), '..', '.firebaserc'),
  ];

  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const raw = fs.readFileSync(candidate, 'utf8');
      const parsed = JSON.parse(raw) as {
        projects?: { default?: string };
      };
      const projectId = parsed?.projects?.default;
      if (typeof projectId === 'string' && projectId.trim().length > 0) {
        return projectId.trim();
      }
    } catch {
      // ignore and try next candidate
    }
  }

  return undefined;
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

async function fetchInvoicesWithPaymentIntentIds(): Promise<Array<{ invoiceId: string; data: InvoiceDoc }>> {
  const firestore = admin.firestore();
  const pageSize = Number(getEnv('FIRESTORE_PAGE_SIZE') ?? '500');

  // Use a paged query to avoid loading everything at once.
  let query = firestore
    .collection('invoices')
    .where('stripePaymentIntentId', '>', '')
    .orderBy('stripePaymentIntentId')
    .limit(pageSize);

  const all: Array<{ invoiceId: string; data: InvoiceDoc }> = [];
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const pageQuery = lastDoc ? query.startAfter(lastDoc) : query;
    const snap = await pageQuery.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      all.push({ invoiceId: doc.id, data: doc.data() as InvoiceDoc });
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < pageSize) break;
  }

  return all;
}

async function main(): Promise<void> {
  const dryRun = getEnv('DRY_RUN') === '1' || getEnv('DRY_RUN') === 'true';
  const maxPaymentIntents = Number(getEnv('MAX_PAYMENTINTENTS') ?? '0');

  // Help Admin SDK resolve a project when running locally.
  const projectId = detectProjectId();

  if (!admin.apps.length) {
    if (!projectId) {
      throw new Error(
        'Unable to detect a Firebase project id. Set GOOGLE_CLOUD_PROJECT=tenacity-tutoring-b8eb2 (or ensure .firebaserc is present).'
      );
    }
    admin.initializeApp({ projectId });
  }

  const invoices = await fetchInvoicesWithPaymentIntentIds();

  const grouped = new Map<string, Array<{ invoiceId: string; data: InvoiceDoc }>>();
  for (const inv of invoices) {
    const paymentIntentId = toOptionalString(inv.data.stripePaymentIntentId);
    if (!paymentIntentId) continue;
    const arr = grouped.get(paymentIntentId) ?? [];
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
  const stripe = !dryRun && stripeKey ? new Stripe(stripeKey, { apiVersion: '2025-02-24.acacia' }) : null;

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const paymentIntentId of paymentIntentIds) {
    if (maxPaymentIntents > 0 && updated + skipped + failed >= maxPaymentIntents) {
      console.log(`Stopping due to MAX_PAYMENTINTENTS=${maxPaymentIntents}`);
      break;
    }

    const groupInvoices = grouped.get(paymentIntentId) ?? [];
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
      return (
        toOptionalString(d.parentId) === parentId &&
        toOptionalString(d.parentEmail) === parentEmail &&
        toOptionalString(d.parentName) === parentName
      );
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
          parentEmail: parentEmail ?? '',
          parentName: parentName ?? '',
          invoiceIds: invoiceIds.join(','),
          source: 'tenacity_tutoring',
          backfilledAt: new Date().toISOString(),
        },
      });

      console.log(`OK ${paymentIntentId}: updated metadata for ${invoiceIds.length} invoice(s)`);
      updated++;
    } catch (e) {
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
