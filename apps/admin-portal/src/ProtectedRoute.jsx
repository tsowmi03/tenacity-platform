import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";

export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="route-state">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;

  return children;
}

export function StaffRoute({ children }) {
  const { user, isAdmin, loading } = useAuth();

  if (loading) return <div className="route-state">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) {
    return (
      <div className="route-state">
        <h1>Admin access required</h1>
        <p className="result error">Access denied: admin only.</p>
      </div>
    );
  }

  return children;
}
