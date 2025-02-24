import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { XeroClient } from "xero-node";
import * as functions from "firebase-functions";

admin.initializeApp();

// 1) Initialize the Xero Client
// Read from functions.config().xero.*, set via CLI
const xero = new XeroClient({
  clientId: functions.config().xero.client_id,
  clientSecret: functions.config().xero.client_secret,
  redirectUris: [functions.config().xero.redirect_uri],
  scopes: [
    "openid",
    "email",
    "profile",
    "offline_access",
    "accounting.transactions",
    "accounting.contacts",
    // Add or remove scopes as needed
  ],
  state: "some-random-state", // optional, to verify later
});

// 2) A helper function to get the Xero consent URL
export const generateXeroAuthUrl = onRequest(async (req, res) => {
  try {
    // Build the authorization URL using the XeroClient
    const consentUrl = await xero.buildConsentUrl();
    // Either redirect the user to this URL or just show it in the response
    res.status(200).send(`
      <h1>Xero Auth URL</h1>
      <p>Click below to authorize this Firebase app to access your Xero data.</p>
      <a href="${consentUrl}" target="_blank">Authorize with Xero</a>
    `);
  } catch (error) {
    logger.error("Error generating Xero Auth URL:", error);
    res.status(500).send("Could not generate Xero Auth URL");
  }
});

// 3) Handle the callback from Xero after user consents
export const xeroOAuthCallback = onRequest(async (req, res) => {
  try {
    // Xero will redirect to this function with `code` and `state` in the query params
    // The "apiCallback" method will exchange the code for tokens
    const tokenSet = await xero.apiCallback(req.url);
    // tokenSet now contains access_token, refresh_token, id_token, etc.

    logger.info("Xero token set acquired:", tokenSet);

    // IMPORTANT: Must store the tokenSet in a secure place for future calls.
    // Typically, store them in Firestore or Realtime DB. For example:
    const db = admin.firestore();
    await db.collection("xeroTokens").doc("master").set({
      ...tokenSet,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Let the user know everything worked
    res.status(200).send(`
      <h1>Success!</h1>
      <p>You can close this tab now. Your Firebase backend is authorized to call the Xero API.</p>
    `);
  } catch (error) {
    logger.error("Error in Xero OAuth callback:", error);
    res.status(400).send("Error in Xero OAuth flow");
  }
});

// ---- Example "helloWorld" endpoint (optional) ----
export const helloWorld = onRequest((request, response) => {
  logger.info("Hello logs!", {structuredData: true});
  response.send("Hello from Firebase!");
});
