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
// Export all functions so Firebase can recognize them
module.exports = Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, emailFunctions), enrolmentFunctions), paymentFunctions), xeroFunctions), timetableFunctions), notificationsFunctions), portalOverrides), { linkUsers: uidLink_1.linkUsers });
//# sourceMappingURL=index.js.map
