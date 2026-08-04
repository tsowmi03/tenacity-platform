import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

const projectId = "demo-tenacity-rules-test";
let testEnv;

function authedDb(uid, role) {
  return testEnv.authenticatedContext(uid, {
    email: `${uid}@example.com`,
    role,
  }).firestore();
}

function anonDb() {
  return testEnv.unauthenticatedContext().firestore();
}

function validFeedbackPayload(overrides = {}) {
  return {
    studentId: "student-1",
    tutorId: "tutor-1",
    parentIds: ["parent-1"],
    subject: "Great progress",
    feedback: "Good work this week",
    createdAt: serverTimestamp(),
    isUnread: true,
    ...overrides,
  };
}

async function seedFirestore() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    await setDoc(doc(db, "users", "admin-1"), {
      role: "admin",
      firstName: "Ada",
      students: [],
    });
    await setDoc(doc(db, "users", "tutor-1"), {
      role: "tutor",
      firstName: "Tess",
      students: [],
    });
    await setDoc(doc(db, "users", "parent-1"), {
      role: "parent",
      firstName: "Pat",
      students: ["student-1"],
    });
    await setDoc(doc(db, "users", "parent-2"), {
      role: "parent",
      firstName: "Pia",
      students: ["student-2"],
    });

    await setDoc(doc(db, "students", "student-1"), {
      firstName: "Alex",
      lastName: "Parent",
      parents: ["parent-1"],
      primaryParentId: "parent-1",
    });
    await setDoc(doc(db, "students", "student-2"), {
      firstName: "Blair",
      lastName: "Other",
      parents: ["parent-2"],
      primaryParentId: "parent-2",
    });

    await setDoc(doc(db, "classes", "class-1"), {
      type: "Maths",
      day: "Monday",
      enrolledStudents: ["student-1"],
      tutors: ["tutor-1"],
    });
    await setDoc(doc(db, "classes", "class-1", "attendance", "week-1"), {
      attendance: ["student-1"],
      tutors: ["tutor-1"],
      termId: "term-1",
      // The app's week query filters on this, so the fixture carries it.
      weekNum: 1,
      cancelled: false,
    });
    await setDoc(doc(db, "terms", "term-1"), {
      status: "active",
      year: 2026,
    });
    await setDoc(doc(db, "announcements", "announcement-1"), {
      title: "Open",
      archived: false,
    });
    await setDoc(doc(db, "announcements", "announcement-2"), {
      title: "Archived",
      archived: true,
    });

    await setDoc(doc(db, "invoices", "invoice-1"), {
      parentId: "parent-1",
      amountDue: 120,
      status: "unpaid",
    });
    await setDoc(doc(db, "invoices", "invoice-2"), {
      parentId: "parent-2",
      amountDue: 90,
      status: "unpaid",
    });
    await setDoc(doc(db, "payslips", "payslip-1"), {
      tutorId: "tutor-1",
      amount: 250,
    });
    await setDoc(doc(db, "feedback", "feedback-1"), {
      studentId: "student-1",
      tutorId: "tutor-1",
      parentIds: ["parent-1"],
      isUnread: true,
      feedback: "Good work",
    });
    await setDoc(doc(db, "waitlistEntries", "class-1_student-1"), {
      classId: "class-1",
      studentId: "student-1",
      parentId: "parent-1",
      status: "active",
    });
    await setDoc(doc(db, "resourceJobs", "resource-1"), {
      createdBy: "tutor-1",
      studentId: "student-1",
      status: "pending",
      createdAt: 1,
    });
    await setDoc(doc(db, "resourceJobs", "resource-2"), {
      createdBy: "other-tutor",
      studentId: "student-2",
      status: "complete",
      createdAt: 2,
    });
    await setDoc(doc(db, "chats", "chat-1"), {
      participants: ["parent-1", "tutor-1"],
      unreadCounts: { "parent-1": 1, "tutor-1": 0 },
      typingStatus: { "parent-1": false, "tutor-1": false },
      deletedFor: {},
      updatedAt: 1,
    });
    await setDoc(doc(db, "chats", "chat-1", "messages", "message-1"), {
      senderId: "tutor-1",
      text: "Hello",
      readBy: {},
      timestamp: 1,
    });
    await setDoc(doc(db, "adminAuditLogs", "audit-1"), {
      action: "seed",
      createdAt: 1,
    });
    await setDoc(doc(db, "year11Interest", "interest-1"), {
      parentFirstName: "Pat",
      parentLastName: "Parent",
      parentEmail: "pat@example.com",
      parentPhone: "0400000000",
      studentFirstName: "Alex",
      studentLastName: "Parent",
      school: "Sydney Technical High School",
      currentYear: "year_10",
      studentStatus: "continuing",
      mathsCourses: ["maths_advanced"],
      englishCourses: [],
      preferredDays: ["tuesday"],
      notes: "",
      status: "new",
      archived: false,
      createdAt: 1,
    });
  });
}

describe("firestore rules", () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId,
      firestore: {
        host: "127.0.0.1",
        port: 8080,
        rules: readFileSync(
          new URL(
            "../../../backend/firebase/rules/firestore.rules",
            import.meta.url
          ),
          "utf8"
        ),
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seedFirestore();
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it("blocks anonymous access to private collections but keeps public class slots readable", async () => {
    const db = anonDb();

    await assertSucceeds(getDocs(collection(db, "classes")));
    await assertFails(getDoc(doc(db, "users", "parent-1")));
    await assertFails(getDoc(doc(db, "students", "student-1")));
    await assertFails(getDoc(doc(db, "invoices", "invoice-1")));
  });

  it("lets a signed-in user query attendance across classes, and keeps anonymous out", async () => {
    // The mobile timetable loads a whole week in one collection-group query
    // rather than a document per class. A path-scoped rule does not cover
    // that query shape, so this is what proves the wildcard rule is present.
    //
    const weekQuery = (db) =>
      query(
        collectionGroup(db, "attendance"),
        where("termId", "==", "term-1"),
        where("weekNum", "==", 1),
      );

    await assertSucceeds(getDocs(weekQuery(authedDb("parent-1", "parent"))));
    await assertSucceeds(getDocs(weekQuery(authedDb("tutor-1", "tutor"))));
    await assertFails(getDocs(weekQuery(anonDb())));
  });

  it("blocks anonymous enrolment creates now that registration uses the verified API", async () => {
    const db = anonDb();

    await assertFails(
      setDoc(doc(db, "enrolments", "public-1"), {
        carerFirstName: "Pat",
        carerLastName: "Parent",
        carerEmail: "pat@example.com",
        carerPhone: "0400000000",
        studentFirstName: "Alex",
        studentLastName: "Parent",
        studentYear: "Year 7",
        studentSubjects: ["Maths"],
        classes: [{ id: "class-1", type: "Maths" }],
        emergencyContactFirstName: "Casey",
        emergencyContactLastName: "Parent",
        emergencyContactPhone: "0400000001",
        emergencyContactRelation: "Parent",
        permissionToLeave: false,
        allergies: "",
        additionalInfo: "",
        termsAccepted: true,
        archived: false,
      })
    );

    await assertFails(
      setDoc(doc(db, "enrolments", "bad-1"), {
        carerEmail: "pat@example.com",
        studentFirstName: "Alex",
        studentLastName: "Parent",
        termsAccepted: true,
        archived: true,
      })
    );
    await assertFails(
      setDoc(doc(db, "enrolments", "bad-2"), {
        carerEmail: "pat@example.com",
        studentFirstName: "Alex",
        studentLastName: "Parent",
        termsAccepted: true,
        archived: false,
        role: "admin",
      })
    );
  });

  it("allows parents to read their own linked data only", async () => {
    const db = authedDb("parent-1", "parent");

    await assertSucceeds(getDoc(doc(db, "users", "parent-1")));
    await assertSucceeds(getDoc(doc(db, "students", "student-1")));
    await assertSucceeds(getDoc(doc(db, "invoices", "invoice-1")));
    await assertSucceeds(getDoc(doc(db, "chats", "chat-1")));
    await assertSucceeds(getDoc(doc(db, "waitlistEntries", "class-1_student-1")));

    await assertFails(getDoc(doc(db, "students", "student-2")));
    await assertFails(getDoc(doc(db, "invoices", "invoice-2")));
    await assertFails(getDoc(doc(db, "users", "parent-2")));
  });

  it("allows parents to query tutor/admin contacts but not all users", async () => {
    const db = authedDb("parent-1", "parent");

    await assertSucceeds(
      getDocs(query(collection(db, "users"), where("role", "in", ["tutor", "admin"])))
    );
    await assertFails(getDocs(collection(db, "users")));
  });

  it("allows parent profile and feedback read-state updates but blocks invoice payment writes", async () => {
    const db = authedDb("parent-1", "parent");

    await assertSucceeds(
      updateDoc(doc(db, "users", "parent-1"), {
        firstName: "Patrick",
        acceptedTermsVersion: "2026.1",
      })
    );
    await assertSucceeds(updateDoc(doc(db, "students", "student-1"), { firstName: "Alexis" }));
    await assertSucceeds(updateDoc(doc(db, "feedback", "feedback-1"), { isUnread: false }));
    await assertSucceeds(
      updateDoc(doc(db, "invoices", "invoice-1"), {
        xeroInvoicePdfPath: "invoices-pdfs/invoice-1.pdf",
      })
    );

    await assertFails(updateDoc(doc(db, "invoices", "invoice-1"), { status: "paid" }));
    await assertFails(updateDoc(doc(db, "users", "parent-1"), { role: "admin" }));
  });

  it("allows staff to create valid feedback documents", async () => {
    const db = authedDb("tutor-1", "tutor");

    await assertSucceeds(
      setDoc(doc(db, "feedback", "feedback-new"), validFeedbackPayload())
    );
  });

  it("rejects malformed or non-staff feedback creates", async () => {
    const tutorDb = authedDb("tutor-1", "tutor");
    const parentDb = authedDb("parent-1", "parent");

    await assertFails(
      setDoc(doc(parentDb, "feedback", "feedback-parent"), validFeedbackPayload())
    );
    await assertFails(
      setDoc(
        doc(tutorDb, "feedback", "feedback-wrong-tutor"),
        validFeedbackPayload({ tutorId: "admin-1" })
      )
    );
    await assertFails(
      setDoc(doc(tutorDb, "feedback", "feedback-missing"), {
        studentId: "student-1",
        tutorId: "tutor-1",
        subject: "Great progress",
      })
    );
    await assertFails(
      setDoc(
        doc(tutorDb, "feedback", "feedback-empty-subject"),
        validFeedbackPayload({ subject: "" })
      )
    );
    await assertFails(
      setDoc(
        doc(tutorDb, "feedback", "feedback-read"),
        validFeedbackPayload({ isUnread: false })
      )
    );
    await assertFails(
      setDoc(
        doc(tutorDb, "feedback", "feedback-action"),
        validFeedbackPayload({
          notificationAction: { type: "create_feedback" },
        })
      )
    );
  });

  it("allows session-linked feedback from a marked roll", async () => {
    const db = authedDb("tutor-1", "tutor");

    await assertSucceeds(
      setDoc(
        doc(db, "feedback", "feedback-session"),
        validFeedbackPayload({
          classId: "class-1",
          sessionId: "term-3_W2",
          progress: "onTrack",
        })
      )
    );

    // Progress alone is valid: an admin may record it outside a session.
    await assertSucceeds(
      setDoc(
        doc(db, "feedback", "feedback-progress-only"),
        validFeedbackPayload({ progress: "needsSupport" })
      )
    );
  });

  it("rejects malformed session links and progress values", async () => {
    const db = authedDb("tutor-1", "tutor");

    await assertFails(
      setDoc(
        doc(db, "feedback", "feedback-bad-progress"),
        validFeedbackPayload({ progress: "excellent" })
      )
    );
    // A session id naming no class cannot be matched back to a roll.
    await assertFails(
      setDoc(
        doc(db, "feedback", "feedback-orphan-session"),
        validFeedbackPayload({ sessionId: "term-3_W2" })
      )
    );
    await assertFails(
      setDoc(
        doc(db, "feedback", "feedback-orphan-class"),
        validFeedbackPayload({ classId: "class-1" })
      )
    );
    await assertFails(
      setDoc(
        doc(db, "feedback", "feedback-empty-class"),
        validFeedbackPayload({ classId: "", sessionId: "term-3_W2" })
      )
    );
  });

  it("allows tutors to use app-required staff surfaces without payment access", async () => {
    const db = authedDb("tutor-1", "tutor");

    await assertSucceeds(getDocs(collection(db, "students")));
    await assertSucceeds(getDocs(collection(db, "users")));
    await assertSucceeds(getDoc(doc(db, "payslips", "payslip-1")));
    await assertSucceeds(
      updateDoc(doc(db, "classes", "class-1", "attendance", "week-1"), {
        cancelled: true,
      })
    );

    await assertFails(getDoc(doc(db, "invoices", "invoice-1")));
    await assertFails(updateDoc(doc(db, "classes", "class-1"), { type: "Science" }));
  });

  it("allows chat participants to read and update participant-safe chat fields", async () => {
    const parentDb = authedDb("parent-1", "parent");
    const otherParentDb = authedDb("parent-2", "parent");

    await assertSucceeds(getDoc(doc(parentDb, "chats", "chat-1", "messages", "message-1")));
    await assertSucceeds(
      updateDoc(doc(parentDb, "chats", "chat-1"), {
        unreadCounts: { "parent-1": 0, "tutor-1": 0 },
      })
    );
    await assertSucceeds(
      updateDoc(doc(parentDb, "chats", "chat-1", "messages", "message-1"), {
        readBy: { "parent-1": 1 },
      })
    );

    await assertFails(getDoc(doc(otherParentDb, "chats", "chat-1")));
    await assertFails(setDoc(doc(parentDb, "chats", "chat-1", "messages", "message-2"), {
      senderId: "parent-1",
      text: "Direct create should use callable",
    }));
  });

  it("allows admins to manage admin collections but blocks client writes to internal collections", async () => {
    const db = authedDb("admin-1", "admin");

    await assertSucceeds(setDoc(doc(db, "classes", "class-2"), { type: "English" }));
    await assertSucceeds(
      setDoc(doc(db, "enrolments", "admin-created"), {
        carerFirstName: "Pat",
        carerLastName: "Parent",
        carerEmail: "pat@example.com",
        carerPhone: "0400000000",
        studentFirstName: "Alex",
        studentLastName: "Parent",
        studentYear: "Year 7",
        studentSubjects: ["Maths"],
        classes: [{ id: "class-1", type: "Maths" }],
        emergencyContactFirstName: "Casey",
        emergencyContactLastName: "Parent",
        emergencyContactPhone: "0400000001",
        emergencyContactRelation: "Parent",
        permissionToLeave: false,
        allergies: "",
        additionalInfo: "",
        termsAccepted: true,
        archived: false,
      })
    );
    await assertSucceeds(updateDoc(doc(db, "invoices", "invoice-1"), { status: "overdue" }));
    await assertSucceeds(getDocs(collection(db, "announcements")));
    await assertSucceeds(getDocs(collection(db, "users")));
    await assertSucceeds(getDoc(doc(db, "adminAuditLogs", "audit-1")));
    await assertSucceeds(getDocs(collection(db, "resourceJobs")));

    await assertFails(setDoc(doc(db, "adminAuditLogs", "audit-2"), { action: "client-write" }));
    await assertFails(setDoc(doc(db, "resourceJobs", "resource-3"), { createdBy: "admin-1" }));
    await assertFails(setDoc(doc(db, "counters", "invoices"), { current: 1 }));
    await assertFails(setDoc(doc(db, "xeroTokens", "main"), { token: "secret" }));
  });

  it("allows staff to read all resource jobs but blocks client writes", async () => {
    const tutorDb = authedDb("tutor-1", "tutor");
    const parentDb = authedDb("parent-1", "parent");

    await assertSucceeds(getDoc(doc(tutorDb, "resourceJobs", "resource-1")));
    await assertSucceeds(getDoc(doc(tutorDb, "resourceJobs", "resource-2")));
    await assertSucceeds(getDocs(collection(tutorDb, "resourceJobs")));
    await assertFails(getDoc(doc(parentDb, "resourceJobs", "resource-1")));
    await assertFails(updateDoc(doc(tutorDb, "resourceJobs", "resource-1"), { status: "failed" }));
  });

  it("allows user-owned notification token and settings writes", async () => {
    const db = authedDb("parent-1", "parent");

    await assertSucceeds(setDoc(doc(db, "userSettings", "parent-1"), { email: true }));
    await assertSucceeds(setDoc(doc(db, "userTokens", "parent-1"), { uid: "parent-1" }));
    await assertSucceeds(
      setDoc(doc(db, "userTokens", "parent-1", "tokens", "token-1"), {
        token: "token-1",
        platform: "ios",
      })
    );

    await assertFails(setDoc(doc(db, "userSettings", "parent-2"), { email: true }));
    await assertFails(deleteDoc(doc(db, "userTokens", "parent-2", "tokens", "token-2")));
  });

  it("lets admins read and triage Year 11 interest but never create or delete it", async () => {
    const adminDb = authedDb("admin-1", "admin");

    await assertSucceeds(getDocs(collection(adminDb, "year11Interest")));
    await assertSucceeds(
      updateDoc(doc(adminDb, "year11Interest", "interest-1"), {
        status: "contacted",
        statusUpdatedAt: serverTimestamp(),
      })
    );
    await assertSucceeds(
      updateDoc(doc(adminDb, "year11Interest", "interest-1"), { archived: true })
    );

    // The public form writes through the admin SDK, so clients never create.
    await assertFails(
      setDoc(doc(adminDb, "year11Interest", "interest-2"), { status: "new" })
    );
    await assertFails(deleteDoc(doc(adminDb, "year11Interest", "interest-1")));

    // Submitted data itself must not be editable from the portal.
    await assertFails(
      updateDoc(doc(adminDb, "year11Interest", "interest-1"), {
        parentEmail: "changed@example.com",
      })
    );
  });

  it("hides Year 11 interest from tutors, parents and anonymous visitors", async () => {
    const tutorDb = authedDb("tutor-1", "tutor");
    const parentDb = authedDb("parent-1", "parent");

    await assertFails(getDoc(doc(tutorDb, "year11Interest", "interest-1")));
    await assertFails(getDoc(doc(parentDb, "year11Interest", "interest-1")));
    await assertFails(getDoc(doc(anonDb(), "year11Interest", "interest-1")));
    await assertFails(
      updateDoc(doc(tutorDb, "year11Interest", "interest-1"), { status: "contacted" })
    );
  });
});
