import React from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ToastProvider } from "./components/ToastProvider";
import { ProtectedRoute, StaffRoute } from "./ProtectedRoute";
import AppShell from "./layout/AppShell";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import EnrolmentPortalPage from "./pages/EnrolmentPortalPage";
import EnrolmentDetailsPage from "./pages/EnrolmentDetailsPage";
import PeoplePage from "./pages/PeoplePage";
import PeopleDetailPage from "./pages/PeopleDetailPage";
import ClassesPage from "./pages/ClassesPage";
import ClassDetailPage from "./pages/ClassDetailPage";
import AttendancePage from "./pages/AttendancePage";

export default function App() {
  return (
    <ToastProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppShell>
                <DashboardPage />
              </AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path="/enrolments"
          element={
            <StaffRoute>
              <AppShell>
                <EnrolmentPortalPage />
              </AppShell>
            </StaffRoute>
          }
        />

        <Route
          path="/enrolments/:enrolmentId"
          element={
            <StaffRoute>
              <AppShell>
                <EnrolmentDetailsPage />
              </AppShell>
            </StaffRoute>
          }
        />

        <Route
          path="/people"
          element={
            <StaffRoute>
              <AppShell>
                <PeoplePage />
              </AppShell>
            </StaffRoute>
          }
        />

        <Route
          path="/people/:kind/:id"
          element={
            <StaffRoute>
              <AppShell>
                <PeopleDetailPage />
              </AppShell>
            </StaffRoute>
          }
        />

        <Route
          path="/classes"
          element={
            <StaffRoute>
              <AppShell>
                <ClassesPage />
              </AppShell>
            </StaffRoute>
          }
        />

        <Route
          path="/classes/:classId"
          element={
            <StaffRoute>
              <AppShell>
                <ClassDetailPage />
              </AppShell>
            </StaffRoute>
          }
        />

        <Route
          path="/attendance"
          element={
            <StaffRoute>
              <AppShell>
                <AttendancePage />
              </AppShell>
            </StaffRoute>
          }
        />

        <Route
          path="*"
          element={
            <ProtectedRoute>
              <AppShell>
                <DashboardPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
    </ToastProvider>
  );
}
