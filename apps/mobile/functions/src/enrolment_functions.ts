import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { defineSecret } from "firebase-functions/params";
import { sendParentWelcomeEmail } from "./email_functions";

const db = admin.firestore();
const sendgridApiKey = defineSecret("SENDGRID_API_KEY");

// Define the type at the top of your file or near where you build parentDocData
type ParentDocData = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  students: string[];
  lessonTokens: number;
  termsAccepted: boolean;
  acceptedTermsVersion: string | null;
  acceptedTermsAt: any | null;
};

// -----------------------------------------------------------------------------------
// Function: acceptPendingEnrolment (HTTPS v2)
//    - Called via a link in the admin’s email
//    - Reads from `enrolments/{enrolmentId}`, creates parent/student docs, etc.
// -----------------------------------------------------------------------------------
export const acceptPendingEnrolment = onRequest(
    {
      secrets: [sendgridApiKey],
    },
    async (req, res) => {
      res.set("Access-Control-Allow-Origin", "https://admin.tenacitytutoring.com");
      res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");

      // 2) If it’s an OPTIONS request, just return 200
      if (req.method === "OPTIONS") {
        res.status(200).send("");
        return; 
      }

      // 2) Verify the token for GET, POST, etc.
      const authHeader = req.headers.authorization || "";
      if (!authHeader.startsWith("Bearer ")) {
        res.status(401).send("No bearer token");
        return;
      }

      const idToken = authHeader.split(" ")[1];
      try {
        await admin.auth().verifyIdToken(idToken);
      } catch (err) {
        res.status(403).send("Invalid or expired token");
        return;
      }
      try {
        // 1) Parse the enrolmentId from the query string
        const enrolmentId = req.query.enrolmentId as string;
        if (!enrolmentId) {
          res.status(400).send("Missing enrolmentId");
          return;
        }
  
        // 2) Get the pendingEnrolment doc
        const enrolmentSnap = await db.collection("enrolments").doc(enrolmentId).get();
        if (!enrolmentSnap.exists) {
          res.status(404).send("Enrolment not found in enrolments");
          return;
        }
        const enrolmentData = enrolmentSnap.data();
        if (!enrolmentData) {
          res.status(400).send("Enrolment data is empty");
          return;
        }
  
        // 1) Build the parent document data (from "care" fields).
        const parentDocData: ParentDocData = {
          firstName: enrolmentData.carerFirstName || "",
          lastName: enrolmentData.carerLastName || "",
          email: enrolmentData.carerEmail || "",
          phone: enrolmentData.carerPhone || "",
          role: "parent",
          students: [],
          lessonTokens: 0,
          termsAccepted: false,
          acceptedTermsVersion: null,
          acceptedTermsAt: null,
        };
  
        // 2) Build the student document data.
        const studentDocData = {
          firstName: enrolmentData.studentFirstName || "",
          lastName: enrolmentData.studentLastName || "",
          dob: enrolmentData.studentDOB || "",
          grade: enrolmentData.studentYear || "",
          parents: [] as string[],
          subjects: enrolmentData.studentSubjects || []
        };

        // If the student's year is 11 or 12, convert detailed subjects to short codes.
        if (studentDocData.grade === "11" || studentDocData.grade === "12") {
          studentDocData.subjects = (enrolmentData.studentSubjects || []).map(convertYear11Or12Subject);
        }
  
        // 3) Extract class IDs from the enrolmentData.  
        const selectedClassIds: string[] = Array.isArray(enrolmentData.classes)
          ? enrolmentData.classes.map((c: any) => c.id)
          : [];
  
        // 4) Generate a new student doc reference.
        const newStudentRef = db.collection("students").doc();

        let parentAuthUid: string;

        try {
          // Try to get the Auth user by email
          const authUser = await admin.auth().getUserByEmail(parentDocData.email);
          parentAuthUid = authUser.uid;
          logger.info(`Auth user for ${parentDocData.email} already exists.`);
        } catch (error: any) {
          if (error.code === "auth/user-not-found") {
            const tempPassword = Math.random().toString(36).slice(-8); // temporary password
            const newAuthUser = await admin.auth().createUser({
              email: parentDocData.email,
              password: tempPassword,
              displayName: `${parentDocData.firstName} ${parentDocData.lastName}`,
            });
            parentAuthUid = newAuthUser.uid;
            logger.info(`Created auth user ${newAuthUser.uid} for ${parentDocData.email}`);
            await sendParentWelcomeEmail(parentDocData.email, parentDocData.firstName);
          } else {
            throw error;
          }
        }
  
        try {
          await db.runTransaction(async (transaction) => {
            // Now use parentAuthUid as the Firestore doc ID for the parent user
            const parentDocRef = db.collection("users").doc(parentAuthUid);
            const parentDocSnap = await transaction.get(parentDocRef);

            // For each selected class, read the attendance docs before any writes.
            const classesAttendanceSnapshots: Array<{
              classRef: FirebaseFirestore.DocumentReference;
              attendanceSnap: FirebaseFirestore.QuerySnapshot;
            }> = [];
            for (const classId of selectedClassIds) {
              const classRef = db.collection("classes").doc(classId);
              const attendanceSnap = await transaction.get(classRef.collection("attendance"));
              classesAttendanceSnapshots.push({ classRef, attendanceSnap });
            }
  
            if (parentDocSnap.exists) {
              // Parent doc exists—update students array
              transaction.update(parentDocRef, {
                students: admin.firestore.FieldValue.arrayUnion(newStudentRef.id),
              });
            } else {
              // Parent doc does not exist—create it
              parentDocData.students.push(newStudentRef.id);

              // Add T&C fields for new parent
              parentDocData.termsAccepted = false;
              parentDocData.acceptedTermsVersion = null;
              parentDocData.acceptedTermsAt = null;

              transaction.set(parentDocRef, parentDocData);
            }
  
            // 4b) Add the parent's doc ID to the student's "parents" array.
            studentDocData.parents.push(parentDocRef.id);
  
            // 5) Create the new student document.
            transaction.set(newStudentRef, studentDocData);
  
            // 6) For each selected class, enroll the student permanently.
            for (const { classRef, attendanceSnap } of classesAttendanceSnapshots) {
              // 6a) Add the student to the class's "enrolledStudents" array.
              transaction.update(classRef, {
                enrolledStudents: admin.firestore.FieldValue.arrayUnion(newStudentRef.id),
              });
  
              // 6b) Also update the attendance docs for this class.
              attendanceSnap.forEach((attDoc) => {
                // Date check
                const attData = attDoc.data();
                if (attData.date.toDate() < new Date()) {
                  return; // skip old attendance docs
                }
  
                transaction.update(attDoc.ref, {
                  attendance: admin.firestore.FieldValue.arrayUnion(newStudentRef.id),
                  updatedAt: admin.firestore.Timestamp.now(),
                  updatedBy: "system",
                });
              });
            }
          });
  
          logger.info(
            `Successfully processed enrolment ${enrolmentId}: created student doc [${newStudentRef.id}] and enrolled in classes`
          );
        } catch (error) {
          logger.error(`Error processing enrolment ${enrolmentId}:`, error);
          throw new Error("Failed to process new enrolment");
        }
  
        // 6) Respond success
        res.status(200).send(`Enrolment ${enrolmentId} accepted successfully.`);
      } catch (error) {
        logger.error("Error in acceptPendingEnrolment:", error);
        res.status(500).send("Failed to accept enrolment");
      }
    }
  );

  function convertYear11Or12Subject(subject: string): string {
    // Split the subject string into parts.
    const parts = subject.split(" ");
    if (parts.length < 3) {
      // Not enough parts to convert, so return the original.
      return subject;
    }
  
    // Extract the base subject, year, and level information.
    // For example, "Math 11 Advanced" => base: "Math", year: "11", level: "Advanced"
    const [base, year, ...levelParts] = parts;
    const level = levelParts.join(" ");
  
    // Convert the base to a short code.
    let shortBase = "";
    if (base.toLowerCase() === "math" || base.toLowerCase() === "mathematics") {
      shortBase = "math";
    } else if (base.toLowerCase() === "english") {
      shortBase = "eng";
    } else {
      shortBase = base.substring(0, 3).toLowerCase();
    }
  
    // Map the level to a short code.
    let shortLevel = "";
    if (level.toLowerCase().includes("advanced")) {
      shortLevel = "ex1";
    } else if (level.toLowerCase().includes("standard")) {
      shortLevel = "std";
    } else if (level.toLowerCase().includes("extension 1")) {
      shortLevel = "ex1";
    } else if (level.toLowerCase().includes("extension 2")) {
      shortLevel = "ex2";
    } else {
      shortLevel = level.substring(0, 3).toLowerCase();
    }
  
    // Combine the parts: shortLevel + shortBase + year.
    return `${shortLevel}${shortBase}${year}`;
  }

