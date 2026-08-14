import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ToastProvider } from "./components/ToastProvider";
import { ResourceRoute } from "./ProtectedRoute";
import ResourcePortalShell from "./layout/ResourcePortalShell";
import LoginPage from "./pages/LoginPage";
import ResourcesPage from "./pages/ResourcesPage";

function ResourcePortalPage() {
  return (
    <ResourceRoute>
      <ResourcePortalShell>
        <ResourcesPage />
      </ResourcePortalShell>
    </ResourceRoute>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<ResourcePortalPage />} />
          {/* The resource surface lived at /resources while it was part of the
              admin bundle. Keep that path working on this origin so an old
              in-portal bookmark still lands somewhere useful. */}
          <Route path="/resources" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
