"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.debugXeroAccountsAndTaxTypes = exports.onInvoiceStatusChanged = exports.markInvoicePaidInXero = exports.onInvoiceCreated = exports.getInvoicePdf = exports.xeroAuthCallback = exports.xeroAuthStart = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const xero_node_1 = require("xero-node");
const admin = require("firebase-admin");
const { requireParentOrAdmin } = require("../src/payments/paymentSecurity");
// 1. Define secrets for Xero credentials.
const XERO_CLIENT_ID = (0, params_1.defineSecret)("XERO_CLIENT_ID");
const XERO_CLIENT_SECRET = (0, params_1.defineSecret)("XERO_CLIENT_SECRET");
// Make sure Firebase Admin is initialized:
if (!admin.apps.length) {
    admin.initializeApp({
        storageBucket: 'tenacity-tutoring-b8eb2.firebasestorage.app',
    });
}
function getXeroClient() {
    return new xero_node_1.XeroClient({
        clientId: XERO_CLIENT_ID.value(),
        clientSecret: XERO_CLIENT_SECRET.value(),
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
exports.xeroAuthStart = (0, https_1.onRequest)({ secrets: [XERO_CLIENT_ID, XERO_CLIENT_SECRET] }, async (req, res) => {
    try {
        const xero = getXeroClient();
        const consentUrl = await xero.buildConsentUrl();
        res.redirect(consentUrl);
    }
    catch (error) {
        logger.error("Error in xeroAuthStart:", error);
        res.status(500).send("Error starting Xero OAuth flow.");
    }
});
/**
 * 2) "xeroAuthCallback" - The callback endpoint
 *    Xero will redirect here after the user logs in and approves your app.
 */
exports.xeroAuthCallback = (0, https_1.onRequest)({ secrets: [XERO_CLIENT_ID, XERO_CLIENT_SECRET] }, async (req, res) => {
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
            .set(Object.assign(Object.assign({}, tokenSet), { tenantId: activeTenant.tenantId }));
        res.send(`<h3>Success!</h3><p>Xero tokens have been retrieved and stored. You can close this tab now.</p>`);
    }
    catch (error) {
        logger.error("Error in xeroAuthCallback:", error);
        res
            .status(500)
            .send("Xero OAuth callback failed: " + error.message);
    }
});
/** Refresh tokens from Firestore, ensuring we can call Xero's API */
async function refreshXeroToken() {
    logger.info("Entering refreshXeroToken");
    const tokenDocRef = admin.firestore().collection("xeroTokens").doc("demoCompany");
    const tokenDoc = await tokenDocRef.get();
    const tokenData = tokenDoc.data();
    if (!tokenData) {
        throw new Error("No Xero tokens found in Firestore.");
    }
    logger.info("Existing token data:", tokenData);
    const xero = new xero_node_1.XeroClient({
        clientId: XERO_CLIENT_ID.value(),
        clientSecret: XERO_CLIENT_SECRET.value(),
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
    await tokenDocRef.update(Object.assign({}, newTokenSet));
    return xero;
}
/**
 * getInvoicePdf:
 * HTTPS Cloud Function that:
 * 1. Expects an invoiceId (via query parameter or request body).
 * 2. Retrieves the corresponding Firestore invoice document.
 * 3. Verifies that a Xero invoice ID exists.
 * 4. Retrieves the tenant ID from the stored Xero tokens.
 * 5. Refreshes the Xero token to get a valid XeroClient.
 * 6. Calls Xero's API to fetch the PDF (returned as a Buffer).
 * 7. Stores the PDF in Cloud Storage.
 * 8. Generates a signed URL for temporary (e.g., 1 hour) access.
 * 9. Updates the Firestore invoice document with the URL.
 * 10. Returns the signed URL in the response.
 */
exports.getInvoicePdf = (0, https_1.onCall)({ secrets: [XERO_CLIENT_ID, XERO_CLIENT_SECRET] }, async (req) => {
    logger.info("getInvoicePdf called with:", req.data);
    try {
        const invoiceId = req.data.invoiceId;
        if (!invoiceId) {
            throw new Error("Missing invoiceId");
        }
        // 1) Fetch the invoice document from Firestore.
        const invoiceDoc = await admin.firestore().collection("invoices").doc(invoiceId).get();
        logger.info("invoiceDoc.exists:", invoiceDoc.exists);
        const invoiceData = invoiceDoc.data();
        if (!(invoiceData === null || invoiceData === void 0 ? void 0 : invoiceData.xeroInvoiceId)) {
            throw new Error("Invoice does not have a Xero invoice ID");
        }
        const invoiceParentId = typeof (invoiceData === null || invoiceData === void 0 ? void 0 : invoiceData.parentId) === 'string' ? invoiceData.parentId : '';
        if (!invoiceParentId) {
            throw new https_1.HttpsError('permission-denied', 'Invoice is missing parent metadata');
        }
        await requireParentOrAdmin(req, invoiceParentId, admin.firestore());
        const xeroInvoiceId = invoiceData.xeroInvoiceId;
        // 2) Retrieve tenant ID
        const tokenDoc = await admin.firestore().collection("xeroTokens").doc("demoCompany").get();
        const tokenData = tokenDoc.data();
        if (!(tokenData === null || tokenData === void 0 ? void 0 : tokenData.tenantId)) {
            throw new Error("Tenant ID not found");
        }
        const tenantId = tokenData.tenantId;
        // 3) Refresh and get Xero client
        const xero = await refreshXeroToken();
        // 4) Fetch PDF buffer
        logger.info("About to call xero.accountingApi.getInvoiceAsPdf");
        const pdfResponse = await xero.accountingApi.getInvoiceAsPdf(tenantId, xeroInvoiceId);
        const pdfBuffer = pdfResponse.body;
        // 5) Save to Storage
        const bucket = admin.storage().bucket(); // check this.bucket.name
        logger.info("Using bucket:", bucket.name);
        const filePath = `invoices-pdfs/${invoiceId}.pdf`;
        logger.info("Saving PDF to:", filePath);
        await bucket.file(filePath).save(pdfBuffer, {
            metadata: { contentType: 'application/pdf' },
            resumable: false,
        });
        // 6) persist and return
        await invoiceDoc.ref.update({ xeroInvoicePdfPath: filePath });
        return { pdfPath: filePath };
    }
    catch (err) {
        if (err instanceof https_1.HttpsError) {
            throw err;
        }
        // log the real error and re-throw it
        logger.error("getInvoicePdf error:", err);
        throw new Error(`getInvoicePdf failed: ${err.message}`);
    }
});
/** Create or retrieve a Xero Contact for a given parent */
async function createXeroContact(parentName, parentEmail) {
    var _a, _b, _c, _d;
    logger.info("createXeroContact called with:", { parentName, parentEmail });
    const xero = await refreshXeroToken();
    logger.info("refreshXeroToken succeeded in createXeroContact");
    // Retrieve tenantId from Firestore
    const tokenDoc = await admin.firestore().collection("xeroTokens").doc("demoCompany").get();
    const tenantId = (_a = tokenDoc.data()) === null || _a === void 0 ? void 0 : _a.tenantId;
    if (!tenantId) {
        throw new Error("Tenant ID not found in Firestore.");
    }
    // 1. Attempt to find existing contact by email.
    logger.info("Fetching existing contacts from Xero with email", parentEmail);
    const existingContactsByEmail = await xero.accountingApi.getContacts(tenantId, undefined, `EmailAddress="${parentEmail}"`);
    const contactsByEmail = (_b = existingContactsByEmail.body.contacts) !== null && _b !== void 0 ? _b : [];
    if (contactsByEmail.length > 0 && contactsByEmail[0].contactID) {
        return contactsByEmail[0].contactID;
    }
    // 2. If no contact by email was found, check for a contact by name.
    logger.info("Fetching existing contacts from Xero with name", parentName);
    const existingContactsByName = await xero.accountingApi.getContacts(tenantId, undefined, `Name="${parentName}"`);
    const contactsByName = (_c = existingContactsByName.body.contacts) !== null && _c !== void 0 ? _c : [];
    if (contactsByName.length > 0 && contactsByName[0].contactID) {
        return contactsByName[0].contactID;
    }
    // 3. Otherwise, create a new contact.
    const newContact = {
        contacts: [
            {
                name: parentName,
                emailAddress: parentEmail,
            },
        ],
    };
    const response = await xero.accountingApi.createContacts(tenantId, newContact);
    const created = (_d = response.body.contacts) !== null && _d !== void 0 ? _d : [];
    if (created.length === 0 || !created[0].contactID) {
        throw new Error("Failed to create Xero contact.");
    }
    logger.info("The new email's contact is", created[0].emailAddress);
    return created[0].contactID;
}
/**
 * Create an ACCREC Invoice in Xero for the given Firestore invoice doc.
 * Builds multiple line items for each student's tutoring,
 * plus separate line items for sibling or second-hour discounts.
 */
async function createXeroInvoice(invoiceId) {
    var _a, _b;
    logger.info("Entering createXeroInvoice with invoiceId:", invoiceId);
    // 1) Refresh Xero token & retrieve tenant
    const xero = await refreshXeroToken();
    logger.info("Xero client refreshed successfully");
    const tokenDoc = await admin
        .firestore()
        .collection("xeroTokens")
        .doc("demoCompany")
        .get();
    const tenantId = (_a = tokenDoc.data()) === null || _a === void 0 ? void 0 : _a.tenantId;
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
    const xeroLineItems = [];
    lineItemsFromDoc.forEach((line) => {
        xeroLineItems.push({
            description: line.description || "Untitled line",
            quantity: line.quantity || 1,
            unitAmount: line.unitAmount || 0,
            accountCode: "0500",
            taxType: "EXEMPTOUTPUT",
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
    const xeroInvoice = {
        type: xero_node_1.Invoice.TypeEnum.ACCREC,
        contact: { contactID: contactId },
        lineItems: xeroLineItems,
        date: dateString,
        dueDate: dueDateString,
        invoiceNumber: `INV-${invoiceData.invoiceNumber || invoiceId}`,
        status: xero_node_1.Invoice.StatusEnum.AUTHORISED,
    };
    logger.info("About to create invoice in Xero...", xeroInvoice);
    // 7) Create the invoice in Xero
    const invoices = { invoices: [xeroInvoice] };
    try {
        const response = await xero.accountingApi.createInvoices(tenantId, invoices);
        const createdInvoices = (_b = response.body.invoices) !== null && _b !== void 0 ? _b : [];
        if (createdInvoices.length === 0 || !createdInvoices[0].invoiceID) {
            logger.error("Invoice creation failed; no invoiceID returned.");
            throw new Error("Failed to create Xero invoice.");
        }
        logger.info("Xero responded with created invoice:", createdInvoices[0]);
        return createdInvoices[0].invoiceID;
    }
    catch (err) {
        logger.error("Error in xero.accountingApi.createInvoices:", err);
        throw err;
    }
}
exports.onInvoiceCreated = (0, firestore_1.onDocumentCreated)({
    document: "/invoices/{invoiceId}",
    secrets: [XERO_CLIENT_ID, XERO_CLIENT_SECRET],
}, async (event) => {
    var _a;
    try {
        logger.info("onInvoiceCreated triggered", { params: event.params });
        const docSnap = event.data;
        if (!docSnap || !docSnap.exists) {
            logger.warn("Snapshot doesn't exist, exiting.");
            return;
        }
        const invoiceData = docSnap.data();
        logger.info("invoiceData read from Firestore:", invoiceData);
        if (invoiceData.xeroInvoiceId) {
            logger.info("Invoice already has xeroInvoiceId; skipping Xero creation.", {
                invoiceId: event.params.invoiceId,
                xeroInvoiceId: invoiceData.xeroInvoiceId,
            });
            return;
        }
        if (!invoiceData)
            return;
        const { invoiceId } = event.params;
        if (!invoiceId) {
            logger.error("No invoiceId found in event params");
            return;
        }
        // Create the Xero invoice
        const xeroInvoiceId = await createXeroInvoice(invoiceId);
        logger.info("Xero invoice created successfully:", xeroInvoiceId);
        // Store the xeroInvoiceId back into Firestore.
        await docSnap.ref.update({ xeroInvoiceId });
        logger.info("Updated Firestore with xeroInvoiceId", { xeroInvoiceId });
        // If the invoice was created as already-paid (e.g. one-off booking where
        // Stripe payment was collected before the invoice existed), mark Xero as
        // paid immediately. xeroInvoiceId is now committed, so markInvoicePaidInXero
        // can fetch it successfully.
        if (invoiceData.status === "paid" && invoiceData.stripePaymentIntentId) {
            try {
                await markInvoicePaidInXero(invoiceId, invoiceData.amountDue, invoiceData.stripePaymentIntentId);
                logger.info("Marked Xero invoice as paid (one-off booking)", { invoiceId, xeroInvoiceId });
            }
            catch (paidErr) {
                logger.error("Failed to mark Xero invoice as paid (one-off booking):", paidErr);
            }
        }
        const xero = await refreshXeroToken();
        // Retrieve tenant ID from Firestore.
        const tokenDoc = await admin.firestore().collection("xeroTokens").doc("demoCompany").get();
        const tenantId = (_a = tokenDoc.data()) === null || _a === void 0 ? void 0 : _a.tenantId;
        if (tenantId) {
            try {
                // Call the Xero API to email the invoice.
                const emailResponse = await xero.accountingApi.emailInvoice(tenantId, xeroInvoiceId, {});
                logger.info(`Invoice ${xeroInvoiceId} emailed successfully via Xero.`, {
                    emailResponse: JSON.stringify(emailResponse),
                });
            }
            catch (emailError) {
                logger.error("Failed to email invoice via Xero:", emailError);
                if (emailError.response) {
                    logger.error("Email Error Status Code:", emailError.response.statusCode);
                    logger.error("Email Error Headers:", JSON.stringify(emailError.response.headers));
                    logger.error("Email Error Body:", JSON.stringify(emailError.response.body));
                }
            }
        }
        else {
            logger.error("Tenant ID not found; cannot email invoice.");
        }
    }
    catch (err) {
        logger.error("onInvoiceCreated error:", err);
    }
});
/** Mark a Xero invoice as paid (Stripe->Xero sync) with retry logic */
async function markInvoicePaidInXero(invoiceId, amountPaid, paymentIntentId, retryCount = 0) {
    var _a;
    logger.info('Attempting to mark Xero invoice as paid', {
        invoiceId,
        amountPaid,
        paymentIntentId,
        retryCount,
    });
    try {
        const xero = await refreshXeroToken();
        // Retrieve tenantId from Firestore
        const tokenDoc = await admin
            .firestore()
            .collection("xeroTokens")
            .doc("demoCompany")
            .get();
        const tenantId = (_a = tokenDoc.data()) === null || _a === void 0 ? void 0 : _a.tenantId;
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
        if (!(iData === null || iData === void 0 ? void 0 : iData.xeroInvoiceId)) {
            throw new Error("No xeroInvoiceId found on Firestore invoice doc.");
        }
        // Skip duplicate check for now - just create the payment
        // Payment date must be a string in 'YYYY-MM-DD' format
        const paymentDateString = new Date().toISOString().split("T")[0];
        const payment = {
            invoice: {
                invoiceID: iData.xeroInvoiceId,
            },
            amount: amountPaid,
            date: paymentDateString,
            account: {
                code: "0500",
            },
            reference: paymentIntentId ? `Stripe Payment: ${paymentIntentId}` : 'Online Payment',
        };
        // createPayments expects { payments: Payment[] }
        await xero.accountingApi.createPayments(tenantId, { payments: [payment] });
        logger.info('Successfully marked Xero invoice as paid', {
            invoiceId,
            xeroInvoiceId: iData.xeroInvoiceId,
            amountPaid,
            paymentIntentId,
        });
    }
    catch (error) {
        logger.error('Error marking Xero invoice as paid', {
            invoiceId,
            amountPaid,
            paymentIntentId,
            retryCount,
            error: error instanceof Error ? error.message : String(error),
        });
        // Retry logic: retry up to 3 times with exponential backoff
        if (retryCount < 3) {
            const delayMs = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
            logger.info(`Retrying Xero payment sync after ${delayMs}ms`, {
                invoiceId,
                retryCount: retryCount + 1,
            });
            await new Promise(resolve => setTimeout(resolve, delayMs));
            await markInvoicePaidInXero(invoiceId, amountPaid, paymentIntentId, retryCount + 1);
        }
        else {
            logger.error('Failed to sync payment to Xero after 3 attempts', {
                invoiceId,
                amountPaid,
                paymentIntentId,
            });
            throw error;
        }
    }
}
exports.markInvoicePaidInXero = markInvoicePaidInXero;
// Updated to work with the webhook payment system
exports.onInvoiceStatusChanged = (0, firestore_1.onDocumentUpdated)({
    document: "invoices/{invoiceId}",
    secrets: [XERO_CLIENT_ID, XERO_CLIENT_SECRET],
}, async (event) => {
    var _a, _b;
    const beforeData = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const afterData = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    // Check if status changed from unpaid to paid and we have a Xero invoice ID
    if (beforeData &&
        afterData &&
        beforeData.status !== afterData.status &&
        afterData.status === "paid" &&
        afterData.xeroInvoiceId) {
        try {
            const invoiceId = event.params.invoiceId;
            const paidAmount = beforeData.amountDue || afterData.amountDue;
            const paymentIntentId = afterData.stripePaymentIntentId;
            logger.info('Invoice status changed to paid, syncing with Xero', {
                invoiceId,
                paidAmount,
                paymentIntentId,
            });
            await markInvoicePaidInXero(invoiceId, paidAmount, paymentIntentId);
            logger.info(`Successfully synced payment to Xero for invoice ${invoiceId}`);
        }
        catch (err) {
            logger.error("Failed to sync payment to Xero:", {
                invoiceId: event.params.invoiceId,
                error: err instanceof Error ? err.message : String(err),
            });
            // Don't throw the error to prevent Cloud Function retries
            // The retry logic is already handled in markInvoicePaidInXero
        }
    }
});
exports.debugXeroAccountsAndTaxTypes = (0, https_1.onRequest)({ secrets: [XERO_CLIENT_ID, XERO_CLIENT_SECRET] }, async (req, res) => {
    var _a, _b, _c;
    try {
        const xero = await refreshXeroToken();
        const tokenDoc = await admin.firestore().collection("xeroTokens").doc("demoCompany").get();
        const tenantId = (_a = tokenDoc.data()) === null || _a === void 0 ? void 0 : _a.tenantId;
        if (!tenantId)
            throw new Error("No tenantId");
        const accounts = await xero.accountingApi.getAccounts(tenantId);
        const taxRates = await xero.accountingApi.getTaxRates(tenantId);
        res.json({
            accounts: (_b = accounts.body.accounts) === null || _b === void 0 ? void 0 : _b.map(a => ({
                code: a.code,
                name: a.name,
                type: a.type,
                status: a.status,
                enablePaymentsToAccount: a.enablePaymentsToAccount,
                showInExpenseClaims: a.showInExpenseClaims,
            })),
            taxRates: (_c = taxRates.body.taxRates) === null || _c === void 0 ? void 0 : _c.map(t => ({
                name: t.name,
                taxType: t.taxType,
                status: t.status,
            })),
        });
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
//# sourceMappingURL=xero_functions.js.map
