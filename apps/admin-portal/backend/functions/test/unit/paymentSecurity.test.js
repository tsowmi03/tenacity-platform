"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { HttpsError } = require("firebase-functions/v2/https");
const {
  amountDueCents,
  loadValidatedInvoicesForPayment,
  normalizeInvoiceIds,
  paymentIntentParentId,
  requireParentOrAdmin,
} = require("../../src/payments/paymentSecurity");

function fakeDb(docs = {}) {
  return {
    collection(name) {
      return {
        doc(id) {
          return {
            async get() {
              const key = `${name}/${id}`;
              if (!(key in docs)) return { exists: false };
              return { exists: true, data: () => docs[key] };
            },
          };
        },
      };
    },
  };
}

describe("payment security helpers", () => {
  it("requires a signed-in parent or admin actor", async () => {
    const db = fakeDb({
      "users/admin-1": { role: "admin" },
      "users/tutor-1": { role: "tutor" },
    });

    assert.deepEqual(
      await requireParentOrAdmin({ auth: { uid: "parent-1", token: {} } }, "parent-1", db),
      { uid: "parent-1", role: "parent" }
    );
    assert.deepEqual(
      await requireParentOrAdmin({ auth: { uid: "admin-1", token: {} } }, "parent-1", db),
      { uid: "admin-1", role: "admin" }
    );

    await assert.rejects(
      () => requireParentOrAdmin({}, "parent-1", db),
      (err) => err instanceof HttpsError && err.code === "unauthenticated"
    );
    await assert.rejects(
      () => requireParentOrAdmin({ auth: { uid: "tutor-1", token: {} } }, "parent-1", db),
      (err) => err instanceof HttpsError && err.code === "permission-denied"
    );
  });

  it("normalizes invoice IDs and rejects duplicates", () => {
    assert.deepEqual(normalizeInvoiceIds([" b ", "a"]), ["a", "b"]);
    assert.throws(() => normalizeInvoiceIds([]), /Missing or invalid invoiceIds/);
    assert.throws(() => normalizeInvoiceIds(["a", "a"]), /Invalid invoiceIds/);
  });

  it("converts invoice dollars to cents", () => {
    assert.equal(amountDueCents({ amountDue: 12.34 }), 1234);
    assert.throws(() => amountDueCents({ amountDue: 0 }), /Invoice has no payable amount/);
  });

  it("validates all invoices belong to the parent and match the requested amount", async () => {
    const db = fakeDb({
      "invoices/inv-1": { parentId: "parent-1", amountDue: 10, status: "unpaid" },
      "invoices/inv-2": { parentId: "parent-1", amountDue: 15.5, status: "unpaid" },
      "invoices/inv-3": { parentId: "parent-2", amountDue: 9, status: "unpaid" },
    });

    const out = await loadValidatedInvoicesForPayment({
      db,
      invoiceIds: ["inv-2", "inv-1"],
      parentId: "parent-1",
      amount: 2550,
    });

    assert.deepEqual(out.invoiceIds, ["inv-1", "inv-2"]);
    assert.equal(out.expectedAmountCents, 2550);

    await assert.rejects(
      () =>
        loadValidatedInvoicesForPayment({
          db,
          invoiceIds: ["inv-1", "inv-3"],
          parentId: "parent-1",
          amount: 1900,
        }),
      (err) => err instanceof HttpsError && err.code === "permission-denied"
    );
    await assert.rejects(
      () =>
        loadValidatedInvoicesForPayment({
          db,
          invoiceIds: ["inv-1"],
          parentId: "parent-1",
          amount: 1,
        }),
      (err) => err instanceof HttpsError && err.code === "invalid-argument"
    );
  });

  it("extracts parent metadata from payment intents", () => {
    assert.equal(paymentIntentParentId({ metadata: { parentId: "parent-1" } }), "parent-1");
    assert.equal(paymentIntentParentId({ metadata: {} }), null);
  });
});
