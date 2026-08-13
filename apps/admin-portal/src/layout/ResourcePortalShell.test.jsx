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
    expect(screen.queryByText("Admin portal")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Sign out/i }));
    expect(authState.logout).toHaveBeenCalledTimes(1);
  });

  it("gives admins a route back to the admin portal", () => {
    authState.isAdmin = true;
    authState.role = "admin";
    render(<ResourcePortalShell><div>Resource content</div></ResourcePortalShell>);

    expect(screen.getByRole("link", { name: "Admin portal" })).toHaveAttribute("href", "/");
  });
});
