import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Run the real TypeScript modules with SendGrid and the environment replaced.
const loadModule = (relativePath, mocks, globals) => {
  const filename = path.join(root, relativePath);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  const require = (id) => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (id.startsWith("@lib/")) return loadModule(`src/lib/${id.slice(5)}.ts`, mocks, globals);
    throw new Error(`Unexpected dependency: ${id}`);
  };
  vm.runInNewContext(source, { module, exports: module.exports, require, ...globals }, { filename });
  return module.exports;
};

const setup = (env) => {
  const sent = [];
  const errors = [];
  const sendgrid = { default: { setApiKey: () => {}, send: async (message) => sent.push(message) } };
  const globals = { process: { env }, console: { error: (...args) => errors.push(args.join(" ")) } };
  return { sent, errors, mocks: { "@sendgrid/mail": sendgrid }, globals };
};

const response = () => {
  const res = { statusCode: 0, body: null, headers: {} };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.setHeader = (name, value) => { res.headers[name] = value; };
  return res;
};

const enquiry = { method: "POST", body: { name: "Test Parent", email: "parent@example.com", phoneNumber: "0400000000" } };
const fullEnv = { SENDGRID_API_KEY: "SG.key", SENDER_EMAIL: "no-reply@example.com", RECIEVER_EMAIL: "enquiries@example.com" };

test("sendGridConfig names exactly the unset or blank variables", () => {
  const { mocks, globals } = setup({});
  const { sendGridConfig } = loadModule("src/lib/adminNotification.ts", mocks, globals);
  assert.deepEqual([...sendGridConfig(fullEnv).missing], []);
  assert.deepEqual([...sendGridConfig({ SENDGRID_API_KEY: "SG.key", SENDER_EMAIL: " " }).missing], ["SENDER_EMAIL", "RECIEVER_EMAIL"]);
});

test("the enquiry route logs which variable is missing, never its value", async () => {
  const { sent, errors, mocks, globals } = setup({ SENDER_EMAIL: "no-reply@example.com" });
  const handler = loadModule("src/pages/api/send-email.ts", mocks, globals).default;
  const res = response();
  await handler(enquiry, res);
  assert.equal(res.statusCode, 500);
  assert.equal(sent.length, 0);
  assert.deepEqual(errors, ["Missing SendGrid configuration for enquiry email: SENDGRID_API_KEY, RECIEVER_EMAIL"]);
});

test("the enquiry route sends when all three are set", async () => {
  const { sent, errors, mocks, globals } = setup(fullEnv);
  const handler = loadModule("src/pages/api/send-email.ts", mocks, globals).default;
  const res = response();
  await handler(enquiry, res);
  assert.equal(res.statusCode, 200);
  assert.equal(sent[0].to, "enquiries@example.com");
  assert.deepEqual(errors, []);
});

test("admin notifications name the missing variable too", async () => {
  const { errors, mocks, globals } = setup({ SENDGRID_API_KEY: "SG.key", RECIEVER_EMAIL: "enquiries@example.com" });
  const { sendAdminNotification } = loadModule("src/lib/adminNotification.ts", mocks, globals);
  assert.equal(await sendAdminNotification({ subject: "s", heading: "h", intro: "i", details: [] }), false);
  assert.deepEqual(errors, ["Missing SendGrid configuration for admin notification: SENDER_EMAIL"]);
});
