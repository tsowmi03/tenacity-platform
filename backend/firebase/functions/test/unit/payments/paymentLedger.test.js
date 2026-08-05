"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

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
  settledByAnotherPayment,
  xeroInvoiceNumber,
} = require("../../../src/payments/paymentLedger");

// The four metadata shapes seen in production. Field names and structure are
// exactly as Stripe stores them; the values are stand-ins, so no parent's
// details end up in the repository.
const APP_INVOICE_METADATA = {
  parentId: "parent-abc",
  parentEmail: "parent@example.com",
  parentName: "Parent Example",
  invoiceIds: "invoice-abc",
  paymentType: "invoice",
  source: "tenacity_tutoring",
};

const XERO_METADATA = {
  EmailAddress: "payer@example.com",
  "Invoice number": "INV-409",
  OrgCode: "!!!QQ8",
  OrgName: "Tenacity Tutoring Pty Ltd",
};

const ONE_OFF_METADATA = {
  parentId: "parent-1",
  invoiceIds: "",
  paymentType: "one_off_booking",
  source: "tenacity_tutoring",
};

describe("classifyPayment", () => {
  it("reads an app payment from its invoiceIds", () => {
    assert.equal(classifyPayment(APP_INVOICE_METADATA), PAYMENT_SOURCE.APP);
  });

  it("reads a Xero payment from its invoice number, which sets no paymentType", () => {
    assert.equal(classifyPayment(XERO_METADATA), PAYMENT_SOURCE.XERO);
  });

  it("reads a one-off booking, whose invoiceIds Stripe drops as an empty string", () => {
    assert.equal(classifyPayment(ONE_OFF_METADATA), PAYMENT_SOURCE.ONE_OFF);
  });

  it("falls back to unknown rather than guessing", () => {
    assert.equal(classifyPayment({}), PAYMENT_SOURCE.UNKNOWN);
    assert.equal(classifyPayment(null), PAYMENT_SOURCE.UNKNOWN);
    assert.equal(classifyPayment({ paymentType: "something_new" }), PAYMENT_SOURCE.UNKNOWN);
  });

  it("prefers invoiceIds over an invoice number if a payment somehow carries both", () => {
    assert.equal(
      classifyPayment({ ...XERO_METADATA, invoiceIds: "abc" }),
      PAYMENT_SOURCE.APP
    );
  });
});

describe("appInvoiceIds", () => {
  it("splits a multi-invoice pay-all payment", () => {
    assert.deepEqual(appInvoiceIds({ invoiceIds: "a,b,c" }), ["a", "b", "c"]);
  });

  it("tolerates spacing and trailing separators", () => {
    assert.deepEqual(appInvoiceIds({ invoiceIds: " a , b ,, " }), ["a", "b"]);
  });

  it("returns nothing for a one-off booking", () => {
    assert.deepEqual(appInvoiceIds(ONE_OFF_METADATA), []);
    assert.deepEqual(appInvoiceIds({}), []);
  });
});

describe("xeroInvoiceNumber", () => {
  it("reads the space-separated key Xero actually writes", () => {
    assert.equal(xeroInvoiceNumber(XERO_METADATA), "INV-409");
  });

  it("returns null for anything else", () => {
    assert.equal(xeroInvoiceNumber(APP_INVOICE_METADATA), null);
    assert.equal(xeroInvoiceNumber({ "Invoice number": "  " }), null);
  });
});

describe("invoiceNumberCandidates", () => {
  it("offers the bare form for a prefixed number, since Firestore stores it bare", () => {
    assert.deepEqual(invoiceNumberCandidates("INV-406"), ["INV-406", "406"]);
  });

  it("offers the prefixed form for a bare number, in case the convention changes", () => {
    assert.deepEqual(invoiceNumberCandidates("406"), ["406", "INV-406"]);
  });

  it("matches the prefix case-insensitively", () => {
    assert.deepEqual(invoiceNumberCandidates("inv-406"), ["inv-406", "406"]);
  });

  it("returns nothing usable for empty input", () => {
    assert.deepEqual(invoiceNumberCandidates(""), []);
    assert.deepEqual(invoiceNumberCandidates(null), []);
  });
});

describe("matchStatusFor", () => {
  const exact = { amountPaidCents: 120000, invoiceAmountDueCents: 120000 };

  it("matches one invoice paid for exactly what it is worth", () => {
    assert.equal(
      matchStatusFor({ matches: ["inv-1"], ...exact }),
      MATCH_STATUS.MATCHED
    );
  });

  it("does not match when nothing was found", () => {
    assert.equal(matchStatusFor({ matches: [], ...exact }), MATCH_STATUS.UNMATCHED);
  });

  it("refuses to choose between two invoices sharing a number", () => {
    assert.equal(
      matchStatusFor({ matches: ["inv-1", "inv-2"], ...exact }),
      MATCH_STATUS.AMBIGUOUS
    );
  });

  it("refuses to clear a balance from a part payment", () => {
    assert.equal(
      matchStatusFor({
        matches: ["inv-1"],
        amountPaidCents: 5000,
        invoiceAmountDueCents: 70000,
      }),
      MATCH_STATUS.AMOUNT_MISMATCH
    );
  });

  it("treats an overpayment as a mismatch too, rather than silently absorbing it", () => {
    assert.equal(
      matchStatusFor({
        matches: ["inv-1"],
        amountPaidCents: 90000,
        invoiceAmountDueCents: 70000,
      }),
      MATCH_STATUS.AMOUNT_MISMATCH
    );
  });

  it("treats an unreadable amount as a mismatch rather than a match", () => {
    assert.equal(
      matchStatusFor({
        matches: ["inv-1"],
        amountPaidCents: 70000,
        invoiceAmountDueCents: null,
      }),
      MATCH_STATUS.AMOUNT_MISMATCH
    );
  });

  it("will not settle an invoice a different payment already settled", () => {
    assert.equal(
      matchStatusFor({
        matches: [{ id: "inv-1", data: { status: "paid", stripePaymentIntentId: "pi_first" } }],
        amountPaidCents: 120000,
        invoiceAmountDueCents: 120000,
        paymentIntentId: "pi_second",
      }),
      MATCH_STATUS.ALREADY_PAID
    );
  });

  it("still settles when the same payment is replayed", () => {
    // Resending a Stripe event must be idempotent, not flagged as a duplicate.
    assert.equal(
      matchStatusFor({
        matches: [{ id: "inv-1", data: { status: "paid", stripePaymentIntentId: "pi_same" } }],
        amountPaidCents: 120000,
        invoiceAmountDueCents: 120000,
        paymentIntentId: "pi_same",
      }),
      MATCH_STATUS.MATCHED
    );
  });

  it("agrees with the three live Xero payments this repairs", () => {
    // INV-406 $1200, INV-403 $700, INV-389 $1300 — all exact.
    for (const dollars of [1200, 700, 1300]) {
      assert.equal(
        matchStatusFor({
          matches: ["inv-1"],
          amountPaidCents: dollars * 100,
          invoiceAmountDueCents: invoiceAmountDueCents({ amountDue: dollars }),
        }),
        MATCH_STATUS.MATCHED
      );
    }
  });
});

describe("settledByAnotherPayment", () => {
  it("is false for an unpaid invoice", () => {
    assert.equal(settledByAnotherPayment({ status: "unpaid" }, "pi_1"), false);
    assert.equal(settledByAnotherPayment({ status: "overdue" }, "pi_1"), false);
  });

  it("is false when the same payment settled it", () => {
    assert.equal(
      settledByAnotherPayment({ status: "paid", stripePaymentIntentId: "pi_1" }, "pi_1"),
      false
    );
  });

  it("is true when a different payment settled it", () => {
    assert.equal(
      settledByAnotherPayment({ status: "paid", stripePaymentIntentId: "pi_1" }, "pi_2"),
      true
    );
  });

  it("is true for an invoice marked paid by hand, which has no payment to compare", () => {
    assert.equal(settledByAnotherPayment({ status: "paid" }, "pi_1"), true);
  });

  it("reads the { id, data } shape the query returns", () => {
    assert.equal(
      settledByAnotherPayment({ id: "inv-1", data: { status: "paid", stripePaymentIntentId: "pi_1" } }, "pi_2"),
      true
    );
  });
});

describe("invoiceAmountDueCents", () => {
  it("converts dollars to cents without float drift", () => {
    assert.equal(invoiceAmountDueCents({ amountDue: 1200 }), 120000);
    assert.equal(invoiceAmountDueCents({ amountDue: 70.7 }), 7070);
  });

  it("returns null when there is no usable amount", () => {
    assert.equal(invoiceAmountDueCents({}), null);
    assert.equal(invoiceAmountDueCents({ amountDue: "700" }), null);
    assert.equal(invoiceAmountDueCents(null), null);
  });
});

describe("paymentLogId", () => {
  it("is the PaymentIntent id, so a replay overwrites rather than duplicates", () => {
    assert.equal(paymentLogId("pi_3U0fgpS6DraUvj421nQv0lXm"), "pi_3U0fgpS6DraUvj421nQv0lXm");
    assert.equal(paymentLogId("  pi_abc  "), "pi_abc");
  });

  it("refuses to build an id from nothing", () => {
    assert.throws(() => paymentLogId(""), TypeError);
    assert.throws(() => paymentLogId(null), TypeError);
  });
});

describe("paidAtFromCharge", () => {
  it("takes the time the money moved, not the time it was processed", () => {
    // ch_3Tz7DnS6DraUvj420iZiMou2, the live INV-389 charge.
    const charge = { created: 1785504896 };
    const fallback = new Date("2026-08-05T00:00:00Z");
    assert.equal(
      paidAtFromCharge(charge, fallback).toISOString(),
      new Date(1785504896 * 1000).toISOString()
    );
  });

  it("falls back when the charge carries no timestamp", () => {
    const fallback = new Date("2026-08-05T00:00:00Z");
    assert.equal(paidAtFromCharge(null, fallback), fallback);
    assert.equal(paidAtFromCharge({}, fallback), fallback);
    assert.equal(paidAtFromCharge({ created: 0 }, fallback), fallback);
  });
});

describe("buildPaymentLogEntry", () => {
  it("records an unmatched payment with everything needed to chase it", () => {
    const entry = buildPaymentLogEntry({
      paymentIntentId: "pi_3U0fgpS6DraUvj421nQv0lXm",
      chargeId: "ch_3U0fgpS6DraUvj4212GEmvl4",
      source: PAYMENT_SOURCE.XERO,
      status: "succeeded",
      matchStatus: MATCH_STATUS.UNMATCHED,
      invoiceNumber: "INV-409",
      amount: 70,
      currency: "AUD",
      payerEmail: "payer@example.com",
      metadata: XERO_METADATA,
    });

    assert.equal(entry.paymentIntentId, "pi_3U0fgpS6DraUvj421nQv0lXm");
    assert.equal(entry.matchStatus, MATCH_STATUS.UNMATCHED);
    assert.equal(entry.invoiceNumber, "INV-409");
    assert.equal(entry.currency, "aud", "currency is normalised for querying");
    assert.deepEqual(entry.invoiceIds, []);
    assert.equal(entry.payerEmail, "payer@example.com");
    assert.deepEqual(entry.metadata, XERO_METADATA);
  });

  it("refuses to build an entry that could not be found again", () => {
    assert.throws(
      () => buildPaymentLogEntry({ paymentIntentId: "", source: "xero" }),
      TypeError
    );
  });
});
