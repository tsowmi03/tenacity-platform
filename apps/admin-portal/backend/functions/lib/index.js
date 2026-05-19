"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
admin.initializeApp(); // Firebase Admin SDK initialization
// Import functions from other files
const emailFunctions = require("./email_functions");
const enrolmentFunctions = require("./enrolment_functions");
const paymentFunctions = require("./payment_functions");
const xeroFunctions = require("./xero_functions");
const timetableFunctions = require("./timetable_functions");
const notificationsFunctions = require("./notifications/index");
const portalOverrides = require("./portal/overrides");
const uidLink_1 = require("./uidLink");

// Phase 2 portal admin functions (user management). Each module exports the
// onCall handler under the canonical function name.
const { adminCreateUser } = require("../src/users/createUser");
const { adminCreateParent } = require("../src/users/createParent");
const { adminUpdateUser } = require("../src/users/updateUser");
const { adminDeleteUser } = require("../src/users/deleteUser");
const {
  adminLinkStudentToParent,
  adminUnlinkStudentFromParent,
} = require("../src/users/linkStudent");
const {
  adminAdjustLessonTokens,
} = require("../src/users/adjustLessonTokens");
const { adminCreateStudent } = require("../src/students/createStudent");
const { adminUpdateStudent } = require("../src/students/updateStudent");
const { adminDeleteStudent } = require("../src/students/deleteStudent");
const { adminAcceptEnrolment } = require("../src/enrolments/acceptEnrolment");
const {
  adminArchiveEnrolment,
  adminUnarchiveEnrolment,
} = require("../src/enrolments/archiveEnrolment");
const {
  adminDeleteEnrolment,
  adminPurgeEnrolment,
} = require("../src/enrolments/deleteEnrolment");
const { adminUpdateEnrolment } = require("../src/enrolments/updateEnrolment");
const { adminCreateClass } = require("../src/classes/createClass");
const { adminUpdateClass } = require("../src/classes/updateClass");
const { adminDeleteClass } = require("../src/classes/deleteClass");
const {
  adminGenerateAttendanceForClass,
  adminRegenerateAttendanceForTerm,
} = require("../src/classes/attendanceGeneration");
const {
  adminCreateInvoice,
  adminCreateInvoiceDraft,
} = require("../src/invoices/createInvoice");
const { adminUpdateInvoice } = require("../src/invoices/updateInvoice");
const { adminDeleteInvoice } = require("../src/invoices/deleteInvoice");
const { adminGetInvoicePdf } = require("../src/invoices/getInvoicePdf");
const { adminIncomeReport } = require("../src/reports/incomeReport");
const {
  adminInvoiceAgingReport,
} = require("../src/reports/invoiceAgingReport");
const { adminExportReport } = require("../src/reports/exportReport");
const { adminAttendanceReport } = require("../src/reports/attendanceReport");
const {
  adminStudentEnrolmentReport,
} = require("../src/reports/studentEnrolmentReport");
const {
  adminClassUtilisationReport,
} = require("../src/reports/classUtilisationReport");
const {
  adminCreateTermsForYear,
  adminUpdateTerm,
} = require("../src/terms/manageTerms");
const { recordAuditEvent } = require("../src/audit/recordAuditEvent");

// Export all functions so Firebase can recognize them
module.exports = Object.assign(
  Object.assign(
    Object.assign(
      Object.assign(
        Object.assign(
          Object.assign(
            Object.assign(Object.assign({}, emailFunctions), enrolmentFunctions),
            paymentFunctions
          ),
          xeroFunctions
        ),
        timetableFunctions
      ),
      notificationsFunctions
    ),
    portalOverrides
  ),
  {
    linkUsers: uidLink_1.linkUsers,
    adminCreateUser,
    adminCreateParent,
    adminUpdateUser,
    adminDeleteUser,
    adminLinkStudentToParent,
    adminUnlinkStudentFromParent,
    adminAdjustLessonTokens,
    adminCreateStudent,
    adminUpdateStudent,
    adminDeleteStudent,
    adminAcceptEnrolment,
    adminArchiveEnrolment,
    adminUnarchiveEnrolment,
    adminDeleteEnrolment,
    adminPurgeEnrolment,
    adminUpdateEnrolment,
    adminCreateClass,
    adminUpdateClass,
    adminDeleteClass,
    adminGenerateAttendanceForClass,
    adminRegenerateAttendanceForTerm,
    adminCreateInvoice,
    adminCreateInvoiceDraft,
    adminUpdateInvoice,
    adminDeleteInvoice,
    adminGetInvoicePdf,
    adminIncomeReport,
    adminInvoiceAgingReport,
    adminExportReport,
    adminAttendanceReport,
    adminStudentEnrolmentReport,
    adminClassUtilisationReport,
    adminCreateTermsForYear,
    adminUpdateTerm,
    recordAuditEvent,
  }
);

// The legacy onRequest `acceptPendingEnrolment` defined in
// lib/enrolment_functions.js (and previously overridden by portal/overrides)
// is replaced by the idempotent `adminAcceptEnrolment` callable. Explicitly
// delete it from the export map so the live function URL stays removed.
delete module.exports.acceptPendingEnrolment;
//# sourceMappingURL=index.js.map
