import * as logger from "firebase-functions/logger";
import * as sgMail from "@sendgrid/mail";
import { defineSecret } from "firebase-functions/params";
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';

const sendgridApiKey = defineSecret("SENDGRID_API_KEY");
const SENDGRID_PARENT_WELCOME_TEMPLATE_ID = "d-ffc33c8494504aa0a1a98615011aa59c";
const SENDGRID_ADMIN_NOTIFY_TEMPLATE_ID = "d-04e89a3c87f74e66b10d1f6199b8917d";

export async function sendParentWelcomeEmail(email: string, firstName: string): Promise<void> {
    const msg = {
        to: email,
        from: "no-reply@tenacitytutoring.com",
        templateId: SENDGRID_PARENT_WELCOME_TEMPLATE_ID,
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
}

// -----------------------------------------------------------------------------------
// Function: sendAdminEnrolmentEmail
//    - Triggered when a new doc is created in `enrolments/{enrolmentId}`
//    - Sends an email to the admin with the enrolment details and an "Accept" link
// -----------------------------------------------------------------------------------
export const sendAdminEnrolmentEmail = onDocumentCreated(
  {
    document: "enrolments/{enrolmentId}",
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

    const adminPortalUrl = "https://admin.tenacitytutoring.com";
    const acceptLink = `${adminPortalUrl}?enrolmentId=${enrolmentId}`;

    // Gather some details to show in the admin's email:
    const studentName = `${enrolmentData.studentFirstName} ${enrolmentData.studentLastName}`;
    const carerName = `${enrolmentData.carerFirstName} ${enrolmentData.carerLastName}`;
    const additionalInfo = enrolmentData.additionalInfo;
    const allergies = enrolmentData.allergies;
    const carerEmail = enrolmentData.carerEmail;
    const carerPhone = enrolmentData.carerPhone;
    // Safely handle missing or empty arrays
    const classArray = enrolmentData.classes || [];
    const classes = classArray
      .map((c: any) => `${c.day} @ ${c.startTime}`)
      .join(", ");
    const emergencyContactName = `${enrolmentData.emergencyContactFirstName} ${enrolmentData.emergencyContactLastName}`;
    const emergencyContactPhone = enrolmentData.emergencyContactPhone;
    const emergencyContactRelation = enrolmentData.emergencyContactRelation;
    const permissionToLeave = enrolmentData.permissionToLeave;
    const subjectArray = enrolmentData.studentSubjects || [];
    const subjects = subjectArray.join(", ");
    const studentYear = enrolmentData.studentYear;

    // Prepare the SendGrid message
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
      sgMail.setApiKey(sendgridApiKey.value());
      await sgMail.send(msg);
      await sendParentWelcomeEmail(carerEmail, enrolmentData.carerFirstName);
      logger.info(`Admin and parent notify email sent for enrolment ${enrolmentId} to ${adminEmail}`);
    } catch (error) {
      const err = error as any;
      logger.error("SendGrid error:", err);
      if (err.response?.body?.errors) {
        logger.error("SendGrid error details:", JSON.stringify(err.response.body.errors));
      }
    }
  }
);

export const sendCustomPasswordResetEmail = onCall(
  {
    secrets: [sendgridApiKey],
  },
  async (request) => {
    const email = request.data.email as string | undefined;
    if (!email) {
      throw new HttpsError('invalid-argument', 'Email is required');
    }

    try {
      // Step 1: Get the official Firebase reset link (contains the oobCode)
      const resetLink = await getAuth().generatePasswordResetLink(email);

      // Step 2: Parse out the oobCode (and anything else you need)
      const url = new URL(resetLink);
      const oobCode = url.searchParams.get('oobCode');

      // Step 3: Construct your own direct link
      // You only *need* the oobCode to call confirmPasswordReset(...) from your HTML page
      // But you can also pass along mode=resetPassword or apiKey if needed.
      const customLink = `https://admin.tenacitytutoring.com/reset_password.html?oobCode=${oobCode}`;

      // Build your custom HTML
      const htmlContent = `
        <p>Hello,</p>
        <p>Click below to reset your password for Tenacity Tutoring:</p>
        <p><a href="${customLink}">Reset Password</a></p>
        <p>If you did not request a password reset, you can safely ignore this email.</p>
      `;

      // Step 4: Send that direct link in your email
      sgMail.setApiKey(sendgridApiKey.value());
      await sgMail.send({
        to: email,
        from: 'noreply@tenacitytutoring.com',
        subject: 'Tenacity Tutoring - Password Reset',
        html: htmlContent,
      });

      return { success: true };
    } catch (err) {
      console.error('Error sending password reset email:', err);
      throw new HttpsError('internal', 'Failed to send reset email');
    }
  }
);

