import React, { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../AuthProvider";
import { firebaseInitError } from "../firebaseConfig";
import Button from "../components/Button";
import logoHorizontal from "../assets/logo-horizontal.png";

export default function LoginPage() {
  const { user, loading, login, accessError } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (user && !loading) {
    return <Navigate to="/" replace />;
  }

  async function onLogin(event) {
    event?.preventDefault();
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
          <h1>Resource portal</h1>
          <p className="muted mt-3">Sign in with your Tenacity tutor or admin account.</p>
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

        {accessError ? (
          <div className="banner banner-danger mb-5">
            <div>
              <div className="banner-title">Access denied</div>
              <div>{accessError}</div>
            </div>
          </div>
        ) : null}

        <form className="login-form grid gap-5" noValidate onSubmit={onLogin}>
          <label className="field">
            <span className="label">Email</span>
            <input
              className="input"
              type="email"
              placeholder="you@tenacitytutoring.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>

          <label className="field">
            <span className="label">Password</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>

          <Button loading={busy} type="submit" variant="primary">
            Sign in
          </Button>

          {error ? <p className="result error" role="alert">{error}</p> : null}
        </form>
      </main>
    </div>
  );
}
