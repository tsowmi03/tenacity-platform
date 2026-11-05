"use strict";

// RES-62. The question bank scripts run on a laptop (gcloud credentials) and
// in GitHub Actions, where Workload Identity hands over an external_account
// credential file. Firebase Admin rejects that file outright (see
// syncStagingTerms.js), and the Firebase CLI cannot read secrets with it.
// google-auth-library handles every credential type, so in that case:
//   - Admin is given a credential that asks google-auth-library for tokens;
//   - API keys are read straight from Secret Manager's REST API.

const fs = require("node:fs");
const { GoogleAuth } = require("google-auth-library");

const SCOPES = ["https://www.googleapis.com/auth/cloud-platform"];

function usesExternalAccount(env = process.env) {
  const file = env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!file) return false;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")).type === "external_account";
  } catch {
    return false;
  }
}

/**
 * Options for admin.initializeApp. Under Workload Identity, Admin is given an
 * "application default" credential (it treats a Compute Engine one as such)
 * built with the credential file hidden, so it never parses the file. Its own
 * tokens come from google-auth-library, and because it counts as application
 * default, Firestore and Storage resolve credentials themselves from the
 * file, which their client libraries do support.
 */
function adminAppOptions(options, { env = process.env, auth = new GoogleAuth({ scopes: SCOPES }), admin = require("firebase-admin") } = {}) {
  if (!usesExternalAccount(env)) return options;
  const file = env.GOOGLE_APPLICATION_CREDENTIALS;
  delete env.GOOGLE_APPLICATION_CREDENTIALS;
  let credential;
  try {
    credential = admin.credential.applicationDefault();
  } finally {
    env.GOOGLE_APPLICATION_CREDENTIALS = file;
  }
  credential.getAccessToken = async () => ({ access_token: await auth.getAccessToken(), expires_in: 3000 });
  return { ...options, credential };
}

/** Reads the latest version of each named secret from Secret Manager. */
async function readSecrets(projectId, names, { auth = new GoogleAuth({ scopes: SCOPES }), fetchImpl = globalThis.fetch } = {}) {
  const token = await auth.getAccessToken();
  const values = {};
  for (const name of names) {
    const url = `https://secretmanager.googleapis.com/v1/projects/${projectId}/secrets/${name}/versions/latest:access`;
    const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Could not read ${name} from Secret Manager: ${response.status}`);
    const body = await response.json();
    values[name] = Buffer.from(body.payload.data, "base64").toString("utf8").trim();
  }
  return values;
}

/**
 * API keys for --firebase-secrets: Secret Manager directly under Workload
 * Identity, otherwise the Firebase CLI as before.
 */
async function loadApiKeys(names, { projectId = "tenacity-tutoring-b8eb2", env = process.env, loadFirebaseSecrets } = {}) {
  if (usesExternalAccount(env)) return readSecrets(projectId, names);
  return loadFirebaseSecrets({ secretNames: names });
}

module.exports = { adminAppOptions, loadApiKeys, readSecrets, usesExternalAccount };
