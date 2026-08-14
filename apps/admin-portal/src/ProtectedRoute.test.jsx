import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = {
  user: null,
  role: null,
  isAdmin: false,
  loading: false,
};

vi.mock("./AuthProvider", () => ({
  useAuth: () => authState,
}));

import { ProtectedRoute, RoleRoute, StaffRoute } from "./ProtectedRoute";

function setAuth(next) {
  Object.assign(authState, next);
}

function renderWithRouter(Wrapper) {
  return render(
    <MemoryRouter initialEntries={["/secret"]}>
      <Routes>
        <Route path="/login" element={<div>LOGIN PAGE</div>} />
        {/* Deliberately still mounted: if any admin route ever redirects to
            /resources again, these tests must fail loudly rather than
            silently 404. */}
        <Route path="/resources" element={<div>RESOURCE PORTAL</div>} />
        <Route
          path="/secret"
          element={
            <Wrapper>
              <div>SECRET CONTENT</div>
            </Wrapper>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  setAuth({ user: null, role: null, isAdmin: false, loading: false });
});

describe("ProtectedRoute", () => {
  it("shows a loading state while auth is resolving", () => {
    setAuth({ user: null, isAdmin: false, loading: true });
    renderWithRouter(ProtectedRoute);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
    expect(screen.queryByText("SECRET CONTENT")).not.toBeInTheDocument();
  });

  it("redirects to /login when no user is signed in", () => {
    setAuth({ user: null, isAdmin: false, loading: false });
    renderWithRouter(ProtectedRoute);
    expect(screen.getByText("LOGIN PAGE")).toBeInTheDocument();
    expect(screen.queryByText("SECRET CONTENT")).not.toBeInTheDocument();
  });

  it("renders children when a user is signed in (admin not required)", () => {
    setAuth({ user: { uid: "u1", email: "u@example.com" }, isAdmin: false, loading: false });
    renderWithRouter(ProtectedRoute);
    expect(screen.getByText("SECRET CONTENT")).toBeInTheDocument();
  });
});

describe("StaffRoute", () => {
  it("redirects to /login when no user is signed in", () => {
    setAuth({ user: null, isAdmin: false, loading: false });
    renderWithRouter(StaffRoute);
    expect(screen.getByText("LOGIN PAGE")).toBeInTheDocument();
  });

  it("denies non-admin signed-in users instead of rendering content", () => {
    setAuth({ user: { uid: "u1", email: "u@example.com" }, isAdmin: false, loading: false });
    renderWithRouter(StaffRoute);
    expect(screen.getByText(/Access denied/i)).toBeInTheDocument();
    expect(screen.queryByText("SECRET CONTENT")).not.toBeInTheDocument();
  });

  it("denies tutors without routing them to the resource portal", () => {
    // Tutors are signed out of this origin by AuthProvider. Until that
    // completes they must see a denial, never admin content, and the admin
    // app must not hand them off to the resource portal in any form.
    setAuth({
      user: { uid: "tutor-1", email: "tutor@example.com" },
      role: "tutor",
      isAdmin: false,
      loading: false,
    });
    renderWithRouter(StaffRoute);

    expect(screen.getByText(/Access denied/i)).toBeInTheDocument();
    expect(screen.queryByText("SECRET CONTENT")).not.toBeInTheDocument();
    expect(screen.queryByText("RESOURCE PORTAL")).not.toBeInTheDocument();
  });

  it("renders children when a user has admin role", () => {
    setAuth({ user: { uid: "u1", email: "admin@example.com" }, isAdmin: true, loading: false });
    renderWithRouter(StaffRoute);
    expect(screen.getByText("SECRET CONTENT")).toBeInTheDocument();
  });
});

describe("RoleRoute", () => {
  // Every RoleRoute in this app now allows admin only. No admin route admits
  // a tutor.
  function AdminOnlyRoute({ children }) {
    return <RoleRoute allowedRoles={["admin"]}>{children}</RoleRoute>;
  }

  it("redirects to /login when no user is signed in", () => {
    setAuth({ user: null, role: null, isAdmin: false, loading: false });
    renderWithRouter(AdminOnlyRoute);
    expect(screen.getByText("LOGIN PAGE")).toBeInTheDocument();
  });

  it("denies signed-in users without an allowed role", () => {
    setAuth({ user: { uid: "u1", email: "u@example.com" }, role: "parent", isAdmin: false, loading: false });
    renderWithRouter(AdminOnlyRoute);
    expect(screen.getByText(/Access denied/i)).toBeInTheDocument();
    expect(screen.queryByText("SECRET CONTENT")).not.toBeInTheDocument();
  });

  it("denies tutors", () => {
    setAuth({ user: { uid: "u1", email: "tutor@example.com" }, role: "tutor", isAdmin: false, loading: false });
    renderWithRouter(AdminOnlyRoute);
    expect(screen.getByText(/Access denied/i)).toBeInTheDocument();
    expect(screen.queryByText("SECRET CONTENT")).not.toBeInTheDocument();
    expect(screen.queryByText("RESOURCE PORTAL")).not.toBeInTheDocument();
  });

  it("renders children for admins", () => {
    setAuth({ user: { uid: "u1", email: "admin@example.com" }, role: "admin", isAdmin: true, loading: false });
    renderWithRouter(AdminOnlyRoute);
    expect(screen.getByText("SECRET CONTENT")).toBeInTheDocument();
  });
});
