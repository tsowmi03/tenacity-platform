import React, { useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../AuthProvider";
import Badge from "../components/Badge";
import Icon from "../components/Icon";
import logoIcon from "../assets/logo-icon.png";

const NAV = [
  { section: "Overview", items: [{ to: "/", label: "Dashboard", icon: "dashboard" }] },
  {
    section: "Operations",
    items: [
      { to: "/enrolments", label: "Enrolments", icon: "enrol" },
      { to: "/year-11-interest", label: "Year 11 interest", icon: "waitlist" },
      { to: "/people", label: "People", icon: "people" },
      { to: "/classes", label: "Classes", icon: "classes" },
      { to: "/resources", label: "Resources", icon: "file-text" },
    ],
  },
  {
    section: "Finance",
    items: [
      { to: "/invoices", label: "Invoices", icon: "invoice" },
      { to: "/reports", label: "Reports", icon: "reports" },
    ],
  },
  {
    section: "System",
    items: [
      { to: "/terms", label: "Terms", icon: "classes" },
      { to: "/audit", label: "Audit", icon: "audit" },
    ],
  },
];

function getInitials(email) {
  const name = String(email || "Admin").split("@")[0].replace(/[._-]+/g, " ");
  const parts = name.split(" ").filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "A";
}

function Sidebar({ onDisabledRoute, onNavigate, onRequestClose }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="logo-mark">
          <img alt="Tenacity" src={logoIcon} />
        </div>
        <div className="brand-text">
          <span className="name">TENACITY</span>
          <span className="tagline">Admin Portal</span>
        </div>
        <button className="sidebar-close" onClick={onRequestClose} type="button" aria-label="Close navigation">
          <Icon name="x" size={18} />
        </button>
      </div>

      <nav aria-label="Primary" className="sidebar-nav">
        {NAV.map((section) => (
          <div key={section.section}>
            <div className="nav-section-label">{section.section}</div>
            {section.items.map((item) => {
              if (item.disabled) {
                return (
                  <button className="nav-item disabled" key={item.to} onClick={() => onDisabledRoute(item.label)} type="button">
                    <span className="nav-icon"><Icon name={item.icon} /></span>
                    <span className="nav-label">{item.label}</span>
                  </button>
                );
              }

              return (
                <NavLink className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`} end={item.to === "/"} key={item.to} onClick={onNavigate} to={item.to}>
                  <span className="nav-icon"><Icon name={item.icon} /></span>
                  <span className="nav-label">{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}

function Topbar({ onOpenNav }) {
  const { user, role, isAdmin, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const initials = useMemo(() => getInitials(user?.email), [user?.email]);
  const roleLabel = role || (isAdmin ? "admin" : "signed in");

  return (
    <header className="topbar">
      <div className="topbar-leading">
        <button className="mobile-nav-btn" onClick={onOpenNav} type="button" aria-label="Open navigation">
          <Icon name="menu" size={20} />
        </button>
        <div className="topbar-title">Admin portal</div>
      </div>

      <div className="topbar-actions">
        <div className="menu-wrap">
          <button className="user-menu" onClick={() => setMenuOpen((open) => !open)} type="button">
            <span className="avatar md">{initials}</span>
            <span className="um-info">
              <span className="um-name">{user?.email || "Admin"}</span>
              <span className="um-role">{roleLabel}</span>
            </span>
            <Icon name="chevron-down" size={16} />
          </button>

          {menuOpen ? (
            <div className="user-popover">
              <div className="user-popover-head">
                <div className="weight-700">{user?.email || "Signed in"}</div>
                <div className="mt-2"><Badge tone={role ? "brand" : "warn"} dot>{role ? `role: ${role}` : "role claim missing"}</Badge></div>
              </div>
              <button className="user-popover-item danger" onClick={logout} type="button">
                <Icon name="logout" size={16} />
                <span>Sign out</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

export default function AppShell({ children }) {
  const [notice, setNotice] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();

  function onDisabledRoute(label) {
    setNotice(`${label} is not available yet.`);
    window.setTimeout(() => setNotice(""), 3000);
  }

  return (
    <div className={`shell ${mobileNavOpen ? "mobile-open" : ""}`} key={location.pathname}>
      {mobileNavOpen ? (
        <button className="mobile-nav-backdrop" onClick={() => setMobileNavOpen(false)} type="button" aria-label="Close navigation" />
      ) : null}
      <Sidebar
        onDisabledRoute={onDisabledRoute}
        onNavigate={() => setMobileNavOpen(false)}
        onRequestClose={() => setMobileNavOpen(false)}
      />
      <Topbar onOpenNav={() => setMobileNavOpen(true)} />
      <main className="main">
        <div className="main-inner">
          {notice ? (
            <div className="banner banner-info mb-5">
              <Icon className="banner-icon" name="info" />
              <div>
                <div className="banner-title">Unavailable</div>
                <div>{notice}</div>
              </div>
            </div>
          ) : null}
          {children}
        </div>
      </main>
    </div>
  );
}
