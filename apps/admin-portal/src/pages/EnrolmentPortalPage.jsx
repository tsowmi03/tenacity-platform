import React, { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { firebaseConfig } from "../firebaseConfig";
import { useAuth } from "../AuthProvider";

export default function EnrolmentPortalPage() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [searchParams] = useSearchParams();

  const enrolmentId = useMemo(() => {
    return searchParams.get("enrolmentId") || "";
  }, [searchParams]);

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  async function onAcceptEnrolment() {
    setResult("");
    setError("");

    if (!firebaseConfig?.projectId) {
      setError("Firebase is not configured. Check your VITE_FIREBASE_* env vars.");
      return;
    }

    if (!user) {
      setError("You must be signed in to accept enrolments.");
      return;
    }

    if (!isAdmin) {
      setError('Access denied: requires admin role ("role: admin").');
      return;
    }

    if (!enrolmentId) {
      setError("Missing enrolmentId in URL (e.g. ?enrolmentId=ABC123). ");
      return;
    }

    setBusy(true);
    try {
      const idToken = await user.getIdToken();
      const baseUrl =
        import.meta.env.VITE_ACCEPT_PENDING_ENROLMENT_URL ||
        "https://acceptpendingenrolment-3kboe6khcq-uc.a.run.app";
      const functionUrl = `${baseUrl}?enrolmentId=${encodeURIComponent(enrolmentId)}`;

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
    <div className="pageCenter">
      <div className="container">
        <div className="header">
          <h1>Enrolment Portal</h1>
          <p className="subtitle">Accept pending enrolments securely</p>
        </div>

        <div className="section">
          <div className="buttonRow">
            <button className="buttonSecondary" onClick={() => navigate("/")}
              type="button">
              Back to Dashboard
            </button>
          </div>
        </div>

        {!enrolmentId ? (
          <p className="result error">
            Missing enrolmentId in URL (e.g. <code>?enrolmentId=ABC123</code>)
          </p>
        ) : (
          <div className="section">
            <p>
              Enrolment ID: <strong>{enrolmentId}</strong>
            </p>

            <button onClick={onAcceptEnrolment} disabled={busy || !isAdmin} type="button">
              Accept Enrolment
            </button>

            {result ? <p className="result">{result}</p> : null}
            {error ? <p className="result error">{error}</p> : null}
          </div>
        )}
      </div>
    </div>
  );
}
