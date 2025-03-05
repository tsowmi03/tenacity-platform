import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import * as sgMail from "@sendgrid/mail";
import { defineSecret } from "firebase-functions/params";

admin.initializeApp();
// const db = admin.firestore();
const sendgridApiKey = defineSecret("SENDGRID_API_KEY");

const SENDGRID_WELCOME_TEMPLATE_ID = "d-ffc33c8494504aa0a1a98615011aa59c";

// Function to send a welcome email
// async function sendWelcomeEmail(email: string, resetLink: string): Promise<void> {
//   const msg = {
//     to: email,
//     from: "no-reply@tenacitytutoring.com",
//     subject: "Welcome to Tenacity Tutoring! – Set Your Password",
//     text: `Welcome to Tenacity Tutoring! Your account has been created using this email address.
// Please click the following link to set your password and get started: ${resetLink}`,
//     html: `<p>Welcome to Tenacity Tutoring!</p>
//            <p>Your account has been created using this email address.</p>
//            <p>Please <a href="${resetLink}">click here</a> to set your password and get started.</p>`
//   };

//   try {
//     // Retrieve the SendGrid API key from the secret manager
//     const apiKey = sendgridApiKey.value();
//     sgMail.setApiKey(apiKey);
//     await sgMail.send(msg);
//     logger.info(`Welcome email sent to ${email}`);
//   } catch (error) {
//     logger.error("Error sending welcome email:", error);
//   }
// }

/**
 * Trigger: Fires when a new doc is created in 'enrolments/{enrolmentId}'.
 * Goal:
 *   1) Create/update a "users/{parentId}" doc with the parent's data.
 *   2) Create a "students/{studentId}" doc with the child's data.
 *   3) Enroll the student in each selected class (found in enrolmentData.classes).
 *   4) Update the attendance docs for the remainder of the term to include the new student.
 *   5) Create an Auth user (if one doesn't already exist) for the application using the email in the enrolment,
 *      and send that user an email with their username and password reset link.
 */
// export const handleNewEnrolment = onDocumentCreated(
//   { document: "pendingEnrolments/{enrolmentId}", secrets: [sendgridApiKey] }, async (event) => {
//   if (!event.data) {
//     logger.error("No snapshot data found in onDocumentCreated trigger.");
//     return;
//   }

//   const enrolmentData = event.data.data();
//   const enrolmentId = event.params.enrolmentId;

//   // 1) Build the parent document data (from "care" fields).
//   const parentDocData = {
//     firstName: enrolmentData.carerFirstName || "",
//     lastName: enrolmentData.carerLastName || "",
//     email: enrolmentData.carerEmail || "",
//     phone: enrolmentData.carerPhone || "",
//     role: "parent",
//     students: [] as string[],
//   };

//   // 2) Build the student document data.
//   const studentDocData = {
//     firstName: enrolmentData.studentFirstName || "",
//     lastName: enrolmentData.studentLastName || "",
//     dob: enrolmentData.studentDob || "",
//     grade: enrolmentData.studentYear || "",
//     lessonTokens: 0,
//     parents: [] as string[],
//   };

//   // 3) Extract class IDs from the enrolmentData.  
//   const selectedClassIds: string[] = Array.isArray(enrolmentData.classes)
//     ? enrolmentData.classes.map((c: any) => c.id)
//     : [];

//   // 4) Generate a new student doc reference.
//   const newStudentRef = db.collection("students").doc();

//   try {
//     // Use the parent's email to see if the parent doc already exists.
//     const parentEmail = parentDocData.email;

//     await db.runTransaction(async (transaction) => {
//       // 4a) Look for an existing parent doc with the same email.
//       const parentQuerySnap = await transaction.get(
//         db.collection("users").where("email", "==", parentEmail).limit(1)
//       );

//       // For each selected class, read the attendance docs before any writes.
//       const classesAttendanceSnapshots: Array<{
//         classRef: FirebaseFirestore.DocumentReference;
//         attendanceSnap: FirebaseFirestore.QuerySnapshot;
//       }> = [];
//       for (const classId of selectedClassIds) {
//         const classRef = db.collection("classes").doc(classId);
//         const attendanceSnap = await transaction.get(classRef.collection("attendance"));
//         classesAttendanceSnapshots.push({ classRef, attendanceSnap });
//       }

//       let parentDocRef: FirebaseFirestore.DocumentReference;

//       if (!parentQuerySnap.empty) {
//         // Parent exists—reuse the doc.
//         parentDocRef = parentQuerySnap.docs[0].ref;
//         // Add the new student's ID to the parent's "students" array.
//         transaction.update(parentDocRef, {
//           students: admin.firestore.FieldValue.arrayUnion(newStudentRef.id),
//         });
//       } else {
//         // No parent exists—create a new parent document.
//         parentDocRef = db.collection("users").doc();
//         // Initialize the parent's students array with the new student's ID.
//         parentDocData.students.push(newStudentRef.id);
//         transaction.set(parentDocRef, parentDocData);
//       }

//       // 4b) Add the parent's doc ID to the student's "parents" array.
//       studentDocData.parents.push(parentDocRef.id);

//       // 5) Create the new student document.
//       transaction.set(newStudentRef, studentDocData);

//       // 6) For each selected class, enroll the student permanently.
//       for (const { classRef, attendanceSnap } of classesAttendanceSnapshots) {
//         // 6a) Add the student to the class's "enrolledStudents" array.
//         transaction.update(classRef, {
//           enrolledStudents: admin.firestore.FieldValue.arrayUnion(newStudentRef.id),
//         });

//         // 6b) Also update the attendance docs for this class.
//         attendanceSnap.forEach((attDoc) => {
//           // Date check
//           const attData = attDoc.data();
//           if (attData.date.toDate() < new Date()) {
//             return; // skip old attendance docs
//           }

//           transaction.update(attDoc.ref, {
//             attendance: admin.firestore.FieldValue.arrayUnion(newStudentRef.id),
//             updatedAt: admin.firestore.Timestamp.now(),
//             updatedBy: "system",
//           });
//         });
//       }
//     });

//     logger.info(
//       `Successfully processed enrolment ${enrolmentId}: created student doc [${newStudentRef.id}] and enrolled in classes`
//     );

//     // Create an Auth user for the parent's email if one doesn't already exist.
//     try {
//       await admin.auth().getUserByEmail(parentDocData.email);
//       logger.info(`Auth user for ${parentDocData.email} already exists.`);
//     } catch (error: any) {
//       if (error.code === "auth/user-not-found") {
//         const tempPassword = Math.random().toString(36).slice(-8); // temporary password
//         const newAuthUser = await admin.auth().createUser({
//           email: parentDocData.email,
//           password: tempPassword,
//           displayName: `${parentDocData.firstName} ${parentDocData.lastName}`,
//         });
//         logger.info(`Created auth user ${newAuthUser.uid} for ${parentDocData.email}`);

//         // Generate a password reset link.
//         const resetLink = await admin.auth().generatePasswordResetLink(parentDocData.email);
//         // Send a welcome email with the reset link (replace with real email sending logic).
//         await sendWelcomeEmail(parentDocData.email, resetLink);
//       } else {
//         throw error;
//       }
//     }
//   } catch (error) {
//     logger.error(`Error processing enrolment ${enrolmentId}:`, error);
//     throw new Error("Failed to process new enrolment");
//   }
// });

// export const populateFirebase = onDocumentCreated(
//   { document: "enrolments/{enrolmentId}", secrets: [sendgridApiKey] }, async (event) => {
//   if (!event.data) {
//     logger.error("No snapshot data found in onDocumentCreated trigger.");
//     return;
//   }

//   const enrolmentData = event.data.data();
//   const enrolmentId = event.params.enrolmentId;

//   // 1) Build the parent document data (from "care" fields).
//   const parentDocData = {
//     firstName: enrolmentData.carerFirstName || "",
//     lastName: enrolmentData.carerLastName || "",
//     email: enrolmentData.carerEmail || "",
//     phone: enrolmentData.carerPhone || "",
//     role: "parent",
//     students: [] as string[],
//   };

//   // 2) Build the student document data.
//   const studentDocData = {
//     firstName: enrolmentData.studentFirstName || "",
//     lastName: enrolmentData.studentLastName || "",
//     dob: enrolmentData.studentDob || "",
//     grade: enrolmentData.studentYear || "",
//     lessonTokens: 0,
//     parents: [] as string[],
//   };

//   // 3) Extract class IDs from the enrolmentData.  
//   const selectedClassIds: string[] = Array.isArray(enrolmentData.classes)
//     ? enrolmentData.classes.map((c: any) => c.id)
//     : [];

//   // 4) Generate a new student doc reference.
//   const newStudentRef = db.collection("students").doc();

//   try {
//     // Use the parent's email to see if the parent doc already exists.
//     const parentEmail = parentDocData.email;

//     await db.runTransaction(async (transaction) => {
//       // 4a) Look for an existing parent doc with the same email.
//       const parentQuerySnap = await transaction.get(
//         db.collection("users").where("email", "==", parentEmail).limit(1)
//       );

//       // For each selected class, read the attendance docs before any writes.
//       const classesAttendanceSnapshots: Array<{
//         classRef: FirebaseFirestore.DocumentReference;
//         attendanceSnap: FirebaseFirestore.QuerySnapshot;
//       }> = [];
//       for (const classId of selectedClassIds) {
//         const classRef = db.collection("classes").doc(classId);
//         const attendanceSnap = await transaction.get(classRef.collection("attendance"));
//         classesAttendanceSnapshots.push({ classRef, attendanceSnap });
//       }

//       let parentDocRef: FirebaseFirestore.DocumentReference;

//       if (!parentQuerySnap.empty) {
//         // Parent exists—reuse the doc.
//         parentDocRef = parentQuerySnap.docs[0].ref;
//         // Add the new student's ID to the parent's "students" array.
//         transaction.update(parentDocRef, {
//           students: admin.firestore.FieldValue.arrayUnion(newStudentRef.id),
//         });
//       } else {
//         // No parent exists—create a new parent document.
//         parentDocRef = db.collection("users").doc();
//         // Initialize the parent's students array with the new student's ID.
//         parentDocData.students.push(newStudentRef.id);
//         transaction.set(parentDocRef, parentDocData);
//       }

//       // 4b) Add the parent's doc ID to the student's "parents" array.
//       studentDocData.parents.push(parentDocRef.id);

//       // 5) Create the new student document.
//       transaction.set(newStudentRef, studentDocData);

//       // 6) For each selected class, enroll the student permanently.
//       for (const { classRef, attendanceSnap } of classesAttendanceSnapshots) {
//         // 6a) Add the student to the class's "enrolledStudents" array.
//         transaction.update(classRef, {
//           enrolledStudents: admin.firestore.FieldValue.arrayUnion(newStudentRef.id),
//         });

//         // 6b) Also update the attendance docs for this class.
//         attendanceSnap.forEach((attDoc) => {
//           // Date check
//           const attData = attDoc.data();
//           if (attData.date.toDate() < new Date()) {
//             return; // skip old attendance docs
//           }

//           transaction.update(attDoc.ref, {
//             attendance: admin.firestore.FieldValue.arrayUnion(newStudentRef.id),
//             updatedAt: admin.firestore.Timestamp.now(),
//             updatedBy: "system",
//           });
//         });
//       }
//     });

//     logger.info(
//       `Successfully processed enrolment ${enrolmentId}: created student doc [${newStudentRef.id}] and enrolled in classes`
//     );

//     // Create an Auth user for the parent's email if one doesn't already exist.
//     try {
//       await admin.auth().getUserByEmail(parentDocData.email);
//       logger.info(`Auth user for ${parentDocData.email} already exists.`);
//     } catch (error: any) {
//       if (error.code === "auth/user-not-found") {
//         const tempPassword = Math.random().toString(36).slice(-8); // temporary password
//         const newAuthUser = await admin.auth().createUser({
//           email: parentDocData.email,
//           password: tempPassword,
//           displayName: `${parentDocData.firstName} ${parentDocData.lastName}`,
//         });
//         logger.info(`Created auth user ${newAuthUser.uid} for ${parentDocData.email}`);
//       } else {
//         throw error;
//       }
//     }
//   } catch (error) {
//     logger.error(`Error processing enrolment ${enrolmentId}:`, error);
//     throw new Error("Failed to process new enrolment");
//   }
// });

export const handleNewEnrolmentWithoutApp = onDocumentCreated(
  { document: "enrolments/{enrolmentId}", secrets: [sendgridApiKey] }, async (event) => {
  if (!event.data) {
    logger.error("No snapshot data found in onDocumentCreated trigger.");
    return;
  }
  const enrolmentData = event.data.data();
  const email = enrolmentData.carerEmail;
  const firstName = enrolmentData.carerFirstName;
  const msg = {
    to: email,
    from: "no-reply@tenacitytutoring.com",
    templateId: SENDGRID_WELCOME_TEMPLATE_ID,
    dynamicTemplateData: {
      first_name: firstName,
    }
  };

  try {
    // Retrieve the SendGrid API key from the secret manager
    const apiKey = sendgridApiKey.value();
    sgMail.setApiKey(apiKey);
    await sgMail.send(msg);
    logger.info(`Welcome email sent to ${email}`);
  } catch (error) {
    logger.error("Error sending welcome email:", error);
  }

});

// 1) Initialize the Xero Client
// Read from functions.config().xero.*, set via CLI
// const xero = new XeroClient({
//   clientId: functions.config().xero.client_id,
//   clientSecret: functions.config().xero.client_secret,
//   redirectUris: [functions.config().xero.redirect_uri],
//   scopes: [
//     "openid",
//     "email",
//     "profile",
//     "offline_access",
//     "accounting.transactions",
//     "accounting.contacts",
//     // Add or remove scopes as needed
//   ],
//   state: "some-random-state", // optional, to verify later
// });

// 2) A helper function to get the Xero consent URL
// export const generateXeroAuthUrl = onRequest(async (req, res) => {
//   try {
//     // Build the authorization URL using the XeroClient
//     const consentUrl = await xero.buildConsentUrl();
//     // Either redirect the user to this URL or just show it in the response
//     res.status(200).send(`
//       <h1>Xero Auth URL</h1>
//       <p>Click below to authorize this Firebase app to access your Xero data.</p>
//       <a href="${consentUrl}" target="_blank">Authorize with Xero</a>
//     `);
//   } catch (error) {
//     logger.error("Error generating Xero Auth URL:", error);
//     res.status(500).send("Could not generate Xero Auth URL");
//   }
// });

// 3) Handle the callback from Xero after user consents
// export const xeroOAuthCallback = onRequest(async (req, res) => {
//   try {
//     // Xero will redirect to this function with `code` and `state` in the query params
//     // The "apiCallback" method will exchange the code for tokens
//     const tokenSet = await xero.apiCallback(req.url);
//     // tokenSet now contains access_token, refresh_token, id_token, etc.

//     logger.info("Xero token set acquired:", tokenSet);

//     // IMPORTANT: Must store the tokenSet in a secure place for future calls.
//     // Typically, store them in Firestore or Realtime DB. For example:
//     const db = admin.firestore();
//     await db.collection("xeroTokens").doc("master").set({
//       ...tokenSet,
//       createdAt: admin.firestore.FieldValue.serverTimestamp(),
//     });

//     // Let the user know everything worked
//     res.status(200).send(`
//       <h1>Success!</h1>
//       <p>You can close this tab now. Your Firebase backend is authorized to call the Xero API.</p>
//     `);
//   } catch (error) {
//     logger.error("Error in Xero OAuth callback:", error);
//     res.status(400).send("Error in Xero OAuth flow");
//   }
// });

export const helloWorld = onRequest((request, response) => {
  logger.info("Hello logs!", {structuredData: true});
  response.send("Hello from Firebase! ");
});
