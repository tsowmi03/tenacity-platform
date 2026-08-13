import React, { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../AuthProvider";
import { firebaseInitError } from "../firebaseConfig";
import Button from "../components/Button";
import Icon from "../components/Icon";
import logoHorizontal from "../assets/logo-horizontal.png";
import { isResourcePortalHost, landingPathForRole } from "../portalMode";

export default function LoginPage() {
  const { user, role, loading, login } = useAuth();
  const resourcePortal = isResourcePortalHost();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const portalAreas = resourcePortal
    ? [
        { icon: "sparkles", label: "Generate" },
        { icon: "eye", label: "Preview" },
        { icon: "download", label: "Download" },
      ]
    : [
        { icon: "enrol", label: "Resources" },
        { icon: "classes", label: "Classes" },
        { icon: "invoice", label: "Invoices" },
      ];

  if (user && !loading) {
    return <Navigate to={landingPathForRole(role, { resourcePortal })} replace />;
  }

  async function onLogin() {
    setError("");

    if (!email || !password) {
      setError("Please enter email and password.");
      return;
    }

    setBusy(true);
    try {
      await login(email, password);
      setEmail("");
      setPassword("");
    } catch (e) {
      console.error("Sign-in error:", e);
      setError(e?.message || "Error signing in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-shell">
      <main className="login-pane">
        <div className="login-brand">
          <img alt="Tenacity Tutoring" src={logoHorizontal} />
        </div>

        <div className="login-copy mb-6">
          <h1>{resourcePortal ? "Resource portal login" : "Staff login"}</h1>
          <p className="muted mt-3">
            Sign in with your Tenacity staff account. Your role determines which portal you can access.
          </p>
        </div>

        <div className="login-summary mb-6" aria-label="Portal areas">
          {portalAreas.map((area) => (
            <div key={area.label}>
              <Icon name={area.icon} size={17} />
              <span>{area.label}</span>
            </div>
          ))}
        </div>

        {firebaseInitError ? (
          <div className="banner banner-danger mb-5">
            <div>
              <div className="banner-title">Firebase configuration error</div>
              <div>{String(firebaseInitError?.message || firebaseInitError)}</div>
              <p className="text-sm mt-3">
              Create a <strong>.env</strong> file with at least:
              <br />
              VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID
            </p>
            </div>
          </div>
        ) : null}

        <div className="card">
          <div className="card-body grid gap-5">
          <div className="field">
            <span className="label">Email</span>
            <input
              className="input"
              type="email"
              placeholder="admin@tenacitytutoring.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div className="field">
            <span className="label">Password</span>
            <input
              className="input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <Button loading={busy} onClick={onLogin} variant="primary">
            Sign in
          </Button>

          {error ? <p className="result error">{error}</p> : null}
          </div>
        </div>
      </main>
    </div>
  );
}
