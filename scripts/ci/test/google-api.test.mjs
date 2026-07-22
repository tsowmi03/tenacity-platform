import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { describe, it } from "node:test";

import {
  GoogleApiError,
  accessTokenFromEnvironment,
  authorizedJsonRequest,
  getAccessToken,
} from "../../firebase/google-api.mjs";

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    redirected: false,
    text: async () => (payload === null ? "" : JSON.stringify(payload)),
  };
}

function decodeJsonSegment(segment) {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

describe("Google API authentication", () => {
  it("exchanges a signed, one-hour service-account assertion for an access token", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const serviceAccount = {
      client_email: "ci@example-project.iam.gserviceaccount.com",
      private_key_id: "key-id",
      private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
      token_uri: "https://oauth2.googleapis.com/token",
    };
    const requests = [];
    const accessToken = await getAccessToken({
      serviceAccount,
      scopes: [
        "https://www.googleapis.com/auth/firebase",
        "https://www.googleapis.com/auth/cloud-platform",
      ],
      now: () => Date.parse("2026-07-21T00:00:00Z"),
      fetchImpl: async (url, init) => {
        requests.push({ url, init });
        return jsonResponse({ access_token: "short-lived-token", token_type: "Bearer", expires_in: 3600 });
      },
    });

    assert.equal(accessToken, "short-lived-token");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, serviceAccount.token_uri);
    assert.equal(requests[0].init.method, "POST");
    assert.equal(requests[0].init.redirect, "error");
    assert(requests[0].init.signal instanceof AbortSignal);
    assert.equal(requests[0].init.headers["content-type"], "application/x-www-form-urlencoded");
    const form = new URLSearchParams(requests[0].init.body);
    assert.equal(form.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
    const assertion = form.get("assertion");
    const [encodedHeader, encodedClaims, encodedSignature] = assertion.split(".");
    assert.deepEqual(decodeJsonSegment(encodedHeader), {
      alg: "RS256",
      typ: "JWT",
      kid: "key-id",
    });
    assert.deepEqual(decodeJsonSegment(encodedClaims), {
      iss: serviceAccount.client_email,
      scope:
        "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/firebase",
      aud: serviceAccount.token_uri,
      iat: 1784592000,
      exp: 1784595600,
    });
    assert.equal(
      verify(
        "RSA-SHA256",
        Buffer.from(`${encodedHeader}.${encodedClaims}`),
        publicKey,
        Buffer.from(encodedSignature, "base64url")
      ),
      true
    );
  });

  it("returns a federated environment token only when it is well-formed", () => {
    const token = `ya29.${"a".repeat(64)}`;
    assert.equal(
      accessTokenFromEnvironment({ GOOGLE_OAUTH_ACCESS_TOKEN: token }),
      token
    );
    assert.equal(accessTokenFromEnvironment({}), null);
    assert.equal(
      accessTokenFromEnvironment({ GOOGLE_OAUTH_ACCESS_TOKEN: "" }),
      null
    );
    assert.throws(
      () => accessTokenFromEnvironment({ GOOGLE_OAUTH_ACCESS_TOKEN: "short" }),
      /GOOGLE_OAUTH_ACCESS_TOKEN is malformed\./
    );
    assert.throws(
      () =>
        accessTokenFromEnvironment({
          GOOGLE_OAUTH_ACCESS_TOKEN: `bad token${"a".repeat(20)}`,
        }),
      /GOOGLE_OAUTH_ACCESS_TOKEN is malformed\./
    );
    assert.throws(
      () =>
        accessTokenFromEnvironment({
          GOOGLE_OAUTH_ACCESS_TOKEN: `line\nbreak${"a".repeat(20)}`,
        }),
      /GOOGLE_OAUTH_ACCESS_TOKEN is malformed\./
    );
  });

  it("rejects non-Google token endpoints before making a request", async () => {
    let fetchCalls = 0;
    await assert.rejects(
      getAccessToken({
        serviceAccount: {
          client_email: "ci@example-project.iam.gserviceaccount.com",
          private_key: "-----BEGIN PRIVATE KEY-----\ninvalid\n-----END PRIVATE KEY-----",
          token_uri: "https://example.invalid/token",
        },
        scopes: ["https://www.googleapis.com/auth/firebase.readonly"],
        fetchImpl: async () => {
          fetchCalls += 1;
        },
      }),
      /token_uri is not an approved Google endpoint/
    );
    assert.equal(fetchCalls, 0);
  });

  it("requires callers to choose an explicit OAuth scope", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    await assert.rejects(
      getAccessToken({
        serviceAccount: {
          client_email: "ci@example-project.iam.gserviceaccount.com",
          private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
        },
        fetchImpl: async () => assert.fail("OAuth request must not be sent"),
      }),
      /At least one OAuth scope is required/
    );
  });

  it("sends authorized JSON requests only to approved API origins", async () => {
    const requests = [];
    const result = await authorizedJsonRequest(
      "https://firebaserules.googleapis.com/v1/projects/test/releases/cloud.firestore",
      {
        accessToken: "secret-token",
        method: "PATCH",
        body: { updateMask: "rulesetName" },
        fetchImpl: async (url, init) => {
          requests.push({ url, init });
          return jsonResponse({ ok: true });
        },
      }
    );
    assert.deepEqual(result, { ok: true });
    assert.equal(requests[0].init.redirect, "error");
    assert(requests[0].init.signal instanceof AbortSignal);
    assert.equal(requests[0].init.headers.authorization, "Bearer secret-token");
    assert.equal(requests[0].init.headers["content-type"], "application/json");
    assert.equal(requests[0].init.body, JSON.stringify({ updateMask: "rulesetName" }));

    let disallowedCalls = 0;
    await assert.rejects(
      authorizedJsonRequest("https://example.invalid/collect", {
        accessToken: "secret-token",
        fetchImpl: async () => {
          disallowedCalls += 1;
        },
      }),
      /origin is not approved/
    );
    assert.equal(disallowedCalls, 0);
    await assert.rejects(
      authorizedJsonRequest("https://firebaserules.googleapis.com/v1/projects/test", {
        accessToken: "secret-token",
        headers: { Authorization: "Bearer attacker-token" },
        fetchImpl: async () => assert.fail("overridden authorization must not be sent"),
      }),
      /Authorization header is managed/
    );
    await assert.rejects(
      authorizedJsonRequest("https://firestore.googleapis.com/v1/projects/test", {
        accessToken: "secret-token",
        method: "POST",
        fetchImpl: async () => assert.fail("unsupported method must not be sent"),
      }),
      /method must be GET or PATCH/
    );
  });

  it("rejects OAuth and API redirects even when an injected fetch returns one", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    await assert.rejects(
      getAccessToken({
        serviceAccount: {
          client_email: "ci@example-project.iam.gserviceaccount.com",
          private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
        },
        scopes: ["https://www.googleapis.com/auth/firebase.readonly"],
        fetchImpl: async (_url, init) => {
          assert.equal(init.redirect, "error");
          return { ...jsonResponse({ access_token: "redirected" }), redirected: true };
        },
      }),
      /returned a redirect/
    );

    await assert.rejects(
      authorizedJsonRequest("https://firestore.googleapis.com/v1/projects/test", {
        accessToken: "secret-token",
        fetchImpl: async (_url, init) => {
          assert.equal(init.redirect, "error");
          return { ...jsonResponse({}), redirected: true };
        },
      }),
      /returned a redirect/
    );
  });

  it("permits PATCH only against the Firebase Rules origin", async () => {
    await assert.rejects(
      authorizedJsonRequest("https://firestore.googleapis.com/v1/projects/test/databases/default", {
        accessToken: "secret-token",
        method: "PATCH",
        body: {},
        fetchImpl: async () => assert.fail("Firestore PATCH must not be sent"),
      }),
      /PATCH requests are allowed only for Firebase Rules/
    );
  });

  it("bounds injected requests and aborts their request signal", async () => {
    let requestSignal;
    await assert.rejects(
      authorizedJsonRequest("https://firestore.googleapis.com/v1/projects/test", {
        accessToken: "secret-token",
        timeoutMs: 5,
        fetchImpl: async (_url, init) => {
          requestSignal = init.signal;
          return new Promise(() => {});
        },
      }),
      /timed out after 5 milliseconds/
    );
    assert.equal(requestSignal.aborted, true);
  });

  it("reports sanitized API failures without exposing the bearer token", async () => {
    const token = "must-not-appear";
    await assert.rejects(
      authorizedJsonRequest("https://firestore.googleapis.com/v1/projects/test", {
        accessToken: token,
        fetchImpl: async () =>
          jsonResponse(
            { error: { message: `permission denied\n${token}\nretry` } },
            403
          ),
      }),
      (error) => {
        assert(error instanceof GoogleApiError);
        assert.equal(error.status, 403);
        assert.match(
          error.message,
          /HTTP 403: permission denied \[REDACTED\] retry/
        );
        assert.equal(error.message.includes(token), false);
        return true;
      }
    );
  });

  it("redacts a rejected JWT assertion and hides invalid JSON response text", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    let assertion;
    await assert.rejects(
      getAccessToken({
        serviceAccount: {
          client_email: "ci@example-project.iam.gserviceaccount.com",
          private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
        },
        scopes: ["https://www.googleapis.com/auth/firebase.readonly"],
        fetchImpl: async (_url, init) => {
          assertion = new URLSearchParams(init.body).get("assertion");
          return jsonResponse(
            { error_description: `rejected assertion ${assertion}` },
            400
          );
        },
      }),
      (error) => {
        assert(error instanceof GoogleApiError);
        assert.equal(error.message.includes(assertion), false);
        assert.match(error.message, /\[REDACTED\]/);
        return true;
      }
    );

    const secretResponseText = "TOP-SECRET-RESPONSE";
    await assert.rejects(
      authorizedJsonRequest("https://firestore.googleapis.com/v1/projects/test", {
        accessToken: "secret-token",
        fetchImpl: async () => ({
          ok: false,
          status: 500,
          redirected: false,
          text: async () => `{${secretResponseText}`,
        }),
      }),
      (error) => {
        assert.match(error.message, /returned invalid JSON/);
        assert.equal(error.message.includes(secretResponseText), false);
        return true;
      }
    );
  });
});
