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
      "accounting.contacts",
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
  const tokenDocRef = admin.firestore().collection("xeroTokens").doc("demoCompany");
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
      "accounting.contacts",
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

  return xero;
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
  const tokenDoc = await admin.firestore().collection("xeroTokens").doc("demoCompany").get();
  const tenantId: string | undefined = tokenDoc.data()?.tenantId;
  if (!tenantId) {
    throw new Error("Tenant ID not found in Firestore.");
  }

  // 1. Attempt to find existing contact by email.
  logger.info("Fetching existing contacts from Xero with email", parentEmail);
  const existingContactsByEmail = await xero.accountingApi.getContacts(
    tenantId,
    undefined,
    `EmailAddress="${parentEmail}"`
  );
  const contactsByEmail = existingContactsByEmail.body.contacts ?? [];
  if (contactsByEmail.length > 0 && contactsByEmail[0].contactID) {
    return contactsByEmail[0].contactID;
  }

  // 2. If no contact by email was found, check for a contact by name.
  logger.info("Fetching existing contacts from Xero with name", parentName);
  const existingContactsByName = await xero.accountingApi.getContacts(
    tenantId,
    undefined,
    `Name="${parentName}"`
  );
  const contactsByName = existingContactsByName.body.contacts ?? [];
  if (contactsByName.length > 0 && contactsByName[0].contactID) {
    return contactsByName[0].contactID;
  }

  // 3. Otherwise, create a new contact.
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

/**
 * Create an ACCREC Invoice in Xero for the given Firestore invoice doc.
 * Builds multiple line items for each student's tutoring,
 * plus separate line items for sibling or second-hour discounts.
 */
async function createXeroInvoice(
  invoiceId: string
): Promise<string> {
  logger.info("Entering createXeroInvoice with invoiceId:", invoiceId);

  // 1) Refresh Xero token & retrieve tenant
  const xero = await refreshXeroToken();
  logger.info("Xero client refreshed successfully");

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

  // 2) Fetch the invoice doc from Firestore
  const invoiceDoc = await admin.firestore().collection("invoices").doc(invoiceId).get();
  const invoiceData = invoiceDoc.data() || {};

  // Extract relevant fields from the invoice doc
  const parentName = invoiceData.parentName || "Unknown Parent";
  const parentEmail = invoiceData.parentEmail || "unknown@example.com";
  const amountDue = invoiceData.amountDue || 0;
  const lineItemsFromDoc = invoiceData.lineItems || []; // array of { description, quantity, unitAmount, lineTotal }
  logger.info("Invoice fields:", {
    parentName,
    parentEmail,
    amountDue,
    lineItemsFromDoc,
  });

  // 3) Create or retrieve Xero Contact
  const contactId = await createXeroContact(parentName, parentEmail);
  logger.info("createXeroContact returned contactId:", contactId);

  // 4) Build Xero line items directly from Firestore lines
  const xeroLineItems: LineItem[] = [];

  (lineItemsFromDoc as any[]).forEach((line) => {
    xeroLineItems.push({
      description: line.description || "Untitled line",
      quantity: line.quantity || 1,
      unitAmount: line.unitAmount || 0,
      accountCode: "200",
      taxType: "NONE",
    });
  });

  // 5) Retrieve invoiceDate/dueDate from Firestore if needed
  let invoiceDate = new Date();
  let dueDate = new Date(Date.now() + 21 * 86400000);

  if (invoiceData.createdAt && invoiceData.createdAt._seconds) {
    invoiceDate = new Date(invoiceData.createdAt._seconds * 1000);
  }
  if (invoiceData.dueDate && invoiceData.dueDate._seconds) {
    dueDate = new Date(invoiceData.dueDate._seconds * 1000);
  }

  const dateString = invoiceDate.toISOString().split("T")[0];
  const dueDateString = dueDate.toISOString().split("T")[0];

  // 6) Construct the Xero invoice object
  const xeroInvoice: Invoice = {
    type: Invoice.TypeEnum.ACCREC,
    contact: { contactID: contactId },
    lineItems: xeroLineItems,
    date: dateString,
    dueDate: dueDateString,
    invoiceNumber: `INV-${invoiceId}`,
    status: Invoice.StatusEnum.AUTHORISED,
  };

  logger.info("About to create invoice in Xero...", xeroInvoice);

  // 7) Create the invoice in Xero
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

export const onInvoiceCreated = onDocumentCreated(
  {
    document: "/invoices/{invoiceId}",
    secrets: [XERO_TEST_CLIENT_ID, XERO_TEST_CLIENT_SECRET],
  },
  async (event) => {
    try {
      logger.info("onInvoiceCreated triggered", { params: event.params });
      const docSnap = event.data;
      // If the snapshot doesn't exist, there's nothing to process
      if (!docSnap || !docSnap.exists) {
        logger.warn("Snapshot doesn't exist, exiting.");
        return;
      }

      const invoiceData = docSnap.data();
      logger.info("invoiceData read from Firestore:", invoiceData);

      if (!invoiceData) return;

      const { invoiceId } = event.params;
      if (!invoiceId) {
        logger.error("No invoiceId found in event params");
        return;
      }

      // Actually create the Xero invoice using our new multi-line logic
      const xeroInvoiceId = await createXeroInvoice(invoiceId);

      logger.info("Xero invoice created successfully:", xeroInvoiceId);

      // Store the xeroInvoiceId back into Firestore
      await docSnap.ref.update({ xeroInvoiceId });
    } catch (err) {
      logger.error("onInvoiceCreated error:", err);
    }
  }
);

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

  // Payment date must be a string in 'YYYY-MM-DD' format
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
