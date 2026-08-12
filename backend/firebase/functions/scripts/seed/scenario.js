"use strict";

/*
 * Pure builder for the staging seed scenario.
 *
 * Deliberately imports nothing — no firebase-admin, no I/O, no randomness.
 * Everything is derived from the injected `now`, so two runs a millisecond
 * apart produce the same structure and the emulator test can assert on the
 * result without standing anything up.
 *
 * User references are SYMBOLIC here (`@parent-1`), because Firebase Auth
 * assigns uids server-side. scripts/seed/writers.js#resolveIds swaps them for
 * real uids after the identity phase. Any string beginning with "@" is a
 * symbolic reference; nothing else in the data may start with "@".
 */

const SYMBOL_PREFIX = "@";

const SUBJECT_MATHS = "Maths";
const SUBJECT_ENGLISH = "English";

/** Symbolic user reference, e.g. ref("parent-1") -> "@parent-1". */
function ref(symbolicId) {
  return `${SYMBOL_PREFIX}${symbolicId}`;
}

function isRef(value) {
  return typeof value === "string" && value.startsWith(SYMBOL_PREFIX);
}

function symbolOf(value) {
  return isRef(value) ? value.slice(SYMBOL_PREFIX.length) : null;
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

/** Most recent Monday at 00:00 local time, inclusive of `date` itself. */
function mondayOf(date) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (monday.getDay() + 6) % 7; // Sunday(0) -> 6, Monday(1) -> 0
  monday.setDate(monday.getDate() - offset);
  return monday;
}

const DAY_OFFSET = Object.freeze({
  Monday: 0,
  Tuesday: 1,
  Wednesday: 2,
  Thursday: 3,
  Friday: 4,
  Saturday: 5,
  Sunday: 6,
});

/** Session instant for `weekNum` of a term: term start + week + weekday + HH:mm. */
function sessionDate(termStart, weekNum, dayOfWeek, startTime) {
  const [hours, minutes] = startTime.split(":").map(Number);
  const date = addDays(termStart, (weekNum - 1) * 7 + DAY_OFFSET[dayOfWeek]);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function emailFor(template, key) {
  return template.replace("{key}", key);
}

/**
 * Build the whole scenario.
 *
 * @param {object}   options
 * @param {Date}     options.now           Clock. Week 5 of the active term.
 * @param {string}   options.seedTag       Stamped on every top-level document.
 * @param {number}   [options.weeks=10]    Weeks in the active term.
 * @param {string}   [options.emailTemplate] "{key}" is replaced per user.
 */
function buildScenario({
  now,
  seedTag,
  weeks = 10,
  emailTemplate = "{key}@staging.tenacity.invalid",
}) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError("buildScenario requires options.now as a valid Date");
  }
  if (!seedTag) throw new TypeError("buildScenario requires options.seedTag");
  if (!Number.isInteger(weeks) || weeks < 5 || weeks > 20) {
    throw new RangeError("options.weeks must be an integer between 5 and 20");
  }
  if (!emailTemplate.includes("{key}")) {
    throw new TypeError('options.emailTemplate must contain "{key}"');
  }

  const year = String(now.getFullYear());
  // Put "today" in week 5 so there are always marked past weeks, a current
  // week with an unmarked roll, and future weeks with bookings only.
  const currentWeek = 5;
  const termStart = addDays(mondayOf(now), -(currentWeek - 1) * 7);
  const termEnd = addDays(termStart, weeks * 7 - 1);

  const activeTermId = `${year}_T3`;
  const previousTermId = `${year}_T2`;
  const nextTermId = `${year}_T4`;

  // ---------------------------------------------------------------- terms
  // Field names follow what the BACKEND writes and what TimetableService
  // queries (`termNum`, `weeksNum`, `status`) — not Term.toMap()'s names,
  // which disagree. See the note in the runbook.
  const terms = [
    {
      id: previousTermId,
      data: {
        year,
        termNum: 2,
        weeksNum: 10,
        status: "completed",
        startDate: addDays(termStart, -11 * 7),
        endDate: addDays(termStart, -7),
      },
    },
    {
      id: activeTermId,
      data: {
        year,
        termNum: 3,
        weeksNum: weeks,
        status: "active",
        startDate: termStart,
        endDate: termEnd,
      },
    },
    {
      id: nextTermId,
      data: {
        year,
        termNum: 4,
        weeksNum: 10,
        status: "upcoming",
        startDate: addDays(termEnd, 15),
        endDate: addDays(termEnd, 15 + 10 * 7 - 1),
      },
    },
  ];

  // ---------------------------------------------------------------- users
  // termsAccepted is deliberately mixed: parent-3 and parent-4 land on the
  // T&C gate at login, parent-1 and parent-2 go straight to the home screen.
  const users = [
    {
      symbolicId: "admin-1",
      key: "admin",
      role: "admin",
      firstName: "Ada",
      lastName: "Admin",
      phone: "0400000001",
      termsAccepted: true,
    },
    {
      symbolicId: "tutor-1",
      key: "tutor1",
      role: "tutor",
      firstName: "Tariq",
      lastName: "Tutor",
      phone: "0400000002",
      termsAccepted: true,
    },
    {
      symbolicId: "tutor-2",
      key: "tutor2",
      role: "tutor",
      firstName: "Tessa",
      lastName: "Tutor",
      phone: "0400000003",
      termsAccepted: true,
    },
    {
      symbolicId: "tutor-3",
      key: "tutor3",
      role: "tutor",
      firstName: "Theo",
      lastName: "Tutor",
      phone: "0400000004",
      termsAccepted: true,
    },
    {
      symbolicId: "parent-1",
      key: "parent1",
      role: "parent",
      firstName: "Pia",
      lastName: "Parent",
      phone: "0400000005",
      termsAccepted: true,
      lessonTokens: 2,
    },
    {
      symbolicId: "parent-2",
      key: "parent2",
      role: "parent",
      firstName: "Paul",
      lastName: "Parent",
      phone: "0400000006",
      termsAccepted: true,
      lessonTokens: 0,
    },
    {
      symbolicId: "parent-3",
      key: "parent3",
      role: "parent",
      firstName: "Priya",
      lastName: "Parent",
      phone: "0400000007",
      termsAccepted: false,
      lessonTokens: 1,
    },
    {
      symbolicId: "parent-4",
      key: "parent4",
      role: "parent",
      firstName: "Peter",
      lastName: "Parent",
      phone: "0400000008",
      termsAccepted: false,
      lessonTokens: 0,
    },
  ].map((user) => ({
    ...user,
    email: emailFor(emailTemplate, user.key),
    displayName: `${user.firstName} ${user.lastName}`,
  }));

  // ------------------------------------------------------------- students
  // student-4 has two parents with an explicit primaryParentId, which is the
  // shared-custody path the app handles differently.
  const students = [
    {
      id: "seed-student-1",
      data: {
        firstName: "Sam",
        lastName: "Parent",
        grade: "Year 9",
        subjects: [SUBJECT_MATHS, SUBJECT_ENGLISH],
        parents: [ref("parent-1")],
        primaryParentId: ref("parent-1"),
      },
    },
    {
      id: "seed-student-2",
      data: {
        firstName: "Sana",
        lastName: "Parent",
        grade: "Year 11",
        subjects: [SUBJECT_ENGLISH],
        parents: [ref("parent-1")],
        primaryParentId: ref("parent-1"),
      },
    },
    {
      id: "seed-student-3",
      data: {
        firstName: "Sol",
        lastName: "Parent",
        grade: "Year 10",
        subjects: [SUBJECT_MATHS],
        parents: [ref("parent-2")],
        primaryParentId: ref("parent-2"),
      },
    },
    {
      id: "seed-student-4",
      data: {
        firstName: "Suri",
        lastName: "Parent",
        grade: "Year 8",
        subjects: [SUBJECT_MATHS, SUBJECT_ENGLISH],
        parents: [ref("parent-2"), ref("parent-3")],
        primaryParentId: ref("parent-2"),
      },
    },
    {
      id: "seed-student-5",
      data: {
        firstName: "Sky",
        lastName: "Parent",
        grade: "Year 12",
        subjects: [SUBJECT_MATHS, SUBJECT_ENGLISH],
        parents: [ref("parent-3")],
        primaryParentId: ref("parent-3"),
      },
    },
    {
      id: "seed-student-6",
      data: {
        firstName: "Shay",
        lastName: "Parent",
        grade: "Year 7",
        subjects: [SUBJECT_ENGLISH],
        parents: [ref("parent-4")],
        primaryParentId: ref("parent-4"),
      },
    },
  ];

  // -------------------------------------------------------------- classes
  // Covers all three ClassEnrollmentStates: class-2 is full, class-3 is
  // pending (below minStudentsToOpen), the rest are open.
  const classes = [
    {
      id: "seed-class-1",
      data: {
        type: SUBJECT_MATHS,
        day: "Monday",
        startTime: "16:00",
        endTime: "17:00",
        capacity: 6,
        minStudentsToOpen: 2,
        enrolledStudents: ["seed-student-1", "seed-student-3", "seed-student-5"],
        tutors: [ref("tutor-1")],
      },
    },
    {
      id: "seed-class-2",
      data: {
        type: SUBJECT_ENGLISH,
        day: "Monday",
        startTime: "17:00",
        endTime: "18:00",
        capacity: 4,
        minStudentsToOpen: 2,
        enrolledStudents: [
          "seed-student-2",
          "seed-student-4",
          "seed-student-5",
          "seed-student-6",
        ],
        tutors: [ref("tutor-2")],
      },
    },
    {
      id: "seed-class-3",
      data: {
        type: SUBJECT_MATHS,
        day: "Tuesday",
        startTime: "16:00",
        endTime: "17:00",
        capacity: 6,
        minStudentsToOpen: 3,
        enrolledStudents: ["seed-student-2"],
        tutors: [ref("tutor-1"), ref("tutor-3")],
      },
    },
    {
      id: "seed-class-4",
      data: {
        type: SUBJECT_ENGLISH,
        day: "Wednesday",
        startTime: "15:30",
        endTime: "16:30",
        capacity: 5,
        minStudentsToOpen: 2,
        enrolledStudents: ["seed-student-1", "seed-student-6"],
        tutors: [ref("tutor-3")],
      },
    },
    {
      id: "seed-class-5",
      data: {
        type: SUBJECT_MATHS,
        day: "Thursday",
        startTime: "16:00",
        endTime: "17:00",
        capacity: 6,
        minStudentsToOpen: 2,
        enrolledStudents: ["seed-student-3", "seed-student-4"],
        tutors: [ref("tutor-2")],
      },
    },
  ];

  // ----------------------------------------------------------- attendance
  const attendance = [];
  for (const klass of classes) {
    for (let weekNum = 1; weekNum <= weeks; weekNum += 1) {
      const isPast = weekNum < currentWeek;
      const isCurrent = weekNum === currentWeek;

      // One cancelled session, so the cancelled-class UI has a subject.
      const cancelled = klass.id === "seed-class-2" && weekNum === 2;

      const booked = [...klass.data.enrolledStudents];
      // A one-off booking: a student in the roster for one future week only,
      // without being permanently enrolled. Exercises ClassModel.rosterFor.
      if (klass.id === "seed-class-1" && weekNum === 7) {
        booked.push("seed-student-6");
      }

      let marks = {};
      let rollCompletedBy = null;
      if (isPast && !cancelled) {
        const partial = klass.id === "seed-class-1" && weekNum === 3;
        const marked = partial ? booked.slice(0, 1) : booked;
        marks = Object.fromEntries(
          marked.map((studentId, index) => [
            studentId,
            index % 4 === 3 ? "away" : "here",
          ])
        );
        // The partially-marked week deliberately leaves rollCompletedAt unset
        // so Attendance.isRollCompleteFor returns false.
        if (!partial) rollCompletedBy = klass.data.tutors[0];
      }

      attendance.push({
        classId: klass.id,
        weekNum,
        docId: `${activeTermId}_W${weekNum}`,
        data: {
          date: sessionDate(
            termStart,
            weekNum,
            klass.data.day,
            klass.data.startTime
          ),
          termId: activeTermId,
          cancelled,
          weekNum,
          attendance: booked,
          tutors: [...klass.data.tutors],
          marks,
          rollCompletedBy,
          rollCompletedAt: rollCompletedBy ? sessionDate(termStart, weekNum, klass.data.day, klass.data.endTime) : null,
        },
        isPast,
        isCurrent,
      });
    }
  }

  // ------------------------------------------------------------- invoices
  // xeroInvoiceId and stripePaymentIntentId stay null: a fabricated Xero id
  // would send the app looking for a PDF that does not exist, and staging has
  // no Xero tenant.
  const invoiceSpecs = [
    { id: "seed-invoice-1", parent: "parent-1", students: ["seed-student-1", "seed-student-2"], status: "unpaid", weeks: 5, dueInDays: 9 },
    { id: "seed-invoice-2", parent: "parent-1", students: ["seed-student-1"], status: "paid", weeks: 10, dueInDays: -30 },
    { id: "seed-invoice-3", parent: "parent-2", students: ["seed-student-3", "seed-student-4"], status: "overdue", weeks: 5, dueInDays: -12 },
    { id: "seed-invoice-4", parent: "parent-2", students: ["seed-student-3"], status: "paid", weeks: 10, dueInDays: -35 },
    { id: "seed-invoice-5", parent: "parent-3", students: ["seed-student-5"], status: "unpaid", weeks: 5, dueInDays: 14 },
    { id: "seed-invoice-6", parent: "parent-4", students: ["seed-student-6"], status: "unpaid", weeks: 5, dueInDays: 21 },
  ];

  const unitAmount = 70;
  const invoices = invoiceSpecs.map((spec) => {
    const lineItems = spec.students.map((studentId) => {
      const student = students.find((s) => s.id === studentId);
      return {
        description: `${student.data.firstName} ${student.data.lastName} — tutoring, ${spec.weeks} week(s)`,
        quantity: spec.weeks,
        unitAmount,
        lineTotal: spec.weeks * unitAmount,
      };
    });
    const amountDue = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const paid = spec.status === "paid";

    return {
      id: spec.id,
      parentSymbolicId: spec.parent,
      data: {
        parentId: ref(spec.parent),
        parentName: null, // filled from the user record in writers.js
        parentEmail: null,
        studentIds: [...spec.students],
        lineItems,
        weeks: spec.weeks,
        amountDue,
        amountDueComputed: amountDue,
        amountDueOverride: null,
        status: spec.status,
        dueDate: addDays(now, spec.dueInDays),
        paidAt: paid ? addDays(now, spec.dueInDays - 2) : null,
        xeroInvoiceId: null,
        stripePaymentIntentId: null,
        adminNotes: null,
        createdByAdminId: ref("admin-1"),
      },
      payments: paid
        ? [
            {
              id: "seed-payment-1",
              data: {
                amountPaid: amountDue,
                paidAt: addDays(now, spec.dueInDays - 2),
                method: "stripe",
              },
            },
          ]
        : [],
    };
  });

  // ---------------------------------------------------------------- chats
  const chats = [
    {
      id: "seed-chat-1",
      participants: ["parent-1", "tutor-1"],
      unreadFor: "parent-1",
      messages: [
        { from: "tutor-1", text: "Hi Pia — Sam did really well on quadratics today.", minutesAgo: 2880 },
        { from: "parent-1", text: "That's great to hear, thank you!", minutesAgo: 2820 },
        { from: "tutor-1", text: "I've set some practice questions for next week.", minutesAgo: 90 },
      ],
    },
    {
      id: "seed-chat-2",
      participants: ["parent-2", "admin-1"],
      unreadFor: null,
      messages: [
        { from: "parent-2", text: "Could we move Sol to the Thursday class?", minutesAgo: 5760 },
        { from: "admin-1", text: "Yes — I'll sort that out today.", minutesAgo: 5700 },
      ],
    },
    {
      id: "seed-chat-3",
      participants: ["parent-3", "tutor-2"],
      unreadFor: "tutor-2",
      messages: [
        { from: "tutor-2", text: "Sky has been making steady progress with essay structure.", minutesAgo: 10080 },
        { from: "parent-3", text: "Thanks for the update.", minutesAgo: 10020 },
        { from: "parent-3", text: "Will there be a practice exam this term?", minutesAgo: 45 },
      ],
    },
  ];

  // -------------------------------------------------------- announcements
  const announcements = [
    {
      id: "seed-announcement-1",
      data: {
        title: "Term 3 has started",
        body: "Welcome back! Classes run as normal from this week.",
        audience: "all",
        archived: false,
        createdAt: addDays(now, -28),
      },
    },
    {
      id: "seed-announcement-2",
      data: {
        title: "Parent-teacher evening",
        body: "Bookings for the parent-teacher evening open next Monday.",
        audience: "parent",
        archived: false,
        createdAt: addDays(now, -3),
      },
    },
    {
      id: "seed-announcement-3",
      data: {
        title: "Term 2 wrap-up",
        body: "Thanks for a great term — see you in Term 3.",
        audience: "all",
        archived: true,
        createdAt: addDays(now, -70),
      },
    },
  ];

  // ------------------------------------------------------------- feedback
  // Keys are constrained by validFeedbackCreate in firestore.rules: classId
  // and sessionId must appear together or not at all, and progress must be one
  // of ahead | onTrack | needsSupport.
  const feedback = [
    {
      id: "seed-feedback-1",
      data: {
        studentId: "seed-student-1",
        tutorId: ref("tutor-1"),
        parentIds: [ref("parent-1")],
        subject: SUBJECT_MATHS,
        feedback: "Sam is handling simultaneous equations confidently now.",
        progress: "ahead",
        classId: "seed-class-1",
        sessionId: `${activeTermId}_W4`,
        isUnread: true,
        createdAt: addDays(now, -7),
      },
    },
    {
      id: "seed-feedback-2",
      data: {
        studentId: "seed-student-3",
        tutorId: ref("tutor-1"),
        parentIds: [ref("parent-2")],
        subject: SUBJECT_MATHS,
        feedback: "Sol needs more practice with fractions before the next test.",
        progress: "needsSupport",
        classId: "seed-class-1",
        sessionId: `${activeTermId}_W4`,
        isUnread: false,
        createdAt: addDays(now, -7),
      },
    },
    {
      id: "seed-feedback-3",
      data: {
        studentId: "seed-student-4",
        tutorId: ref("tutor-2"),
        parentIds: [ref("parent-2"), ref("parent-3")],
        subject: SUBJECT_ENGLISH,
        feedback: "Suri's essay planning has improved a lot this term.",
        progress: "onTrack",
        isUnread: false,
        createdAt: addDays(now, -14),
      },
    },
    {
      id: "seed-feedback-4",
      data: {
        studentId: "seed-student-6",
        tutorId: ref("tutor-3"),
        parentIds: [ref("parent-4")],
        subject: SUBJECT_ENGLISH,
        feedback: "Shay is settling in well and contributing to discussion.",
        progress: "onTrack",
        isUnread: true,
        createdAt: addDays(now, -2),
      },
    },
  ];

  // -------------------------------------------------------------- waitlist
  const waitlistEntries = [
    {
      id: "seed-waitlist-1",
      data: {
        classId: "seed-class-2",
        studentId: "seed-student-1",
        parentId: ref("parent-1"),
        classType: SUBJECT_ENGLISH,
        dayOfWeek: "Monday",
        startTime: "17:00",
        endTime: "18:00",
        status: "active",
        reason: "class_full",
        position: 1,
        createdAt: addDays(now, -5),
        updatedAt: addDays(now, -5),
      },
    },
  ];

  // ------------------------------------------------------------ enrolments
  const enrolments = [
    {
      id: "seed-enrolment-1",
      data: {
        carerFirstName: "Nadia",
        carerLastName: "Newcomer",
        carerEmail: emailFor(emailTemplate, "enrolment1"),
        carerPhone: "0400000009",
        emergencyContactName: "Nils Newcomer",
        emergencyContactPhone: "0400000010",
        studentFirstName: "Nina",
        studentLastName: "Newcomer",
        studentGrade: "Year 9",
        studentSubjects: [SUBJECT_MATHS],
        classes: ["seed-class-1"],
        referralSource: "Word of mouth",
        termsAccepted: true,
        status: "pending",
        archived: false,
        createdAt: addDays(now, -4),
      },
    },
    {
      id: "seed-enrolment-2",
      data: {
        carerFirstName: "Owen",
        carerLastName: "Older",
        carerEmail: emailFor(emailTemplate, "enrolment2"),
        carerPhone: "0400000011",
        emergencyContactName: "Olive Older",
        emergencyContactPhone: "0400000012",
        studentFirstName: "Otis",
        studentLastName: "Older",
        studentGrade: "Year 10",
        studentSubjects: [SUBJECT_ENGLISH],
        classes: ["seed-class-4"],
        referralSource: "Google",
        termsAccepted: true,
        status: "accepted",
        archived: true,
        createdAt: addDays(now, -60),
      },
    },
  ];

  return {
    seedTag,
    activeTermId,
    currentWeek,
    weeks,
    termStart,
    termEnd,
    terms,
    users,
    students,
    classes,
    attendance,
    invoices,
    chats,
    announcements,
    feedback,
    waitlistEntries,
    enrolments,
  };
}

module.exports = {
  SYMBOL_PREFIX,
  addDays,
  buildScenario,
  isRef,
  mondayOf,
  ref,
  sessionDate,
  symbolOf,
};
