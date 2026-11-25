import React, { createContext, useContext } from "react";

export const PORTAL_ALLOWED_ROLES = ["admin", "tutor"];
export const PORTAL_ACCESS_DENIED_MESSAGE = "";

const asked = new URLSearchParams(window.location.search).get("role");
const role = asked === "tutor" ? "tutor" : "admin";
// ?role=none shows the signed-out screens (the login page).
const signedOut = asked === "none";
const value = signedOut ? { user: null, role: null, isAdmin: false, isTutor: false, loading: false, accessError: "", login: async () => {}, logout: async () => {} } : {
  user: { uid: "preview-user", email: role === "admin" ? "admin@example.com" : "tutor@example.com", displayName: role === "admin" ? "Sample Admin" : "Sample Tutor" },
  role,
  isAdmin: role === "admin",
  isTutor: role === "tutor",
  loading: false,
  accessError: "",
  login: async () => {},
  logout: async () => {},
};
const AuthContext = createContext(value);

export function AuthProvider({ children }) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
