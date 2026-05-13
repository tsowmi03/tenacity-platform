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
  }
);
//# sourceMappingURL=index.js.map
