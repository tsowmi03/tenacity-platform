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
exports.createPaymentIntent = (0, https_1.onCall)({ secrets: [stripeSecretKey] }, async (request) => {
    const stripe = new stripe_1.default(stripeSecretKey.value(), { apiVersion: "2025-02-24.acacia" });
    const { amount, currency, parentId, invoiceIds } = request.data;
    const hasInvoiceIds = Array.isArray(invoiceIds) && invoiceIds.length > 0;
    let parentIdString = typeof parentId === 'string' ? parentId.trim() : '';
    if (!parentIdString && !hasInvoiceIds && request.auth?.uid) {
        parentIdString = request.auth.uid;
    }
    if (!parentIdString) {
        throw new https_1.HttpsError('invalid-argument', 'Missing parentId');
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        throw new https_1.HttpsError('invalid-argument', 'Invalid amount');
    }
    if (typeof currency !== 'string' || currency.trim() === '') {
        throw new https_1.HttpsError('invalid-argument', 'Invalid currency');
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
            amount,
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
            },
        }, idempotencyOptions);
        const batch = admin.firestore().batch();
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
                    amountCents: amount,
                    currency: currency.toLowerCase(),
                    parentId: parentIdString,
                    paymentType,
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
exports.verifyPaymentStatus = (0, https_1.onCall)({ secrets: [stripeSecretKey] }, async (request) => {
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
        // Retrieve the PaymentIntent from Stripe.
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        const parentId = paymentIntentParentId(paymentIntent);
        if (!parentId) {
            throw new https_1.HttpsError('permission-denied', 'Payment intent is missing parent metadata');
        }
        await requireParentOrAdmin(request, parentId, admin.firestore());
        logger.info(`DEBUG: Stripe PaymentIntent status: ${paymentIntent.status}`);
        // If payment succeeded, handle the success logic
        if (paymentIntent.status === 'succeeded') {
            await handlePaymentSuccess(stripe, paymentIntent);
        }
        // Return the current status (e.g. 'succeeded', 'requires_payment_method', etc.).
        return {
            status: paymentIntent.status,
            paymentIntentId: paymentIntent.id,
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
exports.stripeWebhook = (0, https_1.onRequest)({ secrets: [stripeWebhookSecret, stripeSecretKey] }, async (req, res) => {
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
                logger.warn('Payment failed:', { paymentIntentId: failedPayment.id });
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
// Helper function to handle successful payments
async function handlePaymentSuccess(stripe, paymentIntent) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    logger.info('Processing successful payment:', { paymentIntentId: paymentIntent.id });
    const fullPaymentIntent = await stripe.paymentIntents.retrieve(paymentIntent.id, {
        expand: ['latest_charge'],
    });
    const metadata = fullPaymentIntent.metadata;
    const invoiceIdsStr = metadata.invoiceIds;
    if (!invoiceIdsStr) {
        if (metadata.paymentType === 'one_off_booking') {
            logger.info('One-off booking payment succeeded; invoice will be generated by the client flow', {
                paymentIntentId: fullPaymentIntent.id,
                parentId: metadata.parentId,
            });
            return;
        }
        logger.error('No invoice IDs found in payment intent metadata');
        return;
    }
    const invoiceIds = invoiceIdsStr
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    const paidAt = new Date();
    const amountPaidCents = fullPaymentIntent.amount_received || fullPaymentIntent.amount;
    const amountPaid = amountPaidCents / 100;
    const latestCharge = typeof fullPaymentIntent.latest_charge === 'string' || !fullPaymentIntent.latest_charge
        ? null
        : fullPaymentIntent.latest_charge;
    const stripePayerName = (_c = (_b = (_a = latestCharge === null || latestCharge === void 0 ? void 0 : latestCharge.billing_details) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : metadata.parentName) !== null && _c !== void 0 ? _c : null;
    const stripePayerEmail = (_g = (_f = (_e = (_d = latestCharge === null || latestCharge === void 0 ? void 0 : latestCharge.billing_details) === null || _d === void 0 ? void 0 : _d.email) !== null && _e !== void 0 ? _e : fullPaymentIntent.receipt_email) !== null && _f !== void 0 ? _f : metadata.parentEmail) !== null && _g !== void 0 ? _g : null;
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
                stripeReceiptEmail: (_h = fullPaymentIntent.receipt_email) !== null && _h !== void 0 ? _h : null,
                stripeChargeId: (_j = latestCharge === null || latestCharge === void 0 ? void 0 : latestCharge.id) !== null && _j !== void 0 ? _j : null,
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
            stripePayerEmail,
            stripePayerName,
        });
    }
    catch (error) {
        logger.error('Error updating invoices after successful payment:', error);
        throw error;
    }
}
//# sourceMappingURL=payment_functions.js.map
