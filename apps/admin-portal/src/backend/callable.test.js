import { describe, expect, it, vi } from "vitest";

vi.mock("firebase/functions", () => ({
  httpsCallable: vi.fn(),
}));

vi.mock("../firebaseConfig", () => ({
  firebaseConfig: { projectId: "test-project" },
  functions: {},
}));

const { BackendError, friendlyMessageForCode, normalizeBackendError } = await import("./callable");

describe("friendlyMessageForCode", () => {
  it("maps known codes (with functions/ prefix) to actionable copy", () => {
    expect(friendlyMessageForCode("functions/resource-exhausted")).toMatch(/busy/i);
    expect(friendlyMessageForCode("deadline-exceeded")).toMatch(/timed out/i);
    expect(friendlyMessageForCode("permission-denied")).toMatch(/permission/i);
  });

  it("returns null for codes we have no friendlier copy for", () => {
    expect(friendlyMessageForCode("failed-precondition")).toBeNull();
    expect(friendlyMessageForCode("invalid-argument")).toBeNull();
  });
});

describe("normalizeBackendError", () => {
  it("replaces opaque internal messages with friendly copy but keeps the original", () => {
    const out = normalizeBackendError({ code: "internal", message: "INTERNAL" });
    expect(out).toBeInstanceOf(BackendError);
    expect(out.code).toBe("internal");
    expect(out.message).toMatch(/something went wrong/i);
    expect(out.userMessage).toMatch(/something went wrong/i);
    expect(out.serverMessage).toBe("INTERNAL");
  });

  it("preserves specific server messages for actionable codes", () => {
    const out = normalizeBackendError({
      code: "failed-precondition",
      message: "Only failed resource jobs can be retried",
    });
    expect(out.message).toBe("Only failed resource jobs can be retried");
    expect(out.userMessage).toBe("Only failed resource jobs can be retried");
  });

  it("surfaces validation messages from invalid-argument", () => {
    const out = normalizeBackendError({
      code: "functions/invalid-argument",
      message: "year must be between 5 and 10",
    });
    expect(out.code).toBe("invalid-argument");
    expect(out.message).toBe("year must be between 5 and 10");
  });

  it("uses the fallback when there is neither a server message nor friendly copy", () => {
    const out = normalizeBackendError({ code: "not-a-real-code" }, "Failed to call thing.");
    expect(out.message).toBe("Failed to call thing.");
  });

  it("passes through existing BackendError instances unchanged", () => {
    const original = new BackendError({ code: "failed-precondition", message: "nope" });
    expect(normalizeBackendError(original)).toBe(original);
  });

  it("carries warnings through from callable error details", () => {
    const out = normalizeBackendError({
      code: "internal",
      message: "boom",
      details: { warnings: [{ code: "X" }] },
    });
    expect(out.warnings).toEqual([{ code: "X" }]);
  });
});
