import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  onAuthStateChanged: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(() => Promise.resolve()),
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: mocks.onAuthStateChanged,
  signInWithEmailAndPassword: mocks.signInWithEmailAndPassword,
  signOut: mocks.signOut,
}));

vi.mock("./firebaseConfig", () => ({ auth: {}, firebaseInitError: null }));

import { AuthProvider, useAuth } from "./AuthProvider";

function Probe() {
  const { role, accessError, loading } = useAuth();
  return (
    <div>
      <span data-testid="role">{loading ? "loading" : role || "none"}</span>
      <span data-testid="access-error">{accessError}</span>
    </div>
  );
}

function userWithRole(role) {
  return {
    uid: `${role || "unknown"}-1`,
    email: `${role || "unknown"}@tenacitytutoring.com`,
    getIdTokenResult: vi.fn(() => Promise.resolve({ claims: role ? { role } : {} })),
  };
}

/** Drive the captured onAuthStateChanged listener the way Firebase would. */
function emitAuthState(user) {
  const listener = mocks.onAuthStateChanged.mock.calls.at(-1)[1];
  return act(() => listener(user));
}

beforeEach(() => {
  mocks.onAuthStateChanged.mockReset();
  mocks.signOut.mockReset();
  mocks.signOut.mockResolvedValue(undefined);
  mocks.onAuthStateChanged.mockImplementation(() => () => {});
});

describe("resource portal admission", () => {
  it("admits admins", async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    await emitAuthState(userWithRole("admin"));

    await waitFor(() => expect(screen.getByTestId("role")).toHaveTextContent("admin"));
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(screen.getByTestId("access-error")).toBeEmptyDOMElement();
  });

  it("admits tutors", async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    await emitAuthState(userWithRole("tutor"));

    await waitFor(() => expect(screen.getByTestId("role")).toHaveTextContent("tutor"));
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(screen.getByTestId("access-error")).toBeEmptyDOMElement();
  });

  it.each([["parent"], ["student"], [null]])(
    "signs out and explains rejection for role %s",
    async (role) => {
      render(<AuthProvider><Probe /></AuthProvider>);
      await emitAuthState(userWithRole(role));

      await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(1));
      expect(screen.getByTestId("role")).not.toHaveTextContent(String(role));
      expect(screen.getByTestId("access-error")).toHaveTextContent(
        /cannot access the resource portal/i
      );
    }
  );

  it("keeps the rejection message through the sign-out that follows it", async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    await emitAuthState(userWithRole("parent"));
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalled());

    // signOut re-enters the listener with a null user. Without the message
    // surviving that pass, the rejected user lands back on a blank login form
    // with no idea why, and simply tries again.
    await emitAuthState(null);

    await waitFor(() => expect(screen.getByTestId("role")).toHaveTextContent("none"));
    expect(screen.getByTestId("access-error")).toHaveTextContent(
      /cannot access the resource portal/i
    );
  });
});
