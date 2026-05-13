"use strict";

const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const sgMail = require("@sendgrid/mail");
const { defineSecret } = require("firebase-functions/params");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");

const { purgeOldInvoicesImpl } = require("../../purgeOldInvoices");

const db = admin.firestore();
const sendgridApiKey = defineSecret("SENDGRID_API_KEY");

const SENDGRID_PARENT_WELCOME_TEMPLATE_ID =
  "d-ffc33c8494504aa0a1a98615011aa59c";
const SENDGRID_ADMIN_NOTIFY_TEMPLATE_ID =
  "d-04e89a3c87f74e66b10d1f6199b8917d";
const SENDGRID_PARENT_ENROLMENT_ACCEPTED_TEMPLATE_ID =
  "d-304facd6df1a43f39798118c2de12277";

function adminPortalBaseUrl() {
  return "https://admin.tenacitytutoring.com";
}

function sendgridInit() {
  const apiKey = sendgridApiKey.value();
  if (!apiKey) {
    throw new Error("Missing SENDGRID_API_KEY secret");
  }
  sgMail.setApiKey(apiKey);
}

async function sendParentWelcomeEmail(email, firstName) {
  const msg = {
    to: email,
    from: "no-reply@tenacitytutoring.com",
    templateId: SENDGRID_PARENT_WELCOME_TEMPLATE_ID,
    dynamicTemplateData: {
      first_name: firstName,
    },
  };

  try {
    sendgridInit();
    await sgMail.send(msg);
    logger.info(`Welcome email sent to ${email}`);
  } catch (error) {
    logger.error("Error sending welcome email:", error);
  }
}

async function sendParentEnrolmentAcceptedEmail(email, studentName, classes, subjects) {
  const msg = {
    to: email,
    from: "no-reply@tenacitytutoring.com",
    templateId: SENDGRID_PARENT_ENROLMENT_ACCEPTED_TEMPLATE_ID,
    dynamicTemplateData: {
      student_name: studentName,
      class_data: classes,
      email,
      subjects,
    },
  };

  try {
    sendgridInit();
    await sgMail.send(msg);
    logger.info(`Enrolment accepted email sent to ${email}`);
  } catch (error) {
    logger.error("Error sending enrolment accepted email:", error);
  }
}

function convertYear11Or12Subject(subject) {
  if (typeof subject !== "string") return "";
  return subject.trim();
}

async function ensureParentAuthUser({ email, firstName, lastName }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error("Parent email is missing");
  }

  try {
    const authUser = await admin.auth().getUserByEmail(normalizedEmail);
    logger.info(`Auth user for ${normalizedEmail} already exists.`, {
      uid: authUser.uid,
    });
    return authUser.uid;
  } catch (error) {
    if (error?.code === "auth/user-not-found") {
      const tempPassword = Math.random().toString(36).slice(-10);
      const displayName = `${firstName || ""} ${lastName || ""}`.trim();
      const newAuthUser = await admin.auth().createUser({
        email: normalizedEmail,
        password: tempPassword,
        displayName: displayName || undefined,
      });
      logger.info(`Created auth user ${newAuthUser.uid} for ${normalizedEmail}`);

      await sendParentWelcomeEmail(normalizedEmail, firstName || "");
      return newAuthUser.uid;
    }

    throw error;
  }
}

const sendAdminEnrolmentEmail = onDocumentCreated(
  {
    document: "enrolments/{enrolmentId}",
    region: "us-central1",
    secrets: [sendgridApiKey],
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      logger.error("No snapshot in sendAdminEnrolmentEmail trigger.");
      return;
    }

    const enrolmentId = event.params.enrolmentId;
    const enrolmentData = snapshot.data();
    if (!enrolmentData) {
      logger.error("No enrolment data found.");
      return;
    }

    const adminEmail = "admin@tenacitytutoring.com";
    const acceptLink = `${adminPortalBaseUrl()}/enrolments/${encodeURIComponent(enrolmentId)}`;

    const studentName = `${enrolmentData.studentFirstName || ""} ${
      enrolmentData.studentLastName || ""
    }`.trim();
    const carerName = `${enrolmentData.carerFirstName || ""} ${
      enrolmentData.carerLastName || ""
    }`.trim();

    const classArray = enrolmentData.classes || [];
    const classes = Array.isArray(classArray)
      ? classArray.map((c) => `${c.day} @ ${c.startTime}`).join(", ")
      : "";

    const emergencyContactName = `${enrolmentData.emergencyContactFirstName || ""} ${
      enrolmentData.emergencyContactLastName || ""
    }`.trim();

    const subjectArray = enrolmentData.studentSubjects || [];
    const subjects = Array.isArray(subjectArray) ? subjectArray.join(", ") : "";

    const msg = {
      to: adminEmail,
      from: "no-reply@tenacitytutoring.com",
      templateId: SENDGRID_ADMIN_NOTIFY_TEMPLATE_ID,
      dynamicTemplateData: {
        enrolmentId,
        studentName,
        carerName,
        additionalInfo: enrolmentData.additionalInfo,
        allergies: enrolmentData.allergies,
        carerEmail: enrolmentData.carerEmail,
        carerPhone: enrolmentData.carerPhone,
        classes,
        emergencyContactName,
        emergencyContactPhone: enrolmentData.emergencyContactPhone,
        emergencyContactRelation: enrolmentData.emergencyContactRelation,
        permissionToLeave: enrolmentData.permissionToLeave,
        subjects,
        studentYear: enrolmentData.studentYear,
        acceptLink,
      },
    };

    try {
      sendgridInit();
      await sgMail.send(msg);
      logger.info(
        `Admin notify email sent for enrolment ${enrolmentId} to ${adminEmail}`
      );
    } catch (error) {
      const err = error;
      logger.error("SendGrid error:", err);
      if (err?.response?.body?.errors) {
        logger.error("SendGrid error details:", JSON.stringify(err.response.body.errors));
      }
    }
  }
);

const sendCustomPasswordResetEmail = onCall(
  {
    region: "us-central1",
    secrets: [sendgridApiKey],
  },
  async (request) => {
    const email = request.data?.email;
    if (!email) {
      throw new HttpsError("invalid-argument", "Email is required");
    }

    try {
      const resetLink = await admin.auth().generatePasswordResetLink(email);
      const url = new URL(resetLink);
      const oobCode = url.searchParams.get("oobCode");
      if (!oobCode) {
        throw new Error("Missing oobCode in generated reset link");
      }

      const customLink = `${adminPortalBaseUrl()}/reset_password.html?oobCode=${oobCode}`;

      const htmlContent = `
        <p>Hello,</p>
        <p>Click below to reset your password for Tenacity Tutoring:</p>
        <p><a href="${customLink}">Reset Password</a></p>
        <p>If you did not request a password reset, you can safely ignore this email.</p>
      `;

      sendgridInit();
      await sgMail.send({
        to: email,
        from: "noreply@tenacitytutoring.com",
        subject: "Tenacity Tutoring - Password Reset",
        html: htmlContent,
      });

      return { success: true };
    } catch (err) {
      logger.error("Error sending password reset email:", err);
      throw new HttpsError("internal", "Failed to send reset email");
    }
  }
);

const syncUserRoleClaim = functions
  .region("us-central1")
  .firestore.document("users/{uid}")
  .onWrite(async (change, context) => {
    const { uid } = context.params;
    const eventId = context.eventId;

    logger.debug("[syncUserRoleClaim] Triggered", {
      eventId,
      uid,
      beforeExists: change.before.exists,
      afterExists: change.after.exists,
    });

    try {
      if (!change.after.exists) {
        logger.info("[syncUserRoleClaim] User doc deleted; clearing custom claims", {
          eventId,
          uid,
        });

        await admin.auth().setCustomUserClaims(uid, {});
        return;
      }

      const data = change.after.data() || {};
      const rawRole = data.role;
      const role = typeof rawRole === "string" ? rawRole.trim() : "";
      const allowed = new Set(["admin", "parent", "tutor", "student"]);

      if (!role || !allowed.has(role)) {
        logger.warn("[syncUserRoleClaim] Missing/invalid role; clearing custom claims", {
          eventId,
          uid,
          role,
        });

        await admin.auth().setCustomUserClaims(uid, {});
        return;
      }

      let existingClaims = null;
      try {
        const userRecord = await admin.auth().getUser(uid);
        existingClaims = userRecord.customClaims || {};
      } catch (e) {
        logger.warn("[syncUserRoleClaim] Failed to fetch existing custom claims", {
          eventId,
          uid,
          errorCode: e?.code,
          errorMessage: e?.message,
        });
      }

      if (existingClaims && existingClaims.role === role) {
        logger.info("[syncUserRoleClaim] Custom claim already up-to-date", {
          eventId,
          uid,
          role,
        });
        return;
      }

      await admin.auth().setCustomUserClaims(uid, { role });
      logger.info("[syncUserRoleClaim] Successfully set custom user claims", {
        eventId,
        uid,
        role,
      });
    } catch (err) {
      logger.error("[syncUserRoleClaim] Failed", {
        eventId,
        uid,
        errorCode: err?.code,
        errorMessage: err?.message,
        stack: err?.stack,
      });
      throw err;
    }
  });

const acceptPendingEnrolment = onRequest(
  { region: "us-central1", secrets: [sendgridApiKey] },
  async (req, res) => {
    const origin = req.headers.origin || "";
    const allowedOrigins = new Set([
      "https://admin.tenacitytutoring.com",
      "http://localhost:5173",
    ]);
    res.set(
      "Access-Control-Allow-Origin",
      allowedOrigins.has(origin) ? origin : "https://admin.tenacitytutoring.com"
    );
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");

    if (req.method === "OPTIONS") {
      res.status(200).send("");
      return;
    }

    if (req.method !== "GET") {
      res.status(405).send("Method not allowed.");
      return;
    }

    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
      res.status(401).send("No bearer token");
      return;
    }

    const idToken = authHeader.split(" ")[1];
    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch (err) {
      res.status(403).send("Invalid or expired token");
      return;
    }

    if (decoded?.role !== "admin") {
      res.status(403).send("Access denied");
      return;
    }

    try {
      const enrolmentId = String(req.query.enrolmentId || "").trim();
      if (!enrolmentId) {
        res.status(400).send("Missing enrolmentId");
        return;
      }

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

      const parentDocData = {
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

      const studentDocData = {
        firstName: enrolmentData.studentFirstName || "",
        lastName: enrolmentData.studentLastName || "",
        grade: enrolmentData.studentYear || "",
        parents: [],
        subjects: enrolmentData.studentSubjects || [],
      };

      if (studentDocData.grade === "11" || studentDocData.grade === "12") {
        studentDocData.subjects = (enrolmentData.studentSubjects || []).map(
          convertYear11Or12Subject
        );
      }

      const selectedClassIds = Array.isArray(enrolmentData.classes)
        ? enrolmentData.classes.map((c) => c?.id).filter(Boolean)
        : [];

      const newStudentRef = db.collection("students").doc();

      const parentAuthUid = await ensureParentAuthUser({
        email: parentDocData.email,
        firstName: parentDocData.firstName,
        lastName: parentDocData.lastName,
      });

      await db.runTransaction(async (transaction) => {
        const parentDocRef = db.collection("users").doc(parentAuthUid);
        const parentDocSnap = await transaction.get(parentDocRef);

        const classesAttendanceSnapshots = [];
        for (const classId of selectedClassIds) {
          const classRef = db.collection("classes").doc(classId);
          const attendanceSnap = await transaction.get(classRef.collection("attendance"));
          classesAttendanceSnapshots.push({ classRef, attendanceSnap });
        }

        if (parentDocSnap.exists) {
          transaction.update(parentDocRef, {
            students: admin.firestore.FieldValue.arrayUnion(newStudentRef.id),
          });
        } else {
          parentDocData.students.push(newStudentRef.id);
          transaction.set(parentDocRef, parentDocData);
        }

        studentDocData.parents.push(parentDocRef.id);
        transaction.set(newStudentRef, studentDocData);

        for (const { classRef, attendanceSnap } of classesAttendanceSnapshots) {
          transaction.update(classRef, {
            enrolledStudents: admin.firestore.FieldValue.arrayUnion(newStudentRef.id),
          });

          attendanceSnap.forEach((attDoc) => {
            const attData = attDoc.data();
            const date = attData?.date?.toDate ? attData.date.toDate() : null;
            if (date && date < new Date()) return;

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

      try {
        const studentName = `${studentDocData.firstName} ${studentDocData.lastName}`.trim();
        const classArray = enrolmentData.classes || [];
        const classes = Array.isArray(classArray)
          ? classArray.map((c) => `${c.day} @ ${c.startTime}`).join(", ")
          : "";
        const subjects = Array.isArray(studentDocData.subjects)
          ? studentDocData.subjects.join(", ")
          : "";

        await sendParentEnrolmentAcceptedEmail(
          parentDocData.email,
          studentName,
          classes,
          subjects
        );
      } catch (e) {
        logger.warn("Failed to send enrolment accepted email (continuing)", {
          errorMessage: e?.message,
        });
      }

      res.status(200).send(`Enrolment ${enrolmentId} accepted successfully.`);
    } catch (error) {
      logger.error("Error in acceptPendingEnrolment:", error);
      res.status(500).send("Failed to accept enrolment");
    }
  }
);

const purgeOldInvoices = onSchedule(
  {
    region: "us-central1",
    schedule: "every monday 03:00",
    timeZone: "Australia/Sydney",
  },
  async () => {
    await purgeOldInvoicesImpl({
      db,
      admin,
      logger,
      dryRun: false,
    });
  }
);

// `acceptPendingEnrolment` (an onRequest endpoint) has been replaced by the
// idempotent `adminAcceptEnrolment` callable in src/enrolments/. The legacy
// definition above is left in place for reference but is no longer exported,
// so the next deploy will REMOVE the live function URL. Make sure the portal
// UI on production has been redeployed to use the new callable before
// deploying functions, or admins will lose the ability to accept enrolments
// during the window between the two deploys.
module.exports = {
  sendAdminEnrolmentEmail,
  sendCustomPasswordResetEmail,
};
