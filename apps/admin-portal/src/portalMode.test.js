import { describe, expect, it } from "vitest";
import {
  adminPortalHome,
  isResourcePortalHost,
  landingPathForRole,
  resourcePortalHome,
} from "./portalMode";

describe("portal mode", () => {
  it("recognises the resource custom domains without matching other hosts", () => {
    expect(isResourcePortalHost("resources.tenacitytutoring.com")).toBe(true);
    expect(isResourcePortalHost("RESOURCES.TENACITYTUTORING.COM.AU")).toBe(true);
    expect(isResourcePortalHost("admin.tenacitytutoring.com")).toBe(false);
    expect(isResourcePortalHost("localhost")).toBe(false);
  });

  it("sends tutors to resources after signing in on the admin host", () => {
    expect(landingPathForRole("tutor")).toBe("/resources");
    expect(landingPathForRole("admin")).toBe("/");
  });

  it("uses root as the resource home on the resource host", () => {
    expect(landingPathForRole("tutor", { resourcePortal: true })).toBe("/");
    expect(resourcePortalHome({ resourcePortal: true })).toBe("/");
    expect(resourcePortalHome({ resourcePortal: false })).toBe("/resources");
    expect(adminPortalHome({ resourcePortal: true })).toBe("https://admin.tenacitytutoring.com");
  });
});
