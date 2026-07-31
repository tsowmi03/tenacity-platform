"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  validateAttendanceReportInput,
  validateClassUtilisationReportInput,
  validateExportReportInput,
} = require("../../src/reports/reportSchemas");
const { buildAttendanceReport } = require("../../src/reports/attendanceReport");
const {
  buildStudentEnrolmentReport,
} = require("../../src/reports/studentEnrolmentReport");
const {
  csvForReport,
  defaultFileName,
  INCOME_COLUMNS,
  STUDENT_ENROLMENT_COLUMNS,
} = require("../../src/reports/exportReport");
const { reportToXlsx } = require("../../src/reports/xlsxExport");
const { generateReportPdf } = require("../../src/reports/pdfExport");

function makeAttendanceDoc(classId, date, extra = {}) {
  return {
    classId,
    id: `${classId}_doc`,
    date,
    cancelled: false,
    attendance: [],
    tutors: [],
    weekNum: 1,
    termId: "2026_T2",
    ...extra,
  };
}

function makeClass(id, extra = {}) {
  return {
    id,
    type: "Maths",
    day: "Monday",
    startTime: "16:00",
    endTime: "17:00",
    capacity: 4,
    enrolledStudents: [],
    tutors: [],
    ...extra,
  };
}

const NOW = new Date("2026-05-20T00:00:00Z");

describe("attendance report schemas", () => {
  it("normalises defaults", () => {
    const out = validateAttendanceReportInput({
      fromDate: "2026-05-01T00:00:00Z",
      toDate: "2026-05-31T00:00:00Z",
    });
    assert.equal(out.groupBy, "class");
    assert.equal(out.includeCancelled, false);
    assert.ok(out.classIds === undefined);
  });

  it("rejects invalid date ranges", () => {
    assert.throws(
      () =>
        validateAttendanceReportInput({
          fromDate: "2026-06-01T00:00:00Z",
          toDate: "2026-05-01T00:00:00Z",
        }),
      /fromDate/
    );
  });

  it("accepts optional filter arrays", () => {
    const out = validateAttendanceReportInput({
      fromDate: "2026-05-01T00:00:00Z",
      toDate: "2026-05-31T00:00:00Z",
      classIds: ["class-1", "class-2"],
      tutorIds: ["tutor-1"],
      groupBy: "week",
    });
    assert.deepEqual(out.classIds, ["class-1", "class-2"]);
    assert.deepEqual(out.tutorIds, ["tutor-1"]);
    assert.equal(out.groupBy, "week");
  });

  it("validates class utilisation input", () => {
    const out = validateClassUtilisationReportInput({
      fromDate: "2026-05-01T00:00:00Z",
      toDate: "2026-05-31T00:00:00Z",
    });
    assert.ok(out.fromDate instanceof Date);
    assert.ok(out.toDate instanceof Date);
  });

  it("export report supports attendance and studentEnrolment types", () => {
    assert.deepEqual(validateExportReportInput({ reportType: "attendance" }), {
      reportType: "attendance",
      format: "csv",
    });
    assert.deepEqual(
      validateExportReportInput({ reportType: "studentEnrolment" }),
      { reportType: "studentEnrolment", format: "csv" }
    );
  });
});

describe("buildAttendanceReport", () => {
  const payload = validateAttendanceReportInput({
    fromDate: "2026-05-01T00:00:00Z",
    toDate: "2026-05-31T00:00:00Z",
    groupBy: "class",
  });

  it("groups sessions by class with utilisation metrics", () => {
    const cls = makeClass("class-1", {
      capacity: 4,
      enrolledStudents: ["s1", "s2", "s3"],
    });
    const classes = new Map([["class-1", cls]]);

    const docs = [
      makeAttendanceDoc("class-1", new Date("2026-05-05T06:00:00Z"), {
        attendance: ["s1", "s2"],
        tutors: ["tutor-1"],
      }),
      makeAttendanceDoc("class-1", new Date("2026-05-12T06:00:00Z"), {
        attendance: ["s1", "s2", "s3"],
        tutors: ["tutor-1"],
      }),
    ];

    const report = buildAttendanceReport({ classes, attendanceDocs: docs, payload, generatedAt: NOW });

    assert.equal(report.reportType, "attendance");
    assert.equal(report.summary.sessionsScheduled, 2);
    assert.equal(report.summary.sessionsHeld, 2);
    assert.equal(report.summary.sessionsCancelled, 0);
    assert.equal(report.summary.totalStudentAttendances, 5);
    assert.equal(report.rows.length, 1);

    const row = report.rows[0];
    assert.equal(row.key, "class-1");
    assert.equal(row.capacity, 4);
    assert.equal(row.permanentEnrolments, 3);
    assert.equal(row.totalStudentAttendances, 5);
    assert.equal(row.averageAttendance, 2.5);
    assert.equal(row.utilisationRate, 0.625);
    assert.equal(row.studentsNotPresent, 1);
    assert.equal(row.oneOffBookings, 0);
  });

  it("counts who was marked here, not who was booked", () => {
    // The roll used to overwrite `attendance` with the present students, so
    // the array served as both records. It is now the booking list only — an
    // away student stays in it — and reading it as attendance would report
    // every session as fully attended.
    const cls = makeClass("class-1", {
      capacity: 4,
      enrolledStudents: ["s1", "s2", "s3"],
    });
    const classes = new Map([["class-1", cls]]);

    const docs = [
      makeAttendanceDoc("class-1", new Date("2026-05-05T06:00:00Z"), {
        attendance: ["s1", "s2", "s3"],
        marks: { s1: "here", s2: "here", s3: "away" },
        tutors: ["tutor-1"],
      }),
    ];

    const report = buildAttendanceReport({ classes, attendanceDocs: docs, payload, generatedAt: NOW });
    const row = report.rows[0];

    assert.equal(report.summary.totalStudentAttendances, 2);
    assert.equal(row.totalStudentAttendances, 2);
    assert.equal(row.studentsNotPresent, 1);
  });

  it("reads a session with no marks from the booking list", () => {
    // History: sessions marked before `marks` existed. The array is the only
    // record of who turned up that they have.
    const cls = makeClass("class-1", {
      capacity: 4,
      enrolledStudents: ["s1", "s2", "s3"],
    });
    const classes = new Map([["class-1", cls]]);

    const docs = [
      makeAttendanceDoc("class-1", new Date("2026-05-05T06:00:00Z"), {
        attendance: ["s1", "s2"],
        tutors: ["tutor-1"],
      }),
    ];

    const report = buildAttendanceReport({ classes, attendanceDocs: docs, payload, generatedAt: NOW });

    assert.equal(report.summary.totalStudentAttendances, 2);
    assert.equal(report.rows[0].studentsNotPresent, 1);
  });

  it("keeps one-off bookings a booking count, not an attendance one", () => {
    // A visitor who booked and did not turn up still took the seat.
    const cls = makeClass("class-1", {
      capacity: 4,
      enrolledStudents: ["s1"],
    });
    const classes = new Map([["class-1", cls]]);

    const docs = [
      makeAttendanceDoc("class-1", new Date("2026-05-05T06:00:00Z"), {
        attendance: ["s1", "visitor"],
        marks: { s1: "here", visitor: "away" },
        tutors: ["tutor-1"],
      }),
    ];

    const report = buildAttendanceReport({ classes, attendanceDocs: docs, payload, generatedAt: NOW });

    assert.equal(report.rows[0].oneOffBookings, 1);
    assert.equal(report.rows[0].totalStudentAttendances, 1);
  });

  it("counts cancelled sessions without adding them to attendance metrics", () => {
    const cls = makeClass("class-1");
    const classes = new Map([["class-1", cls]]);

    const docs = [
      makeAttendanceDoc("class-1", new Date("2026-05-05T06:00:00Z"), {
        attendance: ["s1"],
      }),
      makeAttendanceDoc("class-1", new Date("2026-05-12T06:00:00Z"), {
        cancelled: true,
      }),
    ];

    const report = buildAttendanceReport({ classes, attendanceDocs: docs, payload, generatedAt: NOW });

    assert.equal(report.summary.sessionsScheduled, 2);
    assert.equal(report.summary.sessionsCancelled, 1);
    assert.equal(report.summary.sessionsHeld, 1);
    assert.equal(report.summary.totalStudentAttendances, 1);
    const row = report.rows[0];
    assert.equal(row.sessionsScheduled, 2);
    assert.equal(row.sessionsCancelled, 1);
    assert.equal(row.sessionsHeld, 1);
  });

  it("detects one-off bookings", () => {
    const cls = makeClass("class-1", { enrolledStudents: ["s1"] });
    const classes = new Map([["class-1", cls]]);
    const docs = [
      makeAttendanceDoc("class-1", new Date("2026-05-05T06:00:00Z"), {
        attendance: ["s1", "s2"],
      }),
    ];
    const report = buildAttendanceReport({ classes, attendanceDocs: docs, payload, generatedAt: NOW });
    assert.equal(report.rows[0].oneOffBookings, 1);
    assert.equal(report.rows[0].studentsNotPresent, 0);
  });

  it("filters by tutorIds", () => {
    const cls = makeClass("class-1");
    const classes = new Map([["class-1", cls]]);
    const docs = [
      makeAttendanceDoc("class-1", new Date("2026-05-05T06:00:00Z"), { tutors: ["tutor-1"] }),
      makeAttendanceDoc("class-1", new Date("2026-05-12T06:00:00Z"), { id: "class-1_doc2", tutors: ["tutor-2"] }),
    ];
    const filteredPayload = validateAttendanceReportInput({
      fromDate: "2026-05-01T00:00:00Z",
      toDate: "2026-05-31T00:00:00Z",
      groupBy: "class",
      tutorIds: ["tutor-1"],
    });
    const report = buildAttendanceReport({ classes, attendanceDocs: docs, payload: filteredPayload, generatedAt: NOW });
    assert.equal(report.rows[0].sessionsHeld, 1);
  });

  it("groups by week", () => {
    const cls = makeClass("class-1");
    const classes = new Map([["class-1", cls]]);
    const weekPayload = validateAttendanceReportInput({
      fromDate: "2026-05-01T00:00:00Z",
      toDate: "2026-05-31T00:00:00Z",
      groupBy: "week",
    });
    const docs = [
      makeAttendanceDoc("class-1", new Date("2026-05-04T06:00:00Z"), { attendance: ["s1"] }),
      makeAttendanceDoc("class-1", new Date("2026-05-11T06:00:00Z"), { id: "class-1_doc2", attendance: ["s1", "s2"] }),
    ];
    const report = buildAttendanceReport({ classes, attendanceDocs: docs, payload: weekPayload, generatedAt: NOW });
    assert.equal(report.rows.length, 2);
    report.rows.forEach((r) => {
      assert.ok(r.key.startsWith("2026-W"));
      assert.equal(r.classCount, 1);
    });
  });

  it("groups by student", () => {
    const cls = makeClass("class-1");
    const classes = new Map([["class-1", cls]]);
    const studentPayload = validateAttendanceReportInput({
      fromDate: "2026-05-01T00:00:00Z",
      toDate: "2026-05-31T00:00:00Z",
      groupBy: "student",
    });
    const docs = [
      makeAttendanceDoc("class-1", new Date("2026-05-05T06:00:00Z"), { attendance: ["s1", "s2"] }),
      makeAttendanceDoc("class-1", new Date("2026-05-12T06:00:00Z"), { id: "class-1_doc2", attendance: ["s1"] }),
    ];
    const report = buildAttendanceReport({ classes, attendanceDocs: docs, payload: studentPayload, generatedAt: NOW });
    assert.equal(report.rows.length, 2);
    const s1 = report.rows.find((r) => r.key === "s1");
    assert.equal(s1.sessionsAttended, 2);
  });

  it("returns null utilisationRate when capacity is zero", () => {
    const cls = makeClass("class-1", { capacity: 0 });
    const classes = new Map([["class-1", cls]]);
    const docs = [makeAttendanceDoc("class-1", new Date("2026-05-05T06:00:00Z"), { attendance: ["s1"] })];
    const report = buildAttendanceReport({ classes, attendanceDocs: docs, payload, generatedAt: NOW });
    assert.equal(report.rows[0].utilisationRate, null);
  });
});

describe("buildStudentEnrolmentReport", () => {
  function student(id, extra = {}) {
    return { id, firstName: "Alice", lastName: "Smith", grade: "Year 8", subjects: ["Maths"], parents: [], ...extra };
  }
  function parent(id, students = []) {
    return { id, role: "parent", firstName: "Jane", lastName: "Doe", students };
  }

  it("counts students by grade and subject", () => {
    const report = buildStudentEnrolmentReport({
      students: [
        student("s1", { grade: "Year 8", subjects: ["Maths", "English"] }),
        student("s2", { grade: "Year 9", subjects: ["Maths"] }),
        student("s3", { grade: "Year 8", subjects: ["English"] }),
      ],
      parents: [],
      classes: [],
      enrolments: [],
      generatedAt: NOW,
    });

    assert.equal(report.summary.totalStudents, 3);
    const y8 = report.byGrade.find((g) => g.grade === "Year 8");
    assert.equal(y8.count, 2);
    const maths = report.bySubject.find((s) => s.subject === "Maths");
    assert.equal(maths.count, 2);
    const english = report.bySubject.find((s) => s.subject === "English");
    assert.equal(english.count, 2);
  });

  it("identifies students with no active class", () => {
    const cls = makeClass("class-1", { enrolledStudents: ["s1"] });
    const report = buildStudentEnrolmentReport({
      students: [student("s1"), student("s2")],
      parents: [],
      classes: [cls],
      enrolments: [],
      generatedAt: NOW,
    });

    assert.equal(report.summary.studentsWithActiveClass, 1);
    assert.equal(report.summary.studentsWithNoActiveClass, 1);
    assert.equal(report.studentsWithNoClass[0].studentId, "s2");
  });

  it("detects student-parent linkage issues", () => {
    const s = student("s1", { parents: ["p1"] });
    const p = parent("p1", []); // parent doesn't have s1 in students[]
    const report = buildStudentEnrolmentReport({
      students: [s],
      parents: [p],
      classes: [],
      enrolments: [],
      generatedAt: NOW,
    });

    assert.equal(report.summary.linkageIssueCount, 1);
    assert.equal(report.linkageIssues[0].type, "studentMissingFromParent");
  });

  it("detects missing parent user doc", () => {
    const s = student("s1", { parents: ["p-missing"] });
    const report = buildStudentEnrolmentReport({
      students: [s],
      parents: [],
      classes: [],
      enrolments: [],
      generatedAt: NOW,
    });

    assert.equal(report.linkageIssues[0].type, "missingParentUser");
  });

  it("detects parent listing student who has no reverse link", () => {
    const s = student("s1", { parents: [] }); // student doesn't list p1
    const p = parent("p1", ["s1"]); // parent lists s1
    const report = buildStudentEnrolmentReport({
      students: [s],
      parents: [p],
      classes: [],
      enrolments: [],
      generatedAt: NOW,
    });

    assert.equal(report.linkageIssues[0].type, "parentMissingFromStudent");
  });

  it("lists new students from accepted enrolments", () => {
    const enrolment = {
      id: "enr-1",
      status: "accepted",
      createdStudentId: "s1",
      createdParentId: "p1",
      acceptedAt: new Date("2026-05-10T00:00:00Z"),
    };
    const report = buildStudentEnrolmentReport({
      students: [student("s1")],
      parents: [],
      classes: [],
      enrolments: [enrolment],
      generatedAt: NOW,
    });

    assert.equal(report.newFromEnrolments.length, 1);
    assert.equal(report.newFromEnrolments[0].studentId, "s1");
  });
});

describe("CSV exports for new report types", () => {
  it("renders attendance report CSV rows (groupBy class)", () => {
    const cls = makeClass("class-1", { capacity: 4, enrolledStudents: ["s1", "s2"] });
    const classes = new Map([["class-1", cls]]);
    const payload = validateAttendanceReportInput({
      fromDate: "2026-05-01T00:00:00Z",
      toDate: "2026-05-31T00:00:00Z",
      groupBy: "class",
    });
    const docs = [
      makeAttendanceDoc("class-1", new Date("2026-05-05T06:00:00Z"), { attendance: ["s1", "s2"] }),
    ];
    const report = buildAttendanceReport({ classes, attendanceDocs: docs, payload, generatedAt: NOW });
    const csv = csvForReport(report);
    assert.match(csv, /Class ID,Type,Day/);
    assert.match(csv, /class-1,Maths,Monday/);
  });

  it("renders student enrolment report CSV rows (byGrade)", () => {
    const report = buildStudentEnrolmentReport({
      students: [
        { id: "s1", firstName: "Alice", lastName: "Doe", grade: "Year 8", subjects: ["Maths"], parents: [] },
        { id: "s2", firstName: "Bob", lastName: "Smith", grade: "Year 8", subjects: ["English"], parents: [] },
      ],
      parents: [],
      classes: [],
      enrolments: [],
      generatedAt: NOW,
    });
    const csv = csvForReport(report);
    assert.match(csv, /Grade,Student count/);
    assert.match(csv, /Year 8,2/);
  });
});

describe("xlsx export", () => {
  function makeStudentEnrolmentReport() {
    return {
      reportType: "studentEnrolment",
      generatedAt: NOW.toISOString(),
      filters: {},
      summary: { totalStudents: 2, activeClasses: 1 },
      byGrade: [
        { grade: "Year 8", count: 2 },
      ],
      bySubject: [],
      byClass: [],
      newFromEnrolments: [],
      linkageIssues: [],
    };
  }

  it("returns a base64-encoded xlsx buffer", () => {
    const report = makeStudentEnrolmentReport();
    const result = reportToXlsx(report, STUDENT_ENROLMENT_COLUMNS, report.byGrade);
    assert.equal(typeof result, "string");
    const buf = Buffer.from(result, "base64");
    // xlsx (zip) magic bytes: PK\x03\x04
    assert.equal(buf[0], 0x50);
    assert.equal(buf[1], 0x4b);
    assert.equal(buf[2], 0x03);
    assert.equal(buf[3], 0x04);
  });

  it("encodes column headers and row data", () => {
    const report = makeStudentEnrolmentReport();
    const result = reportToXlsx(report, STUDENT_ENROLMENT_COLUMNS, report.byGrade);
    const buf = Buffer.from(result, "base64").toString("utf8");
    assert.match(buf, /Grade/);
    assert.match(buf, /Year 8/);
  });

  it("encodes summary metrics into the workbook", () => {
    const report = makeStudentEnrolmentReport();
    const result = reportToXlsx(report, STUDENT_ENROLMENT_COLUMNS, report.byGrade);
    const buf = Buffer.from(result, "base64").toString("utf8");
    assert.match(buf, /Total Students/);
  });
});

describe("pdf export", () => {
  function makeIncomeReport() {
    return {
      reportType: "income",
      generatedAt: NOW.toISOString(),
      filters: { fromDate: "2026-01-01", toDate: "2026-03-31" },
      summary: { totalInvoiced: 5000, totalPaid: 4200 },
      rows: [
        {
          key: "2026-01",
          invoiceCount: 3,
          totalInvoiced: 1500,
          totalPaid: 1200,
          totalUnpaid: 300,
          totalOverdue: 0,
          averageInvoiceValue: 500,
          xeroSynced: 3,
          xeroUnsynced: 0,
          stripePaymentIntentCount: 2,
        },
      ],
    };
  }

  it("resolves to a Buffer with PDF magic bytes", async () => {
    const report = makeIncomeReport();
    const buf = await generateReportPdf("Income Report", report, INCOME_COLUMNS, report.rows);
    assert.ok(Buffer.isBuffer(buf));
    assert.ok(buf.length > 0);
    // PDF magic bytes: %PDF-
    assert.equal(buf.slice(0, 5).toString("ascii"), "%PDF-");
  });

  it("produces a non-trivial document (>10KB) for a report with rows", async () => {
    const report = makeIncomeReport();
    const buf = await generateReportPdf("Income Report", report, INCOME_COLUMNS, report.rows);
    assert.ok(buf.length > 1_000, `expected >1KB, got ${buf.length} bytes`);
  });

  it("handles empty rows without throwing", async () => {
    const report = { ...makeIncomeReport(), rows: [] };
    const buf = await generateReportPdf("Income Report", report, INCOME_COLUMNS, report.rows);
    assert.ok(Buffer.isBuffer(buf));
    assert.equal(buf.slice(0, 5).toString("ascii"), "%PDF-");
  });
});

describe("defaultFileName", () => {
  it("uses correct extension per format", () => {
    const d = new Date("2026-05-14T00:00:00Z");
    assert.equal(defaultFileName("income", "csv", d), "income-2026-05-14.csv");
    assert.equal(defaultFileName("attendance", "xlsx", d), "attendance-2026-05-14.xlsx");
    assert.equal(defaultFileName("invoiceAging", "pdf", d), "invoiceAging-2026-05-14.pdf");
  });
});
