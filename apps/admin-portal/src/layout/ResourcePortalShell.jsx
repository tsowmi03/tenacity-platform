import React, { useEffect } from "react";
import { useAuth } from "../AuthProvider";
import Button from "../components/Button";
import logoIcon from "../assets/logo-icon.png";
import {
  adminPortalHome,
  isResourcePortalHost,
  resourcePortalHome,
} from "../portalMode";

export default function ResourcePortalShell({ children }) {
  const { user, role, isAdmin, logout } = useAuth();
  const resourcePortal = isResourcePortalHost();
  const identityInitial = (user?.email || "Staff").charAt(0).toUpperCase();

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Tenacity Resource Portal";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <div className="resource-portal-shell">
      <header className="resource-portal-header">
        <div className="resource-portal-header-inner">
          <a
            aria-label="Resource portal home"
            className="resource-portal-brand"
            href={resourcePortalHome({ resourcePortal })}
          >
            <span className="resource-portal-logo-mark">
              <img alt="" src={logoIcon} />
            </span>
            <span className="resource-portal-brand-copy">
              <span className="resource-portal-brand-name">Tenacity Tutoring</span>
              <span className="resource-portal-brand-product">Resource portal</span>
            </span>
          </a>

          <div className="resource-portal-account">
            <div className="resource-portal-identity">
              <span className="resource-portal-avatar" aria-hidden="true">
                {identityInitial}
              </span>
              <span className="resource-portal-identity-copy">
                <span>{user?.email || "Signed in"}</span>
                <span>{role || "staff"}</span>
              </span>
            </div>
            {isAdmin ? (
              <a
                className="resource-portal-admin-link"
                href={adminPortalHome({ resourcePortal })}
              >
                Admin portal
              </a>
            ) : null}
            <Button
              className="resource-portal-sign-out"
              icon="logout"
              onClick={logout}
              size="sm"
              variant="ghost"
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="resource-portal-main">
        <div className="resource-portal-content">{children}</div>
      </main>
    </div>
  );
}
