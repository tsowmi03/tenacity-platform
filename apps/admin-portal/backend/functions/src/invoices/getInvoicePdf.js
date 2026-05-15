"use strict";

const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { XeroClient } = require("xero-node");

const { requireAdminCallable } = require("../auth/requireAdmin");
const { toHttpsError } = require("../shared/errors");
const { writeAuditLog } = require("../shared/auditLog");
const { assertString, validateShape } = require("../shared/validation");

const xeroClientId = defineSecret("XERO_CLIENT_ID");
const xeroClientSecret = defineSecret("XERO_CLIENT_SECRET");

function validateGetInvoicePdfPayload(input) {
  return validateShape(input || {}, {
    invoiceId: (v) => assertString(v, "invoiceId", { max: 120 }),
  });
}

function buildXeroClient({ clientId, clientSecret }) {
  return new XeroClient({
    clientId,
    clientSecret,
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

async function refreshXeroToken({ db, clientId, clientSecret }) {
  const tokenRef = db.collection("xeroTokens").doc("demoCompany");
  const tokenSnap = await tokenRef.get();
  const tokenData = tokenSnap.data();
  if (!tokenData) {
    throw new HttpsError("failed-precondition", "No Xero token is stored");
  }
  if (!tokenData.tenantId) {
    throw new HttpsError("failed-precondition", "Xero tenant ID is missing");
  }

  const xero = buildXeroClient({ clientId, clientSecret });
  await xero.initialize();
  await xero.setTokenSet({
    id_token: tokenData.id_token,
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: tokenData.expires_at,
    token_type: tokenData.token_type,
    scope: tokenData.scope,
    session_state: tokenData.session_state,
  });
  const refreshed = await xero.refreshToken();
  await tokenRef.update({ ...refreshed });
  return { xero, tenantId: tokenData.tenantId };
}

async function fetchAndStoreInvoicePdf({
  db,
  storage,
  invoiceId,
  xeroInvoiceId,
  secrets,
}) {
  const { xero, tenantId } = await refreshXeroToken({
    db,
    clientId: secrets.clientId,
    clientSecret: secrets.clientSecret,
  });
  const response = await xero.accountingApi.getInvoiceAsPdf(
    tenantId,
    xeroInvoiceId
  );
  const pdfPath = `invoices-pdfs/${invoiceId}.pdf`;
  await storage.bucket().file(pdfPath).save(response.body, {
    metadata: { contentType: "application/pdf" },
    resumable: false,
  });
  return pdfPath;
}

async function getInvoicePdfImpl({ payload, actor, deps }) {
  const { db, storage, secrets, clock, fetchPdf = fetchAndStoreInvoicePdf } = deps;
  if (!db) throw new TypeError("getInvoicePdfImpl requires db");
  if (!storage) throw new TypeError("getInvoicePdfImpl requires storage");
  if (!secrets?.clientId || !secrets?.clientSecret) {
    throw new TypeError("getInvoicePdfImpl requires Xero secrets");
  }
  if (!actor?.uid) throw new TypeError("getInvoicePdfImpl requires actor.uid");

  const ref = db.collection("invoices").doc(payload.invoiceId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", `Invoice not found: ${payload.invoiceId}`);
  }
  const invoice = snap.data() || {};
  if (!invoice.xeroInvoiceId) {
    throw new HttpsError(
      "failed-precondition",
      "Invoice does not have a Xero invoice ID yet"
    );
  }

  let pdfPath = invoice.xeroInvoicePdfPath;
  let source = "cache";
  if (!pdfPath) {
    pdfPath = await fetchPdf({
      db,
      storage,
      invoiceId: payload.invoiceId,
      xeroInvoiceId: invoice.xeroInvoiceId,
      secrets,
    });
    await ref.update({ xeroInvoicePdfPath: pdfPath });
    source = "xero";
  }

  await writeAuditLog(
    db,
    {
      actorUid: actor.uid,
      actorEmail: actor.email,
      action: "invoice.pdf.get",
      targetType: "invoice",
      targetId: payload.invoiceId,
      payloadSummary: { source, pdfPath },
    },
    { logger, clock }
  );

  return { invoiceId: payload.invoiceId, pdfPath, source };
}

const adminGetInvoicePdf = onCall(
  {
    region: "us-central1",
    secrets: [xeroClientId, xeroClientSecret],
  },
  async (request) => {
    const actor = requireAdminCallable(request);
    let payload;
    try {
      payload = validateGetInvoicePdfPayload(request.data);
    } catch (err) {
      throw toHttpsError(err);
    }
    try {
      return await getInvoicePdfImpl({
        payload,
        actor,
        deps: {
          db: admin.firestore(),
          storage: admin.storage(),
          secrets: {
            clientId: xeroClientId.value(),
            clientSecret: xeroClientSecret.value(),
          },
        },
      });
    } catch (err) {
      logger.error("[adminGetInvoicePdf] failed", {
        errorMessage: err?.message,
        actorUid: actor.uid,
      });
      throw toHttpsError(err);
    }
  }
);

module.exports = {
  validateGetInvoicePdfPayload,
  buildXeroClient,
  refreshXeroToken,
  fetchAndStoreInvoicePdf,
  getInvoicePdfImpl,
  adminGetInvoicePdf,
};
