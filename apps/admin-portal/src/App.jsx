import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ToastProvider } from "./components/ToastProvider";
import { RoleRoute, StaffRoute } from "./ProtectedRoute";
import AppShell from "./layout/AppShell";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import EnrolmentPortalPage from "./pages/EnrolmentPortalPage";
import EnrolmentDetailsPage from "./pages/EnrolmentDetailsPage";
import PeoplePage from "./pages/PeoplePage";
import PeopleDetailPage from "./pages/PeopleDetailPage";
import ClassesPage from "./pages/ClassesPage";
import ClassDetailPage from "./pages/ClassDetailPage";
import InvoicesPage from "./pages/InvoicesPage";
import InvoiceDetailPage from "./pages/InvoiceDetailPage";
import ReportsPage from "./pages/ReportsPage";
import TermsPage from "./pages/TermsPage";
import AuditPage from "./pages/AuditPage";
import ResourcesPage from "./pages/ResourcesPage";
import Year11InterestPage from "./pages/Year11InterestPage";
import AnnouncementsPage from "./pages/AnnouncementsPage";
import AnnouncementDetailPage from "./pages/AnnouncementDetailPage";
import ParentFeedbackPage from "./pages/ParentFeedbackPage";
import WeeklyUpdatesPage from "./pages/WeeklyUpdatesPage";
import WeeklyUpdateComposePage from "./pages/WeeklyUpdateComposePage";

export default function App() {
  return (
    <ToastProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/"
          element={
            <StaffRoute>
              <AppShell>
                <DashboardPage />
              </AppShell>
            </StaffRoute>
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
          path="/year-11-interest"
          element={
            <StaffRoute>
              <AppShell>
                <Year11InterestPage />
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
          path="/announcements"
          element={
            <RoleRoute allowedRoles={["admin"]}>
              <AppShell>
                <AnnouncementsPage />
              </AppShell>
            </RoleRoute>
          }
        />

        <Route
          path="/announcements/:announcementId"
          element={
            <RoleRoute allowedRoles={["admin"]}>
              <AppShell>
                <AnnouncementDetailPage />
              </AppShell>
            </RoleRoute>
          }
        />

        <Route
          path="/weekly-update"
          element={
            <RoleRoute allowedRoles={["admin"]}>
              <AppShell>
                <WeeklyUpdatesPage />
              </AppShell>
            </RoleRoute>
          }
        />

        <Route
          path="/weekly-update/:blastId"
          element={
            <RoleRoute allowedRoles={["admin"]}>
              <AppShell>
                <WeeklyUpdateComposePage />
              </AppShell>
            </RoleRoute>
          }
        />

        <Route
          path="/parent-feedback"
          element={
            <RoleRoute allowedRoles={["admin"]}>
              <AppShell>
                <ParentFeedbackPage />
              </AppShell>
            </RoleRoute>
          }
        />

        <Route
          path="/invoices"
          element={
            <StaffRoute>
              <AppShell>
                <InvoicesPage />
              </AppShell>
            </StaffRoute>
          }
        />

        <Route
          path="/invoices/:invoiceId"
          element={
            <StaffRoute>
              <AppShell>
                <InvoiceDetailPage />
              </AppShell>
            </StaffRoute>
          }
        />

        <Route
          path="/resources"
          element={
            <RoleRoute allowedRoles={["admin", "tutor"]}>
              <AppShell>
                <ResourcesPage />
              </AppShell>
            </RoleRoute>
          }
        />

        <Route
          path="/reports"
          element={
            <StaffRoute>
              <AppShell>
                <ReportsPage />
              </AppShell>
            </StaffRoute>
          }
        />

        <Route
          path="/audit"
          element={
            <StaffRoute>
              <AppShell>
                <AuditPage />
              </AppShell>
            </StaffRoute>
          }
        />

        <Route
          path="/terms"
          element={
            <StaffRoute>
              <AppShell>
                <TermsPage />
              </AppShell>
            </StaffRoute>
          }
        />

        <Route path="/settings" element={<Navigate to="/audit" replace />} />

        <Route
          path="*"
          element={
            <StaffRoute>
              <AppShell>
                <DashboardPage />
              </AppShell>
            </StaffRoute>
          }
        />
      </Routes>
    </BrowserRouter>
    </ToastProvider>
  );
}
