"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  EVENTS,
  enrolmentCreatedFromIntake,
  eventFromAuditEntry,
  eventUuid,
  paymentFromInvoice,
  paymentFromPaymentLog,
  personPropertiesChanged,
  personPropertiesForUser,
} = require("../../src/analytics/businessEvents");
const { captureMessage, sendToPostHog } = require("../../src/analytics/serverAnalytics");
const { auditLogEventImpl } = require("../../src/analytics/triggers");

const WHEN = new Date("2026-10-01T05:00:00Z");
const ts = (date) => ({ toDate: () => date });

function fakeDb({ students = {}, enrolments = {}, enrolledIn = {} } = {}) {
  return {
    collection(name) {
      const docs = name === "students" ? students : enrolments;
      return {
        doc: (id) => ({
          async get() {
            return { exists: id in docs, data: () => docs[id] };
          },
        }),
        where: (_field, _op, studentId) => ({
          limit: () => ({
            async get() {
              return { empty: !enrolledIn[studentId] };
            },
          }),
        }),
      };
    },
  };
}

describe("eventUuid", () => {
  it("is stable for the same key and differs between keys", () => {
    assert.equal(eventUuid("a"), eventUuid("a"));
    assert.notEqual(eventUuid("a"), eventUuid("b"));
    assert.match(eventUuid("a"), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("personPropertiesForUser", () => {
  it("gives parents, tutors and admins a readable name, email and role", () => {
    const props = personPropertiesForUser({
      firstName: "Sam",
      lastName: "Lee",
      email: "sam@example.com",
      phone: "0400000000",
      role: "parent",
      students: ["s1", "s2"],
    });
    assert.deepEqual(props, {
      name: "Sam Lee",
      first_name: "Sam",
      last_name: "Lee",
      email: "sam@example.com",
      role: "parent",
      student_count: 2,
    });
    assert.equal(personPropertiesForUser({ role: "tutor", email: "t@example.com" }).name, "t@example.com");
  });

  it("ignores other roles and never sends a phone number", () => {
    assert.equal(personPropertiesForUser({ role: "student" }), null);
    assert.equal(personPropertiesForUser(null), null);
    const props = personPropertiesForUser({ role: "admin", phone: "1", firstName: "A" });
    assert.equal("phone" in props, false);
  });

  it("only reports a change when something PostHog shows changed", () => {
    const user = { role: "parent", firstName: "Sam", email: "s@example.com", students: [] };
    assert.equal(personPropertiesChanged(user, { ...user, fcmTokens: ["x"] }), false);
    assert.equal(personPropertiesChanged(user, { ...user, lastName: "Lee" }), true);
    assert.equal(personPropertiesChanged(null, user), true);
    assert.equal(personPropertiesChanged(user, null), false);
  });
});

describe("enrolmentCreatedFromIntake", () => {
  it("attributes the intake to the parent and records first-touch facts once", () => {
    const evt = enrolmentCreatedFromIntake({
      enrolmentId: "e1",
      enrolment: {
        referralSource: "instagram",
        registrationGroupId: "g1",
        referralCode: "ABC",
        studentYear: "Year 7",
        studentSubjects: ["Maths"],
      },
      parentId: "p1",
      studentId: "s1",
      classIds: ["c1", "c2"],
      newParent: true,
      acceptedAt: ts(WHEN),
      actorRole: "admin",
    });
    assert.equal(evt.event, EVENTS.ENROLMENT_CREATED);
    assert.equal(evt.distinctId, "p1");
    assert.equal(evt.properties.enrolment_type, "intake");
    assert.equal(evt.properties.class_count, 2);
    assert.equal(evt.properties.referral_source, "instagram");
    assert.deepEqual(evt.setOnce, {
      referral_source: "instagram",
      registration_group_id: "g1",
      acquired_via_referral_link: true,
      first_enrolled_at: WHEN.toISOString(),
    });
    // The backfill builds the same event from the enrolment doc alone.
    const fromDoc = enrolmentCreatedFromIntake({
      enrolmentId: "e1",
      enrolment: { createdParentId: "p1", acceptedAt: ts(WHEN) },
    });
    assert.equal(fromDoc.uuid, evt.uuid);
  });

  it("skips an enrolment with no parent or acceptance time", () => {
    assert.equal(enrolmentCreatedFromIntake({ enrolmentId: "e1", enrolment: {} }), null);
  });
});

describe("eventFromAuditEntry", () => {
  const entry = (action, payloadSummary, extra = {}) => ({
    action,
    payloadSummary,
    createdAt: ts(WHEN),
    actorUid: "admin-1",
    actorRole: "admin",
    targetId: "c9",
    ...extra,
  });

  it("maps a permanent swap and a one-week swap", () => {
    const permanent = eventFromAuditEntry(
      entry("class.reschedule", { studentId: "s1", oldClassId: "c1", newClassId: "c2", mode: "permanent" }),
      "log1"
    );
    assert.equal(permanent.event, EVENTS.SWAP_PROCESSED);
    assert.equal(permanent.properties.mode, "permanent");
    assert.equal(permanent.studentId, "s1");
    assert.equal(permanent.parentId, null);
    const week = eventFromAuditEntry(entry("class.reschedule", { studentId: "s1" }), "log2");
    assert.equal(week.properties.mode, "one_week");
  });

  it("attributes a parent's own action to the parent", () => {
    const evt = eventFromAuditEntry(
      entry("class.reschedule", { studentId: "s1" }, { actorUid: "p1", actorRole: "parent" }),
      "log3"
    );
    assert.equal(evt.parentId, "p1");
  });

  it("maps class adds and removals to enrolment events", () => {
    assert.equal(
      eventFromAuditEntry(entry("class.enrol_permanent", { studentId: "s1", classId: "c1" }), "l").properties.enrolment_type,
      "class_added"
    );
    const removed = eventFromAuditEntry(entry("class.unenrol_permanent", { studentId: "s1", classId: "c1" }), "l");
    assert.equal(removed.event, EVENTS.ENROLMENT_CANCELLED);
    assert.equal(removed.properties.reason, "class_removed");
  });

  it("treats a removed student as churn and keeps the parent it recorded", () => {
    const evt = eventFromAuditEntry(
      entry("student.unenrol", { parentId: "p1", classIds: ["c1", "c2"] }, { targetId: "s1" }),
      "log4"
    );
    assert.equal(evt.event, EVENTS.ENROLMENT_CANCELLED);
    assert.equal(evt.parentId, "p1");
    assert.equal(evt.properties.student_still_enrolled, false);
    assert.equal(evt.properties.class_count, 2);
  });

  it("keys every audit event by its log entry, so a resend overwrites it", () => {
    const swap = eventFromAuditEntry(entry("class.reschedule", { studentId: "s1" }), "log9");
    assert.equal(swap.uuid, eventUuid("audit:log9"));
    const removed = eventFromAuditEntry(entry("class.unenrol_permanent", { studentId: "s1" }), "log9");
    assert.equal(removed.uuid, eventUuid("audit:log9"));
  });

  it("ignores audit actions that aren't business events", () => {
    assert.equal(eventFromAuditEntry(entry("report.generate", {}), "l"), null);
    assert.equal(eventFromAuditEntry(entry("enrolment.accept", {}), "l"), null);
  });
});

describe("paymentFromInvoice", () => {
  const unpaid = { status: "unpaid", amountDue: 240, parentId: "p1" };

  it("records an invoice turning paid with the amount that was due", () => {
    const evt = paymentFromInvoice({
      invoiceId: "i1",
      before: unpaid,
      after: {
        ...unpaid,
        status: "paid",
        amountDue: 0,
        paidAt: ts(WHEN),
        dueDate: ts(new Date("2026-09-28T05:00:00Z")),
        stripePaymentIntentId: "pi_1",
        studentIds: ["s1"],
      },
    });
    assert.equal(evt.event, EVENTS.PAYMENT_RECEIVED);
    assert.equal(evt.distinctId, "p1");
    assert.equal(evt.properties.amount, 240);
    assert.equal(evt.properties.method, "stripe");
    assert.equal(evt.properties.days_after_due, 3);
  });

  it("ignores writes that don't make an invoice paid", () => {
    assert.equal(paymentFromInvoice({ invoiceId: "i1", before: unpaid, after: unpaid }), null);
    const paid = { ...unpaid, status: "paid", paidAt: ts(WHEN) };
    assert.equal(paymentFromInvoice({ invoiceId: "i1", before: paid, after: paid }), null);
  });

  it("builds the same event in the backfill, from a paid invoice alone", () => {
    const after = { ...unpaid, status: "paid", paidAt: ts(WHEN) };
    const live = paymentFromInvoice({ invoiceId: "i1", before: unpaid, after });
    const backfill = paymentFromInvoice({ invoiceId: "i1", before: null, after });
    assert.equal(backfill.uuid, live.uuid);
    assert.equal(backfill.properties.method, "manual");
    assert.equal(backfill.properties.paid_at_estimated, false);
  });

  it("falls back to the given time, flagged, when the invoice never recorded one", () => {
    const due = new Date("2026-03-01T00:00:00Z");
    const evt = paymentFromInvoice({
      invoiceId: "old",
      before: null,
      after: { status: "paid", parentId: "p1", amountDue: 0, amountDueComputed: 200, dueDate: ts(due) },
      fallbackTime: ts(due),
    });
    assert.equal(evt.timestamp.getTime(), due.getTime());
    assert.equal(evt.properties.paid_at_estimated, true);
    assert.equal(evt.properties.days_after_due, null);
    assert.equal(evt.properties.amount, 200);
  });
});

describe("paymentFromPaymentLog", () => {
  const log = (status, source, extra = {}) => ({
    status,
    source,
    amount: 45,
    currency: "aud",
    paidAt: ts(WHEN),
    metadata: { parentId: "p1" },
    ...extra,
  });

  it("records one-off booking payments", () => {
    const evt = paymentFromPaymentLog({ paymentIntentId: "pi_1", before: null, after: log("succeeded", "one_off_booking") });
    assert.equal(evt.event, EVENTS.PAYMENT_RECEIVED);
    assert.equal(evt.properties.kind, "one_off_booking");
  });

  it("leaves invoice payments to the invoice trigger", () => {
    assert.equal(paymentFromPaymentLog({ paymentIntentId: "pi_1", before: null, after: log("succeeded", "app") }), null);
  });

  it("records failures once", () => {
    const failed = log("failed", "app", { paidAt: null, processedAt: ts(WHEN), error: "card_declined" });
    const evt = paymentFromPaymentLog({ paymentIntentId: "pi_2", before: null, after: failed });
    assert.equal(evt.event, EVENTS.PAYMENT_FAILED);
    assert.equal(evt.properties.error, "card_declined");
    assert.equal(paymentFromPaymentLog({ paymentIntentId: "pi_2", before: failed, after: failed }), null);
  });
});

describe("auditLogEventImpl", () => {
  it("finds the parent through the student and flags full churn", async () => {
    const db = fakeDb({ students: { s1: { parents: ["p2"], primaryParentId: "p1" } } });
    const evt = await auditLogEventImpl({
      db,
      logId: "l1",
      entry: {
        action: "class.unenrol_permanent",
        actorRole: "admin",
        actorUid: "a1",
        createdAt: ts(WHEN),
        payloadSummary: { studentId: "s1", classId: "c1" },
      },
    });
    assert.equal(evt.distinctId, "p1");
    assert.equal(evt.properties.student_still_enrolled, false);
  });

  it("reads the enrolment doc for an accepted intake", async () => {
    const db = fakeDb({ enrolments: { e1: { referralSource: "google" } } });
    const evt = await auditLogEventImpl({
      db,
      logId: "l2",
      entry: {
        action: "enrolment.accept",
        targetId: "e1",
        actorRole: "admin",
        createdAt: ts(WHEN),
        payloadSummary: { parentId: "p1", studentId: "s1", classIds: ["c1"] },
      },
    });
    assert.equal(evt.distinctId, "p1");
    assert.equal(evt.setOnce.referral_source, "google");
  });

  it("dates a live intake by the enrolment's acceptedAt, as the backfill does", async () => {
    const accepted = new Date("2026-09-30T01:00:00Z");
    const db = fakeDb({ enrolments: { e1: { acceptedAt: ts(accepted), createdParentId: "p1" } } });
    const live = await auditLogEventImpl({
      db,
      logId: "l5",
      entry: {
        action: "enrolment.accept",
        targetId: "e1",
        createdAt: ts(WHEN),
        payloadSummary: { parentId: "p1", classIds: ["c1"] },
      },
    });
    const backfill = enrolmentCreatedFromIntake({
      enrolmentId: "e1",
      enrolment: { acceptedAt: ts(accepted), createdParentId: "p1" },
    });
    assert.equal(live.timestamp.getTime(), accepted.getTime());
    assert.equal(live.timestamp.getTime(), backfill.timestamp.getTime());
    assert.equal(live.uuid, backfill.uuid);
  });

  it("skips an event whose family can't be found", async () => {
    const evt = await auditLogEventImpl({
      db: fakeDb(),
      logId: "l3",
      entry: { action: "class.reschedule", createdAt: ts(WHEN), payloadSummary: { studentId: "gone" } },
    });
    assert.equal(evt, null);
  });
});

describe("sendToPostHog", () => {
  it("does nothing when the project has no token", async () => {
    const result = await sendToPostHog({ events: [{}] }, { createClient: () => null });
    assert.deepEqual(result, { events: 0, people: 0, disabled: true });
  });

  it("sends people and events, then flushes", async () => {
    const calls = { identify: [], capture: [], shutdowns: 0 };
    const client = {
      identify: (m) => calls.identify.push(m),
      capture: (m) => calls.capture.push(m),
      async shutdown() {
        calls.shutdowns += 1;
      },
    };
    const evt = {
      event: "payment_received",
      distinctId: "p1",
      timestamp: WHEN,
      uuid: "u",
      properties: { amount: 1 },
      setOnce: { referral_source: "x" },
    };
    const result = await sendToPostHog(
      { events: [evt], people: [{ distinctId: "p1", properties: { name: "Sam" } }] },
      { createClient: () => client }
    );
    assert.deepEqual(result, { events: 1, people: 1 });
    assert.equal(calls.shutdowns, 1);
    assert.deepEqual(calls.capture[0], captureMessage(evt));
    assert.deepEqual(calls.capture[0].properties.$set_once, { referral_source: "x" });
    assert.equal(calls.capture[0].properties.source, "server");
  });

  it("never throws when the client does", async () => {
    const client = {
      capture() {
        throw new Error("boom");
      },
      async shutdown() {},
    };
    const result = await sendToPostHog({ events: [{}] }, { createClient: () => client, logger: {} });
    assert.equal(result.events, 0);
  });
});

describe("analyticsEnvironment", () => {
  const { analyticsEnvironment } = require("../../src/shared/posthogClient");

  it("tags staging so dashboards can filter it out of the shared project", () => {
    assert.equal(analyticsEnvironment("tenacity-tutoring-staging"), "staging");
    assert.equal(analyticsEnvironment("tenacity-tutoring-b8eb2"), "production");
    assert.equal(analyticsEnvironment(""), "production");
  });

  it("puts the environment on every server event", () => {
    const msg = captureMessage({ event: "x", distinctId: "p", properties: {} }, "staging");
    assert.equal(msg.properties.environment, "staging");
  });
});
