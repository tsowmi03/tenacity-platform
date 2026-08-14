import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({ accessError: "" }));

vi.mock("../AuthProvider", () => ({
  useAuth: () => ({
    user: null,
    role: null,
    loading: false,
    login: vi.fn(),
    accessError: authState.accessError,
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
  beforeEach(() => {
    authState.accessError = "";
  });

  it("shows the production login form without internal project labels", () => {
    renderLogin();

    expect(screen.getByRole("heading", { name: /Admin login/i })).toBeInTheDocument();
    expect(screen.getByText("Enrolments")).toBeInTheDocument();
    expect(screen.getByText("Classes")).toBeInTheDocument();
    expect(screen.getByText("Invoices")).toBeInTheDocument();
    expect(screen.queryByText(/tenacity-tutoring-b8eb2/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^PROD$/i)).not.toBeInTheDocument();
  });

  it("advertises no resource surface on the admin login", () => {
    renderLogin();

    expect(screen.queryByText("Resources")).not.toBeInTheDocument();
    expect(screen.queryByText(/resource portal/i)).not.toBeInTheDocument();
  });

  it("explains a rejected sign-in without naming another portal", () => {
    authState.accessError = "This account cannot access the admin portal. Sign in with a Tenacity admin account.";
    renderLogin();

    expect(screen.getByText("Access denied")).toBeInTheDocument();
    expect(screen.getByText(/cannot access the admin portal/i)).toBeInTheDocument();
    expect(screen.queryByText(/resources\.tenacitytutoring/i)).not.toBeInTheDocument();
  });
});
