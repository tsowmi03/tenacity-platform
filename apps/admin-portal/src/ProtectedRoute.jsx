import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";

export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="container">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;

  return children;
}

export function StaffRoute({ children }) {
  const { user, isStaff, loading } = useAuth();

  if (loading) return <div className="container">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!isStaff) {
    return (
      <div className="container">
        <h1>Dashboard</h1>
        <p className="result error">Access denied: staff only.</p>
      </div>
    );
  }

  return children;
}
