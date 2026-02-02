const functions = require("firebase-functions");
const admin = require("firebase-admin");

const logger = require("firebase-functions/logger");
const sgMail = require("@sendgrid/mail");
const { defineSecret } = require("firebase-functions/params");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");

const { purgeOldInvoicesImpl } = require("./purgeOldInvoices");

admin.initializeApp();

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

function setCors(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}

function getBearerToken(req) {
  const header = req.get("authorization") || req.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

async function requireAuth(req) {
  const token = getBearerToken(req);
  if (!token) {
    const err = new Error("Missing Authorization: Bearer <token> header.");
    err.status = 401;
    throw err;
  }

  try {
    return await admin.auth().verifyIdToken(token);
  } catch (e) {
    const err = new Error("Invalid or expired ID token.");
    err.status = 401;
    throw err;
  }
}

function requireRole(decoded, allowedRoles) {
  const role = decoded?.role;
  if (!allowedRoles.includes(role)) {
    const err = new Error("Access denied.");
    err.status = 403;
    throw err;
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

      // Email is best-effort; do not block provisioning if SendGrid fails.
      await sendParentWelcomeEmail(normalizedEmail, firstName || "");
      return newAuthUser.uid;
    }

    throw error;
  }
}

// -----------------------------------------------------------------------------------
// Function: sendAdminEnrolmentEmail (Firestore v2)
//   - Triggered when a new doc is created in `enrolments/{enrolmentId}`
//   - Sends an email to the admin with an "Accept" link
// -----------------------------------------------------------------------------------
exports.sendAdminEnrolmentEmail = onDocumentCreated(
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

    const additionalInfo = enrolmentData.additionalInfo;
    const allergies = enrolmentData.allergies;
    const carerEmail = enrolmentData.carerEmail;
    const carerPhone = enrolmentData.carerPhone;

    const classArray = enrolmentData.classes || [];
    const classes = Array.isArray(classArray)
      ? classArray.map((c) => `${c.day} @ ${c.startTime}`).join(", ")
      : "";

    const emergencyContactName = `${enrolmentData.emergencyContactFirstName || ""} ${
      enrolmentData.emergencyContactLastName || ""
    }`.trim();
    const emergencyContactPhone = enrolmentData.emergencyContactPhone;
    const emergencyContactRelation = enrolmentData.emergencyContactRelation;
    const permissionToLeave = enrolmentData.permissionToLeave;

    const subjectArray = enrolmentData.studentSubjects || [];
    const subjects = Array.isArray(subjectArray) ? subjectArray.join(", ") : "";
    const studentYear = enrolmentData.studentYear;

    const msg = {
      to: adminEmail,
      from: "no-reply@tenacitytutoring.com",
      templateId: SENDGRID_ADMIN_NOTIFY_TEMPLATE_ID,
      dynamicTemplateData: {
        enrolmentId,
        studentName,
        carerName,
        additionalInfo,
        allergies,
        carerEmail,
        carerPhone,
        classes,
        emergencyContactName,
        emergencyContactPhone,
        emergencyContactRelation,
        permissionToLeave,
        subjects,
        studentYear,
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

// -----------------------------------------------------------------------------------
// Function: sendCustomPasswordResetEmail (HTTPS Callable v2)
//   - Generates a reset link via Firebase Auth
//   - Extracts oobCode and emails a custom link hosted on admin portal
// -----------------------------------------------------------------------------------
exports.sendCustomPasswordResetEmail = onCall(
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

// Keeps Auth custom claims in sync with Firestore users/{uid}.role
// Allowed roles: admin, parent, tutor, student
exports.syncUserRoleClaim = functions
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
                // User document deleted; clear claims
                logger.info("[syncUserRoleClaim] User doc deleted; clearing custom claims", {
                    eventId,
                    uid,
                });

                await admin.auth().setCustomUserClaims(uid, {});
                logger.info("[syncUserRoleClaim] Cleared custom claims (doc deleted)", {
                    eventId,
                    uid,
                });
                return;
            }

            const data = change.after.data() || {};
            const rawRole = data.role;
            const role = typeof rawRole === "string" ? rawRole.trim() : "";

            logger.debug("[syncUserRoleClaim] Loaded role from Firestore", {
                eventId,
                uid,
                rawRoleType: typeof rawRole,
                role,
                hasRoleField: Object.prototype.hasOwnProperty.call(data, "role"),
            });

            const allowed = new Set(["admin", "parent", "tutor", "student"]);
            const roleAllowed = !!role && allowed.has(role);

            logger.debug("[syncUserRoleClaim] Role validation", {
                eventId,
                uid,
                role,
                roleAllowed,
                allowedRoles: Array.from(allowed),
            });

            if (!roleAllowed) {
                // Unknown/missing role: clear claim so we fail closed.
                logger.warn("[syncUserRoleClaim] Missing/invalid role; clearing custom claims", {
                    eventId,
                    uid,
                    role,
                });

                await admin.auth().setCustomUserClaims(uid, {});
                logger.info("[syncUserRoleClaim] Cleared custom claims (invalid role)", {
                    eventId,
                    uid,
                });
                return;
            }

            // Optional: fetch current claims to compare (useful for debugging)
            let existingClaims = null;
            try {
                const userRecord = await admin.auth().getUser(uid);
                existingClaims = userRecord.customClaims || {};
                logger.debug("[syncUserRoleClaim] Existing custom claims fetched", {
                    eventId,
                    uid,
                    existingRole: existingClaims.role || null,
                    existingClaimsKeys: Object.keys(existingClaims),
                });
            } catch (e) {
                logger.warn("[syncUserRoleClaim] Failed to fetch existing custom claims (continuing)", {
                    eventId,
                    uid,
                    errorCode: e?.code,
                    errorMessage: e?.message,
                });
            }

            if (existingClaims && existingClaims.role === role) {
                logger.info("[syncUserRoleClaim] Custom claim already up-to-date; no change needed", {
                    eventId,
                    uid,
                    role,
                });
                return;
            }

            logger.info("[syncUserRoleClaim] Setting custom user claims", {
                eventId,
                uid,
                role,
            });

            // If you later add more claims, merge them here.
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

// Matches the frontend call:
// https://us-central1-<projectId>.cloudfunctions.net/acceptPendingEnrolment?enrolmentId=...
exports.acceptPendingEnrolment = onRequest(
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

  // Admin-only portal.
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

    // Best-effort: send enrolment accepted email to parent.
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

// -----------------------------------------------------------------------------------
// Function: purgeOldInvoices (Scheduled v2)
//   - Runs weekly
//   - Deletes docs in `invoices` where `createdAt` (Timestamp) is > 6 months old
//   - Deletes in batches to respect Firestore limits
// -----------------------------------------------------------------------------------
exports.purgeOldInvoices = onSchedule(
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
