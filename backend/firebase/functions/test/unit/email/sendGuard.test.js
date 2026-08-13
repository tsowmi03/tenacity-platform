"use strict";

const assert = require("node:assert/strict");
const { beforeEach, describe, it } = require("node:test");

const SENDGRID_PATH = require.resolve("@sendgrid/mail");
const GUARD_PATH = require.resolve("../../../src/email/sendGuard");

const PRODUCTION = "tenacity-tutoring-b8eb2";
const STAGING = "tenacity-tutoring-staging";

/** Install a stub for @sendgrid/mail and load a fresh copy of the guard. */
function loadGuard() {
  const sent = [];
  const stub = {
    setApiKey() {},
    send(payload) {
      sent.push(payload);
      return Promise.resolve([{ statusCode: 202 }, {}]);
    },
  };

  require.cache[SENDGRID_PATH] = {
    id: SENDGRID_PATH,
    filename: SENDGRID_PATH,
    loaded: true,
    exports: stub,
  };
  delete require.cache[GUARD_PATH];

  return { guard: require("../../../src/email/sendGuard"), sent };
}

function setProject(projectId) {
  process.env.GCLOUD_PROJECT = projectId;
  delete process.env.GOOGLE_CLOUD_PROJECT;
  delete process.env.FIREBASE_PROJECT_ID;
}

describe("sendGuard", () => {
  beforeEach(() => {
    delete process.env.STAGING_EMAIL_SINK;
  });

  describe("describeRecipients", () => {
    it("flattens strings, objects, and arrays across to/cc/bcc", () => {
      const { guard } = loadGuard();
      assert.deepEqual(
        guard.describeRecipients({
          to: "a@example.com",
          cc: [{ email: "b@example.com" }, "c@example.com"],
          bcc: { email: "d@example.com" },
        }),
        ["a@example.com", "b@example.com", "c@example.com", "d@example.com"]
      );
    });

    it("tolerates a message with no recipients", () => {
      const { guard } = loadGuard();
      assert.deepEqual(guard.describeRecipients({}), []);
    });
  });

  describe("in production", () => {
    it("passes the message through untouched", async () => {
      setProject(PRODUCTION);
      const { guard, sent } = loadGuard();

      const message = { to: "parent@real.example", subject: "Invoice due" };
      await guard.send(message);

      assert.equal(sent.length, 1);
      assert.equal(sent[0], message, "production must not rewrite the message");
      assert.equal(sent[0].subject, "Invoice due");
    });

    it("passes through even when a sink is configured", async () => {
      setProject(PRODUCTION);
      process.env.STAGING_EMAIL_SINK = "sink@example.com";
      const { guard, sent } = loadGuard();

      await guard.send({ to: "parent@real.example", subject: "Invoice due" });
      assert.equal(sent[0].to, "parent@real.example");
    });
  });

  describe("outside production with a sink", () => {
    it("redirects recipients and preserves the originals in a header", async () => {
      setProject(STAGING);
      process.env.STAGING_EMAIL_SINK = "sink@example.com";
      const { guard, sent } = loadGuard();

      await guard.send({
        to: "parent@real.example",
        cc: "other@real.example",
        subject: "Invoice due",
      });

      assert.equal(sent.length, 1);
      assert.equal(sent[0].to, "sink@example.com");
      assert.equal(sent[0].subject, "[STAGING] Invoice due");
      assert.equal(
        sent[0].headers["X-Original-To"],
        "parent@real.example, other@real.example"
      );
      assert.equal(sent[0].headers["X-Tenacity-Environment"], STAGING);
    });

    it("drops cc, bcc, and personalizations so only one email is sent", async () => {
      setProject(STAGING);
      process.env.STAGING_EMAIL_SINK = "sink@example.com";
      const { guard, sent } = loadGuard();

      await guard.send({
        to: "a@real.example",
        cc: "b@real.example",
        bcc: "c@real.example",
        personalizations: [{ to: [{ email: "d@real.example" }] }],
        subject: "Hello",
      });

      assert.equal(sent[0].cc, undefined);
      assert.equal(sent[0].bcc, undefined);
      assert.equal(sent[0].personalizations, undefined);
    });

    it("redirects every message when given an array", async () => {
      setProject(STAGING);
      process.env.STAGING_EMAIL_SINK = "sink@example.com";
      const { guard, sent } = loadGuard();

      await guard.send([
        { to: "one@real.example", subject: "One" },
        { to: "two@real.example", subject: "Two" },
      ]);

      assert.equal(sent.length, 1, "an array payload stays a single send call");
      assert.deepEqual(
        sent[0].map((message) => message.to),
        ["sink@example.com", "sink@example.com"]
      );
    });
  });

  describe("outside production without a sink", () => {
    it("drops the send entirely", async () => {
      setProject(STAGING);
      const { guard, sent } = loadGuard();

      const result = await guard.send({
        to: "parent@real.example",
        subject: "Invoice due",
      });

      assert.equal(sent.length, 0, "no mail may leave staging without a sink");
      assert.equal(result[0].statusCode, 200, "callers should see a success shape");
    });

    it("drops sends for an unknown project too", async () => {
      setProject("");
      const { guard, sent } = loadGuard();

      await guard.send({ to: "parent@real.example", subject: "Hi" });
      assert.equal(sent.length, 0);
    });
  });
});
