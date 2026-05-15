import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { listClasses } from "../backend/classesApi";
import { listStudents } from "../backend/studentsApi";
import { listUsers } from "../backend/usersApi";
import { listWaitlist, promoteWaitlistEntry, updateWaitlistEntryStatus } from "../backend/waitlistApi";
import Badge from "../components/Badge";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import Modal from "../components/Modal";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import Table from "../components/Table";
import { useToast } from "../components/ToastProvider";

const TABS = [
  { key: "active",   label: "Active",   match: (w) => w.status === "active" },
  { key: "offered",  label: "Offered",  match: (w) => w.status === "offered" },
  { key: "accepted", label: "Accepted", match: (w) => w.status === "accepted" || w.status === "promoted" },
  { key: "history",  label: "History",  match: (w) => ["declined", "expired", "cancelled"].includes(w.status) },
];

const STATUS_OPTIONS = ["active", "offered", "accepted", "declined", "expired", "cancelled"];

const PAGE_SIZE = 20;

function fullName(r) {
  return `${String(r?.firstName || "").trim()} ${String(r?.lastName || "").trim()}`.trim();
}
function studentName(s) {
  return s?.displayName || fullName(s) || s?.id || "Unknown student";
}
function userName(u) {
  return u?.displayName || fullName(u) || u?.email || u?.uid || "Unknown user";
}
function className(c) {
  return c?.type || c?.name || c?.id || "Unknown class";
}
function classTime(c) {
  if (!c?.startTime) return "";
  return c.endTime ? `${c.startTime}–${c.endTime}` : c.startTime;
}

function statusTone(status) {
  switch (status) {
    case "active":    return "brand";
    case "offered":   return "warn";
    case "accepted":  return "success";
    case "promoted":  return "success";
    case "declined":  return "neutral";
    case "expired":   return "neutral";
    case "cancelled": return "neutral";
    default:          return "neutral";
  }
}

function relTime(iso) {
  if (!iso) return "-";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "-";
  const diff = (Date.now() - t) / 1000;
  if (diff < 60)         return "just now";
  if (diff < 3600)       return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)      return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function permanentSpotsRemaining(c) {
  if (!c) return 0;
  const cap = Number(c.capacity || 0);
  const enrolled = Array.isArray(c.enrolledStudents) ? c.enrolledStudents.length : 0;
  return Math.max(0, cap - enrolled);
}

export default function WaitlistPage() {
  const navigate = useNavigate();
  const toast    = useToast();
  const [params, setParams] = useSearchParams();

  const [entries,  setEntries]  = useState([]);
  const [classes,  setClasses]  = useState([]);
  const [users,    setUsers]    = useState([]);
  const [students, setStudents] = useState([]);

  const [tab,         setTab]         = useState("active");
  const [search,      setSearch]      = useState("");
  const [classFilter, setClassFilter] = useState(params.get("classId") || "all");
  const [page,        setPage]        = useState(1);
  const [busy,        setBusy]        = useState(true);
  const [error,       setError]       = useState("");
  const [warning,     setWarning]     = useState("");
  const [loadKey,     setLoadKey]     = useState(0);

  // promote modal state
  const [promoteEntry, setPromoteEntry] = useState(null);
  const [promoteBusy,  setPromoteBusy]  = useState(false);
  const [promoteError, setPromoteError] = useState("");

  // status modal state
  const [statusEntry,    setStatusEntry]    = useState(null);
  const [newStatus,      setNewStatus]      = useState("active");
  const [offerExpiresAt, setOfferExpiresAt] = useState("");
  const [statusBusy,     setStatusBusy]     = useState(false);
  const [statusError,    setStatusError]    = useState("");

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError("");
    setWarning("");
    Promise.allSettled([
      listWaitlist(),
      listClasses(),
      listUsers(),
      listStudents(),
    ]).then(([wR, cR, uR, sR]) => {
      if (cancelled) return;
      if (wR.status === "rejected") throw wR.reason;
      setEntries(wR.value);
      setClasses(cR.status  === "fulfilled" ? cR.value : []);
      setUsers(uR.status    === "fulfilled" ? uR.value : []);
      setStudents(sR.status === "fulfilled" ? sR.value : []);
      const fails = [cR, uR, sR].filter((r) => r.status === "rejected");
      if (fails.length) setWarning(fails[0].reason?.message || "Some related data could not be loaded.");
    }).catch((e) => {
      if (!cancelled) setError(e?.message || "Failed to load waitlist.");
    }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [loadKey]);

  useEffect(() => {
    setPage(1);
  }, [search, tab, classFilter]);

  useEffect(() => {
    if (statusEntry) {
      setNewStatus(statusEntry.status || "active");
      setOfferExpiresAt(statusEntry.offerExpiresAtIso ? statusEntry.offerExpiresAtIso.slice(0, 10) : "");
      setStatusError("");
    }
  }, [statusEntry]);

  useEffect(() => {
    if (promoteEntry) setPromoteError("");
  }, [promoteEntry]);

  const usersById    = useMemo(() => new Map(users.map((u)    => [u.uid || u.id, u])), [users]);
  const studentsById = useMemo(() => new Map(students.map((s) => [s.id, s])),           [students]);
  const classesById  = useMemo(() => new Map(classes.map((c)  => [c.id, c])),           [classes]);

  const counts = useMemo(() => {
    const out = {};
    for (const t of TABS) out[t.key] = entries.filter(t.match).length;
    return out;
  }, [entries]);

  const visible = useMemo(() => {
    const tabDef = TABS.find((t) => t.key === tab);
    let rows = entries.filter(tabDef ? tabDef.match : () => true);
    if (classFilter !== "all") rows = rows.filter((w) => w.classId === classFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((w) => {
        const s = studentsById.get(w.studentId);
        const p = usersById.get(w.parentId);
        const c = classesById.get(w.classId);
        return [
          studentName(s),
          userName(p),
          className(c),
          w.reason || "",
          w.studentId || "",
          w.parentId  || "",
          w.classId   || "",
        ].some((v) => String(v).toLowerCase().includes(q));
      });
    }
    return rows.sort((a, b) => {
      const at = new Date(a.createdAtIso || 0).getTime();
      const bt = new Date(b.createdAtIso || 0).getTime();
      return bt - at;
    });
  }, [classFilter, classesById, entries, search, studentsById, tab, usersById]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage  = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageRows  = visible.slice(pageStart, pageStart + PAGE_SIZE);

  function reload() { setLoadKey((k) => k + 1); }

  function setClassFilterFromUI(value) {
    setClassFilter(value);
    if (value === "all") params.delete("classId");
    else                  params.set("classId", value);
    setParams(params, { replace: true });
  }

  async function handlePromote() {
    if (!promoteEntry) return;
    setPromoteError("");
    setPromoteBusy(true);
    try {
      const result = await promoteWaitlistEntry(promoteEntry.id);
      const outcome = result?.outcome || "promoted";
      if (outcome === "promoted") {
        toast.success("Promoted to permanent enrolment", "Student added to class and future attendance updated.");
      } else if (outcome === "already_enrolled") {
        toast.warn("Already enrolled", "Student was already on the class roster. Entry marked as promoted.");
      } else if (outcome === "class_full") {
        setPromoteError("Class is at capacity. Free a spot before promoting, or change the class.");
        setPromoteBusy(false);
        return;
      } else if (outcome === "not_promotable") {
        setPromoteError("This entry's status does not allow promotion.");
        setPromoteBusy(false);
        return;
      } else {
        toast.info("Promotion complete", `Outcome: ${outcome}`);
      }
      setPromoteEntry(null);
      reload();
    } catch (err) {
      setPromoteError(err?.message || "Failed to promote waitlist entry.");
    } finally {
      setPromoteBusy(false);
    }
  }

  async function handleStatusUpdate() {
    if (!statusEntry) return;
    setStatusError("");
    setStatusBusy(true);
    try {
      const options = {};
      if (newStatus === "offered" && offerExpiresAt) {
        options.offerExpiresAt = new Date(`${offerExpiresAt}T23:59:59`).toISOString();
      }
      await updateWaitlistEntryStatus(statusEntry.id, newStatus, options);
      setStatusEntry(null);
      reload();
      toast.success("Status updated", `Entry is now ${newStatus}.`);
    } catch (err) {
      setStatusError(err?.message || "Failed to update status.");
    } finally {
      setStatusBusy(false);
    }
  }

  function renderPagination() {
    if (visible.length <= PAGE_SIZE) return null;
    return (
      <div className="pagination">
        <span>
          Showing {pageStart + 1}-{Math.min(pageStart + PAGE_SIZE, visible.length)} of {visible.length}
        </span>
        <div className="pages">
          <button className="page-btn" disabled={safePage === 1}         onClick={() => setPage((p) => Math.max(1, p - 1))}        type="button">Previous</button>
          <button className="page-btn active" disabled type="button">{safePage} / {pageCount}</button>
          <button className="page-btn" disabled={safePage === pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))} type="button">Next</button>
        </div>
      </div>
    );
  }

  const promoteClass     = promoteEntry ? classesById.get(promoteEntry.classId)   : null;
  const promoteStudent   = promoteEntry ? studentsById.get(promoteEntry.studentId): null;
  const promoteParent    = promoteEntry ? usersById.get(promoteEntry.parentId)    : null;
  const spotsRemaining   = permanentSpotsRemaining(promoteClass);
  const promoteBlocked   = promoteEntry
    ? (spotsRemaining <= 0 || !["active", "offered"].includes(promoteEntry.status))
    : false;

  return (
    <>
      <PageHeader
        title="Waitlist"
        subtitle="Manage offers and promotions. Promoting an entry adds the student to the class roster and future attendance."
        crumbs={[{ label: "Overview", href: "/" }, { label: "Waitlist" }]}
      />

      <section className="grid grid-4 mb-6">
        <StatCard icon="waitlist" label="Active waiting"     value={counts.active   || 0} foot="Open waitlist" />
        <StatCard icon="alert"    label="Offered"            value={counts.offered  || 0} foot="Awaiting parent response" />
        <StatCard icon="people"   label="Accepted / promoted" value={counts.accepted || 0} foot="Now enrolled or accepted offers" />
        <StatCard icon="x-circle" label="History"            value={counts.history  || 0} foot="Declined, expired, cancelled" />
      </section>

      <div className="tabs">
        {TABS.map((t) => (
          <button
            className={`tab ${tab === t.key ? "active" : ""}`}
            disabled={busy}
            key={t.key}
            onClick={() => setTab(t.key)}
            type="button"
          >
            {t.label}
            <span className="count">{counts[t.key] || 0}</span>
          </button>
        ))}
      </div>

      <div className="filter-bar">
        <div className="field-search grow">
          <Icon className="search-icon" name="search" size={16} />
          <input
            className="input"
            placeholder="Search by student, parent, or class"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="select"
          value={classFilter}
          onChange={(e) => setClassFilterFromUI(e.target.value)}
        >
          <option value="all">All classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{className(c)} · {c.day || ""}</option>
          ))}
        </select>
      </div>

      {warning ? (
        <div className="banner banner-warn mb-5">
          <Icon className="banner-icon" name="alert" />
          <div><div className="banner-title">Partial data loaded</div><div>{warning}</div></div>
        </div>
      ) : null}

      <div className="card">
        <div className="card-head">
          <div>
            <h3>{TABS.find((t) => t.key === tab)?.label} entries</h3>
            <div className="card-sub">Click a row's action buttons to promote or change status.</div>
          </div>
          <Badge tone="brand" dot>Live data</Badge>
        </div>
        <div className="card-body flush">
          {busy ? <div className="route-inline-state">Loading waitlist…</div> : null}
          {error ? (
            <div className="banner banner-danger">
              <div><div className="banner-title">Could not load waitlist</div><div>{error}</div></div>
            </div>
          ) : null}

          {!busy && !error ? (
            visible.length === 0 ? (
              <EmptyState icon="waitlist" title="No waitlist entries">
                No entries match the selected filters.
              </EmptyState>
            ) : (
              <>
                <Table
                  columns={[
                    {
                      key: "student",
                      header: "Student",
                      render: (row) => {
                        const s = studentsById.get(row.studentId);
                        return (
                          <div className="row-meta">
                            <span className="primary">{studentName(s)}</span>
                            <span className="secondary">{s?.grade || s?.studentYear || row.studentId}</span>
                          </div>
                        );
                      },
                    },
                    {
                      key: "parent",
                      header: "Parent",
                      render: (row) => {
                        const p = usersById.get(row.parentId);
                        return (
                          <div className="row-meta">
                            <span className="primary">{userName(p)}</span>
                            <span className="secondary">{p?.email || row.parentId}</span>
                          </div>
                        );
                      },
                    },
                    {
                      key: "class",
                      header: "Class",
                      render: (row) => {
                        const c = classesById.get(row.classId);
                        if (!c) return <span className="text-mono">{row.classId}</span>;
                        return (
                          <div className="row-meta">
                            <span className="primary">{className(c)}</span>
                            <span className="secondary">{c.day || ""} {classTime(c)}</span>
                          </div>
                        );
                      },
                    },
                    {
                      key: "reason",
                      header: "Reason",
                      render: (row) => row.reason ? (
                        <span className="text-sm muted">{row.reason}</span>
                      ) : <span className="muted">-</span>,
                    },
                    {
                      key: "added",
                      header: "Added",
                      render: (row) => <span className="text-sm muted">{relTime(row.createdAtIso)}</span>,
                    },
                    {
                      key: "status",
                      header: "Status",
                      render: (row) => <Badge tone={statusTone(row.status)} dot>{row.status}</Badge>,
                    },
                    {
                      key: "actions",
                      header: "",
                      render: (row) => (
                        <div className="row gap-1" onClick={(e) => e.stopPropagation()}>
                          {(row.status === "active" || row.status === "offered") ? (
                            <Button size="sm" variant="primary" onClick={() => setPromoteEntry(row)}>
                              Promote
                            </Button>
                          ) : null}
                          <Button size="sm" variant="secondary" onClick={() => setStatusEntry(row)}>
                            Status
                          </Button>
                        </div>
                      ),
                    },
                  ]}
                  getRowKey={(row) => row.id}
                  rows={pageRows}
                />
                {renderPagination()}
              </>
            )
          ) : null}
        </div>
      </div>

      {/* Promote modal */}
      <Modal
        open={Boolean(promoteEntry)}
        title="Promote to permanent enrolment"
        subtitle="Adds the student to the class roster and appends them to future attendance documents."
        size="lg"
        busy={promoteBusy}
        onClose={() => { if (!promoteBusy) setPromoteEntry(null); }}
        footer={
          <>
            <Button disabled={promoteBusy} onClick={() => setPromoteEntry(null)} variant="secondary">Cancel</Button>
            <Button disabled={promoteBusy || promoteBlocked} loading={promoteBusy} onClick={handlePromote} variant="primary">
              Promote
            </Button>
          </>
        }
      >
        {promoteError ? (
          <div className="banner banner-danger mb-4">
            <div><div className="banner-title">Could not promote</div><div>{promoteError}</div></div>
          </div>
        ) : null}

        {promoteEntry ? (
          <>
            <div className="banner banner-info mb-4">
              <Icon className="banner-icon" name="alert" />
              <div>
                <div className="banner-title">Calls promoteWaitlistEntry</div>
                <div>This existing backend callable handles the enrolment write atomically.</div>
              </div>
            </div>

            <div className="grid grid-2 mb-4" style={{ gap: "var(--s-4)" }}>
              <div>
                <div className="text-xs muted" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Student</div>
                <div style={{ fontWeight: 600 }}>{studentName(promoteStudent)}</div>
                <div className="text-sm muted">{promoteStudent?.grade || promoteStudent?.studentYear || promoteEntry.studentId}</div>
                {promoteParent ? <div className="text-sm muted mt-1">Parent: {userName(promoteParent)}</div> : null}
              </div>
              <div>
                <div className="text-xs muted" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Target class</div>
                <div style={{ fontWeight: 600 }}>{className(promoteClass)}</div>
                <div className="text-sm muted">{promoteClass?.day || ""} · {classTime(promoteClass)} · capacity {promoteClass?.capacity ?? "?"}</div>
                <div className="text-sm mt-1">
                  Currently enrolled: {Array.isArray(promoteClass?.enrolledStudents) ? promoteClass.enrolledStudents.length : 0} / {promoteClass?.capacity ?? "?"}
                </div>
              </div>
            </div>

            <div
              className="row"
              style={{
                gap: "var(--s-5)",
                padding: "16px",
                background: "var(--ink-50)",
                borderRadius: "var(--r-md)",
                marginBottom: "var(--s-4)",
              }}
            >
              <div>
                <div className="text-xs muted" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>Class roster</div>
                <div style={{ fontWeight: 600, marginTop: 4 }}>+1 enrolled</div>
              </div>
              <div>
                <div className="text-xs muted" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>Future attendance</div>
                <div style={{ fontWeight: 600, marginTop: 4 }}>Student added to docs</div>
              </div>
              <div>
                <div className="text-xs muted" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>Waitlist status</div>
                <div style={{ fontWeight: 600, marginTop: 4 }}>→ promoted</div>
              </div>
              <div>
                <div className="text-xs muted" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>Spots remaining</div>
                <div style={{ fontWeight: 600, marginTop: 4 }}>{Math.max(0, spotsRemaining - 1)} after promote</div>
              </div>
            </div>

            {spotsRemaining <= 0 ? (
              <div className="banner banner-danger mb-2">
                <Icon className="banner-icon" name="alert" />
                <div>
                  <div className="banner-title">Class is at capacity</div>
                  <div>Promotion will fail with <span className="text-mono">class_full</span>. Free a spot first or change the target class.</div>
                </div>
              </div>
            ) : null}

            {!["active", "offered"].includes(promoteEntry.status) ? (
              <div className="banner banner-warn mb-2">
                <Icon className="banner-icon" name="alert" />
                <div>
                  <div className="banner-title">Status does not allow promotion</div>
                  <div>Only <span className="text-mono">active</span> and <span className="text-mono">offered</span> entries can be promoted.</div>
                </div>
              </div>
            ) : null}

            <div className="text-xs muted">
              {promoteClass ? (
                <span>
                  Open the class: <a className="text-mono" href="#" onClick={(e) => { e.preventDefault(); setPromoteEntry(null); navigate(`/classes/${promoteClass.id}`); }}>{promoteClass.id}</a>
                </span>
              ) : null}
            </div>
          </>
        ) : null}
      </Modal>

      {/* Status update modal */}
      <Modal
        open={Boolean(statusEntry)}
        title="Update waitlist status"
        subtitle="Manually change the entry status. To enrol the student in the class, use Promote instead."
        busy={statusBusy}
        onClose={() => { if (!statusBusy) setStatusEntry(null); }}
        footer={
          <>
            <Button disabled={statusBusy} onClick={() => setStatusEntry(null)} variant="secondary">Cancel</Button>
            <Button
              disabled={statusBusy || !statusEntry || newStatus === statusEntry.status}
              loading={statusBusy}
              onClick={handleStatusUpdate}
              variant="primary"
            >
              Update status
            </Button>
          </>
        }
      >
        {statusError ? (
          <div className="banner banner-danger mb-4">
            <div><div className="banner-title">Could not update</div><div>{statusError}</div></div>
          </div>
        ) : null}

        {statusEntry ? (
          <div className="grid gap-4">
            <div className="field-readonly">
              <span className="label">Current status</span>
              <div className="readonly-box">
                <Badge tone={statusTone(statusEntry.status)} dot>{statusEntry.status}</Badge>
              </div>
            </div>
            <div className="field">
              <span className="label">New status <span className="req">*</span></span>
              <select
                className="select"
                disabled={statusBusy}
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
              >
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <span className="label-hint">
                Use Promote (not status update) to enrol the student. <span className="text-mono">promoted</span> is set by the backend, not directly.
              </span>
            </div>
            {newStatus === "offered" ? (
              <div className="field">
                <span className="label">Offer expires <span className="label-hint">optional</span></span>
                <input
                  className="input"
                  disabled={statusBusy}
                  type="date"
                  value={offerExpiresAt}
                  onChange={(e) => setOfferExpiresAt(e.target.value)}
                />
                <span className="label-hint">When the offer should be considered expired if not accepted.</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </>
  );
}
