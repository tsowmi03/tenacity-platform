import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthProvider";

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, isStaff, logout } = useAuth();

  return (
    <div className="appShell">
      <aside className="sidebar">
        <div className="brand">
          <img
            src="/assets/Tenacity Horizontal Logo png.png"
            alt="Tenacity Tutoring Logo"
            className="brandLogo"
          />
          <div>
            <div className="brandTitle">Tenacity Tutoring</div>
            <div className="brandSubtitle">Admin Portal</div>
          </div>
        </div>

        <nav className="nav">
          <button className="navItem navItemPrimary" onClick={() => navigate("/")}
            type="button">
            Dashboard
          </button>
          <button className="navItem" onClick={() => navigate("/enrolments")} type="button">
            Enrolment Portal
          </button>
        </nav>

        <div className="sidebarFooter">
          <div className="userChip">
            <div className="userEmail">{user?.email}</div>
            <div className="userRole">
              {isStaff ? "Staff" : "Not staff (role claim missing)"}
            </div>
          </div>

          <button className="navItem" onClick={logout} type="button">
            Sign Out
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1 className="pageTitle">Dashboard</h1>
            <p className="pageSubtitle">Manage enrolments and portal access</p>
          </div>
          <div style={{ minWidth: 160 }}>
            <button className="buttonSecondary" onClick={logout} type="button">
              Sign Out
            </button>
          </div>
        </header>

        <section className="contentGrid">
          <div className="card">
            <h2 className="cardTitle">Quick Actions</h2>
            <div className="cardBody">Open the enrolment portal to accept pending enrolments.</div>
            <div className="buttonRow">
              <button onClick={() => navigate("/enrolments")} type="button">
                Open Enrolment Portal
              </button>
            </div>
          </div>

          <div className="card">
            <h2 className="cardTitle">Account</h2>
            <div className="cardBody">
              Signed in as <strong>{user?.email}</strong>
              <br />
              Access: <strong>{isStaff ? "Staff" : "Not staff"}</strong>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
