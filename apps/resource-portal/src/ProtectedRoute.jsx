import React from "react";
import { Navigate } from "react-router-dom";
import { PORTAL_ALLOWED_ROLES, useAuth } from "./AuthProvider";

// Admission is enforced in AuthProvider, which signs out any account without an
// allowed role claim. This route is the second line: it never renders resource
// UI for a role the portal does not admit, even for the brief moment between
// the claim being read and the sign-out completing.
export function ResourceRoute({ children }) {
  const { user, role, loading } = useAuth();

  if (loading) return <div className="route-state">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!PORTAL_ALLOWED_ROLES.includes(role)) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
