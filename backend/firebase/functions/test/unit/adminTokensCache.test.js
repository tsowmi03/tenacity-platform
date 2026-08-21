"use strict";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  getAdminTokens,
  resetAdminTokensCache,
} = require("../../lib/notifications/shared");

describe("admin tokens cache", () => {
  beforeEach(() => {
    resetAdminTokensCache();
  });

  it("fetches once and reuses the result within the TTL window", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return ["tok1", "tok2"];
    };
    const first = await getAdminTokens({ fetchImpl, nowMs: 1000, ttlMs: 60000 });
    const second = await getAdminTokens({ fetchImpl, nowMs: 1500, ttlMs: 60000 });
    assert.deepEqual(first, ["tok1", "tok2"]);
    assert.deepEqual(second, ["tok1", "tok2"]);
    assert.equal(calls, 1);
  });

  it("re-fetches once the TTL has elapsed", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return [`tok-${calls}`];
    };
    const first = await getAdminTokens({ fetchImpl, nowMs: 0, ttlMs: 1000 });
    const second = await getAdminTokens({ fetchImpl, nowMs: 1500, ttlMs: 1000 });
    assert.deepEqual(first, ["tok-1"]);
    assert.deepEqual(second, ["tok-2"]);
    assert.equal(calls, 2);
  });

  it("re-fetches immediately when forceRefresh is set, even inside the TTL", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return [`tok-${calls}`];
    };
    await getAdminTokens({ fetchImpl, nowMs: 0, ttlMs: 60000 });
    const refreshed = await getAdminTokens({
      fetchImpl,
      nowMs: 10,
      ttlMs: 60000,
      forceRefresh: true,
    });
    assert.deepEqual(refreshed, ["tok-2"]);
    assert.equal(calls, 2);
  });

  it("shares one in-flight fetch across concurrent callers instead of double-querying", async () => {
    let calls = 0;
    let resolveFetch;
    const fetchImpl = () => {
      calls += 1;
      return new Promise((resolve) => {
        resolveFetch = resolve;
      });
    };
    const p1 = getAdminTokens({ fetchImpl, nowMs: 0, ttlMs: 60000 });
    const p2 = getAdminTokens({ fetchImpl, nowMs: 5, ttlMs: 60000 });
    assert.equal(calls, 1);
    resolveFetch(["tok1"]);
    assert.deepEqual(await p1, ["tok1"]);
    assert.deepEqual(await p2, ["tok1"]);
  });

  it("does not cache a failed fetch, so the next call retries against the source", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      if (calls === 1) throw new Error("firestore unavailable");
      return ["tok1"];
    };
    await assert.rejects(
      () => getAdminTokens({ fetchImpl, nowMs: 0, ttlMs: 60000 }),
      /firestore unavailable/
    );
    const recovered = await getAdminTokens({ fetchImpl, nowMs: 5, ttlMs: 60000 });
    assert.deepEqual(recovered, ["tok1"]);
    assert.equal(calls, 2);
  });
});
