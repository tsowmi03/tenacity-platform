// payment_functions.ts
import { onCall, HttpsError, onRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import Stripe from 'stripe';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { createHash } from 'crypto';

const stripeSecretKey = defineSecret("STRIPE_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");

// Make sure Firebase Admin is initialized:
if (!admin.apps.length) {
  admin.initializeApp();
}

function escapeStripeSearchValue(value: string): string {
  // Stripe Search uses a Lucene-like query; keep this conservative.
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function getOrCreateStripeCustomerId(params: {
  stripe: Stripe;
  parentId: string;
  parentEmail?: string;
  parentName?: string;
}): Promise<string> {
  const { stripe, parentId, parentEmail, parentName } = params;

  const userRef = admin.firestore().collection('users').doc(parentId);
  const userSnap = await userRef.get();
  const userData = (userSnap.exists ? (userSnap.data() as Record<string, unknown>) : undefined) ?? undefined;

  const existing = typeof userData?.stripeCustomerId === 'string' ? (userData.stripeCustomerId as string) : null;
  if (existing) return existing;

  // Best-effort de-duplication: search for an existing customer by metadata.
  // This avoids creating multiple Stripe customers if the Firestore field is missing.
  try {
    const escapedUid = escapeStripeSearchValue(parentId);
    const search = await stripe.customers.search({
      query: `metadata['firebaseUid']:'${escapedUid}'`,
      limit: 1,
    });
    const found = search.data?.[0];
    if (found?.id) {
      await userRef.set(
        {
          stripeCustomerId: found.id,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return found.id;
    }
  } catch (err) {
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

  await userRef.set(
    {
      stripeCustomerId: customer.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return customer.id;
}

export const createPaymentIntent = onCall(
  { secrets: [stripeSecretKey] },
  async (request) => {
    const stripe = new Stripe(stripeSecretKey.value(), { apiVersion: "2025-02-24.acacia" });
    const { amount, currency, parentId, invoiceIds } = request.data;
    
    if (!parentId) {
      throw new HttpsError('invalid-argument', 'Missing parentId');
    }
    
    if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      throw new HttpsError('invalid-argument', 'Missing or invalid invoiceIds');
    }

    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      throw new HttpsError('invalid-argument', 'Invalid amount');
    }

    if (typeof currency !== 'string' || currency.trim() === '') {
      throw new HttpsError('invalid-argument', 'Invalid currency');
    }

    const invoiceIdsNormalized = invoiceIds.map((x: unknown) => String(x)).sort();

    // Stripe idempotency prevents duplicates if this request is retried.
    // Use stable inputs: parentId + currency + amount + sorted invoice IDs.
    const rawKey = `${String(parentId)}|${currency.toLowerCase()}|${amount}|${invoiceIdsNormalized.join(',')}`;
    const idempotencyKey = `tenacity_pi_${createHash('sha256').update(rawKey).digest('hex')}`;

    const firstInvoiceId = String(invoiceIdsNormalized[0]);
    const firstInvoiceSnap = await admin.firestore().collection('invoices').doc(firstInvoiceId).get();
    if (!firstInvoiceSnap.exists) {
      throw new HttpsError('not-found', `Invoice not found: ${firstInvoiceId}`);
    }
    const firstInvoice = firstInvoiceSnap.data() as Record<string, unknown>;

    const invoiceParentId = firstInvoice?.parentId;
    if (typeof invoiceParentId === 'string' && invoiceParentId !== String(parentId)) {
      throw new HttpsError('permission-denied', 'parentId does not match invoice parentId');
    }

    const parentEmail = typeof firstInvoice?.parentEmail === 'string' ? (firstInvoice.parentEmail as string) : undefined;
    const parentName = typeof firstInvoice?.parentName === 'string' ? (firstInvoice.parentName as string) : undefined;
    
    try {
      const customerId = await getOrCreateStripeCustomerId({
        stripe,
        parentId: String(parentId),
        parentEmail,
        parentName,
      });

      const paymentIntent = await stripe.paymentIntents.create(
        {
          amount,
          currency,
          customer: customerId,
          receipt_email: parentEmail,
          metadata: {
            parentId: String(parentId),
            parentEmail: parentEmail ?? '',
            parentName: parentName ?? '',
            invoiceIds: invoiceIdsNormalized.join(','),
            source: 'tenacity_tutoring',
          },
        },
        { idempotencyKey }
      );

      // Store the payment intent ID with the invoices for tracking
      const batch = admin.firestore().batch();
      for (const invoiceId of invoiceIdsNormalized) {
        const invoiceRef = admin.firestore().collection('invoices').doc(String(invoiceId));
        batch.update(invoiceRef, {
          stripePaymentIntentId: paymentIntent.id,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();

      logger.info('Payment intent created and linked to invoices', {
        paymentIntentId: paymentIntent.id,
        parentId: parentId,
        invoiceIds: invoiceIdsNormalized,
        amount: amount,
        idempotencyKey,
      });
  
      return { 
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        customerId,
      };
    } catch (error) {
      let errorMessage = 'An unknown error occurred';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      logger.error('Error creating payment intent:', error);
      throw new HttpsError('internal', errorMessage);
    }
  }
);

// Optional: enables PaymentSheet customer mode (saved payment methods).
// Your Flutter client can call this and pass the result into SetupPaymentSheetParameters.
export const createStripeCustomerEphemeralKey = onCall(
  { secrets: [stripeSecretKey] },
  async (request) => {
    const stripe = new Stripe(stripeSecretKey.value(), { apiVersion: "2025-02-24.acacia" });
    const parentId = request.data?.parentId;
    const parentEmail = typeof request.data?.parentEmail === 'string' ? (request.data.parentEmail as string) : undefined;
    const parentName = typeof request.data?.parentName === 'string' ? (request.data.parentName as string) : undefined;

    if (!parentId) {
      throw new HttpsError('invalid-argument', 'Missing parentId');
    }

    const customerId = await getOrCreateStripeCustomerId({
      stripe,
      parentId: String(parentId),
      parentEmail,
      parentName,
    });

    // Stripe requires the API version for ephemeral keys to match the mobile SDK.
    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: "2025-02-24.acacia" }
    );

    return {
      customerId,
      ephemeralKeySecret: ephemeralKey.secret,
    };
  }
);

export const verifyPaymentStatus = onCall(
  { secrets: [stripeSecretKey] },
  async (request) => {
    const stripe = new Stripe(stripeSecretKey.value(), { apiVersion: "2025-02-24.acacia" });
    const { clientSecret } = request.data;
    if (!clientSecret) {
      throw new HttpsError('invalid-argument', 'Missing clientSecret');
    }
    // Extract the PaymentIntent ID from the clientSecret.
    // The clientSecret is in the format "pi_xxx_secret_yyy", so splitting it gives the ID.
    logger.info(`DEBUG: Received clientSecret: ${clientSecret}`);
    const parts = clientSecret.split('_secret_');
    if (parts.length < 2) {
      logger.error(`DEBUG: Invalid clientSecret format: ${clientSecret}`);
      throw new HttpsError('invalid-argument', 'Invalid clientSecret format.');
    }
    const paymentIntentId = parts[0];
    logger.info(`DEBUG: Extracted paymentIntentId: ${paymentIntentId}`);
    
    try {
      // Retrieve the PaymentIntent from Stripe.
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
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
    } catch (error) {
      let errorMessage = 'An unknown error occurred';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      logger.error('Error verifying payment status:', error);
      throw new HttpsError('internal', errorMessage);
    }
  }
);

// Add Stripe webhook handler for more reliable payment confirmation
export const stripeWebhook = onRequest(
  { secrets: [stripeWebhookSecret, stripeSecretKey] },
  async (req, res) => {
    const stripe = new Stripe(stripeSecretKey.value(), { apiVersion: "2025-02-24.acacia" });
    const sig = req.headers['stripe-signature'];
    
    if (!sig) {
      logger.error('Missing stripe-signature header');
      res.status(400).send('Missing stripe-signature header');
      return;
    }

    let event;
    
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody || req.body, 
        sig as string, 
        stripeWebhookSecret.value()
      );
    } catch (err) {
      logger.error('Webhook signature verification failed:', err);
      res.status(400).send(`Webhook signature verification failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return;
    }

    logger.info('Stripe webhook received:', { type: event.type, id: event.id });

    try {
      switch (event.type) {
        case 'payment_intent.succeeded':
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          await handlePaymentSuccess(stripe, paymentIntent);
          break;
        
        case 'payment_intent.payment_failed':
          const failedPayment = event.data.object as Stripe.PaymentIntent;
          logger.warn('Payment failed:', { paymentIntentId: failedPayment.id });
          break;
        
        default:
          logger.info('Unhandled webhook event type:', event.type);
      }
      
      res.json({ received: true });
    } catch (error) {
      logger.error('Error processing webhook:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }
);

// Helper function to handle successful payments
async function handlePaymentSuccess(
  stripe: Stripe,
  paymentIntent: Stripe.PaymentIntent
): Promise<void> {
  logger.info('Processing successful payment:', { paymentIntentId: paymentIntent.id });

  const fullPaymentIntent = await stripe.paymentIntents.retrieve(paymentIntent.id, {
    expand: ['latest_charge'],
  });

  const metadata = fullPaymentIntent.metadata;
  const invoiceIdsStr = metadata.invoiceIds;

  if (!invoiceIdsStr) {
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

  const latestCharge =
    typeof fullPaymentIntent.latest_charge === 'string' || !fullPaymentIntent.latest_charge
      ? null
      : fullPaymentIntent.latest_charge;

  const stripePayerName = latestCharge?.billing_details?.name ?? metadata.parentName ?? null;
  const stripePayerEmail =
    latestCharge?.billing_details?.email ??
    fullPaymentIntent.receipt_email ??
    metadata.parentEmail ??
    null;

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
        stripeReceiptEmail: fullPaymentIntent.receipt_email ?? null,
        stripeChargeId: latestCharge?.id ?? null,

        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();

    logger.info('Successfully marked invoices as paid', {
      paymentIntentId: fullPaymentIntent.id,
      invoiceIds,
      amountPaid,
      stripePayerEmail,
      stripePayerName,
    });
  } catch (error) {
    logger.error('Error updating invoices after successful payment:', error);
    throw error;
  }
}