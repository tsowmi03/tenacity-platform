"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { ensureAuthUser } = require("../../src/auth/authUsers");

function fakeAdmin({ getByEmail, createUser }) {
  return {
    auth: () => ({
      getUserByEmail: getByEmail,
      createUser,
    }),
  };
}

describe("ensureAuthUser", () => {
  it("returns existing uid when the email already has an auth user", async () => {
    const admin = fakeAdmin({
      getByEmail: async () => ({ uid: "existing-uid" }),
      createUser: async () => {
        throw new Error("should not be called");
      },
    });
    const out = await ensureAuthUser(
      { email: "  Jane@Example.COM ", firstName: "Jane", lastName: "Doe" },
      { admin }
    );
    assert.deepEqual(out, { uid: "existing-uid", created: false });
  });

  it("creates a new auth user when email not found", async () => {
    let captured;
    const admin = fakeAdmin({
      getByEmail: async () => {
        const err = new Error("not found");
        err.code = "auth/user-not-found";
        throw err;
      },
      createUser: async (input) => {
        captured = input;
        return { uid: "new-uid" };
      },
    });
    const out = await ensureAuthUser(
      { email: "Jane@Example.com", firstName: "Jane", lastName: "Doe" },
      { admin }
    );
    assert.deepEqual(out, { uid: "new-uid", created: true });
    assert.equal(captured.email, "jane@example.com");
    assert.equal(captured.displayName, "Jane Doe");
    assert.ok(captured.password && captured.password.length >= 8);
  });

  it("propagates unexpected errors", async () => {
    const admin = fakeAdmin({
      getByEmail: async () => {
        const err = new Error("network down");
        err.code = "auth/internal-error";
        throw err;
      },
      createUser: async () => ({ uid: "x" }),
    });
    await assert.rejects(
      () => ensureAuthUser({ email: "a@b.com" }, { admin }),
      /network down/
    );
  });

  it("requires email", async () => {
    await assert.rejects(
      () => ensureAuthUser({ email: "" }, { admin: fakeAdmin({}) }),
      TypeError
    );
  });
});
