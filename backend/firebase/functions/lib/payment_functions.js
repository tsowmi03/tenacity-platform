"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripeWebhook = exports.verifyPaymentStatus = exports.createStripeCustomerEphemeralKey = exports.createPaymentIntent = void 0;
// payment_functions.ts
const https_1 = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const stripe_1 = require("stripe");
const params_1 = require("firebase-functions/params");
const admin = require("firebase-admin");
const crypto_1 = require("crypto");
const { auditLogIdForRequest } = require("../src/shared/auditLog");
const {
    requireParentOrAdmin,
    loadValidatedInvoicesForPayment,
    paymentIntentParentId,
} = require("../src/payments/paymentSecurity");
const {
    MATCH_STATUS,
    PAYMENT_SOURCE,
    appInvoiceIds,
    buildPaymentLogEntry,
    classifyPayment,
    invoiceAmountDueCents,
    invoiceNumberCandidates,
    matchStatusFor,
    paidAtFromCharge,
    paymentLogId,
    shouldRunVerifyFallback,
    xeroInvoiceNumber,
} = require("../src/payments/paymentLedger");
const {
    bookingAmountCents,
    encodeBookingMetadata,
} = require("../src/payments/oneOffBookingMetadata");
const {
    readOneOffPriceCents,
    readSeatHoldsEnabled,
} = require("../src/payments/oneOffPricing");
const { HOLD_COLLECTION, HOLD_TTL_MS } = require("../src/attendance/oneOffSeatHolds");
const { fulfilOneOffBookingImpl } = require("../src/payments/fulfilOneOffBooking");
const stripeSecretKey = (0, params_1.defineSecret)("STRIPE_KEY");
const stripeWebhookSecret = (0, params_1.defineSecret)("STRIPE_WEBHOOK_SECRET");
// Make sure Firebase Admin is initialized:
if (!admin.apps.length) {
    admin.initializeApp();
}
function escapeStripeSearchValue(value) {
    // Stripe Search uses a Lucene-like query; keep this conservative.
    return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
function stringOrNull(value) {
    return typeof value === "string" && value.trim() !== "" ? value : null;
}
function auditDoc(requestId, entry) {
    return {
        ...entry,
        requestId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
}
/**
 * Read the booking a client asked to pay for.
 *
 * Only the identifiers are taken. The price is never read from the request —
 * `createPaymentIntent` looks it up server-side.
 */
function normaliseBookingRequest(booking) {
    if (!booking || typeof booking !== 'object' || Array.isArray(booking)) {
        throw new https_1.HttpsError('invalid-argument', 'booking must be an object');
    }
    const studentIds = Array.isArray(booking.studentIds) ? booking.studentIds : [];
    return {
        classId: typeof booking.classId === 'string' ? booking.classId : '',
        attendanceDocId: typeof booking.attendanceDocId === 'string' ? booking.attendanceDocId : '',
        studentIds: studentIds.filter((id) => typeof id === 'string'),
    };
}
function auditRef(requestId) {
    return admin.firestore().collection("adminAuditLogs").doc(auditLogIdForRequest(requestId));
}
async function getOrCreateStripeCustomerId(params) {
    var _a, _b;
    const { stripe, parentId, parentEmail, parentName } = params;
    const userRef = admin.firestore().collection('users').doc(parentId);
    const userSnap = await userRef.get();
    const userData = (_a = (userSnap.exists ? userSnap.data() : undefined)) !== null && _a !== void 0 ? _a : undefined;
    const existing = typeof (userData === null || userData === void 0 ? void 0 : userData.stripeCustomerId) === 'string' ? userData.stripeCustomerId : null;
    if (existing)
        return existing;
    // Best-effort de-duplication: search for an existing customer by metadata.
    // This avoids creating multiple Stripe customers if the Firestore field is missing.
    try {
        const escapedUid = escapeStripeSearchValue(parentId);
        const search = await stripe.customers.search({
            query: `metadata['firebaseUid']:'${escapedUid}'`,
            limit: 1,
        });
        const found = (_b = search.data) === null || _b === void 0 ? void 0 : _b[0];
        if (found === null || found === void 0 ? void 0 : found.id) {
            await userRef.set({
                stripeCustomerId: found.id,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            return found.id;
        }
    }
    catch (err) {
        // Non-fatal: fall back to creating a new customer.
        logger.warn('Stripe customer search failed; will create a new customer', {
            parentId,
            error: err instanceof Error ? err.message : String(err),
        });
    }
    const customer = await stripe.customers.create({
        email: parentEmail,
        name: parentName,
        metadata: {
            firebaseUid: parentId,
            source: 'tenacity_tutoring',
        },
    });
    await userRef.set({
        stripeCustomerId: customer.id,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return customer.id;
}
// The 256MiB default leaves roughly 56MiB of working room: requiring
// `lib/index.js` alone takes RSS to ~200MiB, because every function loads the
// whole entrypoint. The money path is the one place where running out of it
// loses a booking, so it gets headroom until the entrypoint is slimmed down.
const PAYMENT_FUNCTION_MEMORY = "512MiB";
exports.createPaymentIntent = (0, https_1.onCall)({ secrets: [stripeSecretKey], memory: PAYMENT_FUNCTION_MEMORY }, async (request) => {
    const stripe = new stripe_1.default(stripeSecretKey.value(), { apiVersion: "2025-02-24.acacia" });
    const { amount, currency, parentId, invoiceIds, booking } = request.data;
    const hasInvoiceIds = Array.isArray(invoiceIds) && invoiceIds.length > 0;
    const hasBooking = booking !== undefined && booking !== null;
    let parentIdString = typeof parentId === 'string' ? parentId.trim() : '';
    if (!parentIdString && !hasInvoiceIds && request.auth?.uid) {
        parentIdString = request.auth.uid;
    }
    if (!parentIdString) {
        throw new https_1.HttpsError('invalid-argument', 'Missing parentId');
    }
    // A booking-backed payment is priced by the server; `amount` is ignored.
    // Everything else still supplies it.
    if (!hasBooking && (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0)) {
        throw new https_1.HttpsError('invalid-argument', 'Invalid amount');
    }
    if (typeof currency !== 'string' || currency.trim() === '') {
        throw new https_1.HttpsError('invalid-argument', 'Invalid currency');
    }
    if (hasBooking && hasInvoiceIds) {
        throw new https_1.HttpsError('invalid-argument', 'A payment cannot be both a booking and an invoice payment');
    }
    const db = admin.firestore();
    const actor = await requireParentOrAdmin(request, parentIdString, db);
    let invoiceIdsNormalized = [];
    let firstInvoice = {};
    if (hasInvoiceIds) {
        const validation = await loadValidatedInvoicesForPayment({
            db,
            invoiceIds,
            parentId: parentIdString,
            amount,
        });
        invoiceIdsNormalized = validation.invoiceIds;
        firstInvoice = validation.firstInvoice;
    }
    else if (invoiceIds !== undefined && (!Array.isArray(invoiceIds) || invoiceIds.length !== 0)) {
        throw new https_1.HttpsError('invalid-argument', 'Invalid invoiceIds');
    }
    else {
        const parentSnap = await db.collection('users').doc(parentIdString).get();
        const parent = parentSnap.exists ? parentSnap.data() : {};
        const firstName = typeof (parent === null || parent === void 0 ? void 0 : parent.firstName) === 'string' ? parent.firstName.trim() : '';
        const lastName = typeof (parent === null || parent === void 0 ? void 0 : parent.lastName) === 'string' ? parent.lastName.trim() : '';
        firstInvoice = {
            parentEmail: typeof (parent === null || parent === void 0 ? void 0 : parent.email) === 'string' ? parent.email : undefined,
            parentName: `${firstName} ${lastName}`.trim() || undefined,
        };
    }
    const paymentType = hasInvoiceIds ? 'invoice' : 'one_off_booking';
    // A booking-backed payment carries what it is for, so the server can
    // complete the enrolment itself if the app never comes back. It is also
    // priced here: the one-off path used to charge whatever `amount` the client
    // sent, so a modified client could book a $70 class for 50c.
    let bookingMetadata = {};
    let chargeAmount = amount;
    if (hasBooking) {
        const requested = normaliseBookingRequest(booking);
        const unitPriceCents = await readOneOffPriceCents(db);
        try {
            bookingMetadata = encodeBookingMetadata({ ...requested, unitPriceCents });
            chargeAmount = bookingAmountCents({
                unitPriceCents,
                studentCount: requested.studentIds.length,
            });
        }
        catch (error) {
            throw new https_1.HttpsError('invalid-argument', error.message);
        }
    }
    // Keep stable idempotency for invoice-backed payments. Legacy one-off
    // bookings do not include booking context, so parent+amount would reuse the
    // same PaymentIntent for multiple separate classes.
    const rawKey = hasInvoiceIds
        ? `${parentIdString}|${currency.toLowerCase()}|${amount}|${paymentType}|${invoiceIdsNormalized.join(',')}`
        : null;
    const idempotencyOptions = rawKey
        ? { idempotencyKey: `tenacity_pi_${(0, crypto_1.createHash)('sha256').update(rawKey).digest('hex')}` }
        : undefined;
    const parentEmail = typeof (firstInvoice === null || firstInvoice === void 0 ? void 0 : firstInvoice.parentEmail) === 'string' ? firstInvoice.parentEmail : undefined;
    const parentName = typeof (firstInvoice === null || firstInvoice === void 0 ? void 0 : firstInvoice.parentName) === 'string' ? firstInvoice.parentName : undefined;
    try {
        const customerId = await getOrCreateStripeCustomerId({
            stripe,
            parentId: parentIdString,
            parentEmail,
            parentName,
        });
        const paymentIntent = await stripe.paymentIntents.create({
            amount: chargeAmount,
            currency,
            customer: customerId,
            receipt_email: parentEmail,
            metadata: {
                parentId: parentIdString,
                parentEmail: parentEmail !== null && parentEmail !== void 0 ? parentEmail : '',
                parentName: parentName !== null && parentName !== void 0 ? parentName : '',
                invoiceIds: invoiceIdsNormalized.join(','),
                paymentType,
                source: 'tenacity_tutoring',
                ...bookingMetadata,
            },
        }, idempotencyOptions);
        const batch = admin.firestore().batch();
        if (hasBooking && await readSeatHoldsEnabled(db)) {
            // Reserve the seats while the parent is at the card sheet, so
            // another family cannot take them mid-payment. Soft: it expires on
            // its own if the payment is abandoned.
            const requested = normaliseBookingRequest(booking);
            batch.set(db.collection(HOLD_COLLECTION).doc(paymentIntent.id), {
                paymentIntentId: paymentIntent.id,
                classId: requested.classId,
                attendanceDocId: requested.attendanceDocId,
                studentCount: requested.studentIds.length,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + HOLD_TTL_MS),
            });
        }
        if (hasInvoiceIds) {
            // Store the payment intent ID with the invoices for tracking.
            for (const invoiceId of invoiceIdsNormalized) {
                const invoiceRef = admin.firestore().collection('invoices').doc(String(invoiceId));
                batch.update(invoiceRef, {
                    stripePaymentIntentId: paymentIntent.id,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
            }
        }
        const actorUid = actor.uid;
        const payStartRequestId = `invoice.pay_start:${paymentIntent.id}`;
        batch.set(auditRef(payStartRequestId), auditDoc(payStartRequestId, {
                actorUid,
                actorEmail: stringOrNull(request.auth?.token?.email) ?? parentEmail ?? null,
                actorRole: actor.role,
                action: "invoice.pay_start",
                targetType: "payment",
                targetId: paymentIntent.id,
                targetName: `Payment ${paymentIntent.id.slice(-6)}`,
                payloadSummary: {
                    invoiceIds: invoiceIdsNormalized,
                    amountCents: chargeAmount,
                    currency: currency.toLowerCase(),
                    parentId: parentIdString,
                    paymentType,
                    // Recorded so a payment can be traced to a booking even if
                    // fulfilment never runs.
                    bookingClassId: bookingMetadata.bookingClassId ?? null,
                    bookingAttendanceId: bookingMetadata.bookingAttendanceId ?? null,
                    bookingStudentIds: bookingMetadata.bookingStudentIds ?? null,
                },
            }));
        await batch.commit();
        logger.info('Payment intent created and linked to invoices', {
            paymentIntentId: paymentIntent.id,
            parentId: parentIdString,
            invoiceIds: invoiceIdsNormalized,
            amount: amount,
            paymentType,
            idempotencyKey: idempotencyOptions === null || idempotencyOptions === void 0 ? void 0 : idempotencyOptions.idempotencyKey,
        });
        return {
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
            customerId,
        };
    }
    catch (error) {
        if (error instanceof https_1.HttpsError) {
            throw error;
        }
        let errorMessage = 'An unknown error occurred';
        if (error instanceof Error) {
            errorMessage = error.message;
        }
        logger.error('Error creating payment intent:', error);
        throw new https_1.HttpsError('internal', errorMessage);
    }
});
// Optional: enables PaymentSheet customer mode (saved payment methods).
// Your Flutter client can call this and pass the result into SetupPaymentSheetParameters.
exports.createStripeCustomerEphemeralKey = (0, https_1.onCall)({ secrets: [stripeSecretKey] }, async (request) => {
    var _a, _b, _c;
    const stripe = new stripe_1.default(stripeSecretKey.value(), { apiVersion: "2025-02-24.acacia" });
    const parentId = (_a = request.data) === null || _a === void 0 ? void 0 : _a.parentId;
    const parentEmail = typeof ((_b = request.data) === null || _b === void 0 ? void 0 : _b.parentEmail) === 'string' ? request.data.parentEmail : undefined;
    const parentName = typeof ((_c = request.data) === null || _c === void 0 ? void 0 : _c.parentName) === 'string' ? request.data.parentName : undefined;
    const parentIdString = typeof parentId === 'string' ? parentId.trim() : '';
    if (!parentIdString) {
        throw new https_1.HttpsError('invalid-argument', 'Missing parentId');
    }
    await requireParentOrAdmin(request, parentIdString, admin.firestore());
    const customerId = await getOrCreateStripeCustomerId({
        stripe,
        parentId: parentIdString,
        parentEmail,
        parentName,
    });
    // Stripe requires the API version for ephemeral keys to match the mobile SDK.
    const ephemeralKey = await stripe.ephemeralKeys.create({ customer: customerId }, { apiVersion: "2025-02-24.acacia" });
    return {
        customerId,
        ephemeralKeySecret: ephemeralKey.secret,
    };
});
exports.verifyPaymentStatus = (0, https_1.onCall)({ secrets: [stripeSecretKey], memory: PAYMENT_FUNCTION_MEMORY }, async (request) => {
    const stripe = new stripe_1.default(stripeSecretKey.value(), { apiVersion: "2025-02-24.acacia" });
    const { clientSecret } = request.data;
    if (!clientSecret) {
        throw new https_1.HttpsError('invalid-argument', 'Missing clientSecret');
    }
    // Extract the PaymentIntent ID from the clientSecret.
    // The clientSecret is in the format "pi_xxx_secret_yyy", so splitting it gives the ID.
    logger.info('verifyPaymentStatus called');
    const parts = clientSecret.split('_secret_');
    if (parts.length < 2) {
        logger.error(`DEBUG: Invalid clientSecret format: ${clientSecret}`);
        throw new https_1.HttpsError('invalid-argument', 'Invalid clientSecret format.');
    }
    const paymentIntentId = parts[0];
    logger.info(`DEBUG: Extracted paymentIntentId: ${paymentIntentId}`);
    try {
        // Retrieve the PaymentIntent from Stripe, expanded, so that the
        // settlement handler below does not have to fetch it a second time.
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
            expand: ['latest_charge'],
        });
        const parentId = paymentIntentParentId(paymentIntent);
        if (!parentId) {
            throw new https_1.HttpsError('permission-denied', 'Payment intent is missing parent metadata');
        }
        await requireParentOrAdmin(request, parentId, admin.firestore());
        logger.info(`DEBUG: Stripe PaymentIntent status: ${paymentIntent.status}`);
        let fulfilment = null;
        if (paymentIntent.status === 'succeeded') {
            // Fast path for a booking: complete it now rather than making the
            // parent wait on webhook delivery. Idempotent and claim-protected,
            // so racing the webhook is safe, and a payment with no booking
            // context returns immediately without touching Firestore.
            fulfilment = await fulfilOneOffBookingImpl({
                db: admin.firestore(),
                stripe,
                paymentIntent,
                logger,
            });

            // Settle any invoice the payment refers to — but only when the
            // webhook has not already finished the job. This is a fallback,
            // not the normal path.
            const ledgerEntry = await readPaymentLogEntry(paymentIntent.id);
            if (shouldRunVerifyFallback({ metadata: paymentIntent.metadata, ledgerEntry })) {
                await handlePaymentSuccess(stripe, paymentIntent);
            }
            else {
                logger.info('Skipping settlement fallback; nothing left to settle', {
                    paymentIntentId: paymentIntent.id,
                    ledgerStatus: ledgerEntry?.status ?? null,
                    ledgerMatchStatus: ledgerEntry?.matchStatus ?? null,
                });
            }
        }
        // Return the current status (e.g. 'succeeded', 'requires_payment_method', etc.).
        return {
            status: paymentIntent.status,
            paymentIntentId: paymentIntent.id,
            fulfilment: fulfilment && fulfilment.state !== 'not_applicable'
                ? {
                    state: fulfilment.state,
                    reason: fulfilment.reason ?? null,
                    enrolledStudentIds: fulfilment.enrolledStudentIds ?? [],
                    unfilledStudentIds: fulfilment.unfilledStudentIds ?? [],
                    invoiceId: fulfilment.invoiceId ?? null,
                }
                : null,
        };
    }
    catch (error) {
        if (error instanceof https_1.HttpsError) {
            throw error;
        }
        let errorMessage = 'An unknown error occurred';
        if (error instanceof Error) {
            errorMessage = error.message;
        }
        logger.error('Error verifying payment status:', error);
        throw new https_1.HttpsError('internal', errorMessage);
    }
});
// Add Stripe webhook handler for more reliable payment confirmation
exports.stripeWebhook = (0, https_1.onRequest)({ secrets: [stripeWebhookSecret, stripeSecretKey], memory: PAYMENT_FUNCTION_MEMORY }, async (req, res) => {
    const stripe = new stripe_1.default(stripeSecretKey.value(), { apiVersion: "2025-02-24.acacia" });
    const sig = req.headers['stripe-signature'];
    if (!sig) {
        logger.error('Missing stripe-signature header');
        res.status(400).send('Missing stripe-signature header');
        return;
    }
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.rawBody || req.body, sig, stripeWebhookSecret.value());
    }
    catch (err) {
        logger.error('Webhook signature verification failed:', err);
        res.status(400).send(`Webhook signature verification failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        return;
    }
    logger.info('Stripe webhook received:', { type: event.type, id: event.id });
    try {
        switch (event.type) {
            case 'payment_intent.succeeded':
                const paymentIntent = event.data.object;
                await handlePaymentSuccess(stripe, paymentIntent);
                break;
            case 'payment_intent.payment_failed':
                const failedPayment = event.data.object;
                await handlePaymentFailed(failedPayment);
                break;
            default:
                logger.info('Unhandled webhook event type:', event.type);
        }
        res.json({ received: true });
    }
    catch (error) {
        logger.error('Error processing webhook:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});
/**
 * Find the Firestore invoice a Xero-originated payment refers to.
 *
 * Xero sends the human invoice number ("INV-406") rather than a document id,
 * so this is the only link back. Returns every match; the caller decides
 * whether one of them may be marked paid.
 */
async function findInvoicesByNumber(invoiceNumber) {
    const candidates = invoiceNumberCandidates(invoiceNumber);
    if (candidates.length === 0) return [];
    const snapshot = await admin.firestore()
        .collection('invoices')
        .where('invoiceNumber', 'in', candidates)
        .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
}

/**
 * The ledger entry already recorded for a payment, if any.
 *
 * Best-effort: this only decides whether to repeat work the webhook may have
 * done, so a read failure should fall through to doing it rather than skipping
 * settlement on the strength of a failed lookup.
 */
async function readPaymentLogEntry(paymentIntentId) {
    try {
        const snapshot = await admin.firestore()
            .collection('paymentLogs')
            .doc(paymentLogId(paymentIntentId))
            .get();
        return snapshot.exists ? snapshot.data() : null;
    }
    catch (error) {
        logger.warn('Could not read payment log; running settlement anyway', {
            paymentIntentId,
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}

/**
 * Write (or overwrite) the ledger entry for a payment.
 *
 * Keyed on the PaymentIntent id so the webhook, `verifyPaymentStatus` and any
 * replayed Stripe event all land on the same document instead of stacking up
 * duplicates. Best-effort: a ledger failure must not lose an invoice update
 * that already succeeded.
 */
async function recordPaymentLog(entry) {
    try {
        await admin.firestore()
            .collection('paymentLogs')
            .doc(paymentLogId(entry.paymentIntentId))
            .set({
                ...entry,
                paidAt: entry.paidAt ? admin.firestore.Timestamp.fromDate(entry.paidAt) : null,
                processedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
    }
    catch (error) {
        logger.error('Failed to write payment log', {
            paymentIntentId: entry.paymentIntentId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

// Helper function to handle successful payments
async function handlePaymentSuccess(stripe, paymentIntent) {
    logger.info('Processing successful payment:', { paymentIntentId: paymentIntent.id });
    // The webhook hands us the event's own PaymentIntent, whose `latest_charge`
    // is an id rather than the charge. `verifyPaymentStatus` has already
    // expanded it, so only fetch when the charge is not already here.
    const chargeAlreadyExpanded = paymentIntent.latest_charge
        && typeof paymentIntent.latest_charge !== 'string';
    const fullPaymentIntent = chargeAlreadyExpanded
        ? paymentIntent
        : await stripe.paymentIntents.retrieve(paymentIntent.id, {
            expand: ['latest_charge'],
        });
    const metadata = fullPaymentIntent.metadata || {};
    const amountPaidCents = fullPaymentIntent.amount_received || fullPaymentIntent.amount;
    const amountPaid = amountPaidCents / 100;
    const latestCharge = typeof fullPaymentIntent.latest_charge === 'string' || !fullPaymentIntent.latest_charge
        ? null
        : fullPaymentIntent.latest_charge;
    // The time the money actually moved. Taken from the charge so a replayed
    // event stamps the date the parent paid, not the date it was reprocessed.
    const paidAt = paidAtFromCharge(latestCharge);
    const stripeChargeId = latestCharge?.id ?? null;
    const stripeReceiptEmail = fullPaymentIntent.receipt_email ?? null;
    const stripePayerName = latestCharge?.billing_details?.name ?? metadata.parentName ?? null;
    const stripePayerEmail = latestCharge?.billing_details?.email
        ?? fullPaymentIntent.receipt_email
        ?? metadata.parentEmail
        ?? null;
    const source = classifyPayment(metadata);
    const invoiceNumber = xeroInvoiceNumber(metadata);
    // Resolve which invoices, if any, this payment settles.
    let invoiceIds = [];
    let matchStatus;
    if (source === PAYMENT_SOURCE.APP) {
        // The app told us exactly what it was paying for.
        invoiceIds = appInvoiceIds(metadata);
        matchStatus = MATCH_STATUS.MATCHED;
    }
    else if (source === PAYMENT_SOURCE.XERO) {
        // A parent paid from a Xero-emailed invoice. Match on the number, and
        // only settle it when there is exactly one and the amount agrees.
        const matches = await findInvoicesByNumber(invoiceNumber);
        matchStatus = matchStatusFor({
            matches,
            amountPaidCents,
            invoiceAmountDueCents: matches.length === 1 ? invoiceAmountDueCents(matches[0].data) : null,
            paymentIntentId: fullPaymentIntent.id,
        });
        if (matchStatus === MATCH_STATUS.MATCHED) {
            invoiceIds = [matches[0].id];
        }
        else {
            logger.warn('Xero payment could not be settled automatically', {
                paymentIntentId: fullPaymentIntent.id,
                invoiceNumber,
                matchStatus,
                matchedInvoiceIds: matches.map((match) => match.id),
                amountPaid,
            });
        }
    }
    else if (source === PAYMENT_SOURCE.ONE_OFF) {
        matchStatus = MATCH_STATUS.NO_INVOICE_EXPECTED;
        // Complete the booking here, from the PaymentIntent, so it no longer
        // depends on the parent's phone surviving the next few seconds.
        // Payments from app builds that predate the booking context return
        // `not_applicable` and fall back to the old client-driven path.
        const fulfilment = await fulfilOneOffBookingImpl({
            db: admin.firestore(),
            stripe,
            paymentIntent: fullPaymentIntent,
            logger,
        });
        if (fulfilment.invoiceId) {
            // An invoice now exists, so the ledger should say so — this is the
            // link the reconciliation sweep looks for. Marking it paid below is
            // idempotent (fulfilment already created it paid) and adds the
            // `invoice.pay_complete` audit entry the invoice path also writes.
            invoiceIds = [fulfilment.invoiceId];
            matchStatus = MATCH_STATUS.MATCHED;
        }
        logger.info('One-off booking payment succeeded', {
            paymentIntentId: fullPaymentIntent.id,
            parentId: metadata.parentId,
            fulfilmentState: fulfilment.state,
        });
    }
    else {
        matchStatus = MATCH_STATUS.UNMATCHED;
        logger.warn('Payment succeeded with no recognisable invoice reference', {
            paymentIntentId: fullPaymentIntent.id,
            metadata,
        });
    }
    const logEntry = buildPaymentLogEntry({
        paymentIntentId: fullPaymentIntent.id,
        chargeId: stripeChargeId,
        source,
        status: 'succeeded',
        matchStatus,
        invoiceIds,
        invoiceNumber,
        amount: amountPaid,
        currency: fullPaymentIntent.currency,
        payerName: stripePayerName,
        payerEmail: stripePayerEmail,
        receiptEmail: stripeReceiptEmail,
        paidAt,
        metadata,
    });
    // Nothing to settle: record the payment and stop. Returning normally keeps
    // Stripe from retrying an event we understand but cannot act on.
    if (invoiceIds.length === 0) {
        await recordPaymentLog(logEntry);
        return;
    }
    try {
        const batch = admin.firestore().batch();
        for (const invoiceId of invoiceIds) {
            const invoiceRef = admin.firestore().collection('invoices').doc(invoiceId);
            batch.update(invoiceRef, {
                status: 'paid',
                paidAt: admin.firestore.Timestamp.fromDate(paidAt),
                stripePaymentIntentId: fullPaymentIntent.id,
                stripePayerName,
                stripePayerEmail,
                stripeReceiptEmail,
                stripeChargeId,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }
        for (const invoiceId of invoiceIds) {
            const actorUid = stringOrNull(metadata.parentId) ?? "stripe";
            const requestId = `invoice.pay_complete:${fullPaymentIntent.id}:${invoiceId}`;
            batch.set(auditRef(requestId), auditDoc(requestId, {
                actorUid,
                actorEmail: stripePayerEmail,
                actorRole: actorUid === "stripe" ? "system" : "parent",
                action: "invoice.pay_complete",
                targetType: "invoice",
                targetId: invoiceId,
                targetName: `Invoice ${invoiceId.slice(0, 6)}`,
                payloadSummary: {
                    paymentIntentId: fullPaymentIntent.id,
                    amountPaid,
                    stripePayerEmail,
                    stripePayerName,
                    source,
                },
                before: { status: "unpaid" },
                after: { status: "paid" },
            }));
        }
        await batch.commit();
        logger.info('Successfully marked invoices as paid', {
            paymentIntentId: fullPaymentIntent.id,
            invoiceIds,
            amountPaid,
            source,
            stripePayerEmail,
            stripePayerName,
        });
    }
    catch (error) {
        logger.error('Error updating invoices after successful payment:', error);
        // Keep the match as resolved — the invoice was identified, the write is
        // what failed. Stripe will retry and this entry will be overwritten.
        await recordPaymentLog({
            ...logEntry,
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
    await recordPaymentLog(logEntry);
}
/**
 * Record a failed payment.
 *
 * Nothing is settled, but the attempt is kept so a parent reporting "I paid"
 * can be checked against something other than the Cloud Functions log.
 */
async function handlePaymentFailed(paymentIntent) {
    const metadata = paymentIntent.metadata || {};
    logger.warn('Payment failed:', {
        paymentIntentId: paymentIntent.id,
        error: paymentIntent.last_payment_error?.message,
    });
    await recordPaymentLog(buildPaymentLogEntry({
        paymentIntentId: paymentIntent.id,
        source: classifyPayment(metadata),
        status: 'failed',
        matchStatus: MATCH_STATUS.UNMATCHED,
        invoiceIds: appInvoiceIds(metadata),
        invoiceNumber: xeroInvoiceNumber(metadata),
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
        payerEmail: paymentIntent.receipt_email ?? null,
        error: paymentIntent.last_payment_error?.message || 'Unknown error',
        metadata,
    }));
}
//# sourceMappingURL=payment_functions.js.map
