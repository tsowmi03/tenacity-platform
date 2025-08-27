// payment_functions.ts
import { onCall, HttpsError, onRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import Stripe from 'stripe';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';

const stripeSecretKey = defineSecret("STRIPE_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");

// Make sure Firebase Admin is initialized:
if (!admin.apps.length) {
  admin.initializeApp();
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
    
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency,
        metadata: {
          parentId: parentId,
          invoiceIds: invoiceIds.join(','),
          source: 'tenacity_tutoring',
        },
      });

      // Store the payment intent ID with the invoices for tracking
      const batch = admin.firestore().batch();
      for (const invoiceId of invoiceIds) {
        const invoiceRef = admin.firestore().collection('invoices').doc(invoiceId);
        batch.update(invoiceRef, {
          stripePaymentIntentId: paymentIntent.id,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();

      logger.info('Payment intent created and linked to invoices', {
        paymentIntentId: paymentIntent.id,
        parentId: parentId,
        invoiceIds: invoiceIds,
        amount: amount,
      });
  
      return { 
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
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
        await handlePaymentSuccess(paymentIntent);
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
  { secrets: [stripeWebhookSecret] },
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
          await handlePaymentSuccess(paymentIntent);
          break;
        
        case 'payment_intent.payment_failed':
          const failedPayment = event.data.object as Stripe.PaymentIntent;
          logger.warn('Payment failed:', { paymentIntentId: failedPayment.id });
          // Optionally handle failed payments
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
async function handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent): Promise<void> {
  logger.info('Processing successful payment:', { paymentIntentId: paymentIntent.id });
  
  const metadata = paymentIntent.metadata;
  const invoiceIdsStr = metadata.invoiceIds;
  
  if (!invoiceIdsStr) {
    logger.error('No invoice IDs found in payment intent metadata');
    return;
  }
  
  const invoiceIds = invoiceIdsStr.split(',');
  const paidAt = new Date();
  const amountPaidCents = paymentIntent.amount_received || paymentIntent.amount;
  const amountPaid = amountPaidCents / 100; // Convert from cents to dollars
  
  try {
    // Update all related invoices to paid status
    const batch = admin.firestore().batch();
    
    for (const invoiceId of invoiceIds) {
      const invoiceRef = admin.firestore().collection('invoices').doc(invoiceId.trim());
      
      batch.update(invoiceRef, {
        status: 'paid',
        paidAt: admin.firestore.Timestamp.fromDate(paidAt),
        stripePaymentIntentId: paymentIntent.id,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    
    await batch.commit();
    
    logger.info('Successfully marked invoices as paid', {
      paymentIntentId: paymentIntent.id,
      invoiceIds: invoiceIds,
      amountPaid: amountPaid,
    });
    
  } catch (error) {
    logger.error('Error updating invoices after successful payment:', error);
    throw error;
  }
}