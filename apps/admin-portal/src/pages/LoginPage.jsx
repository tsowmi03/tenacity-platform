import React, { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthProvider";
import { firebaseInitError } from "../firebaseConfig";

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
    <div className="pageCenter">
      <div className="container">
        <div className="header">
          <img
            src="/../../assets/Tenacity Horizontal Logo png.png"
            alt="Tenacity Tutoring Logo"
            className="logo"
          />
          <br />
          <h1>Admin Login</h1>
          <p className="subtitle">Sign in to access the dashboard</p>
        </div>

        {firebaseInitError ? (
          <div className="section">
            <p className="result error">
              Firebase configuration error:{" "}
              {String(firebaseInitError?.message || firebaseInitError)}
            </p>
            <p className="userInfo">
              Create a <strong>.env</strong> file with at least:
              <br />
              VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID
            </p>
          </div>
        ) : null}

        <div className="section">
          <div className="field">
            <span className="label">Email</span>
            <input
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
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <div className="buttonRow">
            <button onClick={onLogin} disabled={busy}>
              Sign In
            </button>
          </div>

          {error ? <p className="result error">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
