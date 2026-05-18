import React, { useEffect, useMemo, useState } from "react";
import { listRecentAuditLogs } from "../backend/auditApi";
import Badge from "../components/Badge";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";

const AUDIT_LIMITS = [50, 100, 200];

function formatDateTime(iso) {
  if (!iso) return "Unknown time";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString();
}

function formatRelativeTime(iso) {
  if (!iso) return "No timestamp";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "No timestamp";
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(diffMs / 60000);
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

function actionLabel(action) {
  if (!action) return "Unknown action";
  return String(action)
    .replace(/^admin/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function actorLabel(row) {
  return row.actorEmail || row.actorUid || "Unknown user";
}

function targetLabel(row) {
  if (!row.targetType && !row.targetId) return "No target";
  if (!row.targetId) return row.targetType;
  if (!row.targetType) return row.targetId;
  return `${row.targetType} · ${row.targetId}`;
}

function jsonBlock(value, emptyLabel) {
  if (value === undefined || value === null) return emptyLabel;
  return JSON.stringify(value, null, 2);
}

function objectKeys(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.keys(value);
}

export default function AuditPage() {
  const [logs, setLogs] = useState([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [limit, setLimit] = useState(50);
  const [actionFilter, setActionFilter] = useState("all");
  const [targetFilter, setTargetFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loadKey, setLoadKey] = useState(0);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError("");
    listRecentAuditLogs(limit)
      .then((rows) => {
        if (!cancelled) setLogs(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || "Failed to load audit entries.");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [limit, loadKey]);

  const actionOptions = useMemo(() => {
    const options = new Set();
    logs.forEach((row) => {
      if (row.action) options.add(row.action);
    });
    return [...options].sort();
  }, [logs]);

  const targetOptions = useMemo(() => {
    const options = new Set();
    logs.forEach((row) => {
      if (row.targetType) options.add(row.targetType);
    });
    return [...options].sort();
  }, [logs]);

  const visible = useMemo(() => {
    let rows = logs;
    if (actionFilter !== "all") rows = rows.filter((row) => row.action === actionFilter);
    if (targetFilter !== "all") rows = rows.filter((row) => row.targetType === targetFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((row) => [
        row.action,
        actionLabel(row.action),
        row.targetType,
        row.targetId,
        row.actorEmail,
        row.actorUid,
        row.requestId,
      ].some((value) => String(value || "").toLowerCase().includes(q)));
    }
    return rows;
  }, [actionFilter, logs, search, targetFilter]);

  const stats = useMemo(() => {
    const actors = new Set(logs.map((row) => row.actorEmail || row.actorUid).filter(Boolean));
    return {
      loaded: logs.length,
      actors: actors.size,
      actions: actionOptions.length,
      targets: targetOptions.length,
    };
  }, [actionOptions.length, logs, targetOptions.length]);

  return (
    <>
      <PageHeader
        title="Audit"
        subtitle="Recent recorded admin actions from Firestore."
        crumbs={[{ label: "Overview", href: "/" }, { label: "Audit" }]}
        actions={<Button disabled={busy} onClick={() => setLoadKey((key) => key + 1)} variant="secondary">Refresh</Button>}
      />

      <section className="grid grid-4 mb-6">
        <StatCard icon="list" label="Entries loaded" value={stats.loaded} foot={`Last ${limit}`} />
        <StatCard icon="people" label="Actors" value={stats.actors} foot="Recorded users" />
        <StatCard icon="settings" label="Actions" value={stats.actions} foot="Distinct action types" />
        <StatCard icon="classes" label="Targets" value={stats.targets} foot="Distinct target types" />
      </section>

      <div className="filter-bar">
        <div className="field-search grow">
          <Icon className="search-icon" name="search" size={16} />
          <input
            className="input"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by action, user, target, or request"
            value={search}
          />
        </div>
        <select aria-label="Filter by action" className="select" onChange={(event) => setActionFilter(event.target.value)} value={actionFilter}>
          <option value="all">All actions</option>
          {actionOptions.map((action) => (
            <option key={action} value={action}>{actionLabel(action)}</option>
          ))}
        </select>
        <select aria-label="Filter by target" className="select" onChange={(event) => setTargetFilter(event.target.value)} value={targetFilter}>
          <option value="all">All targets</option>
          {targetOptions.map((target) => (
            <option key={target} value={target}>{target}</option>
          ))}
        </select>
        <select aria-label="Audit row limit" className="select" onChange={(event) => setLimit(Number(event.target.value))} value={limit}>
          {AUDIT_LIMITS.map((count) => (
            <option key={count} value={count}>Last {count}</option>
          ))}
        </select>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h3>Recorded actions</h3>
            <div className="card-sub">Click an entry to inspect before/after snapshots and payload details.</div>
          </div>
          <Badge tone="brand" dot>adminAuditLogs</Badge>
        </div>
        <div className="card-body flush">
          {busy ? <div className="route-inline-state">Loading audit entries...</div> : null}
          {error ? (
            <div className="banner banner-danger">
              <div>
                <div className="banner-title">Could not load audit entries</div>
                <div>{error}</div>
              </div>
            </div>
          ) : null}
          {!busy && !error && visible.length === 0 ? (
            <EmptyState icon="list" title="No audit entries">
              {logs.length === 0 ? "Recorded admin actions will appear here once they are written." : "No entries match the current filters."}
            </EmptyState>
          ) : null}
          {!busy && !error && visible.length > 0 ? (
            <div className="audit-list">
              {visible.map((row) => {
                const isExpanded = expanded === row.id;
                const fields = objectKeys(row.payloadSummary?.fields ? null : row.payloadSummary);
                return (
                  <div className={`audit-row${isExpanded ? " expanded" : ""}`} key={row.id}>
                    <button
                      className="audit-row-summary"
                      onClick={() => setExpanded(isExpanded ? null : row.id)}
                      type="button"
                    >
                      <span className="audit-when">
                        <time dateTime={row.createdAtIso || undefined}>{formatDateTime(row.createdAtIso)}</time>
                        <span>{formatRelativeTime(row.createdAtIso)}</span>
                      </span>
                      <span className="audit-action">
                        <span>{actionLabel(row.action)}</span>
                        <span className="text-mono">{row.action || "unknown"}</span>
                      </span>
                      <span className="audit-target">{targetLabel(row)}</span>
                      <span className="audit-actor">{actorLabel(row)}</span>
                      <Icon name={isExpanded ? "chevron-up" : "chevron-down"} size={14} />
                    </button>
                    {isExpanded ? (
                      <div className="audit-row-body">
                        <div className="audit-detail-grid">
                          <div className="audit-detail-item">
                            <span>Action</span>
                            <strong>{actionLabel(row.action)}</strong>
                          </div>
                          <div className="audit-detail-item">
                            <span>User</span>
                            <strong>{actorLabel(row)}</strong>
                          </div>
                          <div className="audit-detail-item">
                            <span>Target</span>
                            <strong>{targetLabel(row)}</strong>
                          </div>
                          <div className="audit-detail-item">
                            <span>Time</span>
                            <strong>{formatDateTime(row.createdAtIso)}</strong>
                          </div>
                        </div>

                        {row.payloadSummary ? (
                          <div className="audit-summary-strip">
                            {Array.isArray(row.payloadSummary.fields) ? (
                              <span>Fields: {row.payloadSummary.fields.join(", ") || "none"}</span>
                            ) : fields.length ? (
                              <span>Payload: {fields.join(", ")}</span>
                            ) : (
                              <span>Payload summary recorded</span>
                            )}
                          </div>
                        ) : null}

                        <div className="grid grid-2" style={{ gap: "var(--s-4)" }}>
                          <div>
                            <div className="audit-json-label">Before</div>
                            <pre className="audit-json">{jsonBlock(row.before, "(no before snapshot)")}</pre>
                          </div>
                          <div>
                            <div className="audit-json-label">After</div>
                            <pre className="audit-json">{jsonBlock(row.after, "(no after snapshot)")}</pre>
                          </div>
                        </div>

                        {row.payloadSummary ? (
                          <div className="mt-3">
                            <div className="audit-json-label">Payload summary</div>
                            <pre className="audit-json">{jsonBlock(row.payloadSummary, "(no payload summary)")}</pre>
                          </div>
                        ) : null}

                        <div className="row gap-4 mt-3 text-xs muted">
                          {row.actorUid ? <span><strong>actor uid:</strong> <span className="text-mono">{row.actorUid}</span></span> : null}
                          {row.requestId ? <span><strong>request:</strong> <span className="text-mono">{row.requestId}</span></span> : null}
                          <span><strong>audit doc:</strong> <span className="text-mono">{row.id}</span></span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
