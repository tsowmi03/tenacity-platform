import { describe, expect, it } from "vitest";
import { analyticsEnvironment, syncAnalyticsUser } from "./analytics";

describe("analytics", () => {
  it("tags staging so dashboards can filter it out of the shared project", () => {
    expect(analyticsEnvironment("tenacity-tutoring-staging")).toBe("staging");
    expect(analyticsEnvironment("tenacity-tutoring-b8eb2")).toBe("production");
  });

  it("does nothing in tests", () => {
    expect(() => syncAnalyticsUser({ uid: "a1", email: "a@example.com" }, "admin")).not.toThrow();
    expect(() => syncAnalyticsUser(null)).not.toThrow();
  });
});
