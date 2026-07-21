"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripeWebhook = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const stripe_1 = require("stripe");
const admin = require("firebase-admin");
const xero_functions_1 = require("./xero_functions");
const stripeSecretKey = (0, params_1.defineSecret)("STRIPE_KEY");
const stripeWebhookSecret = (0, params_1.defineSecret)("STRIPE_WEBHOOK_SECRET");
// Add the Xero secrets here
const XERO_CLIENT_ID = (0, params_1.defineSecret)("XERO_CLIENT_ID");
const XERO_CLIENT_SECRET = (0, params_1.defineSecret)("XERO_CLIENT_SECRET");
exports.stripeWebhook = (0, https_1.onRequest)(
// Include ALL secrets that this function or its dependencies need
{ secrets: [stripeSecretKey, stripeWebhookSecret, XERO_CLIENT_ID, XERO_CLIENT_SECRET] }, async (req, res) => {
    const stripe = new stripe_1.default(stripeSecretKey.value(), { apiVersion: "2025-02-24.acacia" });
    const sig = req.headers['stripe-signature'];
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.rawBody, sig, stripeWebhookSecret.value());
    }
    catch (err) {
        logger.error('Webhook signature verification failed:', err);
        res.status(400).send('Webhook signature verification failed');
        return;
    }
    logger.info('Received Stripe webhook:', event.type);
    switch (event.type) {
        case 'payment_intent.succeeded':
            await handlePaymentSuccess(event.data.object);
            break;
        case 'payment_intent.payment_failed':
            await handlePaymentFailed(event.data.object);
            break;
        default:
            logger.info(`Unhandled event type: ${event.type}`);
    }
    res.status(200).send('OK');
});
async function handlePaymentSuccess(paymentIntent) {
    logger.info("=== handlePaymentSuccess started ===");
    const { parentId, invoiceId } = paymentIntent.metadata;
    const amountPaid = paymentIntent.amount / 100;
    logger.info('Processing successful payment:', {
        paymentIntentId: paymentIntent.id,
        parentId,
        invoiceId,
        amountPaid,
        metadata: JSON.stringify(paymentIntent.metadata, null, 2),
    });
    try {
        if (invoiceId && invoiceId !== '') {
            logger.info("Processing single invoice payment for invoiceId:", invoiceId);
            await updateSingleInvoice(invoiceId, amountPaid);
            logger.info("Single invoice updated in Firestore successfully");
            try {
                logger.info("About to call markInvoicePaidInXero for invoiceId:", invoiceId, "with amount:", amountPaid);
                await (0, xero_functions_1.markInvoicePaidInXero)(invoiceId, amountPaid);
                logger.info(`Successfully marked invoice ${invoiceId} as paid in Xero`);
            }
            catch (xeroError) {
                logger.error(`Failed to mark invoice ${invoiceId} as paid in Xero:`, xeroError);
                if (xeroError instanceof Error) {
                    logger.error("Xero error message:", xeroError.message);
                    logger.error("Xero error stack:", xeroError.stack);
                }
                if (xeroError.response) {
                    logger.error("Xero API error response:", JSON.stringify(xeroError.response, null, 2));
                }
            }
        }
        else if (parentId && parentId !== '') {
            logger.info("Processing multiple invoices payment for parentId:", parentId);
            await markAllInvoicesPaid(parentId, amountPaid);
            logger.info("Multiple invoices processed successfully");
        }
        else {
            logger.warn("No invoiceId or parentId found in payment metadata");
        }
        logger.info("About to create payment log");
        await admin.firestore().collection('paymentLogs').add({
            stripePaymentIntentId: paymentIntent.id,
            parentId: parentId || null,
            invoiceId: invoiceId || null,
            amount: amountPaid,
            currency: paymentIntent.currency,
            status: 'succeeded',
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
            metadata: paymentIntent.metadata,
        });
        logger.info("Payment log created successfully");
    }
    catch (error) {
        logger.error('=== Error processing payment success ===');
        logger.error('Error processing payment success:', error);
        if (error instanceof Error) {
            logger.error("Error message:", error.message);
            logger.error("Error stack:", error.stack);
        }
        await admin.firestore().collection('paymentLogs').add({
            stripePaymentIntentId: paymentIntent.id,
            parentId: parentId || null,
            invoiceId: invoiceId || null,
            amount: amountPaid,
            currency: paymentIntent.currency,
            status: 'processing_failed',
            error: error instanceof Error ? error.message : String(error),
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
            metadata: paymentIntent.metadata,
        });
        logger.error('=== Error processing payment success end ===');
    }
    logger.info("=== handlePaymentSuccess completed ===");
}
async function handlePaymentFailed(paymentIntent) {
    var _a;
    logger.error('Payment failed:', {
        paymentIntentId: paymentIntent.id,
        error: paymentIntent.last_payment_error,
    });
    await admin.firestore().collection('paymentLogs').add({
        stripePaymentIntentId: paymentIntent.id,
        parentId: paymentIntent.metadata.parentId || null,
        invoiceId: paymentIntent.metadata.invoiceId || null,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
        status: 'failed',
        error: ((_a = paymentIntent.last_payment_error) === null || _a === void 0 ? void 0 : _a.message) || 'Unknown error',
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        metadata: paymentIntent.metadata,
    });
}
async function updateSingleInvoice(invoiceId, paidAmount) {
    logger.info("updateSingleInvoice called with:", { invoiceId, paidAmount });
    const invoiceRef = admin.firestore().collection('invoices').doc(invoiceId);
    logger.info("About to fetch invoice document:", invoiceId);
    const invoice = await invoiceRef.get();
    logger.info("Invoice document fetched, exists:", invoice.exists);
    if (!invoice.exists) {
        logger.error(`Invoice ${invoiceId} not found in Firestore`);
        throw new Error(`Invoice ${invoiceId} not found`);
    }
    const invoiceData = invoice.data();
    logger.info("Current invoice data:", JSON.stringify(invoiceData, null, 2));
    const newAmount = Math.max(0, invoiceData.amountDue - paidAmount);
    const newStatus = newAmount === 0 ? 'paid' : invoiceData.status;
    logger.info("Calculated updates:", { newAmount, newStatus, oldAmount: invoiceData.amountDue, oldStatus: invoiceData.status });
    logger.info("About to update invoice in Firestore");
    await invoiceRef.update({
        amountDue: newAmount,
        status: newStatus,
        paidAt: newAmount === 0 ? admin.firestore.FieldValue.serverTimestamp() : null,
    });
    logger.info("Invoice updated in Firestore successfully");
}
async function markAllInvoicesPaid(parentId, totalPaidAmount) {
    logger.info("markAllInvoicesPaid called with:", { parentId, totalPaidAmount });
    const unpaidInvoices = await admin.firestore()
        .collection('invoices')
        .where('parentId', '==', parentId)
        .where('status', '==', 'unpaid')
        .get();
    logger.info(`Found ${unpaidInvoices.docs.length} unpaid invoices for parent ${parentId}`);
    const batch = admin.firestore().batch();
    let remainingAmount = totalPaidAmount;
    const sortedInvoices = unpaidInvoices.docs.sort((a, b) => {
        const aData = a.data();
        const bData = b.data();
        return aData.dueDate.seconds - bData.dueDate.seconds;
    });
    logger.info("Processing invoices in order:", sortedInvoices.map(doc => ({ id: doc.id, amount: doc.data().amountDue })));
    for (const doc of sortedInvoices) {
        const invoiceData = doc.data();
        const amountDue = invoiceData.amountDue;
        logger.info(`Processing invoice ${doc.id} with amount due: ${amountDue}, remaining payment: ${remainingAmount}`);
        if (remainingAmount >= amountDue) {
            logger.info(`Fully paying invoice ${doc.id}`);
            batch.update(doc.ref, {
                amountDue: 0,
                status: 'paid',
                paidAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            remainingAmount -= amountDue;
            try {
                logger.info(`About to mark invoice ${doc.id} as paid in Xero with amount: ${amountDue}`);
                await (0, xero_functions_1.markInvoicePaidInXero)(doc.id, amountDue);
                logger.info(`Successfully marked invoice ${doc.id} as paid in Xero`);
            }
            catch (xeroError) {
                logger.error(`Failed to mark invoice ${doc.id} as paid in Xero:`, xeroError);
                if (xeroError instanceof Error) {
                    logger.error("Xero error message:", xeroError.message);
                    logger.error("Xero error stack:", xeroError.stack);
                }
            }
        }
        else if (remainingAmount > 0) {
            logger.info(`Partially paying invoice ${doc.id} with remaining amount: ${remainingAmount}`);
            batch.update(doc.ref, {
                amountDue: amountDue - remainingAmount,
                status: 'unpaid',
            });
            remainingAmount = 0;
            break;
        }
        else {
            logger.info(`No remaining amount for invoice ${doc.id}`);
            break;
        }
    }
    logger.info("About to commit batch updates to Firestore");
    await batch.commit();
    logger.info("Batch updates committed successfully");
}
//# sourceMappingURL=stripe_webhooks.js.map