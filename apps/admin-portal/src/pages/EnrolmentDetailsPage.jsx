import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db, firebaseConfig } from "../firebaseConfig";
import { useAuth } from "../AuthProvider";

export default function EnrolmentDetailsPage() {
  const navigate = useNavigate();
  const { enrolmentId: rawEnrolmentId } = useParams();
  const enrolmentId = useMemo(() => {
    const raw = String(rawEnrolmentId || "").trim();
    if (!raw) return "";
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }, [rawEnrolmentId]);

  const { user, isAdmin } = useAuth();

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  const [enrolmentBusy, setEnrolmentBusy] = useState(false);
  const [enrolmentError, setEnrolmentError] = useState("");
  const [enrolmentData, setEnrolmentData] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadEnrolment() {
      setEnrolmentError("");
      setEnrolmentData(null);

      if (!enrolmentId) {
        setEnrolmentError("Missing enrolment id.");
        return;
      }

      if (!firebaseConfig?.projectId) {
        setEnrolmentError(
          "Firebase is not configured. Check your VITE_FIREBASE_* env vars."
        );
        return;
      }
      if (!db) {
        setEnrolmentError("Firestore is not configured.");
        return;
      }
      if (!user) {
        setEnrolmentError("You must be signed in to view enrolments.");
        return;
      }
      if (!isAdmin) {
        setEnrolmentError('Access denied: requires admin role ("role: admin").');
        return;
      }

      setEnrolmentBusy(true);
      try {
        const snap = await getDoc(doc(db, "enrolments", enrolmentId));
        if (!snap.exists()) {
          if (!cancelled) setEnrolmentError("Enrolment not found.");
          return;
        }

        const data = snap.data() || {};
        if (!cancelled) setEnrolmentData(data);
      } catch (e) {
        console.error(e);
        if (!cancelled) setEnrolmentError("Failed to load enrolment details.");
      } finally {
        if (!cancelled) setEnrolmentBusy(false);
      }
    }

    loadEnrolment();
    return () => {
      cancelled = true;
    };
  }, [enrolmentId, user, isAdmin]);

  function formatEnrolmentValue(value) {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);

    if (typeof value?.toDate === "function") {
      try {
        return value.toDate().toISOString();
      } catch {
        return String(value);
      }
    }

    if (Array.isArray(value)) {
      const parts = value.map((v) => formatEnrolmentValue(v)).filter(Boolean);
      return parts.length ? parts.join(", ") : "";
    }

    if (typeof value === "object") {
      try {
        return JSON.stringify(
          value,
          (k, v) => {
            if (v && typeof v?.toDate === "function") {
              try {
                return v.toDate().toISOString();
              } catch {
                return String(v);
              }
            }
            return v;
          },
          2
        );
      } catch {
        return String(value);
      }
    }

    return String(value);
  }

  function formatFullName(firstName, lastName) {
    return `${String(firstName || "").trim()} ${String(lastName || "").trim()}`.trim();
  }

  function formatStudentYear(raw) {
    const value = String(raw || "").trim();
    if (!value) return "";
    if (/^year\s+/i.test(value)) return value;
    if (/^\d+$/.test(value)) return `Year ${value}`;
    return value;
  }

  function formatClasses(raw) {
    const list = Array.isArray(raw) ? raw : [];
    const parts = list
      .map((c) => {
        const day = String(c?.day || "").trim();
        const startTime = String(c?.startTime || "").trim();
        const label = `${day}${day && startTime ? " @ " : ""}${startTime}`.trim();
        return label;
      })
      .filter(Boolean);
    return parts.join(", ");
  }

  function formatSubjects(raw) {
    const list = Array.isArray(raw) ? raw : [];
    const parts = list.map((s) => String(s || "").trim()).filter(Boolean);
    return parts.join(", ");
  }

  function renderField(label, value) {
    const formatted = formatEnrolmentValue(value);
    return (
      <div style={{ marginTop: 10 }}>
        <span className="label">{label}</span>
        <div
          style={{
            padding: "10px 12px",
            border: "1px solid rgba(17, 24, 39, 0.18)",
            borderRadius: 10,
            background: "rgba(255, 255, 255, 0.95)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontSize: 14,
          }}
        >
          {formatted || "(empty)"}
        </div>
      </div>
    );
  }

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
      setError("Missing enrolmentId in URL.");
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
          <h1>Enrolment Details</h1>
          <p className="subtitle">Review enrolment information</p>
        </div>

        <div className="section">
          <div className="buttonRow">
            <button
              className="buttonSecondary"
              onClick={() => navigate("/enrolments")}
              type="button"
            >
              Back to Enrolment List
            </button>
          </div>
        </div>

        <div className="section">
          <p>
            Enrolment ID: <strong>{enrolmentId}</strong>
          </p>

          {enrolmentBusy ? <p className="result">Loading enrolment details...</p> : null}
          {enrolmentError ? <p className="result error">{enrolmentError}</p> : null}

          {!enrolmentBusy && !enrolmentError && enrolmentData ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 800, marginTop: 6 }}>Student Details:</div>
              {renderField(
                "Name",
                formatFullName(enrolmentData.studentFirstName, enrolmentData.studentLastName)
              )}
              {renderField("Year", formatStudentYear(enrolmentData.studentYear))}
              {renderField("Class(es)", formatClasses(enrolmentData.classes))}
              {renderField("Subjects", formatSubjects(enrolmentData.studentSubjects))}

              <div style={{ fontWeight: 800, marginTop: 18 }}>Carer Details:</div>
              {renderField(
                "Name",
                formatFullName(enrolmentData.carerFirstName, enrolmentData.carerLastName)
              )}
              {renderField("Phone", enrolmentData.carerPhone)}
              {renderField("Email", enrolmentData.carerEmail)}

              <div style={{ fontWeight: 800, marginTop: 18 }}>Emergency Contact Details:</div>
              {renderField(
                "Name",
                formatFullName(
                  enrolmentData.emergencyContactFirstName,
                  enrolmentData.emergencyContactLastName
                )
              )}
              {renderField("Phone", enrolmentData.emergencyContactPhone)}
              {renderField("Relation", enrolmentData.emergencyContactRelation)}

              <div style={{ fontWeight: 800, marginTop: 18 }}>Misc:</div>
              {renderField("Allergies", enrolmentData.allergies)}
              {renderField("Permission to Leave", enrolmentData.permissionToLeave)}
              {renderField("Additional Info", enrolmentData.additionalInfo)}
            </div>
          ) : null}

          <div style={{ marginTop: 14 }}>
            <button onClick={onAcceptEnrolment} disabled={busy || !isAdmin} type="button">
              Accept Enrolment
            </button>
          </div>

          {result ? <p className="result">{result}</p> : null}
          {error ? <p className="result error">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
