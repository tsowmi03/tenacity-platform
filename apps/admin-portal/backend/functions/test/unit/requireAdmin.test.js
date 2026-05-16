"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { HttpsError } = require("firebase-functions/v2/https");
const {
  isAdminClaim,
  requireAdminCallable,
  requireAdminOnRequest,
} = require("../../src/auth/requireAdmin");

describe("isAdminClaim", () => {
  it("returns true only when role === 'admin'", () => {
    assert.equal(isAdminClaim({ role: "admin" }), true);
    assert.equal(isAdminClaim({ role: "parent" }), false);
    assert.equal(isAdminClaim({}), false);
    assert.equal(isAdminClaim(null), false);
  });
});

describe("requireAdminCallable", () => {
  it("returns actor when admin", () => {
    const actor = requireAdminCallable({
      auth: { uid: "u1", token: { role: "admin", email: "a@b.com" } },
    });
    assert.deepEqual(actor, {
      uid: "u1",
      email: "a@b.com",
      claims: { role: "admin", email: "a@b.com" },
    });
  });

  it("unauthenticated when no auth", () => {
    try {
      requireAdminCallable({});
      assert.fail("should throw");
    } catch (err) {
      assert.ok(err instanceof HttpsError);
      assert.equal(err.code, "unauthenticated");
    }
  });

  it("permission-denied when role missing", () => {
    try {
      requireAdminCallable({ auth: { uid: "u1", token: { role: "parent" } } });
      assert.fail("should throw");
    } catch (err) {
      assert.equal(err.code, "permission-denied");
    }
  });
});

describe("requireAdminOnRequest", () => {
  function fakeAdmin({ verify }) {
    return { auth: () => ({ verifyIdToken: verify }) };
  }

  it("rejects missing bearer", async () => {
    await assert.rejects(
      () => requireAdminOnRequest({ headers: {} }, fakeAdmin({ verify: async () => ({}) })),
      (err) => err.code === "unauthenticated"
    );
  });

  it("rejects malformed bearer", async () => {
    await assert.rejects(
      () =>
        requireAdminOnRequest(
          { headers: { authorization: "Token abc" } },
          fakeAdmin({ verify: async () => ({}) })
        ),
      (err) => err.code === "unauthenticated"
    );
  });

  it("rejects when verifyIdToken throws", async () => {
    await assert.rejects(
      () =>
        requireAdminOnRequest(
          { headers: { authorization: "Bearer x" } },
          fakeAdmin({
            verify: async () => {
              throw new Error("bad");
            },
          })
        ),
      (err) => err.code === "unauthenticated"
    );
  });

  it("rejects non-admin", async () => {
    await assert.rejects(
      () =>
        requireAdminOnRequest(
          { headers: { authorization: "Bearer x" } },
          fakeAdmin({ verify: async () => ({ uid: "u1", role: "parent" }) })
        ),
      (err) => err.code === "permission-denied"
    );
  });

  it("returns actor on success", async () => {
    const actor = await requireAdminOnRequest(
      { headers: { authorization: "Bearer x" } },
      fakeAdmin({
        verify: async () => ({ uid: "u1", role: "admin", email: "a@b.com" }),
      })
    );
    assert.equal(actor.uid, "u1");
    assert.equal(actor.email, "a@b.com");
    assert.equal(actor.claims.role, "admin");
  });
});
