const assert = require("node:assert/strict");
const test = require("node:test");

const {
  applicationDefaultCredentialsMessage,
  isApplicationDefaultCredentialsReauthError,
} = require("../lib/google_auth_errors");

test("isApplicationDefaultCredentialsReauthError detects invalid_rapt ADC failures", () => {
  const error = new Error(
    'Getting metadata from plugin failed with error: {"error":"invalid_grant","error_subtype":"invalid_rapt"}',
  );

  assert.equal(isApplicationDefaultCredentialsReauthError(error), true);
});

test("isApplicationDefaultCredentialsReauthError ignores unrelated errors", () => {
  assert.equal(isApplicationDefaultCredentialsReauthError(new Error("permission denied")), false);
});

test("applicationDefaultCredentialsMessage includes project-scoped reauth command", () => {
  const message = applicationDefaultCredentialsMessage("tenacity-tutoring-b8eb2");

  assert.match(
    message,
    /gcloud auth application-default login --project=tenacity-tutoring-b8eb2/,
  );
  assert.match(message, /npm run backfill:attendance-dates/);
});
