import * as admin from "firebase-admin";
admin.initializeApp(); // Firebase Admin SDK initialization

// Import functions from other files
import * as emailFunctions from "./email_functions";
import * as enrolmentFunctions from "./enrolment_functions";
import * as paymentFunctions from "./payment_functions";
import * as xeroFunctions from "./xero_functions";

// Export all functions so Firebase can recognize them
module.exports = { 
  ...emailFunctions, 
  ...enrolmentFunctions, 
  ...paymentFunctions,
  ...xeroFunctions
};