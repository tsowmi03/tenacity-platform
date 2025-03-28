import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { defineSecret } from "firebase-functions/params";
import { sendParentWelcomeEmail } from "./email_functions";


const db = admin.firestore();
const sendgridApiKey = defineSecret("SENDGRID_API_KEY");
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
        const parentDocData = {
          firstName: enrolmentData.carerFirstName || "",
          lastName: enrolmentData.carerLastName || "",
          email: enrolmentData.carerEmail || "",
          phone: enrolmentData.carerPhone || "",
          role: "parent",
          students: [] as string[],
        };
  
        // 2) Build the student document data.
        const studentDocData = {
          firstName: enrolmentData.studentFirstName || "",
          lastName: enrolmentData.studentLastName || "",
          dob: enrolmentData.studentDob || "",
          grade: enrolmentData.studentYear || "",
          lessonTokens: 0,
          parents: [] as string[],
          subjects: enrolmentData.studentSubjects || []
        };
  
        // 3) Extract class IDs from the enrolmentData.  
        const selectedClassIds: string[] = Array.isArray(enrolmentData.classes)
          ? enrolmentData.classes.map((c: any) => c.id)
          : [];
  
        // 4) Generate a new student doc reference.
        const newStudentRef = db.collection("students").doc();
  
        try {
          // Use the parent's email to see if the parent doc already exists.
          const parentEmail = parentDocData.email;
  
          await db.runTransaction(async (transaction) => {
            // 4a) Look for an existing parent doc with the same email.
            const parentQuerySnap = await transaction.get(
              db.collection("users").where("email", "==", parentEmail ).limit(1)
            );
  
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
  
            let parentDocRef: FirebaseFirestore.DocumentReference;
  
            if (!parentQuerySnap.empty) {
              // Parent exists—reuse the doc.
              parentDocRef = parentQuerySnap.docs[0].ref;
              // Add the new student's ID to the parent's "students" array.
              transaction.update(parentDocRef, {
                students: admin.firestore.FieldValue.arrayUnion(newStudentRef.id),
              });
            } else {
              // No parent exists—create a new parent document.
              parentDocRef = db.collection("users").doc();
              // Initialize the parent's students array with the new student's ID.
              parentDocData.students.push(newStudentRef.id);
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
  
          // Create an Auth user for the parent's email if one doesn't already exist.
          try {
            await admin.auth().getUserByEmail(parentDocData.email);
            logger.info(`Auth user for ${parentDocData.email} already exists.`);
          } catch (error: any) {
            if (error.code === "auth/user-not-found") {
              const tempPassword = Math.random().toString(36).slice(-8); // temporary password
              const newAuthUser = await admin.auth().createUser({
                email: parentDocData.email,
                password: tempPassword,
                displayName: `${parentDocData.firstName} ${parentDocData.lastName}`,
              });
              logger.info(`Created auth user ${newAuthUser.uid} for ${parentDocData.email}`);
  
              await sendParentWelcomeEmail(parentDocData.email, parentDocData.firstName);
            } else {
              throw error;
            }
          }
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

  