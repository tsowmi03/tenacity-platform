import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../AuthProvider", () => ({
  useAuth: () => ({
    user: { uid: "admin-1", email: "admin@tenacitytutoring.com" },
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
});
