import { describe, expect, it } from "vitest";
import { analyticsEnvironment, syncAnalyticsUser, tagEvent } from "./analytics";

describe("analytics", () => {
  it("tags staging so dashboards can filter it out of the shared project", () => {
    expect(analyticsEnvironment("tenacity-tutoring-staging")).toBe("staging");
    expect(analyticsEnvironment("tenacity-tutoring-b8eb2")).toBe("production");
  });

  it("tags every event, including the first page view", () => {
    const event = tagEvent({ event: "$pageview", properties: {} });
    expect(event.properties).toMatchObject({ app: "admin_portal", environment: "production" });
  });

  it("does nothing in tests", () => {
    expect(() => syncAnalyticsUser({ uid: "a1", email: "a@example.com" }, "admin")).not.toThrow();
    expect(() => syncAnalyticsUser(null)).not.toThrow();
  });
});
