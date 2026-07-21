import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./callable", () => ({
  callFunction: vi.fn(async () => ({})),
}));

import { callFunction } from "./callable";
import { createTermsForYear, updateTerm } from "./termsApi";

beforeEach(() => {
  callFunction.mockClear();
});

describe("termsApi.createTermsForYear", () => {
  it("forwards the year and term rows to the backend callable", async () => {
    const terms = [
      { termNum: 1, weeksNum: 10, startDate: "2027-02-01", endDate: "2027-04-09", status: "upcoming" },
      { termNum: 2, weeksNum: 10, startDate: "2027-04-26", endDate: "2027-07-02", status: "upcoming" },
    ];

    await createTermsForYear("2027", terms);

    expect(callFunction).toHaveBeenCalledWith("adminCreateTermsForYear", {
      year: "2027",
      terms,
    });
  });
});

describe("termsApi.updateTerm", () => {
  it("wraps the term id and update fields in the callable payload", async () => {
    const updates = {
      startDate: "2027-02-02",
      endDate: "2027-04-10",
      weeksNum: 9,
      status: "active",
    };

    await updateTerm("2027_T1", updates);

    expect(callFunction).toHaveBeenCalledWith("adminUpdateTerm", {
      termId: "2027_T1",
      updates,
    });
  });
});
