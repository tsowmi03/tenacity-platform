import { describe, expect, it } from "vitest";
import { derivationLabel, groupJobsByLineage } from "./resourceLineage";

function job(id, overrides = {}) {
  return {
    id,
    jobId: id,
    lineageRootId: id,
    createdAtIso: "2026-08-20T00:00:00.000Z",
    ...overrides,
  };
}

describe("groupJobsByLineage", () => {
  it("numbers versions oldest-first but lists them newest-first", () => {
    const [stack] = groupJobsByLineage([
      job("job-3", { lineageRootId: "job-1", createdAtIso: "2026-08-22T00:00:00.000Z" }),
      job("job-2", { lineageRootId: "job-1", createdAtIso: "2026-08-21T00:00:00.000Z" }),
      job("job-1", { createdAtIso: "2026-08-20T00:00:00.000Z" }),
    ]);

    expect(stack.versions.map((entry) => entry.job.jobId)).toEqual(["job-3", "job-2", "job-1"]);
    expect(stack.versions.map((entry) => entry.version)).toEqual([3, 2, 1]);
    expect(stack.latest.job.jobId).toEqual("job-3");
    expect(stack.total).toBe(3);
  });

  it("keeps stacks in the order their newest member arrived", () => {
    const stacks = groupJobsByLineage([
      job("job-b", { createdAtIso: "2026-08-25T00:00:00.000Z" }),
      job("job-a", { createdAtIso: "2026-08-20T00:00:00.000Z" }),
    ]);
    expect(stacks.map((stack) => stack.rootId)).toEqual(["job-b", "job-a"]);
  });

  it("treats a job with no lineage recorded as its own root", () => {
    const [stack] = groupJobsByLineage([{ id: "old-job", jobId: "old-job" }]);
    expect(stack.rootId).toBe("old-job");
    expect(stack.rootLoaded).toBe(true);
    expect(stack.total).toBe(1);
  });

  it("flags a stack whose original is not among the loaded jobs", () => {
    const [stack] = groupJobsByLineage([
      job("job-2", { lineageRootId: "job-1", derivation: "revision" }),
    ]);
    expect(stack.rootLoaded).toBe(false);
  });

  it("returns nothing for an empty history", () => {
    expect(groupJobsByLineage([])).toEqual([]);
    expect(groupJobsByLineage()).toEqual([]);
  });
});

describe("derivationLabel", () => {
  it("names how a version was produced", () => {
    expect(derivationLabel({ derivation: "revision" })).toBe("Revised");
    expect(derivationLabel({ derivation: "edited-inputs" })).toBe("Edited inputs");
    expect(derivationLabel({})).toBe("Original");
    expect(derivationLabel()).toBe("Original");
  });
});
