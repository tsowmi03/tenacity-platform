import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../AuthProvider", () => ({
  useAuth: () => ({
    user: { uid: "admin-1", email: "admin@tenacitytutoring.com" },
    role: "admin",
    isAdmin: true,
    logout: vi.fn(),
  }),
}));

import AppShell from "./AppShell";

function renderShell() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <AppShell>
        <div>Page content</div>
      </AppShell>
    </MemoryRouter>
  );
}

describe("AppShell", () => {
  it("does not show placeholder search, notification controls, or project labels", () => {
    renderShell();

    expect(screen.queryByPlaceholderText(/Search enrolments/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Notifications/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/tenacity-tutoring-b8eb2/i)).not.toBeInTheDocument();
  });

  it("opens and closes the mobile navigation state", async () => {
    const user = userEvent.setup();
    const { container } = renderShell();

    expect(container.querySelector(".shell.mobile-open")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Open navigation"));
    expect(container.querySelector(".shell.mobile-open")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: /Enrolments/i }));
    expect(container.querySelector(".shell.mobile-open")).not.toBeInTheDocument();
  });

  it("exposes announcements and audit in the navigation", () => {
    renderShell();

    expect(screen.getByRole("link", { name: /Announcements/i })).toHaveAttribute("href", "/announcements");
    expect(screen.getByRole("link", { name: /Audit/i })).toHaveAttribute("href", "/audit");
    expect(screen.getByRole("link", { name: /Terms/i })).toHaveAttribute("href", "/terms");
    expect(screen.queryByRole("link", { name: /Settings/i })).not.toBeInTheDocument();
  });

  it("has no navigation into the resource portal", () => {
    // The resource surface is a separate application on a separate origin.
    // The admin navigation must not carry a route or a link to it.
    renderShell();

    expect(screen.queryByRole("link", { name: /Resources/i })).not.toBeInTheDocument();
    for (const link of screen.queryAllByRole("link")) {
      const href = link.getAttribute("href") || "";
      expect(href).not.toBe("/resources");
      expect(href).not.toMatch(/resources\.tenacitytutoring/);
    }
  });
});
