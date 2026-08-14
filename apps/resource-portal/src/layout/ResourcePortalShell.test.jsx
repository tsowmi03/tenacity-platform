import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  user: { uid: "tutor-1", email: "tutor@tenacitytutoring.com" },
  role: "tutor",
  isAdmin: false,
  logout: vi.fn(),
}));

vi.mock("../AuthProvider", () => ({
  useAuth: () => authState,
}));

import ResourcePortalShell from "./ResourcePortalShell";

describe("ResourcePortalShell", () => {
  beforeEach(() => {
    authState.user = { uid: "tutor-1", email: "tutor@tenacitytutoring.com" };
    authState.role = "tutor";
    authState.isAdmin = false;
    authState.logout.mockReset();
  });

  it("gives tutors a dedicated resource surface with visible sign out", async () => {
    const user = userEvent.setup();
    render(<ResourcePortalShell><div>Resource content</div></ResourcePortalShell>);

    expect(screen.getByText("Resource content")).toBeInTheDocument();
    expect(screen.getByText("Tenacity Tutoring")).toBeInTheDocument();
    expect(screen.getByText("Resource portal")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Sign out/i }));
    expect(authState.logout).toHaveBeenCalledTimes(1);
  });

  it("shows the signed-in identity and role", () => {
    render(<ResourcePortalShell><div>Resource content</div></ResourcePortalShell>);

    expect(screen.getByText("tutor@tenacitytutoring.com")).toBeInTheDocument();
    expect(screen.getByText("tutor")).toBeInTheDocument();
  });

  it("never links to the admin portal, for any role", () => {
    // The portals are separate applications on separate origins with separate
    // sessions. An admin link here would be the one thread tying them back
    // together, so its absence is asserted rather than assumed.
    const { rerender } = render(
      <ResourcePortalShell><div>Resource content</div></ResourcePortalShell>
    );
    expect(screen.queryByText(/Admin portal/i)).not.toBeInTheDocument();

    authState.isAdmin = true;
    authState.role = "admin";
    rerender(<ResourcePortalShell><div>Resource content</div></ResourcePortalShell>);

    expect(screen.queryByText(/Admin portal/i)).not.toBeInTheDocument();
    for (const link of screen.queryAllByRole("link")) {
      expect(link.getAttribute("href")).not.toMatch(/admin\.tenacitytutoring\.com/);
    }
  });
});
