"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { buildUserDoc } = require("../../src/users/userFactory");
const {
  isInternalAccount,
  validateCreateUserInput,
  validateUpdateUserInput,
} = require("../../src/users/userSchemas");
const { refuseInternalAccount } = require("../../src/payments/paymentSecurity");
const { ValidationError } = require("../../src/shared/validation");

const baseInput = {
  role: "tutor",
  firstName: "Testy",
  lastName: "McTest",
  email: "testy@example.com",
  phone: "0400",
};

describe("account visibility", () => {
  it("defaults a new account to standard", () => {
    const doc = buildUserDoc(validateCreateUserInput(baseInput), {
      actorUid: "admin-1",
    });
    assert.equal(doc.visibility, "standard");
  });

  it("carries an explicit internal visibility through to the document", () => {
    const doc = buildUserDoc(
      validateCreateUserInput({ ...baseInput, visibility: "internal" }),
      { actorUid: "admin-1" }
    );
    assert.equal(doc.visibility, "internal");
  });

  it("rejects any visibility outside the two known values", () => {
    for (const visibility of ["hidden", "test", "STANDARD", "", null]) {
      assert.throws(
        () => validateCreateUserInput({ ...baseInput, visibility }),
        ValidationError,
        `expected ${JSON.stringify(visibility)} to be rejected`
      );
    }
  });

  it("allows visibility to be changed on an existing account", () => {
    assert.equal(
      validateUpdateUserInput({ visibility: "internal" }).visibility,
      "internal"
    );
    assert.equal(validateUpdateUserInput({}).visibility, undefined);
  });

  it("treats an absent field as standard", () => {
    // Every document written before this existed.
    assert.equal(isInternalAccount({ role: "tutor" }), false);
    assert.equal(isInternalAccount({}), false);
    assert.equal(isInternalAccount(null), false);
    assert.equal(isInternalAccount({ visibility: "standard" }), false);
    assert.equal(isInternalAccount({ visibility: "internal" }), true);
  });
});

describe("refuseInternalAccount", () => {
  it("blocks a payment from an internal account", () => {
    assert.throws(
      () => refuseInternalAccount({ auth: { token: { internal: true } } }),
      (err) =>
        err.code === "permission-denied" && /internal account/i.test(err.message)
    );
  });

  it("lets everyone else through", () => {
    // The claim is only ever present when true, so the common case is a token
    // without the key at all.
    refuseInternalAccount({ auth: { token: { role: "parent" } } });
    refuseInternalAccount({ auth: { token: { internal: false } } });
    refuseInternalAccount({ auth: {} });
    refuseInternalAccount({});
    refuseInternalAccount(undefined);
  });

  it("does not accept a truthy non-boolean as internal", () => {
    // Guards against a stringly-typed claim being read as authoritative.
    refuseInternalAccount({ auth: { token: { internal: "true" } } });
    refuseInternalAccount({ auth: { token: { internal: 1 } } });
  });
});
