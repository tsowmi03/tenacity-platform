import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { db, firebaseConfig } from "../firebaseConfig";
import { useAuth } from "../AuthProvider";
import { collection, getDocs, orderBy, query } from "firebase/firestore";

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

  const [listBusy, setListBusy] = useState(false);
  const [listError, setListError] = useState("");
  const [enrolments, setEnrolments] = useState([]);
  const [listTab, setListTab] = useState("unarchived");

  useEffect(() => {
    const idFromQuery = String(searchParams.get("enrolmentId") || "").trim();
    if (!idFromQuery) return;
    navigate(`/enrolments/${encodeURIComponent(idFromQuery)}`, { replace: true });
  }, [navigate, searchParams]);

  useEffect(() => {
    let cancelled = false;

    async function loadEnrolments() {
      setListError("");

      if (enrolmentId) return;
      if (!firebaseConfig?.projectId) {
        setListError(
          "Firebase is not configured. Check your VITE_FIREBASE_* env vars."
        );
        return;
      }
      if (!db) {
        setListError("Firestore is not configured.");
        return;
      }
      if (!user) {
        setListError("You must be signed in to view enrolments.");
        return;
      }
      if (!isAdmin) {
        setListError('Access denied: requires admin role ("role: admin").');
        return;
      }

      setListBusy(true);
      try {
        const snap = await getDocs(query(collection(db, "enrolments"), orderBy("archived", "asc")));
        const rows = snap.docs.map((d) => {
          const data = d.data() || {};
          return {
            id: d.id,
            archived: data.archived === true,
            studentFirstName: data.studentFirstName || "",
            studentLastName: data.studentLastName || "",
            carerEmail: data.carerEmail || "",
          };
        });

        // Safety net: ensure deterministic ordering even if some docs are missing `archived`.
        rows.sort((a, b) => {
          const aa = a.archived ? 1 : 0;
          const bb = b.archived ? 1 : 0;
          if (aa !== bb) return aa - bb;
          return a.id.localeCompare(b.id);
        });

        if (!cancelled) setEnrolments(rows);
      } catch (e) {
        console.error(e);
        if (!cancelled) setListError("Failed to load enrolments.");
      } finally {
        if (!cancelled) setListBusy(false);
      }
    }

    loadEnrolments();
    return () => {
      cancelled = true;
    };
  }, [enrolmentId, user, isAdmin]);

  const visibleEnrolments = useMemo(() => {
    const wantArchived = listTab === "archived";
    return enrolments.filter((e) => e.archived === wantArchived);
  }, [enrolments, listTab]);

  // Note: enrolment acceptance happens on the dedicated details page.

  return (
    <div className="pageCenter">
      <div className="container">
        <div className="header">
          <h1>Enrolment Portal</h1>
          <p className="subtitle">Accept pending enrolments securely</p>
        </div>

        <div className="section">
          <div className="buttonRow">
            <button
              className="buttonSecondary"
              onClick={() => navigate("/")}
              type="button"
            >
              Back to Dashboard
            </button>
          </div>
        </div>

        <div className="section">
          <p className="subtitle" style={{ textAlign: "left", marginTop: 0 }}>
            Select an enrolment to view details.
          </p>

          <div className="buttonRow" style={{ marginTop: 12 }}>
            <button
              type="button"
              className={listTab === "unarchived" ? "" : "buttonSecondary"}
              onClick={() => setListTab("unarchived")}
              disabled={listBusy}
            >
              Unarchived
            </button>
            <button
              type="button"
              className={listTab === "archived" ? "" : "buttonSecondary"}
              onClick={() => setListTab("archived")}
              disabled={listBusy}
            >
              Archived
            </button>
          </div>

          {listBusy ? <p className="result">Loading enrolments...</p> : null}
          {listError ? <p className="result error">{listError}</p> : null}

          {!listBusy && !listError ? (
            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              {visibleEnrolments.length === 0 ? (
                <p className="result">No enrolments found.</p>
              ) : (
                visibleEnrolments.map((e) => {
                  const studentName = `${e.studentFirstName} ${e.studentLastName}`.trim();
                  return (
                    <button
                      key={e.id}
                      className="buttonSecondary"
                      type="button"
                      onClick={() =>
                        navigate(`/enrolments/${encodeURIComponent(e.id)}`)
                      }
                    >
                      {e.archived ? "[ARCHIVED] " : ""}
                      {studentName || "(Unnamed student)"} — {e.carerEmail || e.id}
                    </button>
                  );
                })
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
