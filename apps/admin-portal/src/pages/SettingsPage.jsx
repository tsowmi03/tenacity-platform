import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../AuthProvider";
import { getClientFirebaseConfig, listRecentAuditLogs, listTerms } from "../backend/settingsApi";
import Badge from "../components/Badge";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import Table from "../components/Table";

const TABS = [
  { key: "overview",    label: "Overview" },
  { key: "terms",       label: "Terms" },
  { key: "audit",       label: "Audit log" },
  { key: "maintenance", label: "Maintenance" },
];

// Node.js 20 decommission date for Cloud Functions runtime.
// Source: backend PLAN.md "Upgrade off Node.js 20 before decommission on 2026-10-30".
const NODE_RUNTIME           = "nodejs20";
const NODE_DECOMMISSION_DATE = "2026-10-30";

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}
function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}
function termLabel(t) {
  return `${t.year} Term ${t.termNum}`;
}
function termTone(status) {
  if (status === "active")    return "success";
  if (status === "upcoming")  return "brand";
  if (status === "completed") return "neutral";
  return "neutral";
}
function daysUntil(dateStr) {
  const target = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  return Math.ceil((target.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

// ── Overview tab ────────────────────────────────────────────────────────────

function OverviewTab() {
  const { user, isAdmin } = useAuth();
  const config = useMemo(() => getClientFirebaseConfig(), []);
  const daysToDecommission = daysUntil(NODE_DECOMMISSION_DATE);

  return (
    <>
      <section className="grid grid-3 mb-6">
        <StatCard icon="dashboard" label="Project ID"     value={config.projectId || "(not set)"}    foot={`region · ${config.region}`} />
        <StatCard icon="alert"     label="Runtime"        value={NODE_RUNTIME}                        foot={`decommission ${NODE_DECOMMISSION_DATE}`} />
        <StatCard icon="people"    label="Signed in"      value={isAdmin ? "Admin" : "Non-admin"}    foot={user?.email || "—"} />
      </section>

      {daysToDecommission !== null && daysToDecommission > 0 ? (
        <div className="banner banner-warn mb-5">
          <Icon className="banner-icon" name="alert" />
          <div>
            <div className="banner-title">Cloud Functions runtime decommission</div>
            <div>
              Functions are deployed on <span className="text-mono">{NODE_RUNTIME}</span>.
              Decommission on <span className="text-mono">{NODE_DECOMMISSION_DATE}</span>
              ({daysToDecommission} day{daysToDecommission === 1 ? "" : "s"} from today).
              Upgrade to Node.js 22 or later in the backend `functions/package.json` and redeploy before that date.
            </div>
          </div>
        </div>
      ) : null}

      <div className="card mb-5">
        <div className="card-head">
          <h3>Firebase project configuration</h3>
          <Badge tone="brand" dot>Read-only</Badge>
        </div>
        <div className="card-body field-section">
          <div className="field-readonly">
            <span className="label">Project ID</span>
            <div className="readonly-box text-mono">{config.projectId || "(VITE_FIREBASE_PROJECT_ID not set)"}</div>
          </div>
          <div className="field-readonly">
            <span className="label">Auth domain</span>
            <div className="readonly-box text-mono">{config.authDomain || "(not set)"}</div>
          </div>
          <div className="field-readonly">
            <span className="label">Storage bucket</span>
            <div className="readonly-box text-mono">{config.storageBucket || "(not set)"}</div>
          </div>
          <div className="field-readonly">
            <span className="label">App ID</span>
            <div className="readonly-box text-mono">{config.appId || "(not set)"}</div>
          </div>
          <div className="field-readonly">
            <span className="label">API key</span>
            <div className="readonly-box text-mono">{config.apiKey || "(not set)"}</div>
          </div>
          <div className="field-readonly">
            <span className="label">Functions region</span>
            <div className="readonly-box text-mono">{config.region}</div>
          </div>
        </div>
      </div>

      <div className="banner banner-info">
        <Icon className="banner-icon" name="alert" />
        <div>
          <div className="banner-title">Integration health is not checked from this UI</div>
          <div>
            Live health for SendGrid, Stripe, and Xero is intentionally not displayed — there's no end-to-end probe wired into this portal yet. Check those services in their own dashboards.
          </div>
        </div>
      </div>
    </>
  );
}

// ── Terms tab ───────────────────────────────────────────────────────────────

function TermsTab() {
  const [terms, setTerms] = useState([]);
  const [busy,  setBusy]  = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    listTerms().then((t) => { if (!cancelled) setTerms(t); })
      .catch((e) => { if (!cancelled) setError(e?.message || "Failed to load terms."); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, []);

  const counts = useMemo(() => ({
    total:     terms.length,
    active:    terms.filter((t) => t.status === "active").length,
    upcoming:  terms.filter((t) => t.status === "upcoming").length,
    completed: terms.filter((t) => t.status === "completed").length,
  }), [terms]);

  return (
    <>
      <section className="grid grid-4 mb-6">
        <StatCard icon="calendar" label="Total terms"  value={counts.total}     foot="All academic years" />
        <StatCard icon="calendar" label="Active"        value={counts.active}    foot="Currently running" />
        <StatCard icon="calendar" label="Upcoming"      value={counts.upcoming}  foot="Not yet started" />
        <StatCard icon="calendar" label="Completed"     value={counts.completed} foot="Past terms" />
      </section>

      <div className="banner banner-info mb-5">
        <Icon className="banner-icon" name="alert" />
        <div>
          <div className="banner-title">Term editing is not available yet</div>
          <div>
            Terms are managed outside this portal until a backend term-management callable lands. The list below is read-only.
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h3>Academic terms</h3>
            <div className="card-sub">Sorted by year and term number, newest first.</div>
          </div>
          <Button disabled variant="secondary">Add term</Button>
        </div>
        <div className="card-body flush">
          {busy ? <div className="route-inline-state">Loading terms…</div> : null}
          {error ? (
            <div className="banner banner-danger">
              <div><div className="banner-title">Could not load terms</div><div>{error}</div></div>
            </div>
          ) : null}
          {!busy && !error ? (
            terms.length === 0 ? (
              <EmptyState icon="calendar" title="No terms" />
            ) : (
              <Table
                columns={[
                  {
                    key: "term",
                    header: "Term",
                    render: (t) => (
                      <div className="row-meta">
                        <span className="primary">{termLabel(t)}</span>
                        <span className="secondary text-mono">{t.id}</span>
                      </div>
                    ),
                  },
                  { key: "weeks",  header: "Weeks",  render: (t) => t.weeksNum ?? "—" },
                  { key: "start",  header: "Starts", render: (t) => formatDate(t.startDateIso) },
                  { key: "end",    header: "Ends",   render: (t) => formatDate(t.endDateIso) },
                  { key: "status", header: "Status", render: (t) => <Badge tone={termTone(t.status)} dot>{t.status || "unknown"}</Badge> },
                ]}
                getRowKey={(t) => t.id}
                rows={terms}
              />
            )
          ) : null}
        </div>
      </div>
    </>
  );
}

// ── Audit log tab ───────────────────────────────────────────────────────────

const AUDIT_LIMITS = [50, 100, 200];

function AuditTab() {
  const [logs,        setLogs]        = useState([]);
  const [busy,        setBusy]        = useState(true);
  const [error,       setError]       = useState("");
  const [limit,       setLimit]       = useState(50);
  const [actionFilter, setActionFilter] = useState("all");
  const [search,      setSearch]      = useState("");
  const [loadKey,     setLoadKey]     = useState(0);
  const [expanded,    setExpanded]    = useState(null); // id of expanded row

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError("");
    listRecentAuditLogs(limit).then((rows) => { if (!cancelled) setLogs(rows); })
      .catch((e) => { if (!cancelled) setError(e?.message || "Failed to load audit log."); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [limit, loadKey]);

  const actionOptions = useMemo(() => {
    const set = new Set();
    logs.forEach((row) => { if (row.action) set.add(row.action); });
    return [...set].sort();
  }, [logs]);

  const visible = useMemo(() => {
    let rows = logs;
    if (actionFilter !== "all") rows = rows.filter((r) => r.action === actionFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((row) => [
        row.action, row.targetType, row.targetId, row.actorEmail, row.actorUid, row.requestId,
      ].some((v) => String(v || "").toLowerCase().includes(q)));
    }
    return rows;
  }, [actionFilter, logs, search]);

  return (
    <>
      <section className="grid grid-3 mb-6">
        <StatCard icon="list"   label="Entries loaded" value={logs.length}              foot={`Limit: ${limit}`} />
        <StatCard icon="people" label="Unique actors"  value={new Set(logs.map((l) => l.actorUid)).size} foot="Distinct admins" />
        <StatCard icon="alert"  label="Unique actions" value={actionOptions.length}     foot="Distinct action types" />
      </section>

      <div className="filter-bar">
        <div className="field-search grow">
          <Icon className="search-icon" name="search" size={16} />
          <input
            className="input"
            placeholder="Search by action, target, or actor"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="select" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
          <option value="all">All actions</option>
          {actionOptions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select className="select" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
          {AUDIT_LIMITS.map((n) => <option key={n} value={n}>Last {n}</option>)}
        </select>
        <Button disabled={busy} onClick={() => setLoadKey((k) => k + 1)} variant="secondary">Refresh</Button>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h3>Audit log</h3>
            <div className="card-sub">Reads from <span className="text-mono">adminAuditLogs</span> ordered by createdAt desc. Click a row to expand the before/after snapshot.</div>
          </div>
          <Badge tone="brand" dot>Live data</Badge>
        </div>
        <div className="card-body flush">
          {busy ? <div className="route-inline-state">Loading audit log…</div> : null}
          {error ? (
            <div className="banner banner-danger">
              <div><div className="banner-title">Could not load audit log</div><div>{error}</div></div>
            </div>
          ) : null}
          {!busy && !error ? (
            visible.length === 0 ? (
              <EmptyState icon="list" title="No audit entries">
                {logs.length === 0 ? "No audit logs have been written yet." : "No entries match the current filters."}
              </EmptyState>
            ) : (
              <div className="audit-list">
                {visible.map((row) => {
                  const isExpanded = expanded === row.id;
                  return (
                    <div className={`audit-row${isExpanded ? " expanded" : ""}`} key={row.id}>
                      <button
                        className="audit-row-summary"
                        onClick={() => setExpanded(isExpanded ? null : row.id)}
                        type="button"
                      >
                        <span className="audit-when">{formatDateTime(row.createdAtIso)}</span>
                        <span className="audit-action text-mono">{row.action}</span>
                        <span className="audit-target">
                          <span className="text-mono">{row.targetType}</span>
                          <span className="muted"> · </span>
                          <span className="text-mono">{row.targetId}</span>
                        </span>
                        <span className="audit-actor">{row.actorEmail || row.actorUid}</span>
                        <Icon name={isExpanded ? "chevron-up" : "chevron-down"} size={14} />
                      </button>
                      {isExpanded ? (
                        <div className="audit-row-body">
                          <div className="grid grid-2" style={{ gap: "var(--s-4)" }}>
                            <div>
                              <div className="text-xs muted" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Before</div>
                              <pre className="audit-json">{row.before ? JSON.stringify(row.before, null, 2) : "(no snapshot)"}</pre>
                            </div>
                            <div>
                              <div className="text-xs muted" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>After</div>
                              <pre className="audit-json">{row.after ? JSON.stringify(row.after, null, 2) : "(no snapshot)"}</pre>
                            </div>
                          </div>
                          {row.payloadSummary ? (
                            <div className="mt-3">
                              <div className="text-xs muted" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Payload summary</div>
                              <pre className="audit-json">{JSON.stringify(row.payloadSummary, null, 2)}</pre>
                            </div>
                          ) : null}
                          <div className="row gap-4 mt-3 text-xs muted">
                            <span><strong>actor uid:</strong> <span className="text-mono">{row.actorUid}</span></span>
                            {row.requestId ? <span><strong>request:</strong> <span className="text-mono">{row.requestId}</span></span> : null}
                            <span><strong>doc id:</strong> <span className="text-mono">{row.id}</span></span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )
          ) : null}
        </div>
      </div>
    </>
  );
}

// ── Maintenance tab ─────────────────────────────────────────────────────────

function MaintenanceTab() {
  return (
    <>
      <div className="banner banner-info mb-5">
        <Icon className="banner-icon" name="alert" />
        <div>
          <div className="banner-title">No portal maintenance shortcuts yet</div>
          <div>
            One-off backfills and migrations live in <span className="text-mono">backend/functions/scripts/</span> and are run from the CLI. A maintenance shortcut will only appear here when a dedicated admin callable exists and the action is safe to run from the portal.
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Available CLI scripts</h3>
          <div className="card-sub">Run from a developer machine with credentials set up.</div>
        </div>
        <div className="card-body">
          <div className="col gap-3">
            <div className="row gap-3" style={{ padding: "10px 14px", background: "var(--ink-50)", borderRadius: "var(--r-md)" }}>
              <Icon name="alert" size={16} />
              <div className="grow">
                <div style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>Attendance date backfill</div>
                <div className="text-xs muted text-mono">backend/functions/scripts/backfillArchived.js</div>
              </div>
              <span className="muted text-sm">CLI only</span>
            </div>
            <div className="row gap-3" style={{ padding: "10px 14px", background: "var(--ink-50)", borderRadius: "var(--r-md)" }}>
              <Icon name="alert" size={16} />
              <div className="grow">
                <div style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>Old invoice purge dry-run</div>
                <div className="text-xs muted text-mono">backend/functions/scripts/dryRunPurgeOldInvoices.js</div>
              </div>
              <span className="muted text-sm">CLI only</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Page shell ──────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [tab, setTab] = useState("overview");

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Project configuration, terms, audit log, and maintenance pointers."
        crumbs={[{ label: "Overview", href: "/" }, { label: "Settings" }]}
      />

      <div className="tabs">
        {TABS.map((t) => (
          <button
            className={`tab ${tab === t.key ? "active" : ""}`}
            key={t.key}
            onClick={() => setTab(t.key)}
            type="button"
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview"    ? <OverviewTab />    : null}
      {tab === "terms"       ? <TermsTab />       : null}
      {tab === "audit"       ? <AuditTab />       : null}
      {tab === "maintenance" ? <MaintenanceTab /> : null}
    </>
  );
}
