import { describe, expect, it } from "vitest";

import { warningSummary } from "./ResourceQueuePanel";

describe("warningSummary", () => {
  it("returns nothing for a job without warnings", () => {
    expect(warningSummary({ warnings: [] })).toBe("");
    expect(warningSummary({})).toBe("");
  });

  it("shows the maths fallback warning ahead of an omitted diagram", () => {
    const summary = warningSummary({
      warnings: [
        { code: "OPTIONAL_DIAGRAM_OMITTED", message: "Optional diagram for Q4 was omitted: Rasterisation failed" },
        {
          code: "MATH_FALLBACK",
          message: 'Some maths could not be formatted and is shown as plain text. Check before printing: Q3 "x^(".',
        },
      ],
    });
    expect(summary).toBe(
      'Some maths could not be formatted and is shown as plain text. Check before printing: Q3 "x^(". (+1 more)'
    );
  });

  it("uses a neutral message when a warning has none", () => {
    expect(warningSummary({ warnings: [{ code: "SOMETHING_NEW" }] })).toBe(
      "This resource was generated with a warning."
    );
  });
});
