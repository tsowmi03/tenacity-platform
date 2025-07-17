import * as admin from "firebase-admin";
import { onCall } from "firebase-functions/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import { v4 as uuid } from "uuid";

const db = admin.firestore();

// Helper to compute the first session date for a class in a term.
function computeFirstSessionDate(termStart: Date, classDay: string): Date {
  const dayOffsets: { [key: string]: number } = {
    monday: 0,
    tuesday: 1,
    wednesday: 2,
    thursday: 3,
    friday: 4,
    saturday: 5,
    sunday: 6,
  };
  const offset = dayOffsets[classDay.toLowerCase()] ?? 0;
  const firstSession = new Date(termStart);
  firstSession.setDate(termStart.getDate() + offset);
  return firstSession;
}

// Helper: Pre-generate attendance docs for a class for a given term.
async function generateAttendanceDocsForTerm(
  classModel: any,
  term: any,
  firstSessionDate: Date
): Promise<void> {
  const classRef = admin.firestore().collection('classes').doc(classModel.id);
  const attendanceColl = classRef.collection('attendance');

  for (let w = 1; w <= term.weeksNum; w++) {
    // Create doc ID in format "YYYY_TN_WN"
    const attendanceDocId = `${term.id}_W${w}`;
    // Session date: firstSessionDate + (w-1)*7 days
    const sessionDate = new Date(firstSessionDate);
    sessionDate.setDate(firstSessionDate.getDate() + (w - 1) * 7);

    // Set session time using classModel.startTime ("HH:mm")
    if (classModel.startTime && typeof classModel.startTime === "string" && classModel.startTime.includes(":")) {
      const [h, m] = classModel.startTime.split(":").map(Number);
      sessionDate.setHours(h, m, 0, 0);
    }

    const newAttendance = {
      id: attendanceDocId,
      termId: term.id,
      weekNumber: w,
      date: admin.firestore.Timestamp.fromDate(sessionDate),
      updatedAt: admin.firestore.Timestamp.now(),
      updatedBy: 'system',
      // Pre-fill with permanently enrolled students.
      attendance: classModel.enrolledStudents || [],
      tutors: classModel.tutors || [],
    };

    await attendanceColl.doc(attendanceDocId).set(newAttendance);
  }
}

// Cloud Function that runs daily at 00:05.
export const rolloverTermData = onSchedule(
    {
      schedule: "every day 00:05",
      // optional: timeZone: "Australia/Sydney"
    },
    async (context) => {
    const db = admin.firestore();
    const now = new Date();
    
    // Define a window for "yesterday" – the day the term ended.
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const tomorrow = new Date(yesterday);
    tomorrow.setDate(yesterday.getDate() + 1);

    try {
      // 1. Find the term that ended yesterday.
      const endedTermQuery = await db.collection('terms')
        .where('endDate', '>=', admin.firestore.Timestamp.fromDate(yesterday))
        .where('endDate', '<', admin.firestore.Timestamp.fromDate(tomorrow))
        .get();
      
      if (endedTermQuery.empty) {
        console.log("No term ended yesterday. Exiting.");
        return;
      }
      
      let endedTerm: any;
      endedTermQuery.forEach(doc => {
        endedTerm = { id: doc.id, ...doc.data() };
      });
      
      // 2. Mark the ended term as inactive.
      await db.collection('terms').doc(endedTerm.id).update({ status: 'inactive' });
      console.log(`Term ${endedTerm.id} marked as inactive.`);
      
      // 3. Find the next term.
      // query for the term with the earliest startDate that is greater than the ended term's endDate.
      const newTermQuery = await db.collection('terms')
        .where('startDate', '>', endedTerm.endDate)
        .orderBy('startDate', 'asc')
        .limit(1)
        .get();
      
      if (newTermQuery.empty) {
        console.log("No new term found.");
        return;
      }
      
      let newTerm: any;
      newTermQuery.forEach(doc => {
        newTerm = { id: doc.id, ...doc.data() };
      });
      
      // 4. Mark the status for the new term.
      const newTermStart = newTerm.startDate.toDate();
      await db.collection('terms').doc(newTerm.id).update({ status: "active" });
      console.log(`Term ${newTerm.id} marked as "active".`);
      
      // 5. For each class, generate attendance docs for the new term.
      const classesSnapshot = await db.collection('classes').get();
      const promises: Promise<void>[] = [];
      classesSnapshot.forEach(doc => {
        const classData = doc.data();
        // Compute the first session date for this class in the new term.
        const firstSessionDate = computeFirstSessionDate(newTermStart, classData.day);
        promises.push(
          generateAttendanceDocsForTerm(
            { id: doc.id, ...classData },
            newTerm,
            firstSessionDate
          )
        );
      });
      
      await Promise.all(promises);
      console.log("Attendance docs generated for new term on all classes.");
      
      return;
    } catch (error) {
      console.error("Error during term rollover:", error);
      throw new Error("Term rollover failed");
    }
  });

export const deleteUserByUidV2 = onCall(async (request) => {
  const { uid } = request.data;
  console.log(`[deleteUserByUidV2] Request received. Data:`, request.data);

  if (!uid) {
    console.error("[deleteUserByUidV2] Missing uid in request data.");
    throw new Error("Missing uid");
  }

  try {
    console.log(`[deleteUserByUidV2] Attempting to delete user with uid: ${uid}`);
    await admin.auth().deleteUser(uid);
    console.log(`[deleteUserByUidV2] Successfully deleted user with uid: ${uid}`);
    return { success: true };
  } catch (error: any) {
    console.error(`[deleteUserByUidV2] Error deleting user with uid: ${uid}`, error);
    throw new Error(error.message || "Failed to delete user");
  }
});

export const generateTermInvoices = onSchedule(
  { schedule: "every day 09:00" },
  async (context) => {
    const now = new Date();

    // 1. Find the current active term whose startDate has commenced and invoices not generated
    const termSnap = await db
      .collection("terms")
      .where("status", "==", "active")
      .where("startDate", "<=", admin.firestore.Timestamp.fromDate(now))
      .where("invoicesGeneratedAt", "==", null)
      .limit(1)
      .get();

    if (termSnap.empty) {
      console.log("[generateTermInvoices] No eligible term found (either not started or invoices already generated).");
      return;
    }

    const termDoc = termSnap.docs[0];
    const termId = termDoc.id;
    const term = termDoc.data()!;
    const weeks = term.weeksNum as number;
    const termStart = term.startDate.toDate();
    const nowTs = admin.firestore.Timestamp.now();

    // 1) Load all classes for this term
    const classesSnap = await db
      .collection("classes")
      .get();

    // 2) Build up a per-parent invoice payload
    type LineItem = {
      description: string;
      quantity:    number;
      unitAmount:  number;
      lineTotal:   number;
    };
    type Payload = {
      parentId:    string;
      parentName:  string;
      parentEmail: string;
      lineItems:   LineItem[];
    };
    const invoicesByParent = new Map<string, Payload>();

    for (const clsDoc of classesSnap.docs) {
      const clsData = clsDoc.data() as any;
      const className = clsData.type || "Class";
      const enrolledStudents: string[] = clsData.enrolledStudents || [];

      for (const studentId of enrolledStudents) {
        // a) load student, derive grade & rate
        const studentSnap = await db.collection("students").doc(studentId).get();
        if (!studentSnap.exists) continue;
        const student = studentSnap.data() as any;
        const gradeNum = parseInt((student.grade||"").replace(/\D/g, ""), 10) || 0;
        const baseRate = gradeNum >= 7 && gradeNum <= 12 ? 70 : 60;

        // b) load parent (first in array)
        const parentId = student.primaryParentId || (student.parents as string[])[0];
        if (!parentId) continue;
        const userSnap = await db.collection("users").doc(parentId).get();
        if (!userSnap.exists) continue;
        const user = userSnap.data() as any;

        // c) init payload
        if (!invoicesByParent.has(parentId)) {
          invoicesByParent.set(parentId, {
            parentId,
            parentName:  `${user.firstName} ${user.lastName}`,
            parentEmail: user.email,
            lineItems:   [],
          });
        }
        const payload = invoicesByParent.get(parentId)!;

        // d) push one line item per class-session series
        const subtotal = baseRate * weeks;
        payload.lineItems.push({
          description: `${student.firstName} ${student.lastName} — ${className}`,
          quantity:    weeks,
          unitAmount:  baseRate,
          lineTotal:   subtotal,
        });
      }
    }

    // 3) Apply "second-lesson" discount: for every 2 full lines, −$10/session
    for (const payload of invoicesByParent.values()) {
      const fullCount = payload.lineItems.length;
      const pairs     = Math.floor(fullCount / 2);
      for (let i = 0; i < pairs; i++) {
        const discLineTotal = -10 * weeks;
        payload.lineItems.push({
          description: "Second lesson discount",
          quantity:    weeks,
          unitAmount:  -10,
          lineTotal:   discLineTotal,
        });
      }
    }

    // 4) Write each invoice doc
    const batch = db.batch();
    for (const p of invoicesByParent.values()) {
      const invId   = uuid();
      const amount  = p.lineItems.reduce((sum, li) => sum + li.lineTotal, 0);
      const dueDate = admin.firestore.Timestamp.fromDate(
        new Date(termStart.getTime() + 21 * 24 * 60 * 60 * 1000)
      );
      const ref = db.collection("invoices").doc(invId);
      batch.set(ref, {
        parentId:    p.parentId,
        parentName:  p.parentName,
        parentEmail: p.parentEmail,
        lineItems:   p.lineItems,
        weeks:       weeks,
        amountDue:   amount,
        status:      "unpaid",
        dueDate:     dueDate,
        createdAt:   nowTs,
        termId:      termId,
      });
    }
    await batch.commit();

    // 5. After successful invoice creation, mark invoices as generated for this term
    await db.collection("terms").doc(termId).update({
      invoicesGeneratedAt: nowTs,
    });

    console.log(`[generateTermInvoices] Invoices generated and marked for term ${termId}.`);
  }
);

/**
 * Dry-run generator for the CURRENT active term.
 * Logs what invoices WOULD be created, but writes nothing.
 */
export const dryRunCurrentTermInvoices = onRequest(
  {},
  async (_req, res) => {
    try {
      console.log("[dryRunCurrentTermInvoices] Starting dry run for current active term.");

      // 1) Grab the active term
      console.log("[dryRunCurrentTermInvoices] Fetching active term...");
      const termSnap = await db
        .collection("terms")
        .where("status", "==", "active")
        .limit(1)
        .get();
      if (termSnap.empty) {
        console.log("[dryRunCurrentTermInvoices] No active term found.");
        res.status(404).send("No active term found");
        return;
      }
      const termDoc = termSnap.docs[0];
      const termId = termDoc.id;
      const term = termDoc.data()!;
      const weeks = term.weeksNum as number;
      console.log(`[dryRunCurrentTermInvoices] Active term: ${termId}, weeks: ${weeks}`);

      // 2) Load all classes in that term
      console.log(`[dryRunCurrentTermInvoices] Fetching classes for term ${termId}...`);
      const classesSnap = await db
        .collection("classes")
        .get();
      console.log(`[dryRunCurrentTermInvoices] Found ${classesSnap.size} classes.`);

      type LineItem = {
        description: string;
        quantity: number;
        unitAmount: number;
        lineTotal: number;
      };
      type Payload = {
        parentId: string;
        parentName: string;
        parentEmail: string;
        lineItems: LineItem[];
      };
      const invoicesByParent = new Map<string, Payload>();

      // 3) Build each parent's line items
      for (const clsDoc of classesSnap.docs) {
        const cls = clsDoc.data() as any;
        const name = cls.type || clsDoc.id;
        console.log(`[dryRunCurrentTermInvoices] Processing class: ${name} (${clsDoc.id})`);
        for (const studentId of cls.enrolledStudents || []) {
          console.log(`[dryRunCurrentTermInvoices] Fetching student: ${studentId}`);
          const studentSnap = await db.collection("students").doc(studentId).get();
          if (!studentSnap.exists) {
            console.log(`[dryRunCurrentTermInvoices] Student ${studentId} not found, skipping.`);
            continue;
          }
          const student = studentSnap.data() as any;
          const gradeNum = parseInt((student.grade || "").replace(/\D/g, ""), 10) || 0;
          const rate = gradeNum >= 7 && gradeNum <= 12 ? 70 : 60;
          const parentId = (student.parents as string[])[0];
          if (!parentId) {
            console.log(`[dryRunCurrentTermInvoices] No parent found for student ${studentId}, skipping.`);
            continue;
          }
          console.log(`[dryRunCurrentTermInvoices] Fetching parent: ${parentId}`);
          const userSnap = await db.collection("users").doc(parentId).get();
          if (!userSnap.exists) {
            console.log(`[dryRunCurrentTermInvoices] Parent ${parentId} not found, skipping.`);
            continue;
          }
          const user = userSnap.data() as any;

          if (!invoicesByParent.has(parentId)) {
            invoicesByParent.set(parentId, {
              parentId,
              parentName: `${user.firstName} ${user.lastName}`,
              parentEmail: user.email,
              lineItems: [],
            });
            console.log(`[dryRunCurrentTermInvoices] Created invoice payload for parent: ${user.email}`);
          }
          const p = invoicesByParent.get(parentId)!;
          const subtotal = rate * weeks;
          p.lineItems.push({
            description: `${student.firstName} ${student.lastName} — ${name}`,
            quantity: weeks,
            unitAmount: rate,
            lineTotal: subtotal,
          });
          console.log(`[dryRunCurrentTermInvoices] Added line item for ${student.firstName} ${student.lastName} (${user.email}): $${subtotal}`);
        }
      }

      // 4) Apply second-lesson discount
      console.log("[dryRunCurrentTermInvoices] Applying second-lesson discounts...");
      for (const p of invoicesByParent.values()) {
        const pairs = Math.floor(p.lineItems.length / 2);
        for (let i = 0; i < pairs; i++) {
          p.lineItems.push({
            description: "Second lesson discount",
            quantity: weeks,
            unitAmount: -10,
            lineTotal: -10 * weeks,
          });
          console.log(`[dryRunCurrentTermInvoices] Applied second lesson discount for ${p.parentEmail}: -$${10 * weeks}`);
        }
      }

      // 5) Log what WOULD be written
      console.log("[dryRunCurrentTermInvoices] Final invoice preview:");
      const output = Array.from(invoicesByParent.values()).map(p => {
        const total = p.lineItems.reduce((s, li) => s + li.lineTotal, 0);
        console.log("[dryRunCurrentTermInvoices] Invoice for", p.parentEmail, JSON.stringify(p, null, 2));
        return {
          parentEmail: p.parentEmail,
          amountDue: total,
          lineItems: p.lineItems,
        };
      });

      res.status(200).json({ termId, count: output.length, invoices: output });
      console.log("[dryRunCurrentTermInvoices] Dry run complete.");
    } catch (err: any) {
      console.error("dryRunCurrentTermInvoices error:", err);
      res.status(500).send(err.message);
    }
  }
);
