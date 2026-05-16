import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./callable", () => ({
  callFunction: vi.fn(async () => ({})),
}));

import { callFunction } from "./callable";
import { promoteWaitlistEntry, updateWaitlistEntryStatus } from "./waitlistApi";

beforeEach(() => {
  callFunction.mockClear();
});

describe("waitlistApi.promoteWaitlistEntry", () => {
  it("sends { entryId } to promoteWaitlistEntry", async () => {
    await promoteWaitlistEntry("wl_entry_42");
    expect(callFunction).toHaveBeenCalledWith("promoteWaitlistEntry", { entryId: "wl_entry_42" });
  });
});

describe("waitlistApi.updateWaitlistEntryStatus", () => {
  it("sends { entryId, status } when no options provided", async () => {
    await updateWaitlistEntryStatus("wl_entry_42", "declined");
    expect(callFunction).toHaveBeenCalledWith("updateWaitlistEntryStatus", {
      entryId: "wl_entry_42",
      status: "declined",
    });
  });

  it("includes offerExpiresAt only when provided", async () => {
    await updateWaitlistEntryStatus("wl_entry_42", "offered", {
      offerExpiresAt: "2026-06-01T00:00:00.000Z",
    });
    expect(callFunction).toHaveBeenCalledWith("updateWaitlistEntryStatus", {
      entryId: "wl_entry_42",
      status: "offered",
      offerExpiresAt: "2026-06-01T00:00:00.000Z",
    });
  });

  it("does not forward unknown option fields like note (backend ignores it)", async () => {
    await updateWaitlistEntryStatus("wl_entry_42", "cancelled", { note: "stale" });
    expect(callFunction.mock.calls[0][1]).toEqual({
      entryId: "wl_entry_42",
      status: "cancelled",
    });
  });
});
