"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

require("firebase-admin");

const {
  announcementIsParentVisible,
  mapWithConcurrency,
  resolveParentRecipients,
  sendParentEmailBlastImpl,
  validateSendPayload,
} = require("../../src/email/parentEmailBlast");
const { renderWeeklyUpdateEmail } = require("../../src/email/weeklyUpdateEmail");
const {
  unsubscribeTokenFor,
  unsubscribeOneClickUrlFor,
  unsubscribePageUrlFor,
  uidFromUnsubscribeToken,
} = require("../../src/email/unsubscribeToken");

const SECRET = "test-unsubscribe-secret";
const clock = () => new Date("2026-08-06T00:00:00Z");

/**
 * Minimal in-memory Firestore covering the reads and writes this module makes:
 * doc get/update, a single equality query, and transactions.
 */
function makeDb(seed = {}) {
  const store = new Map(Object.entries(seed).map(([key, value]) => [key, { ...value }]));
  const added = [];

  const snapshotFor = (path) => {
    const [, id] = path.split("/");
    const data = store.get(path);
    return {
      id,
      exists: data !== undefined,
      data: () => (data === undefined ? undefined : { ...data }),
    };
  };

  const docRef = (collection, id) => ({
    id,
    path: `${collection}/${id}`,
    async get() {
      return snapshotFor(`${collection}/${id}`);
    },
    async update(patch) {
      const path = `${collection}/${id}`;
      if (!store.has(path)) throw new Error(`missing doc ${path}`);
      store.set(path, { ...store.get(path), ...patch });
    },
  });

  return {
    store,
    added,
    collection(name) {
      return {
        doc: (id) => docRef(name, id),
        async add(data) {
          added.push({ collection: name, data });
          return { id: `auto-${added.length}` };
        },
        where(field, op, value) {
          assert.equal(op, "==");
          return {
            async get() {
              const docs = [];
              for (const [path, data] of store.entries()) {
                const [collectionName, id] = path.split("/");
                if (collectionName === name && data[field] === value) {
                  docs.push({ id, data: () => ({ ...data }) });
                }
              }
              return { docs, empty: docs.length === 0 };
            },
          };
        },
      };
    },
    async runTransaction(fn) {
      return fn({
        get: (ref) => Promise.resolve(snapshotFor(ref.path)),
        update: (ref, patch) => {
          store.set(ref.path, { ...store.get(ref.path), ...patch });
        },
      });
    },
  };
}

function seedForSend(overrides = {}) {
  return {
    "parentEmailBlasts/blast-1": {
      subject: "Week of 4 August",
      intro: "Hi parents",
      announcementIds: ["ann-live", "ann-archived", "ann-tutor"],
      sections: [{ title: "Fee reminder", body: "Invoices due Friday" }],
      status: "draft",
      ...overrides,
    },
    "announcements/ann-live": {
      title: "Timetable change",
      body: "Tuesday moves to 5pm",
      audience: "parent",
      archived: false,
    },
    "announcements/ann-archived": {
      title: "Withdrawn notice",
      body: "Ignore me",
      audience: "all",
      archived: true,
    },
    "announcements/ann-tutor": {
      title: "Tutor PD",
      body: "Staff only",
      audience: "tutor",
      archived: false,
    },
    "users/parent-1": { role: "parent", email: "a@example.com", firstName: "Ann" },
    "users/parent-2": { role: "parent", email: "b@example.com", firstName: "Ben" },
    "users/parent-3": { role: "parent", email: "c@example.com", emailBlastOptOut: true },
    "users/parent-4": { role: "parent", email: "" },
    "users/tutor-1": { role: "tutor", email: "t@example.com" },
  };
}

function recordingSender() {
  const sent = [];
  return {
    sent,
    send: async (message) => {
      sent.push(message);
    },
  };
}

describe("validateSendPayload", () => {
  it("requires a blastId", () => {
    assert.throws(() => validateSendPayload({}), /blastId/);
  });

  it("accepts a bare blastId", () => {
    assert.deepEqual(validateSendPayload({ blastId: "abc" }), {
      blastId: "abc",
      testEmails: null,
    });
  });

  it("normalises test recipients and rejects invalid ones", () => {
    assert.deepEqual(
      validateSendPayload({ blastId: "abc", testEmails: ["Admin@Example.com"] }),
      { blastId: "abc", testEmails: ["admin@example.com"] }
    );
    assert.throws(
      () => validateSendPayload({ blastId: "abc", testEmails: ["nope"] }),
      /valid email/
    );
  });

  it("caps the number of test recipients", () => {
    const many = ["a@x.com", "b@x.com", "c@x.com", "d@x.com", "e@x.com", "f@x.com"];
    assert.throws(
      () => validateSendPayload({ blastId: "abc", testEmails: many }),
      /at most 5/
    );
  });
});

describe("resolveParentRecipients", () => {
  it("drops opt-outs and unusable addresses, and dedupes shared inboxes", () => {
    const { recipients, optedOut, unusable } = resolveParentRecipients([
      { id: "p1", data: { email: "Shared@Example.com", firstName: "Ann" } },
      { id: "p2", data: { email: "shared@example.com", firstName: "Ben" } },
      { id: "p3", data: { email: "opted@example.com", emailBlastOptOut: true } },
      { id: "p4", data: { email: "not-an-email" } },
      { id: "p5", data: {} },
    ]);

    assert.deepEqual(
      recipients.map((r) => r.email),
      ["shared@example.com"]
    );
    assert.equal(recipients[0].uid, "p1");
    assert.equal(optedOut, 1);
    assert.equal(unusable, 2);
  });
});

describe("announcementIsParentVisible", () => {
  it("accepts parent and all, rejects archived and staff audiences", () => {
    assert.equal(announcementIsParentVisible({ audience: "parent" }), true);
    assert.equal(announcementIsParentVisible({ audience: "all" }), true);
    assert.equal(announcementIsParentVisible({ audience: "tutor" }), false);
    assert.equal(announcementIsParentVisible({ audience: "admin" }), false);
    assert.equal(
      announcementIsParentVisible({ audience: "all", archived: true }),
      false
    );
  });
});

describe("mapWithConcurrency", () => {
  it("preserves order and respects the limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return value * 2;
    });
    assert.deepEqual(results, [2, 4, 6, 8, 10]);
    assert.ok(peak <= 2, `expected at most 2 in flight, saw ${peak}`);
  });
});

describe("renderWeeklyUpdateEmail", () => {
  it("escapes author content and includes the unsubscribe link", () => {
    const { html, text } = renderWeeklyUpdateEmail({
      subject: "Week of 4 August",
      intro: "Hi <parents> & friends",
      announcements: [{ title: "Timetable", body: "Line one\nLine two" }],
      sections: [{ title: "Fees", body: "Due Friday" }],
      unsubscribeUrl: "https://example.com/unsubscribe?token=abc",
    });

    assert.ok(html.includes("Hi &lt;parents&gt; &amp; friends"));
    assert.ok(!html.includes("<parents>"));
    assert.ok(html.includes("Line one<br />Line two"));
    assert.ok(html.includes("https://example.com/unsubscribe?token=abc"));
    assert.ok(text.includes("Unsubscribe from weekly updates:"));
  });

  it("omits the announcements heading when none are selected", () => {
    const { html } = renderWeeklyUpdateEmail({
      subject: "Note",
      intro: "Just a note",
      unsubscribeUrl: "https://example.com/u",
    });
    assert.ok(!html.includes("This week's announcements"));
  });
});

describe("unsubscribe tokens", () => {
  it("round-trips a uid", () => {
    const token = unsubscribeTokenFor("user-1", SECRET);
    assert.equal(uidFromUnsubscribeToken(token, SECRET), "user-1");
  });

  it("rejects tampering, wrong secrets and junk", () => {
    const token = unsubscribeTokenFor("user-1", SECRET);
    assert.equal(uidFromUnsubscribeToken(`user-2.${token.split(".")[1]}`, SECRET), null);
    assert.equal(uidFromUnsubscribeToken(token, "other-secret"), null);
    assert.equal(uidFromUnsubscribeToken("garbage", SECRET), null);
    assert.equal(uidFromUnsubscribeToken("", SECRET), null);
    assert.equal(uidFromUnsubscribeToken(token, ""), null);
  });

  it("builds page and one-click urls against the given origin", () => {
    assert.ok(
      unsubscribePageUrlFor("user-1", SECRET, "https://site.test/").startsWith(
        "https://site.test/unsubscribe?token=user-1."
      )
    );
    // RFC 8058 one-click POSTs, so the header must point at the API route.
    assert.ok(
      unsubscribeOneClickUrlFor("user-1", SECRET, "https://site.test").startsWith(
        "https://site.test/api/unsubscribe?token=user-1."
      )
    );
  });
});

describe("sendParentEmailBlastImpl", () => {
  const actor = { uid: "admin-1", email: "admin@example.com" };

  it("mails eligible parents, records stats and writes an audit log", async () => {
    const db = makeDb(seedForSend());
    const sender = recordingSender();

    const result = await sendParentEmailBlastImpl({
      payload: { blastId: "blast-1", testEmails: null },
      actor,
      deps: { db, sendEmail: sender.send, secret: SECRET, clock },
    });

    assert.equal(result.recipientCount, 2);
    assert.equal(result.successCount, 2);
    assert.equal(result.failureCount, 0);
    assert.equal(result.optedOutCount, 1);
    assert.equal(result.announcementCount, 1);

    assert.deepEqual(
      sender.sent.map((message) => message.to).sort(),
      ["a@example.com", "b@example.com"]
    );
    const [first] = sender.sent;
    assert.equal(first.from, "no-reply@tenacitytutoring.com");
    assert.ok(first.headers["List-Unsubscribe"].includes("/api/unsubscribe?token="));
    assert.equal(first.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    assert.ok(first.html.includes("/unsubscribe?token="));
    assert.ok(first.html.includes("Timetable change"));
    assert.ok(first.html.includes("Fee reminder"));
    // Archived and tutor-only announcements never reach a parent.
    assert.ok(!first.html.includes("Withdrawn notice"));
    assert.ok(!first.html.includes("Tutor PD"));

    const blast = db.store.get("parentEmailBlasts/blast-1");
    assert.equal(blast.status, "sent");
    assert.equal(blast.successCount, 2);
    assert.equal(blast.sentBy, "admin-1");
    assert.deepEqual(
      blast.announcementSnapshots.map((item) => item.id),
      ["ann-live"]
    );

    assert.equal(db.added.length, 1);
    assert.equal(db.added[0].collection, "adminAuditLogs");
    assert.equal(db.added[0].data.action, "parentEmailBlast.send");
    assert.equal(db.added[0].data.payloadSummary.recipientCount, 2);
  });

  it("gives each recipient their own unsubscribe link", async () => {
    const db = makeDb(seedForSend());
    const sender = recordingSender();

    await sendParentEmailBlastImpl({
      payload: { blastId: "blast-1", testEmails: null },
      actor,
      deps: { db, sendEmail: sender.send, secret: SECRET, clock },
    });

    const links = sender.sent.map((message) => message.headers["List-Unsubscribe"]);
    assert.equal(new Set(links).size, 2);
  });

  it("counts per-recipient failures without failing the whole send", async () => {
    const db = makeDb(seedForSend());
    const sendEmail = async (message) => {
      if (message.to === "b@example.com") throw new Error("bounced");
    };

    const result = await sendParentEmailBlastImpl({
      payload: { blastId: "blast-1", testEmails: null },
      actor,
      deps: { db, sendEmail, secret: SECRET, clock },
    });

    assert.equal(result.successCount, 1);
    assert.equal(result.failureCount, 1);
    assert.equal(db.store.get("parentEmailBlasts/blast-1").status, "sent");
  });

  it("marks the blast failed when every recipient fails", async () => {
    const db = makeDb(seedForSend());
    const sendEmail = async () => {
      throw new Error("sendgrid down");
    };

    const result = await sendParentEmailBlastImpl({
      payload: { blastId: "blast-1", testEmails: null },
      actor,
      deps: { db, sendEmail, secret: SECRET, clock },
    });

    assert.equal(result.successCount, 0);
    assert.equal(db.store.get("parentEmailBlasts/blast-1").status, "failed");
  });

  it("refuses to send a blast that already went out", async () => {
    const db = makeDb(seedForSend({ status: "sent" }));
    const sender = recordingSender();

    await assert.rejects(
      sendParentEmailBlastImpl({
        payload: { blastId: "blast-1", testEmails: null },
        actor,
        deps: { db, sendEmail: sender.send, secret: SECRET, clock },
      }),
      /already been sent/
    );
    assert.equal(sender.sent.length, 0);
  });

  it("refuses to send a blast that is mid-send", async () => {
    const db = makeDb(seedForSend({ status: "sending" }));
    await assert.rejects(
      sendParentEmailBlastImpl({
        payload: { blastId: "blast-1", testEmails: null },
        actor,
        deps: { db, sendEmail: async () => {}, secret: SECRET, clock },
      }),
      /already being sent/
    );
  });

  it("keeps a test send out of the parent list and leaves the draft alone", async () => {
    const db = makeDb(seedForSend());
    const sender = recordingSender();

    const result = await sendParentEmailBlastImpl({
      payload: { blastId: "blast-1", testEmails: ["qa@example.com"] },
      actor,
      deps: { db, sendEmail: sender.send, secret: SECRET, clock },
    });

    assert.equal(result.test, true);
    assert.deepEqual(
      sender.sent.map((message) => message.to),
      ["qa@example.com"]
    );
    const blast = db.store.get("parentEmailBlasts/blast-1");
    assert.equal(blast.status, "draft");
    assert.equal(blast.lastTestRecipientCount, 1);
    assert.equal(db.added.length, 0);
  });

  it("rejects an empty blast and releases the draft", async () => {
    const db = makeDb(
      seedForSend({ intro: "  ", announcementIds: [], sections: [] })
    );
    await assert.rejects(
      sendParentEmailBlastImpl({
        payload: { blastId: "blast-1", testEmails: null },
        actor,
        deps: { db, sendEmail: async () => {}, secret: SECRET, clock },
      }),
      /Add an intro/
    );
    assert.equal(db.store.get("parentEmailBlasts/blast-1").status, "failed");
  });

  it("requires the unsubscribe secret", async () => {
    const db = makeDb(seedForSend());
    await assert.rejects(
      sendParentEmailBlastImpl({
        payload: { blastId: "blast-1", testEmails: null },
        actor,
        deps: { db, sendEmail: async () => {}, secret: "", clock },
      }),
      /EMAIL_BLAST_UNSUBSCRIBE_SECRET/
    );
  });

  it("fails clearly when the draft is gone", async () => {
    const db = makeDb({});
    await assert.rejects(
      sendParentEmailBlastImpl({
        payload: { blastId: "missing", testEmails: null },
        actor,
        deps: { db, sendEmail: async () => {}, secret: SECRET, clock },
      }),
      /no longer exists/
    );
  });
});
