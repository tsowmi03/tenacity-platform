import React, { useEffect, useMemo, useState } from "react";
import { listRecentAuditLogs } from "../backend/auditApi";
import { getDocument } from "../backend/firestoreReads";
import { normalizeClass, normalizeEnrolment, normalizeInvoice, normalizeStudent, normalizeTerm, normalizeWaitlistEntry } from "../backend/schemas";
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
    .replace(/\./g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function actorLabel(row) {
  return row.actorEmail || row.actorUid || "Unknown user";
}

function displayName(data, fallback = "") {
  if (!data || typeof data !== "object") return fallback;
  const fullName = [data.firstName, data.lastName]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
  return fullName || data.displayName || data.name || data.email || fallback;
}

function roleLabel(role) {
  if (!role) return "Unknown role";
  return String(role).replace(/^./, (char) => char.toUpperCase());
}

function targetLabel(row) {
  if (row.targetName && row.targetType) return `${row.targetName} · ${row.targetType}`;
  if (row.targetName) return row.targetName;
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

function signedNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return n > 0 ? `+${n}` : String(n);
}

function targetSubject(row) {
  return row.targetName || row.targetId || "Target";
}

function auditSummary(row) {
  const payload = row.payloadSummary || {};
  if (row.action === "user.adjust_lesson_tokens") {
    const before = row.before?.lessonTokens;
    const after = row.after?.lessonTokens;
    const delta = signedNumber(payload.value);
    const reason = payload.reason ? ` Reason: ${payload.reason}.` : " No reason recorded.";
    if (before !== undefined && after !== undefined) {
      return `Adjusted lesson tokens for ${targetSubject(row)} from ${before} to ${after}${delta ? ` (${delta})` : ""}.${reason}`;
    }
    return `Adjusted lesson tokens for ${targetSubject(row)}.${reason}`;
  }

  if (row.action === "enrolment.accept") {
    const classCount = Array.isArray(payload.classIds) ? payload.classIds.length : 0;
    const authPart = payload.authUserCreated ? " Auth account created." : "";
    return `Accepted enrolment for ${targetSubject(row)}. Enrolled into ${classCount} class${classCount === 1 ? "" : "es"}.${authPart}`;
  }

  if (row.action === "enrolment.archive") {
    const reason = payload.reason ? ` Reason: ${payload.reason}.` : "";
    return `Archived enrolment for ${targetSubject(row)}.${reason}`;
  }

  if (row.action === "enrolment.unarchive") {
    return `Unarchived enrolment for ${targetSubject(row)}.`;
  }

  if (row.action === "enrolment.delete") {
    const reason = payload.reason ? ` Reason: ${payload.reason}.` : "";
    return `Deleted enrolment for ${targetSubject(row)}.${reason}`;
  }

  if (row.action === "enrolment.purge") {
    const reason = payload.reason ? ` Reason: ${payload.reason}.` : "";
    return `Permanently purged enrolment for ${targetSubject(row)}.${reason}`;
  }

  if (Array.isArray(payload.fields)) {
    return `Updated ${payload.fields.join(", ") || "fields"} on ${targetSubject(row)}.`;
  }

  if (row.action === "report.generate") {
    return `Generated ${targetSubject(row)}${payload.rowCount !== undefined ? ` with ${payload.rowCount} rows` : ""}.`;
  }

  if (row.action === "report.export") {
    return `Exported ${targetSubject(row)}${payload.format ? ` as ${String(payload.format).toUpperCase()}` : ""}${payload.rowCount !== undefined ? ` with ${payload.rowCount} rows` : ""}.`;
  }

  const keys = objectKeys(payload);
  return keys.length ? `Recorded ${keys.join(", ")} for ${targetSubject(row)}.` : "";
}

function readableSnapshot(row, value) {
  if (row.action === "user.adjust_lesson_tokens" && value?.lessonTokens !== undefined) {
    return `Lesson tokens: ${value.lessonTokens}`;
  }
  return jsonBlock(value, "(no snapshot)");
}

const TARGET_CONFIG = {
  user: {
    collection: "users",
    getName: (doc) => displayName(doc, null),
  },
  student: {
    collection: "students",
    normalize: normalizeStudent,
    getName: (doc) => doc.displayName || null,
  },
  enrolment: {
    collection: "enrolments",
    normalize: normalizeEnrolment,
    getName: (doc) => doc.studentName || null,
  },
  class: {
    collection: "classes",
    normalize: normalizeClass,
    getName: (doc) => doc.type || doc.name || null,
  },
  invoice: {
    collection: "invoices",
    normalize: normalizeInvoice,
    getName: (doc) => (doc.invoiceNumber ? `Invoice #${doc.invoiceNumber}` : null),
  },
  term: {
    collection: "terms",
    normalize: normalizeTerm,
    getName: (doc) => (doc.year && doc.termNum != null ? `${doc.year} Term ${doc.termNum}` : null),
  },
  waitlistEntry: {
    collection: "waitlistEntries",
    normalize: normalizeWaitlistEntry,
    getName: (doc) => [doc.firstName, doc.lastName].filter(Boolean).join(" ").trim() || doc.studentName || null,
  },
};

async function enrichAuditRows(rows) {
  const byType = new Map();
  rows.forEach((row) => {
    if (row.actorUid) {
      if (!byType.has("user")) byType.set("user", new Set());
      byType.get("user").add(row.actorUid);
    }
    if (row.targetType && row.targetId) {
      if (!byType.has(row.targetType)) byType.set(row.targetType, new Set());
      byType.get(row.targetType).add(row.targetId);
    }
  });

  if (byType.size === 0) return rows;

  const fetched = new Map();
  await Promise.all(
    [...byType.entries()].flatMap(([type, ids]) => {
      const config = TARGET_CONFIG[type];
      if (!config) return [];
      return [...ids].map(async (id) => {
        try {
          const doc = await getDocument(config.collection, id, config.normalize ? { normalize: config.normalize } : undefined);
          fetched.set(`${type}/${id}`, doc);
        } catch {
          fetched.set(`${type}/${id}`, null);
        }
      });
    }),
  );

  return rows.map((row) => {
    const actorDoc = row.actorUid ? fetched.get(`user/${row.actorUid}`) : null;
    let targetName = row.targetName;
    if (!targetName && row.targetType && row.targetId) {
      const config = TARGET_CONFIG[row.targetType];
      const doc = fetched.get(`${row.targetType}/${row.targetId}`);
      if (config && doc) targetName = config.getName(doc) || null;
    }
    return {
      ...row,
      actorRole: row.actorRole || actorDoc?.role || null,
      targetName: targetName || row.targetName,
    };
  });
}

export default function AuditPage() {
  const [logs, setLogs] = useState([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [limit, setLimit] = useState(50);
  const [actionFilter, setActionFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [targetFilter, setTargetFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loadKey, setLoadKey] = useState(0);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError("");
    listRecentAuditLogs(limit)
      .then((rows) => enrichAuditRows(rows))
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

  const roleOptions = useMemo(() => {
    const options = new Set();
    logs.forEach((row) => {
      if (row.actorRole) options.add(row.actorRole);
    });
    return [...options].sort();
  }, [logs]);

  const visible = useMemo(() => {
    let rows = logs;
    if (actionFilter !== "all") rows = rows.filter((row) => row.action === actionFilter);
    if (roleFilter !== "all") rows = rows.filter((row) => row.actorRole === roleFilter);
    if (targetFilter !== "all") rows = rows.filter((row) => row.targetType === targetFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((row) => [
        row.action,
        actionLabel(row.action),
        row.targetType,
        row.targetId,
        row.targetName,
        row.actorEmail,
        row.actorUid,
        row.actorRole,
        row.requestId,
      ].some((value) => String(value || "").toLowerCase().includes(q)));
    }
    return rows;
  }, [actionFilter, logs, roleFilter, search, targetFilter]);

  const stats = useMemo(() => {
    const actors = new Set(logs.map((row) => row.actorEmail || row.actorUid).filter(Boolean));
    return {
      loaded: logs.length,
      actors: actors.size,
      actions: actionOptions.length,
      roles: roleOptions.length,
    };
  }, [actionOptions.length, logs, roleOptions.length]);

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
        <StatCard icon="people" label="Roles" value={stats.roles} foot="Distinct actor roles" />
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
        <select aria-label="Filter by user role" className="select" onChange={(event) => setRoleFilter(event.target.value)} value={roleFilter}>
          <option value="all">All roles</option>
          {roleOptions.map((role) => (
            <option key={role} value={role}>{roleLabel(role)}</option>
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
                const summary = auditSummary(row);
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
                            <strong>{actorLabel(row)} · {roleLabel(row.actorRole)}</strong>
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

                        {summary ? (
                          <div className="audit-summary-strip">
                            <span>{summary}</span>
                          </div>
                        ) : null}

                        <div className="grid grid-2" style={{ gap: "var(--s-4)" }}>
                          <div>
                            <div className="audit-json-label">Before</div>
                            <pre className="audit-json">{readableSnapshot(row, row.before)}</pre>
                          </div>
                          <div>
                            <div className="audit-json-label">After</div>
                            <pre className="audit-json">{readableSnapshot(row, row.after)}</pre>
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
                          {row.actorRole ? <span><strong>role:</strong> <span className="text-mono">{row.actorRole}</span></span> : null}
                          {row.targetId ? <span><strong>target id:</strong> <span className="text-mono">{row.targetId}</span></span> : null}
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
