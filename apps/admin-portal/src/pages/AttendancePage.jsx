import React, { useEffect, useMemo, useState } from "react";
import { listClasses } from "../backend/classesApi";
import { generateAttendanceForClass, regenerateAttendanceForTerm } from "../backend/attendanceApi";
import { listTerms } from "../backend/settingsApi";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import { useToast } from "../components/ToastProvider";

function className(c) {
  return c?.type || c?.name || c?.id || "Unnamed";
}
function termLabel(t) {
  return `${t.year} Term ${t.termNum}${t.status === "active" ? " (active)" : ""}`;
}

export default function AttendancePage() {
  const toast = useToast();

  const [classes,   setClasses]   = useState([]);
  const [terms,     setTerms]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState("");

  // scope: "class" | "term"
  const [scope,      setScope]      = useState("class");
  const [classId,    setClassId]    = useState("");
  const [termId,     setTermId]     = useState("");
  const [termIds,    setTermIds]    = useState([]);  // for class scope: which terms
  const [classIds,   setClassIds]   = useState([]);  // for term scope: optional class filter
  const [fromDate,   setFromDate]   = useState("");
  const [overwrite,  setOverwrite]  = useState(false);

  const [busy,       setBusy]       = useState(false);
  const [error,      setError]      = useState("");
  const [lastResult, setLastResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([listClasses(), listTerms()]).then(([c, t]) => {
      if (cancelled) return;
      setClasses(c);
      setTerms(t);
      const firstClass  = c[0]?.id || "";
      const activeTerm  = t.find((x) => x.status === "active");
      const firstTerm   = activeTerm?.id || t[0]?.id || "";
      setClassId(firstClass);
      setTermId(firstTerm);
      setTermIds(activeTerm ? [activeTerm.id] : firstTerm ? [firstTerm] : []);
      setFromDate(new Date().toISOString().slice(0, 10));
    }).catch((e) => {
      if (!cancelled) setLoadError(e?.message || "Failed to load data.");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function toggleClassId(id) {
    setClassIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }
  function toggleTermId(id) {
    setTermIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  const selectedClass = useMemo(() => classes.find((c) => c.id === classId), [classes, classId]);
  const selectedTerm  = useMemo(() => terms.find((t) => t.id === termId),    [terms, termId]);

  async function handleRun() {
    setError("");
    setBusy(true);
    try {
      let result;
      if (scope === "class") {
        if (!classId) throw new Error("Select a class.");
        result = await generateAttendanceForClass({
          classId,
          termIds:  termIds.length ? termIds : undefined,
          fromDate: fromDate || undefined,
          overwrite,
        });
      } else {
        if (!termId) throw new Error("Select a term.");
        result = await regenerateAttendanceForTerm({
          termId,
          classIds: classIds.length ? classIds : undefined,
          fromDate: fromDate || undefined,
          overwrite,
        });
      }
      const written    = result?.written    ?? result?.docsWritten    ?? 0;
      const skipped    = result?.skipped    ?? result?.docsSkipped    ?? 0;
      const considered = result?.considered ?? result?.docsConsidered ?? (written + skipped);
      setLastResult({ scope, classId, termId, written, skipped, considered, ranAt: new Date() });
      toast.success("Attendance run complete", `Wrote ${written} of ${considered} docs. Skipped ${skipped} existing.`);
    } catch (err) {
      setError(err?.message || "Run failed.");
    } finally {
      setBusy(false);
    }
  }

  function handleReset() {
    setClassIds([]);
    setOverwrite(false);
    setError("");
    setLastResult(null);
  }

  return (
    <>
      <PageHeader
        title="Attendance maintenance"
        subtitle="Repair or generate weekly attendance documents. Daily marking stays in the Flutter app."
        crumbs={[{ label: "Overview", href: "/" }, { label: "Classes", href: "/classes" }, { label: "Attendance maintenance" }]}
      />

      <div className="banner banner-info mb-5">
        <Icon className="banner-icon" name="alert" />
        <div>
          <div className="banner-title">When to use this</div>
          <div>Use class-level generation for new classes or repairs. Use term-level regeneration after a term rollover, day/time fix, or backfill.</div>
        </div>
      </div>

      {loadError ? (
        <div className="banner banner-danger mb-5">
          <div><div className="banner-title">Could not load data</div><div>{loadError}</div></div>
        </div>
      ) : null}

      {/* Step 1: Scope */}
      <div className="card mb-4">
        <div className="card-head">
          <h3>1. Pick a scope</h3>
        </div>
        <div className="card-body">
          <div className="grid grid-2" style={{ gap: "var(--s-3)" }}>
            {[
              {
                id:    "class",
                icon:  "classes",
                label: "Generate for one class",
                sub:   "adminGenerateAttendanceForClass — repair or set up a specific class.",
              },
              {
                id:    "term",
                icon:  "calendar",
                label: "Regenerate for a term",
                sub:   "adminRegenerateAttendanceForTerm — term-level setup or rollover.",
              },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setScope(opt.id)}
                style={{
                  textAlign: "left",
                  padding: "16px 18px",
                  borderRadius: "var(--r-md)",
                  border: `1.5px solid ${scope === opt.id ? "var(--brand-navy)" : "var(--ink-200)"}`,
                  background: scope === opt.id ? "var(--brand-blue-50, #EFF6FF)" : "var(--white)",
                  cursor: "pointer",
                  transition: "all var(--dur)",
                }}
              >
                <div className="row gap-3 mb-2">
                  <div style={{
                    width: 32, height: 32,
                    borderRadius: "var(--r-sm)",
                    background: scope === opt.id ? "var(--brand-navy)" : "var(--ink-100)",
                    color: scope === opt.id ? "var(--white)" : "var(--ink-700)",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                  }}>
                    <Icon name={opt.icon} size={16} />
                  </div>
                  <span style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>{opt.label}</span>
                </div>
                <div className="text-sm muted text-mono">{opt.sub}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Step 2: Parameters */}
      <div className="card mb-4">
        <div className="card-head">
          <h3>2. Set parameters</h3>
        </div>
        <div className="card-body">
          {loading ? <div className="route-inline-state">Loading…</div> : scope === "class" ? (
            <div className="grid gap-4">
              <div className="grid grid-2" style={{ gap: "var(--s-3)" }}>
                <div className="field">
                  <span className="label">Class <span className="req">*</span></span>
                  <select
                    className="select"
                    disabled={busy}
                    value={classId}
                    onChange={(e) => setClassId(e.target.value)}
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {className(c)} · {c.day || ""} {c.startTime || ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <span className="label">From date <span className="label-hint">optional</span></span>
                  <input
                    className="input"
                    disabled={busy}
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="field">
                <span className="label">Terms <span className="label-hint">leave empty for all active/upcoming terms</span></span>
                <div className="grid grid-2" style={{ gap: "var(--s-2)" }}>
                  {terms.map((t) => (
                    <label
                      key={t.id}
                      className="row gap-2"
                      style={{
                        padding: "8px 12px",
                        background: termIds.includes(t.id) ? "var(--brand-blue-50, #EFF6FF)" : "var(--ink-50)",
                        border: `1px solid ${termIds.includes(t.id) ? "var(--brand-blue, #3B82F6)" : "transparent"}`,
                        borderRadius: "var(--r-sm)",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        checked={termIds.includes(t.id)}
                        disabled={busy}
                        type="checkbox"
                        onChange={() => toggleTermId(t.id)}
                      />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>{termLabel(t)}</div>
                        {t.status ? <div className="muted" style={{ fontSize: "var(--fs-xs)" }}>{t.status}</div> : null}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div className={`propagation-row${overwrite ? " warn" : ""}`}>
                <div>
                  <div className="prop-label">Overwrite existing docs</div>
                  <div className="prop-sub">{overwrite ? "Existing docs for matching weeks will be replaced." : "Weeks that already have docs are skipped."}</div>
                </div>
                <div
                  className={`switch${overwrite ? " on" : ""}`}
                  role="switch"
                  aria-checked={overwrite}
                  onClick={() => !busy && setOverwrite((v) => !v)}
                />
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              <div className="grid grid-2" style={{ gap: "var(--s-3)" }}>
                <div className="field">
                  <span className="label">Term <span className="req">*</span></span>
                  <select
                    className="select"
                    disabled={busy}
                    value={termId}
                    onChange={(e) => setTermId(e.target.value)}
                  >
                    {terms.map((t) => (
                      <option key={t.id} value={t.id}>{termLabel(t)}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <span className="label">From date <span className="label-hint">defaults to term start</span></span>
                  <input
                    className="input"
                    disabled={busy}
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="field">
                <span className="label">Classes to include <span className="label-hint">leave empty for all classes in this term</span></span>
                <div className="grid grid-2" style={{ gap: "var(--s-2)" }}>
                  {classes.map((c) => (
                    <label
                      key={c.id}
                      className="row gap-2"
                      style={{
                        padding: "8px 12px",
                        background: classIds.includes(c.id) ? "var(--brand-blue-50, #EFF6FF)" : "var(--ink-50)",
                        border: `1px solid ${classIds.includes(c.id) ? "var(--brand-blue, #3B82F6)" : "transparent"}`,
                        borderRadius: "var(--r-sm)",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        checked={classIds.includes(c.id)}
                        disabled={busy}
                        type="checkbox"
                        onChange={() => toggleClassId(c.id)}
                      />
                      <span style={{ fontSize: "var(--fs-sm)", fontWeight: 500 }}>
                        {className(c)} · {c.day || ""}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div className={`propagation-row${overwrite ? " warn" : ""}`}>
                <div>
                  <div className="prop-label">Overwrite existing docs</div>
                  <div className="prop-sub">{overwrite ? "Existing docs will be replaced." : "Existing weeks are skipped."}</div>
                </div>
                <div
                  className={`switch${overwrite ? " on" : ""}`}
                  role="switch"
                  aria-checked={overwrite}
                  onClick={() => !busy && setOverwrite((v) => !v)}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Step 3: Run */}
      <div className="card mb-4">
        <div className="card-head">
          <h3>3. Review and run</h3>
        </div>
        <div className="card-body">
          <div className="grid grid-3 mb-5">
            <div>
              <div className="text-xs muted" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>Scope</div>
              <div style={{ fontWeight: 600, marginTop: 4 }}>{scope === "class" ? "One class" : "Whole term"}</div>
            </div>
            <div>
              <div className="text-xs muted" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>Target</div>
              <div style={{ fontWeight: 600, marginTop: 4 }}>
                {scope === "class"
                  ? (selectedClass ? className(selectedClass) : "—")
                  : (selectedTerm ? termLabel(selectedTerm) : "—")}
              </div>
            </div>
            <div>
              <div className="text-xs muted" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>Overwrite</div>
              <div style={{ marginTop: 4 }}>
                <Badge tone={overwrite ? "warn" : "neutral"}>{overwrite ? "Yes" : "No — skip existing"}</Badge>
              </div>
            </div>
          </div>

          {error ? (
            <div className="banner banner-danger mb-4">
              <div><div className="banner-title">Run failed</div><div>{error}</div></div>
            </div>
          ) : null}

          {overwrite ? (
            <div className="banner banner-warn mb-4">
              <Icon className="banner-icon" name="alert" />
              <div><div className="banner-title">Overwrite is destructive</div><div>Existing attendance lists for matching weeks will be replaced with the current class roster.</div></div>
            </div>
          ) : null}

          <div className="row gap-2" style={{ justifyContent: "flex-end" }}>
            <Button disabled={busy} onClick={handleReset} variant="secondary">Reset</Button>
            <Button disabled={busy || loading} loading={busy} onClick={handleRun} variant="primary">
              Run {scope === "class" ? "generation" : "regeneration"}
            </Button>
          </div>
        </div>
      </div>

      {/* Last run result */}
      {lastResult ? (
        <div className="card">
          <div className="card-head">
            <h3>Last run result</h3>
            <span className="text-sm muted">{lastResult.ranAt.toLocaleTimeString()}</span>
          </div>
          <div className="card-body">
            <div className="grid grid-3">
              <div className="att-result-stat">
                <div className="stat-label">Considered</div>
                <div className="stat-value">{lastResult.considered}</div>
              </div>
              <div className="att-result-stat">
                <div className="stat-label">Written</div>
                <div className="stat-value ok">{lastResult.written}</div>
              </div>
              <div className="att-result-stat">
                <div className="stat-label">Skipped existing</div>
                <div className="stat-value muted">{lastResult.skipped}</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
