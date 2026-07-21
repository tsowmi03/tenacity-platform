"use strict";

const { describe, it, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");

const admin = require("firebase-admin");
const { incomeReportImpl } = require("../../src/reports/incomeReport");
const {
  invoiceAgingReportImpl,
} = require("../../src/reports/invoiceAgingReport");
const { exportReportImpl } = require("../../src/reports/exportReport");
const {
  attendanceReportImpl,
} = require("../../src/reports/attendanceReport");
const {
  studentEnrolmentReportImpl,
} = require("../../src/reports/studentEnrolmentReport");
const {
  classUtilisationReportImpl,
} = require("../../src/reports/classUtilisationReport");
const {
  validateIncomeReportInput,
  validateInvoiceAgingReportInput,
  validateAttendanceReportInput,
  validateClassUtilisationReportInput,
} = require("../../src/reports/reportSchemas");
const { getAdmin, clearCollection, clearCollectionGroup } = require("../helpers/emulator");

const actor = { uid: "admin-actor", email: "admin@tenacitytutoring.com" };
const clock = () => new Date("2026-05-20T00:00:00Z");

function ts(iso) {
  return admin.firestore.Timestamp.fromDate(new Date(iso));
}

async function seedInvoice(db, id, extra = {}) {
  await db.collection("invoices").doc(id).set({
    parentId: "parent-1",
    parentName: "Jane Doe",
    parentEmail: "jane@example.com",
    studentIds: ["student-1"],
    invoiceNumber: id,
    status: "unpaid",
    amountDue: 200,
    amountDueComputed: 200,
    dueDate: ts("2026-05-10T00:00:00Z"),
    createdAt: ts("2026-05-01T00:00:00Z"),
    lineItems: [{ description: "Tutoring", lineTotal: 200 }],
    ...extra,
  });
}

async function seedClass(db, id, extra = {}) {
  await db.collection("classes").doc(id).set({
    type: "Maths",
    day: "Monday",
    startTime: "16:00",
    endTime: "17:00",
    capacity: 4,
    enrolledStudents: [],
    tutors: [],
    ...extra,
  });
}

async function seedAttendance(db, classId, docId, date, extra = {}) {
  await db
    .collection("classes")
    .doc(classId)
    .collection("attendance")
    .doc(docId)
    .set({
      date: ts(date),
      cancelled: false,
      attendance: [],
      tutors: [],
      weekNum: 1,
      termId: "2026_T2",
      ...extra,
    });
}

describe("reporting (firestore emulator)", () => {
  let db;

  before(() => {
    ({ db } = getAdmin());
  });

  beforeEach(async () => {
    await clearCollection(db, "invoices");
  });

  after(async () => {
    await clearCollection(db, "invoices");
  });

  it("builds an income report from invoice docs", async () => {
    await seedInvoice(db, "inv-paid", {
      status: "paid",
      amountDue: 0,
      paidAt: ts("2026-05-15T00:00:00Z"),
      xeroInvoiceId: "xero-1",
    });
    await seedInvoice(db, "inv-overdue", {
      parentId: "parent-2",
      status: "overdue",
      amountDue: 75,
      lineItems: [{ description: "Tutoring", lineTotal: 125 }],
      stripePaymentIntentId: "pi_1",
    });
    await seedInvoice(db, "inv-outside", {
      createdAt: ts("2026-04-01T00:00:00Z"),
    });

    const report = await incomeReportImpl({
      payload: validateIncomeReportInput({
        fromDate: "2026-05-01T00:00:00Z",
        toDate: "2026-05-31T23:59:59Z",
        groupBy: "parent",
      }),
      actor,
      deps: { db, clock },
    });

    assert.equal(report.summary.invoiceCount, 2);
    assert.equal(report.summary.totalInvoiced, 325);
    assert.equal(report.summary.totalPaid, 200);
    assert.equal(report.summary.totalUnpaid, 75);
    assert.equal(report.rows.length, 2);
  });

  it("builds an invoice aging report from unpaid invoice docs", async () => {
    await seedInvoice(db, "inv-old", {
      dueDate: ts("2026-04-01T00:00:00Z"),
      amountDue: 80,
      xeroInvoiceId: "xero-1",
    });
    await seedInvoice(db, "inv-current", {
      dueDate: ts("2026-05-25T00:00:00Z"),
      amountDue: 40,
      stripePaymentIntentId: "pi_1",
    });
    await seedInvoice(db, "inv-paid", {
      status: "paid",
      amountDue: 0,
    });

    const report = await invoiceAgingReportImpl({
      payload: validateInvoiceAgingReportInput({
        asOfDate: "2026-05-20T00:00:00Z",
      }),
      actor,
      deps: { db, clock },
    });

    assert.equal(report.summary.invoiceCount, 2);
    assert.equal(report.summary.totalOutstanding, 120);
    assert.equal(report.buckets.find((b) => b.bucket === "31-60").balance, 80);
    assert.equal(report.buckets.find((b) => b.bucket === "current").balance, 40);
    assert.equal(report.invoices[0].invoiceId, "inv-old");
  });

  it("exports an income report as CSV", async () => {
    await seedInvoice(db, "inv-csv", {
      parentName: "Jane, Doe",
    });

    const out = await exportReportImpl({
      payload: {
        reportType: "income",
        format: "csv",
        report: {
          fromDate: "2026-05-01T00:00:00Z",
          toDate: "2026-05-31T23:59:59Z",
          groupBy: "month",
        },
      },
      actor,
      deps: { db, clock },
    });

    assert.equal(out.contentType, "text/csv; charset=utf-8");
    assert.equal(out.fileName, "income-2026-05-20.csv");
    assert.match(out.csv, /Group,Invoices,Total invoiced/);
    assert.match(out.csv, /2026-05,1,200/);
    assert.equal(out.rowCount, 1);
  });
});

describe("attendance reporting (firestore emulator)", () => {
  let db;

  before(() => {
    ({ db } = getAdmin());
  });

  beforeEach(async () => {
    await clearCollectionGroup(db, "attendance");
    await clearCollection(db, "classes");
  });

  after(async () => {
    await clearCollectionGroup(db, "attendance");
    await clearCollection(db, "classes");
  });

  it("builds an attendance report grouped by class", async () => {
    await seedClass(db, "class-1", {
      capacity: 4,
      enrolledStudents: ["s1", "s2", "s3"],
    });
    await seedAttendance(db, "class-1", "2026_T2_W1", "2026-05-05T06:00:00Z", {
      attendance: ["s1", "s2"],
      tutors: ["tutor-1"],
    });
    await seedAttendance(db, "class-1", "2026_T2_W2", "2026-05-12T06:00:00Z", {
      attendance: ["s1", "s2", "s3"],
      tutors: ["tutor-1"],
    });
    await seedAttendance(db, "class-1", "2026_T2_W3", "2026-05-19T06:00:00Z", {
      cancelled: true,
    });

    const report = await attendanceReportImpl({
      payload: validateAttendanceReportInput({
        fromDate: "2026-05-01T00:00:00Z",
        toDate: "2026-05-31T00:00:00Z",
        groupBy: "class",
      }),
      actor,
      deps: { db, clock },
    });

    assert.equal(report.summary.sessionsScheduled, 3);
    assert.equal(report.summary.sessionsCancelled, 1);
    assert.equal(report.summary.sessionsHeld, 2);
    assert.equal(report.summary.totalStudentAttendances, 5);
    assert.equal(report.rows.length, 1);

    const row = report.rows[0];
    assert.equal(row.key, "class-1");
    assert.equal(row.capacity, 4);
    assert.equal(row.permanentEnrolments, 3);
    assert.equal(row.totalStudentAttendances, 5);
    assert.equal(row.averageAttendance, 2.5);
    assert.equal(row.studentsNotPresent, 1);
  });

  it("builds a class utilisation report", async () => {
    await seedClass(db, "class-u", { capacity: 4, enrolledStudents: ["s1", "s2", "s3", "s4"] });
    await seedAttendance(db, "class-u", "2026_T2_W1", "2026-05-05T06:00:00Z", {
      attendance: ["s1", "s2", "s3", "s4"],
    });

    const report = await classUtilisationReportImpl({
      payload: validateClassUtilisationReportInput({
        fromDate: "2026-05-01T00:00:00Z",
        toDate: "2026-05-31T00:00:00Z",
      }),
      actor,
      deps: { db, clock },
    });

    assert.equal(report.reportType, "classUtilisation");
    assert.equal(report.summary.averageUtilisationRate, 1);
    assert.equal(report.summary.classesAbove80Percent, 1);
    assert.equal(report.summary.classesBelow50Percent, 0);
  });
});

describe("student enrolment reporting (firestore emulator)", () => {
  let db;

  before(() => {
    ({ db } = getAdmin());
  });

  beforeEach(async () => {
    await clearCollection(db, "students");
    await clearCollection(db, "users");
    await clearCollection(db, "classes");
    await clearCollection(db, "enrolments");
  });

  after(async () => {
    await clearCollection(db, "students");
    await clearCollection(db, "users");
    await clearCollection(db, "classes");
    await clearCollection(db, "enrolments");
  });

  it("builds a student enrolment snapshot report", async () => {
    await db.collection("students").doc("s1").set({
      firstName: "Alice",
      lastName: "Smith",
      grade: "Year 8",
      subjects: ["Maths", "English"],
      parents: ["p1"],
    });
    await db.collection("students").doc("s2").set({
      firstName: "Bob",
      lastName: "Jones",
      grade: "Year 9",
      subjects: ["Maths"],
      parents: [],
    });
    await db.collection("users").doc("p1").set({
      role: "parent",
      firstName: "Jane",
      lastName: "Smith",
      email: "jane@example.com",
      students: ["s1"],
    });
    await seedClass(db, "class-1", { enrolledStudents: ["s1"] });
    await db.collection("enrolments").doc("enr-1").set({
      status: "accepted",
      createdStudentId: "s1",
      createdParentId: "p1",
      acceptedAt: ts("2026-05-10T00:00:00Z"),
    });

    const report = await studentEnrolmentReportImpl({
      actor,
      deps: { db, clock },
    });

    assert.equal(report.summary.totalStudents, 2);
    assert.equal(report.summary.studentsWithActiveClass, 1);
    assert.equal(report.summary.studentsWithNoActiveClass, 1);
    assert.equal(report.summary.linkageIssueCount, 0);
    assert.equal(report.byGrade.find((g) => g.grade === "Year 8").count, 1);
    assert.equal(report.byGrade.find((g) => g.grade === "Year 9").count, 1);
    assert.equal(report.newFromEnrolments.length, 1);
    assert.equal(report.studentsWithNoClass[0].studentId, "s2");
  });
});
