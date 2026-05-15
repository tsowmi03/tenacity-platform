import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = {
  user: null,
  isAdmin: false,
  loading: false,
};

vi.mock("./AuthProvider", () => ({
  useAuth: () => authState,
}));

import { ProtectedRoute, StaffRoute } from "./ProtectedRoute";

function setAuth(next) {
  Object.assign(authState, next);
}

function renderWithRouter(Wrapper) {
  return render(
    <MemoryRouter initialEntries={["/secret"]}>
      <Routes>
        <Route path="/login" element={<div>LOGIN PAGE</div>} />
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
  setAuth({ user: null, isAdmin: false, loading: false });
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

  it("renders children when a user has admin role", () => {
    setAuth({ user: { uid: "u1", email: "admin@example.com" }, isAdmin: true, loading: false });
    renderWithRouter(StaffRoute);
    expect(screen.getByText("SECRET CONTENT")).toBeInTheDocument();
  });
});
