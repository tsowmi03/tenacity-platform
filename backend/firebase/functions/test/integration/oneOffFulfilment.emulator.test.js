"use strict";

const { describe, it, before, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const { enrolOneOffStudentsImpl } = require("../../src/attendance/enrolOneOffStudents");
const {
  FULFILMENT_COLLECTION,
  fulfilOneOffBookingImpl,
} = require("../../src/payments/fulfilOneOffBooking");
const { encodeBookingMetadata } = require("../../src/payments/oneOffBookingMetadata");
const { FULFILMENT_STATE } = require("../../src/payments/oneOffFulfilmentState");
const { getAdmin, clearCollection, clearCollectionGroup } = require("../helpers/emulator");

const CLASS_ID = "class-1";
const ATTENDANCE_ID = "2026-08-10";
const PARENT_ID = "parent-1";

const silentLogger = { info() {}, warn() {}, error() {} };

/** A Stripe PaymentIntent, only as much of one as fulfilment reads. */
function paymentIntent({
  id = "pi_test_1",
  studentIds = ["student-1"],
  unitPriceCents = 7000,
} = {}) {
  return {
    id,
    receipt_email: "parent@example.com",
    metadata: {
      parentId: PARENT_ID,
      parentEmail: "parent@example.com",
      parentName: "Pat Parent",
      invoiceIds: "",
      paymentType: "one_off_booking",
      source: "tenacity_tutoring",
      ...encodeBookingMetadata({
        classId: CLASS_ID,
        attendanceDocId: ATTENDANCE_ID,
        studentIds,
        unitPriceCents,
      }),
    },
  };
}

/** A Stripe stand-in that records refunds instead of issuing them. */
function fakeStripe({ failRefunds = false, existingRefunds = [] } = {}) {
  const refunds = [];
  return {
    refunds: {
      list: async () => ({ data: existingRefunds }),
      create: async (params, options) => {
        refunds.push({ params, options });
        if (failRefunds) throw new Error("refund failed");
        return { id: `re_${refunds.length}` };
      },
    },
    recordedRefunds: refunds,
  };
}

describe("one-off fulfilment (emulator)", () => {
  let db;

  before(() => {
    ({ db } = getAdmin());
  });

  beforeEach(async () => {
    await clearCollectionGroup(db, "attendance");
    for (const name of [
      "classes",
      "students",
      "users",
      "invoices",
      "counters",
      "invoiceCreateRequests",
      FULFILMENT_COLLECTION,
      'oneOffHolds',
    ]) {
      await clearCollection(db, name);
    }

    await db.collection("users").doc(PARENT_ID).set({
      firstName: "Pat",
      lastName: "Parent",
      email: "parent@example.com",
      role: "parent",
    });
    for (const id of ["student-1", "student-2", "student-3"]) {
      await db.collection("students").doc(id).set({
        firstName: id,
        lastName: "Parent",
        parents: [PARENT_ID],
      });
    }
    await db.collection("classes").doc(CLASS_ID).set({
      capacity: 3,
      day: "Monday",
      startTime: "16:00",
      type: "Maths",
      enrolledStudents: [],
    });
    await db
      .collection("classes")
      .doc(CLASS_ID)
      .collection("attendance")
      .doc(ATTENDANCE_ID)
      .set({
        attendance: ["other-1"],
        date: new Date("2099-08-10T06:00:00.000Z"),
      });
  });

  async function attendanceNow() {
    const snap = await db
      .collection("classes")
      .doc(CLASS_ID)
      .collection("attendance")
      .doc(ATTENDANCE_ID)
      .get();
    return snap.data().attendance;
  }

  describe("enrolOneOffStudentsImpl", () => {
    it("enrols students into the session", async () => {
      const result = await enrolOneOffStudentsImpl({
        db,
        classId: CLASS_ID,
        attendanceDocId: ATTENDANCE_ID,
        studentIds: ["student-1", "student-2"],
        actor: { uid: "system" },
      });

      assert.equal(result.ok, true);
      assert.deepEqual(result.enrolled, ["student-1", "student-2"]);
      assert.deepEqual((await attendanceNow()).sort(), [
        "other-1",
        "student-1",
        "student-2",
      ]);
    });

    it("enrols once when run twice", async () => {
      const args = {
        db,
        classId: CLASS_ID,
        attendanceDocId: ATTENDANCE_ID,
        studentIds: ["student-1"],
        actor: { uid: "system" },
      };
      await enrolOneOffStudentsImpl(args);
      const second = await enrolOneOffStudentsImpl(args);

      assert.deepEqual(second.enrolled, []);
      assert.deepEqual(second.alreadyEnrolled, ["student-1"]);
      assert.equal((await attendanceNow()).filter((id) => id === "student-1").length, 1);
    });

    it("fills the seats that exist and reports the rest, without throwing", async () => {
      // Capacity 3, one seat already taken, three students asked for.
      const result = await enrolOneOffStudentsImpl({
        db,
        classId: CLASS_ID,
        attendanceDocId: ATTENDANCE_ID,
        studentIds: ["student-1", "student-2", "student-3"],
        actor: { uid: "system" },
      });

      assert.deepEqual(result.enrolled, ["student-1", "student-2"]);
      assert.deepEqual(result.noCapacity, ["student-3"]);
      assert.equal((await attendanceNow()).length, 3);
    });

    it("reports a missing session rather than inventing one", async () => {
      const result = await enrolOneOffStudentsImpl({
        db,
        classId: CLASS_ID,
        attendanceDocId: "no-such-week",
        studentIds: ["student-1"],
        actor: { uid: "system" },
      });

      assert.equal(result.ok, false);
      assert.equal(result.reason, "attendance_not_found");
    });

    it("keeps a seat back for a payment still at the card sheet", async () => {
      await db.collection("oneOffHolds").doc("pi_other").set({
        paymentIntentId: "pi_other",
        classId: CLASS_ID,
        attendanceDocId: ATTENDANCE_ID,
        studentCount: 1,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      });

      // Capacity 3, one seat taken, one held: only one seat is really free.
      const result = await enrolOneOffStudentsImpl({
        db,
        classId: CLASS_ID,
        attendanceDocId: ATTENDANCE_ID,
        studentIds: ["student-1", "student-2"],
        actor: { uid: "system" },
        respectHolds: true,
      });

      assert.deepEqual(result.enrolled, ["student-1"]);
      assert.deepEqual(result.noCapacity, ["student-2"]);
    });

    it("ignores a hold left behind by an abandoned card sheet", async () => {
      await db.collection("oneOffHolds").doc("pi_stale").set({
        paymentIntentId: "pi_stale",
        classId: CLASS_ID,
        attendanceDocId: ATTENDANCE_ID,
        studentCount: 2,
        expiresAt: new Date(Date.now() - 1000),
      });

      const result = await enrolOneOffStudentsImpl({
        db,
        classId: CLASS_ID,
        attendanceDocId: ATTENDANCE_ID,
        studentIds: ["student-1", "student-2"],
        actor: { uid: "system" },
        respectHolds: true,
      });

      assert.deepEqual(result.enrolled, ["student-1", "student-2"]);
    });

    it("does not let a booking's own hold block it", async () => {
      await db.collection("oneOffHolds").doc("pi_mine").set({
        paymentIntentId: "pi_mine",
        classId: CLASS_ID,
        attendanceDocId: ATTENDANCE_ID,
        studentCount: 2,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      });

      const result = await enrolOneOffStudentsImpl({
        db,
        classId: CLASS_ID,
        attendanceDocId: ATTENDANCE_ID,
        studentIds: ["student-1", "student-2"],
        actor: { uid: "system" },
        respectHolds: true,
        paymentIntentId: "pi_mine",
      });

      assert.deepEqual(result.enrolled, ["student-1", "student-2"]);
    });

    it("refuses a student the caller may not enrol", async () => {
      const result = await enrolOneOffStudentsImpl({
        db,
        classId: CLASS_ID,
        attendanceDocId: ATTENDANCE_ID,
        studentIds: ["student-1"],
        actor: { uid: "someone-else" },
        canEnrol: (studentData) => (studentData.parents || []).includes("someone-else"),
      });

      assert.equal(result.ok, false);
      assert.equal(result.reason, "forbidden");
      assert.deepEqual(await attendanceNow(), ["other-1"]);
    });
  });

  describe("fulfilOneOffBookingImpl", () => {
    it("enrols and invoices a paid booking", async () => {
      const result = await fulfilOneOffBookingImpl({
        db,
        stripe: fakeStripe(),
        paymentIntent: paymentIntent({ studentIds: ["student-1"] }),
        logger: silentLogger,
      });

      assert.equal(result.state, FULFILMENT_STATE.COMPLETE);
      assert.deepEqual(result.enrolledStudentIds, ["student-1"]);
      assert.ok((await attendanceNow()).includes("student-1"));

      const invoices = await db.collection("invoices").get();
      assert.equal(invoices.size, 1);
      const invoice = invoices.docs[0].data();
      assert.equal(invoice.status, "paid");
      assert.equal(invoice.stripePaymentIntentId, "pi_test_1");
      assert.equal(invoice.amountDue, 70);
      assert.deepEqual(invoice.studentIds, ["student-1"]);
    });

    it("does nothing twice when Stripe delivers the same event again", async () => {
      // A webhook redelivery must not enrol twice or raise a second invoice.
      const intent = paymentIntent({ studentIds: ["student-1"] });
      const first = await fulfilOneOffBookingImpl({
        db,
        stripe: fakeStripe(),
        paymentIntent: intent,
        logger: silentLogger,
      });
      const second = await fulfilOneOffBookingImpl({
        db,
        stripe: fakeStripe(),
        paymentIntent: intent,
        logger: silentLogger,
      });

      assert.equal(first.state, FULFILMENT_STATE.COMPLETE);
      assert.equal(second.alreadySettled, true);
      assert.equal((await db.collection("invoices").get()).size, 1);
      assert.equal((await attendanceNow()).filter((id) => id === "student-1").length, 1);
    });

    it("raises one invoice even when the client got there first", async () => {
      // The old client path writes an invoice carrying the PaymentIntent id.
      // Fulfilment must adopt it rather than raise a second.
      await db.collection("invoices").add({
        parentId: PARENT_ID,
        stripePaymentIntentId: "pi_test_1",
        status: "paid",
        amountDue: 70,
      });

      await fulfilOneOffBookingImpl({
        db,
        stripe: fakeStripe(),
        paymentIntent: paymentIntent({ studentIds: ["student-1"] }),
        logger: silentLogger,
      });

      assert.equal((await db.collection("invoices").get()).size, 1);
    });

    it("refunds in full when the session filled up first", async () => {
      await db
        .collection("classes")
        .doc(CLASS_ID)
        .collection("attendance")
        .doc(ATTENDANCE_ID)
        .set({
          attendance: ["other-1", "other-2", "other-3"],
          date: new Date("2099-08-10T06:00:00.000Z"),
        });

      const stripe = fakeStripe();
      const result = await fulfilOneOffBookingImpl({
        db,
        stripe,
        paymentIntent: paymentIntent({ studentIds: ["student-1"] }),
        logger: silentLogger,
      });

      assert.equal(result.state, FULFILMENT_STATE.REFUNDED);
      assert.equal(stripe.recordedRefunds.length, 1);
      assert.equal(stripe.recordedRefunds[0].params.amount, 7000);
      assert.equal(
        stripe.recordedRefunds[0].options.idempotencyKey,
        "oneoff-refund:pi_test_1"
      );
      assert.equal((await db.collection("invoices").get()).size, 0);
    });

    it("keeps the seats it could fill and refunds only the difference", async () => {
      const stripe = fakeStripe();
      const result = await fulfilOneOffBookingImpl({
        db,
        stripe,
        paymentIntent: paymentIntent({
          studentIds: ["student-1", "student-2", "student-3"],
        }),
        logger: silentLogger,
      });

      assert.equal(result.state, FULFILMENT_STATE.COMPLETE);
      assert.deepEqual(result.unfilledStudentIds, ["student-3"]);
      assert.equal(stripe.recordedRefunds[0].params.amount, 7000);

      const invoice = (await db.collection("invoices").get()).docs[0].data();
      assert.equal(invoice.amountDue, 140, "only the students who got a seat");
      assert.deepEqual(invoice.studentIds, ["student-1", "student-2"]);
    });

    it("does not refund twice when Stripe already has one", async () => {
      // Stripe only honours an idempotency key for ~24h, and the refund is
      // issued before its id reaches the claim. A sweep resuming a day later
      // would otherwise send the money back a second time.
      await db
        .collection("classes")
        .doc(CLASS_ID)
        .collection("attendance")
        .doc(ATTENDANCE_ID)
        .set({
          attendance: ["other-1", "other-2", "other-3"],
          date: new Date("2099-08-10T06:00:00.000Z"),
        });

      const stripe = fakeStripe({
        existingRefunds: [{ id: "re_already", status: "succeeded" }],
      });
      const result = await fulfilOneOffBookingImpl({
        db,
        stripe,
        paymentIntent: paymentIntent({ studentIds: ["student-1"] }),
        logger: silentLogger,
      });

      assert.equal(result.state, FULFILMENT_STATE.REFUNDED);
      assert.equal(result.refundId, "re_already");
      assert.equal(stripe.recordedRefunds.length, 0, "no second refund issued");
    });

    it("ignores a failed refund when deciding whether one exists", async () => {
      await db
        .collection("classes")
        .doc(CLASS_ID)
        .collection("attendance")
        .doc(ATTENDANCE_ID)
        .set({
          attendance: ["other-1", "other-2", "other-3"],
          date: new Date("2099-08-10T06:00:00.000Z"),
        });

      const stripe = fakeStripe({
        existingRefunds: [{ id: "re_dead", status: "failed" }],
      });
      await fulfilOneOffBookingImpl({
        db,
        stripe,
        paymentIntent: paymentIntent({ studentIds: ["student-1"] }),
        logger: silentLogger,
      });

      assert.equal(stripe.recordedRefunds.length, 1, "a real refund is still sent");
    });

    it("asks for a human when the money cannot be sent back", async () => {
      await db
        .collection("classes")
        .doc(CLASS_ID)
        .collection("attendance")
        .doc(ATTENDANCE_ID)
        .set({
          attendance: ["other-1", "other-2", "other-3"],
          date: new Date("2099-08-10T06:00:00.000Z"),
        });

      const result = await fulfilOneOffBookingImpl({
        db,
        stripe: fakeStripe({ failRefunds: true }),
        paymentIntent: paymentIntent({ studentIds: ["student-1"] }),
        logger: silentLogger,
      });

      assert.equal(result.state, FULFILMENT_STATE.NEEDS_ADMIN);
      assert.equal(result.reason, "refund_failed");
    });

    it("never auto-refunds a class that has already run", async () => {
      await db
        .collection("classes")
        .doc(CLASS_ID)
        .collection("attendance")
        .doc(ATTENDANCE_ID)
        .set({
          attendance: ["other-1", "other-2", "other-3"],
          date: new Date("2020-01-01T06:00:00.000Z"),
        });

      const stripe = fakeStripe();
      const result = await fulfilOneOffBookingImpl({
        db,
        stripe,
        paymentIntent: paymentIntent({ studentIds: ["student-1"] }),
        logger: silentLogger,
      });

      assert.equal(result.state, FULFILMENT_STATE.NEEDS_ADMIN);
      assert.equal(result.reason, "class_date_passed");
      assert.equal(stripe.recordedRefunds.length, 0);
    });

    it("will not enrol a child who is not this parent's", async () => {
      // A signed-in parent can read attendance rosters, so they can see other
      // families' student ids. Fulfilment runs as the system, so without this
      // it would buy a place for somebody else's child and put that child's
      // name on the payer's invoice.
      await db.collection("students").doc("student-elsewhere").set({
        firstName: "Not",
        lastName: "Theirs",
        parents: ["another-parent"],
      });

      const result = await fulfilOneOffBookingImpl({
        db,
        stripe: fakeStripe(),
        paymentIntent: paymentIntent({ studentIds: ["student-elsewhere"] }),
        logger: silentLogger,
      });

      assert.equal(result.state, FULFILMENT_STATE.NEEDS_ADMIN);
      assert.equal(result.reason, "forbidden");
      assert.ok(!(await attendanceNow()).includes("student-elsewhere"));
      assert.equal((await db.collection("invoices").get()).size, 0);
    });

    it("leaves a payment from an older app build to the client path", async () => {
      const legacy = {
        id: "pi_legacy",
        metadata: {
          parentId: PARENT_ID,
          invoiceIds: "",
          paymentType: "one_off_booking",
          source: "tenacity_tutoring",
        },
      };

      const result = await fulfilOneOffBookingImpl({
        db,
        stripe: fakeStripe(),
        paymentIntent: legacy,
        logger: silentLogger,
      });

      assert.equal(result.state, "not_applicable");
      assert.equal((await db.collection(FULFILMENT_COLLECTION).get()).size, 0);
      assert.deepEqual(await attendanceNow(), ["other-1"]);
    });

    it("records what it did, so a sweep can tell it is finished", async () => {
      await fulfilOneOffBookingImpl({
        db,
        stripe: fakeStripe(),
        paymentIntent: paymentIntent({ studentIds: ["student-1"] }),
        logger: silentLogger,
      });

      const claim = (
        await db.collection(FULFILMENT_COLLECTION).doc("pi_test_1").get()
      ).data();
      assert.equal(claim.state, FULFILMENT_STATE.COMPLETE);
      assert.equal(claim.parentId, PARENT_ID);
      assert.deepEqual(claim.enrolledStudentIds, ["student-1"]);
      assert.ok(claim.invoiceId);
      assert.equal(claim.attempts, 1);
    });

    it("survives the webhook and the app racing each other", async () => {
      // Both callers fulfil the same payment at the same moment.
      const intent = paymentIntent({ studentIds: ["student-1", "student-2"] });
      const results = await Promise.all([
        fulfilOneOffBookingImpl({
          db,
          stripe: fakeStripe(),
          paymentIntent: intent,
          logger: silentLogger,
        }),
        fulfilOneOffBookingImpl({
          db,
          stripe: fakeStripe(),
          paymentIntent: intent,
          logger: silentLogger,
        }),
      ]);

      assert.equal((await db.collection("invoices").get()).size, 1);
      const attendance = await attendanceNow();
      assert.equal(attendance.filter((id) => id === "student-1").length, 1);
      assert.equal(attendance.filter((id) => id === "student-2").length, 1);
      assert.ok(
        results.some((r) => r.state === FULFILMENT_STATE.COMPLETE || r.alreadySettled),
        "at least one caller reports the booking done"
      );
    });
  });
});
