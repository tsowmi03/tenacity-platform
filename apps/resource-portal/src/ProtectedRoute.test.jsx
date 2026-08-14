import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  user: null,
  role: null,
  loading: false,
}));

vi.mock("./AuthProvider", () => ({
  useAuth: () => authState,
  PORTAL_ALLOWED_ROLES: ["admin", "tutor"],
}));

import { ResourceRoute } from "./ProtectedRoute";

function setAuth(next) {
  Object.assign(authState, next);
}

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/login" element={<div>Login screen</div>} />
        <Route
          path="/"
          element={
            <ResourceRoute>
              <div>Resource surface</div>
            </ResourceRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  setAuth({ user: null, role: null, loading: false });
});

describe("ResourceRoute", () => {
  it("renders the resource surface for admins", () => {
    setAuth({ user: { uid: "admin-1" }, role: "admin" });
    renderRoute();
    expect(screen.getByText("Resource surface")).toBeInTheDocument();
  });

  it("renders the resource surface for tutors", () => {
    setAuth({ user: { uid: "tutor-1" }, role: "tutor" });
    renderRoute();
    expect(screen.getByText("Resource surface")).toBeInTheDocument();
  });

  it("sends signed-out visitors to login", () => {
    renderRoute();
    expect(screen.getByText("Login screen")).toBeInTheDocument();
    expect(screen.queryByText("Resource surface")).not.toBeInTheDocument();
  });

  it("never renders resource UI for a disallowed role mid sign-out", () => {
    // AuthProvider signs these accounts out, but that is asynchronous. This
    // route must not paint the resource surface in the interim.
    setAuth({ user: { uid: "parent-1" }, role: "parent" });
    renderRoute();

    expect(screen.queryByText("Resource surface")).not.toBeInTheDocument();
    expect(screen.getByText("Login screen")).toBeInTheDocument();
  });

  it("waits rather than redirecting while the claim is still loading", () => {
    setAuth({ user: null, role: null, loading: true });
    renderRoute();

    expect(screen.queryByText("Resource surface")).not.toBeInTheDocument();
    expect(screen.queryByText("Login screen")).not.toBeInTheDocument();
  });
});
