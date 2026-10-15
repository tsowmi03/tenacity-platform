import { describe, expect, it } from "vitest";
import { EVENTS, analyticsEnvironment, createJobOutcomeTracker, tagEvent, track } from "./analytics";

describe("analytics", () => {
  it("tags staging so dashboards can filter it out of the shared project", () => {
    expect(analyticsEnvironment("tenacity-tutoring-staging")).toBe("staging");
    expect(analyticsEnvironment("tenacity-tutoring-b8eb2")).toBe("production");
  });

  it("refuses an event nobody declared", () => {
    expect(() => track("made_up_event")).toThrow(/Unknown analytics event/);
    expect(() => track(EVENTS.RESOURCE_DOWNLOADED, { job_id: "j1" })).not.toThrow();
  });

  it("tags every event, including the first page view", () => {
    const event = tagEvent({ event: "$pageview", properties: { $current_url: "/" } });
    expect(event.properties).toMatchObject({ app: "resource_portal", environment: "production" });
  });

  it("only reports jobs it saw finish", () => {
    const report = createJobOutcomeTracker("tutor-1");
    // Already complete when the list first loads: not a transition.
    expect(() => report([{ jobId: "a", status: "complete" }])).not.toThrow();
    expect(() =>
      report([
        { jobId: "a", status: "complete" },
        { jobId: "b", status: "processing" },
      ])
    ).not.toThrow();
    expect(() =>
      report([
        { jobId: "a", status: "complete" },
        { jobId: "b", status: "failed", createdAtIso: "2026-10-15T00:00:00Z" },
      ])
    ).not.toThrow();
  });
});
