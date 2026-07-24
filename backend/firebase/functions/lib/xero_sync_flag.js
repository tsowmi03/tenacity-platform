"use strict";

const { defineBoolean } = require("firebase-functions/params");

// Feature flag (default OFF): push a payment into Xero when an invoice is
// marked paid in the app. While this is disabled, a payment made in the app is
// still recorded in Firestore and the admins are still notified, but the
// invoice is NOT marked paid in Xero automatically — an admin records the
// payment against the invoice in Xero by hand. The default lives in code so it
// survives every deploy; set XERO_PAYMENT_SYNC=true in the function env to turn
// the automatic sync back on.
//
// Note this only gates the *payment* write. Invoice creation
// (`onInvoiceCreated`) still pushes new invoices into Xero and emails them
// from there.
const XERO_PAYMENT_SYNC = defineBoolean("XERO_PAYMENT_SYNC", { default: false });

function xeroPaymentSyncEnabled() {
  return XERO_PAYMENT_SYNC.value();
}

module.exports = {
  XERO_PAYMENT_SYNC,
  xeroPaymentSyncEnabled,
};
