"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  validateBackfillPayload,
  backfillXeroInvoicesImpl,
} = require("../../../src/invoices/backfillXeroInvoices");

const DELETE = Symbol("delete");
const FieldValue = {
  serverTimestamp: () => "SERVER_TIME",
  delete: () => DELETE,
};

function millis(ms) {
  return { toMillis: () => ms };
}

/** Just enough Firestore for the backfill: one invoices collection plus the audit log. */
function fakeDb(invoices) {
  const store = new Map(Object.entries(invoices));
  const auditLogs = [];
  const apply = (id, patch) => {
    const next = { ...store.get(id) };
    for (const [key, value] of Object.entries(patch)) {
      if (value === DELETE) delete next[key];
      else next[key] = value;
    }
    store.set(id, next);
  };
  const refFor = (id) => ({
    id,
    update: async (patch) => apply(id, patch),
  });
  return {
    store,
    auditLogs,
    collection(name) {
      if (name === "adminAuditLogs") {
        return { add: async (entry) => (auditLogs.push(entry), { id: "audit-1" }) };
      }
      assert.equal(name, "invoices");
      return {
        where(field, op, value) {
          assert.deepEqual([field, op], ["status", "=="]);
          return {
            get: async () => ({
              docs: [...store.entries()]
                .filter(([, data]) => data.status === value)
                .map(([id, data]) => ({ id, ref: refFor(id), data: () => data })),
            }),
          };
        },
      };
    },
    async runTransaction(fn) {
      return fn({
        get: async (ref) => ({ data: () => store.get(ref.id) }),
        update: (ref, patch) => apply(ref.id, patch),
      });
    },
  };
}

function fakeXero({ existing = {}, failFor = new Set(), failEmail = false } = {}) {
  const calls = { created: [], emailed: [], looked: [] };
  return {
    calls,
    xeroInvoiceNumber: (id, data) => `INV-${data.invoiceNumber || id}`,
    findXeroInvoiceByNumber: async (number) => {
      calls.looked.push(number);
      return existing[number] ?? null;
    },
    createXeroInvoice: async (id) => {
      if (failFor.has(id)) throw new Error("Xero said no");
      calls.created.push(id);
      return `xero-${id}`;
    },
    emailXeroInvoice: async (xeroId) => {
      if (failEmail) throw new Error("mail down");
      calls.emailed.push(xeroId);
    },
  };
}

const actor = { uid: "admin-1", email: "admin@example.com", claims: { role: "admin" } };
const run = (db, xero, input = {}) =>
  backfillXeroInvoicesImpl({
    payload: validateBackfillPayload(input),
    actor,
    deps: { db, xero, FieldValue, clock: () => 1_000_000_000, sleep: async () => {}, pauseMs: 0 },
  });

const invoices = () => ({
  newer: { status: "unpaid", amountDue: 50, invoiceNumber: "N2", createdAt: millis(2000) },
  older: { status: "unpaid", amountDue: 40, invoiceNumber: "N1", createdAt: millis(1000) },
  synced: { status: "unpaid", amountDue: 30, xeroInvoiceId: "x-1", createdAt: millis(500) },
  paid: { status: "paid", amountDue: 20, createdAt: millis(100) },
});

describe("validateBackfillPayload", () => {
  it("defaults to a dry run that sends nothing", () => {
    assert.deepEqual(validateBackfillPayload(undefined), {
      dryRun: true,
      sendEmail: false,
      limit: 10,
    });
  });

  it("rejects values it cannot trust", () => {
    assert.throws(() => validateBackfillPayload({ dryRun: "false" }));
    assert.throws(() => validateBackfillPayload({ limit: 0 }));
    assert.throws(() => validateBackfillPayload({ limit: 31 }));
    assert.throws(() => validateBackfillPayload({ invoiceIds: [] }));
  });
});

describe("backfillXeroInvoicesImpl", () => {
  it("reports unpaid invoices without a Xero copy, oldest first, and writes nothing", async () => {
    const db = fakeDb(invoices());
    const xero = fakeXero();

    const summary = await run(db, xero);

    assert.equal(summary.dryRun, true);
    assert.equal(summary.matching, 2);
    assert.deepEqual(
      summary.results.map((r) => [r.invoiceId, r.outcome]),
      [["older", "would-create"], ["newer", "would-create"]]
    );
    assert.deepEqual(xero.calls, { created: [], emailed: [], looked: [] });
    assert.equal(db.store.get("older").xeroInvoiceId, undefined);
    assert.equal(db.auditLogs.length, 0);
  });

  it("creates the invoices, records the Xero id, and does not email by default", async () => {
    const db = fakeDb(invoices());
    const xero = fakeXero();

    const summary = await run(db, xero, { dryRun: false });

    assert.equal(summary.created, 2);
    assert.deepEqual(xero.calls.created, ["older", "newer"]);
    assert.deepEqual(xero.calls.emailed, []);
    assert.equal(db.store.get("older").xeroInvoiceId, "xero-older");
    assert.equal(db.store.get("older").xeroBackfillClaimedAt, undefined);
    assert.equal(db.store.get("paid").xeroInvoiceId, undefined);
    assert.equal(db.auditLogs.length, 1);
    assert.equal(db.auditLogs[0].action, "invoice.xero.backfill");
  });

  it("emails only the invoices it created, when asked", async () => {
    const db = fakeDb(invoices());
    const xero = fakeXero({ existing: { "INV-N1": "xero-already" } });

    const summary = await run(db, xero, { dryRun: false, sendEmail: true });

    assert.equal(summary.linkedExisting, 1);
    assert.equal(db.store.get("older").xeroInvoiceId, "xero-already");
    assert.deepEqual(xero.calls.created, ["newer"]);
    assert.deepEqual(xero.calls.emailed, ["xero-newer"]);
    assert.equal(db.store.get("newer").xeroBackfillEmailedAt, "SERVER_TIME");
  });

  it("keeps going after a failure and releases that invoice's claim", async () => {
    const db = fakeDb(invoices());
    const xero = fakeXero({ failFor: new Set(["older"]) });

    const summary = await run(db, xero, { dryRun: false });

    assert.equal(summary.failed, 1);
    assert.equal(summary.created, 1);
    assert.equal(db.store.get("older").xeroInvoiceId, undefined);
    assert.equal(db.store.get("older").xeroBackfillClaimedAt, undefined);
    assert.equal(db.store.get("newer").xeroInvoiceId, "xero-newer");
  });

  it("still counts an invoice as created when only its email fails", async () => {
    const db = fakeDb(invoices());
    const xero = fakeXero({ failEmail: true });

    const summary = await run(db, xero, { dryRun: false, sendEmail: true, limit: 1 });

    assert.equal(summary.created, 1);
    assert.equal(summary.emailed, 0);
    assert.equal(summary.remaining, 1);
    assert.equal(summary.results[0].emailError, "mail down");
    assert.equal(db.store.get("older").xeroInvoiceId, "xero-older");
  });

  it("sends an email that failed on an earlier run, once", async () => {
    const db = fakeDb(invoices());

    await run(db, fakeXero({ failEmail: true }), { dryRun: false, sendEmail: true });
    assert.equal(db.store.get("older").xeroBackfillEmailedAt, undefined);

    const retry = fakeXero();
    const second = await run(db, retry, { dryRun: false, sendEmail: true });

    assert.equal(second.emailRetried, 2);
    assert.equal(second.created, 0);
    assert.deepEqual(retry.calls.created, []);
    assert.deepEqual(retry.calls.emailed.sort(), ["xero-newer", "xero-older"]);
    assert.equal(db.store.get("older").xeroBackfillEmailedAt, "SERVER_TIME");

    const third = fakeXero();
    const last = await run(db, third, { dryRun: false, sendEmail: true });
    assert.equal(last.processed, 0);
    assert.deepEqual(third.calls.emailed, []);
  });

  it("emails invoices created earlier without email when asked later", async () => {
    const db = fakeDb(invoices());
    await run(db, fakeXero(), { dryRun: false });

    const dry = await run(db, fakeXero(), { sendEmail: true });
    assert.deepEqual(
      dry.results.map((r) => r.outcome),
      ["would-email", "would-email"]
    );

    const xero = fakeXero();
    const summary = await run(db, xero, { dryRun: false, sendEmail: true });
    assert.equal(summary.emailRetried, 2);
    assert.equal(xero.calls.emailed.length, 2);
  });

  it("never emails an invoice that already existed in Xero", async () => {
    const db = fakeDb(invoices());
    await run(db, fakeXero({ existing: { "INV-N1": "xero-already" } }), { dryRun: false });
    assert.equal(db.store.get("older").xeroBackfillCreated, undefined);

    const xero = fakeXero();
    await run(db, xero, { dryRun: false, sendEmail: true });

    assert.deepEqual(xero.calls.emailed, ["xero-newer"]);
  });

  it("leaves an invoice another run has claimed alone", async () => {
    const data = invoices();
    data.older.xeroBackfillClaimedAt = millis(1_000_000_000 - 60_000);
    const db = fakeDb(data);
    const xero = fakeXero();

    const summary = await run(db, xero, { dryRun: false, invoiceIds: ["older"] });

    assert.equal(summary.skipped, 1);
    assert.deepEqual(xero.calls.created, []);
  });

  it("takes over a claim that has expired", async () => {
    const data = invoices();
    data.older.xeroBackfillClaimedAt = millis(1_000_000_000 - 11 * 60_000);
    const db = fakeDb(data);
    const xero = fakeXero();

    const summary = await run(db, xero, { dryRun: false, invoiceIds: ["older"] });

    assert.equal(summary.created, 1);
  });
});
