import * as logger from "firebase-functions/logger";
import * as sgMail from "@sendgrid/mail";
import { defineSecret } from "firebase-functions/params";
import {onDocumentCreated} from "firebase-functions/v2/firestore";

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