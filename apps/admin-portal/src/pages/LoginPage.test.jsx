import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../AuthProvider", () => ({
  useAuth: () => ({
    user: null,
    role: null,
    loading: false,
    login: vi.fn(),
  }),
}));

vi.mock("../firebaseConfig", () => ({
  firebaseInitError: null,
}));

import LoginPage from "./LoginPage";

function renderLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  );
}

describe("LoginPage", () => {
  it("shows the production login form without internal project labels", () => {
    renderLogin();

    expect(screen.getByRole("heading", { name: /Staff login/i })).toBeInTheDocument();
    expect(screen.getByText("Resources")).toBeInTheDocument();
    expect(screen.getByText("Classes")).toBeInTheDocument();
    expect(screen.getByText("Invoices")).toBeInTheDocument();
    expect(screen.queryByText(/tenacity-tutoring-b8eb2/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^PROD$/i)).not.toBeInTheDocument();
  });
});
