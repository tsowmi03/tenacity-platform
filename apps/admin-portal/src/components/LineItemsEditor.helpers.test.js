import { describe, expect, it } from "vitest";
import {
  computeLineTotal,
  emptyLineItem,
  lineItemsSum,
  normalizeLineItemsForSubmit,
} from "./LineItemsEditor";

describe("emptyLineItem", () => {
  it("returns a zero-valued row with all expected fields", () => {
    expect(emptyLineItem()).toEqual({
      description: "",
      quantity: 1,
      unitAmount: 0,
      lineTotal: 0,
      studentName: "",
      isAdminAdjustment: false,
    });
  });
});

describe("computeLineTotal", () => {
  it("multiplies quantity by unitAmount", () => {
    expect(computeLineTotal({ quantity: 3, unitAmount: 25 })).toBe(75);
  });

  it("rounds to two decimal places", () => {
    expect(computeLineTotal({ quantity: 3, unitAmount: 33.333 })).toBe(100);
    expect(computeLineTotal({ quantity: 1.5, unitAmount: 10.123 })).toBe(15.18);
  });

  it("returns 0 for non-finite inputs", () => {
    expect(computeLineTotal({ quantity: NaN, unitAmount: 10 })).toBe(0);
    expect(computeLineTotal({ quantity: 1, unitAmount: undefined })).toBe(0);
  });
});

describe("lineItemsSum", () => {
  it("sums lineTotal across items", () => {
    const items = [
      { lineTotal: 10 },
      { lineTotal: 25.5 },
      { lineTotal: -5 },
    ];
    expect(lineItemsSum(items)).toBe(30.5);
  });

  it("returns 0 for empty or invalid input", () => {
    expect(lineItemsSum([])).toBe(0);
    expect(lineItemsSum(null)).toBe(0);
    expect(lineItemsSum(undefined)).toBe(0);
  });

  it("ignores missing lineTotal values", () => {
    expect(lineItemsSum([{ description: "no total" }, { lineTotal: 5 }])).toBe(5);
  });
});

describe("normalizeLineItemsForSubmit", () => {
  it("trims description, coerces numbers, and drops empty optional fields", () => {
    const items = [
      {
        description: "  Tutoring  ",
        quantity: "2",
        unitAmount: "50",
        lineTotal: "100",
        studentName: "  Alex  ",
        isAdminAdjustment: false,
      },
    ];
    expect(normalizeLineItemsForSubmit(items)).toEqual([
      {
        description: "Tutoring",
        quantity: 2,
        unitAmount: 50,
        lineTotal: 100,
        studentName: "Alex",
      },
    ]);
  });

  it("omits studentName when blank and omits isAdminAdjustment when false", () => {
    const result = normalizeLineItemsForSubmit([
      {
        description: "Session",
        quantity: 1,
        unitAmount: 80,
        lineTotal: 80,
        studentName: "",
        isAdminAdjustment: false,
      },
    ]);
    expect(result[0]).not.toHaveProperty("studentName");
    expect(result[0]).not.toHaveProperty("isAdminAdjustment");
  });

  it("preserves isAdminAdjustment when true", () => {
    const result = normalizeLineItemsForSubmit([
      {
        description: "Credit",
        quantity: 1,
        unitAmount: -10,
        lineTotal: -10,
        isAdminAdjustment: true,
      },
    ]);
    expect(result[0].isAdminAdjustment).toBe(true);
  });
});
