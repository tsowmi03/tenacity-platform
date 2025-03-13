// xero_functions.ts
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import {
  XeroClient,
  Invoices,
  Contacts,
  Invoice,
  LineItem,
  Payment,
} from "xero-node";
import * as admin from "firebase-admin";

// 1. Define secrets for Xero credentials.
const XERO_TEST_CLIENT_ID = defineSecret("XERO_TEST_CLIENT_ID");
const XERO_TEST_CLIENT_SECRET = defineSecret("XERO_TEST_CLIENT_SECRET");

// Make sure Firebase Admin is initialized:
if (!admin.apps.length) {
  admin.initializeApp();
}

/** The XeroClient is the main SDK wrapper around Xero's API. */
function getXeroClient(): XeroClient {
  return new XeroClient({
    clientId: XERO_TEST_CLIENT_ID.value(),
    clientSecret: XERO_TEST_CLIENT_SECRET.value(),
    grantType: "authorization_code",
    redirectUris: ["https://xeroauthcallback-3kboe6khcq-uc.a.run.app"],
    scopes: [
      "openid",
      "email",
      "profile",
      "offline_access",
      "accounting.settings",
      "accounting.transactions",
      "accounting.contacts"
    ],
  });
  
}

/**
 * 1) "xeroAuthStart" - The starting endpoint
 *    When you hit this URL, it redirects you to Xero's consent screen.
 */
export const xeroAuthStart = onRequest(
  { secrets: [XERO_TEST_CLIENT_ID, XERO_TEST_CLIENT_SECRET] },
  async (req, res) => {
    try {
      const xero = getXeroClient();
      const consentUrl = await xero.buildConsentUrl();
      res.redirect(consentUrl);
    } catch (error) {
      logger.error("Error in xeroAuthStart:", error);
      res.status(500).send("Error starting Xero OAuth flow.");
    }
  }
);

/**
 * 2) "xeroAuthCallback" - The callback endpoint
 *    Xero will redirect here after the user logs in and approves your app.
 */
export const xeroAuthCallback = onRequest(
  { secrets: [XERO_TEST_CLIENT_ID, XERO_TEST_CLIENT_SECRET] },
  async (req, res) => {
    try {
      const xero = getXeroClient();

      // Exchange auth code for tokens
      await xero.apiCallback(req.url);

      // Retrieve the token set & tenant info
      const tokenSet = await xero.readTokenSet();
      await xero.updateTenants();
      logger.info("Tenants returned by Xero:", xero.tenants);
      const activeTenant = xero.tenants[0];

      // Store tokens in Firestore
      await admin
        .firestore()
        .collection("xeroTokens")
        .doc("demoCompany")
        .set({
          ...tokenSet,
          tenantId: activeTenant.tenantId,
        });

      res.send(
        `<h3>Success!</h3><p>Xero tokens have been retrieved and stored. You can close this tab now.</p>`
      );
    } catch (error) {
      logger.error("Error in xeroAuthCallback:", error);
      res
        .status(500)
        .send("Xero OAuth callback failed: " + (error as Error).message);
    }
  }
);

/** Refresh tokens from Firestore, ensuring we can call Xero's API */
async function refreshXeroToken(): Promise<XeroClient> {
  logger.info("Entering refreshXeroToken");
  const tokenDocRef = admin
    .firestore()
    .collection("xeroTokens")
    .doc("demoCompany");
  const tokenDoc = await tokenDocRef.get();
  const tokenData = tokenDoc.data();
  if (!tokenData) {
    throw new Error("No Xero tokens found in Firestore.");
  }
  logger.info("Existing token data:", tokenData);

  const xero = new XeroClient({
    clientId: XERO_TEST_CLIENT_ID.value(),
    clientSecret: XERO_TEST_CLIENT_SECRET.value(),
    grantType: "authorization_code",
    redirectUris: ["https://xeroauthcallback-3kboe6khcq-uc.a.run.app"],
    scopes: [
      "openid",
      "email",
      "profile",
      "offline_access",
      "accounting.settings",
      "accounting.transactions",
      "accounting.contacts"
    ],
  });

  // Build OpenID client by calling initialize()
  await xero.initialize();

  // Initialize with existing tokens
  await xero.setTokenSet({
    id_token: tokenData.id_token,
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: tokenData.expires_at,
    token_type: tokenData.token_type,
    scope: tokenData.scope,
    session_state: tokenData.session_state,
  });
  logger.info("TokenSet is set, now calling xero.refreshToken()");

  // Refresh
  const newTokenSet = await xero.refreshToken();
  logger.info("Tokens refreshed, new tokenSet:", newTokenSet);

  // Store updated tokens
  await tokenDocRef.update({
    ...newTokenSet,
  });

  return xero; // Authenticated XeroClient instance
}

/** Create or retrieve a Xero Contact for a given parent */
async function createXeroContact(
  parentName: string,
  parentEmail: string
): Promise<string> {
  logger.info("createXeroContact called with:", { parentName, parentEmail });
  const xero = await refreshXeroToken();
  logger.info("refreshXeroToken succeeded in createXeroContact");

  // Retrieve tenantId from Firestore
  const tokenDoc = await admin
    .firestore()
    .collection("xeroTokens")
    .doc("demoCompany")
    .get();
  const tenantId: string | undefined = tokenDoc.data()?.tenantId;
  if (!tenantId) {
    throw new Error("Tenant ID not found in Firestore.");
  }

  // Attempt to find existing contact by email
  logger.info("Fetching existing contacts from Xero with email", parentEmail);
  const existingContacts = await xero.accountingApi.getContacts(
    tenantId,
    undefined,
    `EmailAddress="${parentEmail}"`
  );
  logger.info("Existing contacts response:", existingContacts?.body);

  // Safely handle undefined arrays
  const contacts = existingContacts.body.contacts ?? [];
  if (contacts.length > 0 && contacts[0].contactID) {
    return contacts[0].contactID;
  }

  // Otherwise, create a new contact
  const newContact: Contacts = {
    contacts: [
      {
        name: parentName,
        emailAddress: parentEmail,
      },
    ],
  };

  const response = await xero.accountingApi.createContacts(tenantId, newContact);
  const created = response.body.contacts ?? [];
  if (created.length === 0 || !created[0].contactID) {
    throw new Error("Failed to create Xero contact.");
  }
  return created[0].contactID;
}

/** Create an ACCREC Invoice in Xero for the given parent & amount */
async function createXeroInvoice(
  parentName: string,
  parentEmail: string,
  amount: number,
  invoiceId: string
): Promise<string> {
  logger.info("Entering createXeroInvoice", {
    parentName,
    parentEmail,
    amount,
    invoiceId,
  });
  const xero = await refreshXeroToken();
  logger.info("Xero client refreshed successfully");

  // Retrieve tenantId from Firestore
  const tokenDoc = await admin
    .firestore()
    .collection("xeroTokens")
    .doc("demoCompany")
    .get();
  const tenantId: string | undefined = tokenDoc.data()?.tenantId;
  if (!tenantId) {
    logger.error("No tenantId found in Firestore!");
    throw new Error("Tenant ID not found in Firestore.");
  }

  logger.info("Tenant ID found:", tenantId);

  const contactId = await createXeroContact(parentName, parentEmail);
  logger.info("createXeroContact returned contactId:", contactId);

  // For xero-node, the date/dueDate fields should be strings (e.g. '2023-12-31')
  // We'll convert from JS Date to 'YYYY-MM-DD'
  const dateString = new Date().toISOString().split("T")[0];
  const dueDateString = new Date(
    Date.now() + 14 * 24 * 60 * 60 * 1000
  )
    .toISOString()
    .split("T")[0];

  const lineItem: LineItem = {
    description: "Tutoring Services",
    quantity: 1,
    unitAmount: amount,
    accountCode: "200", // e.g. Sales
  };

  const xeroInvoice: Invoice = {
    type: Invoice.TypeEnum.ACCREC,
    contact: { contactID: contactId },
    lineItems: [lineItem],
    date: dateString,
    dueDate: dueDateString,
    invoiceNumber: `INV-${invoiceId}`,
    status: Invoice.StatusEnum.AUTHORISED,
  };

  logger.info("About to create invoice in Xero...", xeroInvoice);

  const invoices: Invoices = { invoices: [xeroInvoice] };

  try {
    const response = await xero.accountingApi.createInvoices(tenantId, invoices);
    const createdInvoices = response.body.invoices ?? [];
    if (createdInvoices.length === 0 || !createdInvoices[0].invoiceID) {
      logger.error("Invoice creation failed; no invoiceID returned.");
      throw new Error("Failed to create Xero invoice.");
    }

    logger.info("Xero responded with created invoice:", createdInvoices[0]);
    return createdInvoices[0].invoiceID;
  } catch (err) {
    logger.error("Error in xero.accountingApi.createInvoices:", err);
    throw err;
  }
}

// 3) Firestore Trigger (v2): On invoice doc creation, create a Xero invoice.
export const onInvoiceCreated = onDocumentCreated({
  document: "/invoices/{invoiceId}",
  secrets: [XERO_TEST_CLIENT_ID, XERO_TEST_CLIENT_SECRET],
}, async (event) => {
  try {
    logger.info("onInvoiceCreated triggered", { params: event.params });
    const docSnap = event.data;
    // If the snapshot doesn't exist, there's nothing to process
    if (!docSnap || !docSnap.exists) {
      logger.warn("Snapshot doesn't exist, exiting.");
      return;
    };

    // Extract data from the snapshot
    const invoiceData = docSnap.data();
    logger.info("invoiceData read from Firestore:", invoiceData);

    if (!invoiceData) return;

    // Read path param from event.params
    const { invoiceId } = event.params;
    if (!invoiceId) {
      logger.error("No invoiceId found in event params");
      return;
    }

    // Read relevant fields
    const parentName = invoiceData.parentName || "Unknown Parent";
    const parentEmail = invoiceData.parentEmail || "unknown@example.com";
    const amountDue = invoiceData.amountDue || 0;

    logger.info("Calling createXeroInvoice with", {
      parentName,
      parentEmail,
      amountDue,
      invoiceId,
    });

    // Call your existing createXeroInvoice function
    const xeroInvoiceId = await createXeroInvoice(
      parentName,
      parentEmail,
      amountDue,
      invoiceId
    );

    logger.info("Xero invoice created successfully:", xeroInvoiceId);

    // Store the xeroInvoiceId back into Firestore
    await docSnap.ref.update({ xeroInvoiceId });

  } catch (err) {
    logger.error("onInvoiceCreated error:", err);
  }
});

/** Mark a Xero invoice as paid (Stripe->Xero sync) */
export async function markInvoicePaidInXero(
  invoiceId: string,
  amountPaid: number
): Promise<void> {
  const xero = await refreshXeroToken();

  // Retrieve tenantId from Firestore
  const tokenDoc = await admin
    .firestore()
    .collection("xeroTokens")
    .doc("demoCompany")
    .get();
  const tenantId: string | undefined = tokenDoc.data()?.tenantId;
  if (!tenantId) {
    throw new Error("Tenant ID not found in Firestore.");
  }

  // Fetch the invoice doc to find the xeroInvoiceId
  const invoiceDoc = await admin
    .firestore()
    .collection("invoices")
    .doc(invoiceId)
    .get();
  const iData = invoiceDoc.data();
  if (!iData?.xeroInvoiceId) {
    throw new Error("No xeroInvoiceId found on Firestore invoice doc.");
  }

  // Payment date must also be a string
  const paymentDateString = new Date().toISOString().split("T")[0];

  const payment: Payment = {
    invoice: {
      invoiceID: iData.xeroInvoiceId,
    },
    amount: amountPaid,
    date: paymentDateString,
    account: {
      code: "090", // example Bank Account code
    },
  };

  // createPayments expects { payments: Payment[] }
  await xero.accountingApi.createPayments(tenantId, { payments: [payment] });
}
