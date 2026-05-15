import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./callable", () => ({
  callFunction: vi.fn(async () => ({})),
}));

import { callFunction } from "./callable";
import { adjustLessonTokens, deleteUser, updateUser } from "./usersApi";

beforeEach(() => {
  callFunction.mockClear();
});

describe("usersApi.adjustLessonTokens", () => {
  it("sends { uid, delta } for delta mode", async () => {
    await adjustLessonTokens("parent_123", "delta", 3, "Lesson refund");
    expect(callFunction).toHaveBeenCalledTimes(1);
    expect(callFunction).toHaveBeenCalledWith("adminAdjustLessonTokens", {
      uid: "parent_123",
      delta: 3,
      reason: "Lesson refund",
    });
  });

  it("sends { uid, set } for set mode", async () => {
    await adjustLessonTokens("parent_123", "set", 12);
    expect(callFunction).toHaveBeenCalledWith("adminAdjustLessonTokens", {
      uid: "parent_123",
      set: 12,
    });
  });

  it("supports negative deltas (token removal)", async () => {
    await adjustLessonTokens("parent_123", "delta", -2);
    expect(callFunction.mock.calls[0][1]).toMatchObject({ uid: "parent_123", delta: -2 });
  });

  it("coerces numeric strings to numbers", async () => {
    await adjustLessonTokens("parent_123", "set", "5");
    expect(callFunction.mock.calls[0][1].set).toBe(5);
  });

  it("omits reason when not provided", async () => {
    await adjustLessonTokens("parent_123", "delta", 1);
    const payload = callFunction.mock.calls[0][1];
    expect(payload).not.toHaveProperty("reason");
  });
});

describe("usersApi.updateUser", () => {
  it("merges uid with update fields", async () => {
    await updateUser("uid_abc", { firstName: "Alex", lastName: "Doe", phone: "+61400000000" });
    expect(callFunction).toHaveBeenCalledWith("adminUpdateUser", {
      uid: "uid_abc",
      firstName: "Alex",
      lastName: "Doe",
      phone: "+61400000000",
    });
  });
});

describe("usersApi.deleteUser", () => {
  it("passes uid and confirmEmail to adminDeleteUser", async () => {
    await deleteUser("uid_abc", "alex@example.com");
    expect(callFunction).toHaveBeenCalledWith("adminDeleteUser", {
      uid: "uid_abc",
      confirmEmail: "alex@example.com",
    });
  });
});
