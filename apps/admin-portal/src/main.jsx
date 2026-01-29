import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

function getRequiredEnv(name) {
  const v = import.meta.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

let firebaseConfig = null;
let firebaseInitError = null;
let auth = null;

try {
  firebaseConfig = {
    apiKey: getRequiredEnv("VITE_FIREBASE_API_KEY"),
    authDomain: getRequiredEnv("VITE_FIREBASE_AUTH_DOMAIN"),
    projectId: getRequiredEnv("VITE_FIREBASE_PROJECT_ID"),
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };

  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
} catch (e) {
  firebaseInitError = e;
}

function App() {
  const enrolmentId = useMemo(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get("enrolmentId") || "";
  }, []);

  const [user, setUser] = useState(null);
  const [isStaff, setIsStaff] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setResult("");
      setError("");

      if (!u) {
        setIsStaff(false);
        return;
      }

      try {
        const tokenResult = await u.getIdTokenResult(true);
        setIsStaff(tokenResult?.claims?.role === "staff");
      } catch (e) {
        console.error(e);
        setIsStaff(false);
      }
    });

    return () => unsub();
  }, []);

  async function onLogin() {
    setResult("");
    setError("");

    if (!auth) {
      setError("Firebase is not configured. Check your VITE_FIREBASE_* env vars.");
      return;
    }

    if (!email || !password) {
      setError("Please enter email and password.");
      return;
    }

    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setEmail("");
      setPassword("");
    } catch (e) {
      console.error("Sign-in error:", e);
      setError(e?.message || "Error signing in.");
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    setResult("");
    setError("");
    if (!auth) return;
    setBusy(true);
    try {
      await signOut(auth);
    } finally {
      setBusy(false);
    }
  }

  async function onAcceptEnrolment() {
    setResult("");
    setError("");

    if (!auth || !firebaseConfig?.projectId) {
      setError("Firebase is not configured. Check your VITE_FIREBASE_* env vars.");
      return;
    }

    const u = auth.currentUser;
    if (!u) {
      setError("You must be signed in to accept enrolments.");
      return;
    }
    if (!isStaff) {
      setError('Access denied: requires staff role ("role: staff").');
      return;
    }
    if (!enrolmentId) {
      setError("Missing enrolmentId in URL (e.g. ?enrolmentId=ABC123).");
      return;
    }

    setBusy(true);
    try {
      const idToken = await u.getIdToken();
      const projectId = firebaseConfig.projectId;
      const functionUrl = `https://us-central1-${projectId}.cloudfunctions.net/acceptPendingEnrolment?enrolmentId=${encodeURIComponent(
        enrolmentId
      )}`;

      const response = await fetch(functionUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      const message = await response.text();
      if (!response.ok) {
        setError(message || `Request failed (${response.status}).`);
        return;
      }
      setResult(message);
    } catch (e) {
      console.error(e);
      setError("Error accepting enrolment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <img
        src="/assets/Tenacity Horizontal Logo png.png"
        alt="Tenacity Tutoring Logo"
        className="logo"
      />

      <h1>Enrolment Portal</h1>

      {firebaseInitError ? (
        <div className="section">
          <p className="result error">
            Firebase configuration error: {String(firebaseInitError?.message || firebaseInitError)}
          </p>
          <p className="userInfo">
            Create a <strong>.env</strong> file with at least:
            <br />
            VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID
          </p>
        </div>
      ) : null}

      <div className="section">
        <p className="userInfo">
          {user ? `Signed in as ${user.email}` : ""}
          {user && !isStaff ? " (not staff)" : ""}
        </p>

        {!user ? (
          <div>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <button onClick={onLogin} disabled={busy}>
              Sign In
            </button>
          </div>
        ) : (
          <button onClick={onLogout} disabled={busy}>
            Sign Out
          </button>
        )}
      </div>

      {user && enrolmentId ? (
        <div className="section">
          <p>
            Enrolment ID: <strong>{enrolmentId}</strong>
          </p>
          <button onClick={onAcceptEnrolment} disabled={busy || !isStaff}>
            Accept Enrolment
          </button>

          {result ? <p className="result">{result}</p> : null}
          {error ? <p className="result error">{error}</p> : null}
        </div>
      ) : null}

      {!enrolmentId ? (
        <p className="result error">
          Missing enrolmentId in URL (e.g. <code>?enrolmentId=ABC123</code>)
        </p>
      ) : null}
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);