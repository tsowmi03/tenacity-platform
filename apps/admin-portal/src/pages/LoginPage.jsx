import React, { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthProvider";
import { firebaseInitError } from "../firebaseConfig";
import Button from "../components/Button";
import logoHorizontal from "../assets/logo-horizontal.png";

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (user) return <Navigate to="/" replace />;

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
      navigate("/", { replace: true });
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

        <div className="mb-6">
          <h1>Admin login</h1>
          <p className="muted mt-3">Sign in with your staff account to access the portal.</p>
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

      <aside className="login-side">
        <div>
          <div className="env-pill">PROD</div>
          <h2 className="login-side-title mt-5">Tenacity admin portal</h2>
        </div>
        <div className="login-side-meta text-sm">
          tenacity-tutoring-b8eb2
        </div>
      </aside>
    </div>
  );
}
