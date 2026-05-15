import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthProvider";
import Badge from "../components/Badge";
import Button from "../components/Button";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Manage staff workflows for enrolments and portal access."
        actions={
          <Button iconRight="arrow-right" onClick={() => navigate("/enrolments")} variant="primary">
            Open enrolments
          </Button>
        }
      />

      <section className="grid grid-3 mb-6">
        <StatCard icon="enrol" label="Live workflow" value="Enrolments" foot="Current production route" />
        <StatCard icon="shield" label="Access state" value={isAdmin ? "Admin" : "Limited"} foot="From Firebase custom claims" />
        <StatCard icon="settings" label="Data access" value="API layer" foot="Shared frontend contracts" />
      </section>

      <section className="grid grid-2">
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Quick actions</h3>
              <div className="card-sub">Existing live workflows preserved in the new shell.</div>
            </div>
            <Badge tone="brand" dot>Ready</Badge>
          </div>
          <div className="card-body">
            <p className="muted mb-5">Open the enrolment queue to review pending and archived enrolments.</p>
            <Button onClick={() => navigate("/enrolments")} variant="primary">
              Open enrolment portal
            </Button>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3>Account</h3>
              <div className="card-sub">Signed-in staff context from Firebase Auth.</div>
            </div>
            <Badge tone={isAdmin ? "success" : "warn"}>{isAdmin ? "Admin" : "Not admin"}</Badge>
          </div>
          <div className="card-body">
            <dl className="dlist compact">
              <dt>Email</dt>
              <dd>{user?.email || "Unknown"}</dd>
              <dt>Access</dt>
              <dd>{isAdmin ? "Admin portal access" : "Admin role claim missing"}</dd>
            </dl>
          </div>
        </div>
      </section>
    </>
  );
}
