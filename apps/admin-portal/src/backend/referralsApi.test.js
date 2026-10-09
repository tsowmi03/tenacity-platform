import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./firestoreReads", () => ({
  listDocuments: vi.fn(async () => []),
  orderBy: vi.fn((field, direction) => ({ field, direction })),
  timestampToIso: vi.fn(() => null),
}));

vi.mock("./callable", () => ({
  callFunction: vi.fn(async () => ({})),
}));

import { callFunction } from "./callable";
import { listDocuments } from "./firestoreReads";
import {
  listReferrals,
  referralStatusLabel,
  referralStatusTone,
  setReferralRewardApplied,
  setReferralStatus,
} from "./referralsApi";
import { normalizeReferral } from "./schemas";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("referralsApi", () => {
  it("reads the referrals collection newest first", async () => {
    await listReferrals();
    expect(listDocuments).toHaveBeenCalledTimes(1);
    expect(listDocuments.mock.calls[0][0]).toBe("referrals");
    expect(listDocuments.mock.calls[0][1].constraints).toEqual([
      { field: "createdAt", direction: "desc" },
    ]);
  });

  it("sends status changes through the audited callable", async () => {
    await setReferralStatus("p1_p2", "successful");
    expect(callFunction).toHaveBeenCalledWith("adminUpdateReferral", {
      referralId: "p1_p2",
      status: "successful",
    });
  });

  it("sends reward changes through the audited callable as a boolean", async () => {
    await setReferralRewardApplied("p1_p2", true);
    await setReferralRewardApplied("p1_p2", "yes");
    expect(callFunction.mock.calls).toEqual([
      ["adminUpdateReferral", { referralId: "p1_p2", rewardApplied: true }],
      ["adminUpdateReferral", { referralId: "p1_p2", rewardApplied: false }],
    ]);
  });

  it("labels statuses and falls back for unknown ones", () => {
    expect(referralStatusLabel("successful")).toBe("Successful");
    expect(referralStatusTone("successful")).toBe("success");
    expect(referralStatusLabel("weird")).toBe("Pending");
    expect(referralStatusTone("weird")).toBe("neutral");
  });
});

describe("normalizeReferral", () => {
  it("fills safe defaults for a sparse document", () => {
    const row = normalizeReferral("p1_p2", { status: "paid", enrolmentIds: ["e1", 7] });
    expect(row.status).toBe("pending");
    expect(row.rewardApplied).toBe(false);
    expect(row.newParentExisted).toBe(false);
    expect(row.enrolmentIds).toEqual(["e1"]);
  });
});
