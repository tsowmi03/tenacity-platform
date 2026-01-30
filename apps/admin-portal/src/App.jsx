import React from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ProtectedRoute, StaffRoute } from "./ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import EnrolmentPortalPage from "./pages/EnrolmentPortalPage";
import EnrolmentDetailsPage from "./pages/EnrolmentDetailsPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/enrolments"
          element={
            <StaffRoute>
              <EnrolmentPortalPage />
            </StaffRoute>
          }
        />

        <Route
          path="/enrolments/:enrolmentId"
          element={
            <StaffRoute>
              <EnrolmentDetailsPage />
            </StaffRoute>
          }
        />

        <Route path="*" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}
