"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { adminAppOptions, loadApiKeys, readSecrets, usesExternalAccount } = require("../../scripts/lib/questionBankAuth");

function credentialFile(type) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "qb-auth-")), "creds.json");
  fs.writeFileSync(file, JSON.stringify({ type }));
  return file;
}

describe("question bank credentials", () => {
  it("leaves ordinary credentials to firebase-admin", () => {
    const env = { GOOGLE_APPLICATION_CREDENTIALS: credentialFile("authorized_user") };
    assert.equal(usesExternalAccount(env), false);
    assert.deepEqual(adminAppOptions({ projectId: "p" }, { env }), { projectId: "p" });
    assert.equal(usesExternalAccount({}), false);
  });

  it("gives firebase-admin an application-default credential under Workload Identity, without it reading the file", async () => {
    const file = credentialFile("external_account");
    const env = { GOOGLE_APPLICATION_CREDENTIALS: file };
    let seenEnv;
    const credential = { getAccessToken: async () => assert.fail("replaced") };
    const admin = { credential: { applicationDefault: () => { seenEnv = env.GOOGLE_APPLICATION_CREDENTIALS; return credential; } } };
    const options = adminAppOptions({ projectId: "p" }, { env, admin, auth: { getAccessToken: async () => "tok" } });
    assert.equal(seenEnv, undefined, "the file is hidden while the credential is built");
    assert.equal(env.GOOGLE_APPLICATION_CREDENTIALS, file, "and restored for Firestore and Storage");
    assert.equal(options.projectId, "p");
    assert.deepEqual(await options.credential.getAccessToken(), { access_token: "tok", expires_in: 3000 });
  });

  it("reads API keys from Secret Manager", async () => {
    const urls = [];
    const fetchImpl = async (url) => {
      urls.push(url);
      return { ok: true, json: async () => ({ payload: { data: Buffer.from("key-123\n").toString("base64") } }) };
    };
    const values = await readSecrets("proj", ["OPENAI_API_KEY"], { auth: { getAccessToken: async () => "t" }, fetchImpl });
    assert.deepEqual(values, { OPENAI_API_KEY: "key-123" });
    assert.match(urls[0], /projects\/proj\/secrets\/OPENAI_API_KEY\/versions\/latest:access$/);
  });

  it("falls back to the Firebase CLI off Workload Identity", async () => {
    const values = await loadApiKeys(["X"], { env: {}, loadFirebaseSecrets: ({ secretNames }) => ({ [secretNames[0]]: "cli" }) });
    assert.deepEqual(values, { X: "cli" });
  });
});
