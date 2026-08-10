import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listWeeklyUpdates } from "../backend/weeklyUpdateApi";
import Badge from "../components/Badge";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import Table from "../components/Table";
import { statusLabel, statusTone } from "./weeklyUpdateDigest";

const REPORTING_TIME_ZONE = "Australia/Sydney";

function formatDateTime(iso) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-AU", {
    timeZone: REPORTING_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function deliveryCell(row) {
  if (row.status !== "sent" && row.status !== "failed") return "-";
  const delivered = row.successCount || 0;
  const failed = row.failureCount || 0;
  return failed ? `${delivered} delivered, ${failed} failed` : `${delivered} delivered`;
}

export default function WeeklyUpdatesPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [loadKey, setLoadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError("");

    listWeeklyUpdates()
      .then((updates) => {
        if (!cancelled) setRows(updates);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(
            loadError?.userMessage || loadError?.message || "Failed to load weekly updates."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loadKey]);

  const columns = [
    {
      key: "subject",
      header: "Subject",
      render: (row) => row.subject || "Untitled update",
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge>,
    },
    {
      key: "recipientCount",
      header: "Recipients",
      render: (row) => (row.recipientCount == null ? "-" : row.recipientCount),
    },
    { key: "delivery", header: "Delivery", render: deliveryCell },
    { key: "sentAt", header: "Sent", render: (row) => formatDateTime(row.sentAtIso) },
    {
      key: "updatedAt",
      header: "Last edited",
      render: (row) => formatDateTime(row.updatedAtIso),
    },
  ];

  return (
    <>
      <PageHeader
        title="Weekly update"
        subtitle="Email parents a digest of this week's announcements, plus anything else worth saying."
        actions={
          <>
            <Button icon="refresh" onClick={() => setLoadKey((key) => key + 1)} loading={busy}>
              Refresh
            </Button>
            <Button variant="primary" icon="plus" onClick={() => navigate("/weekly-update/new")}>
              New weekly update
            </Button>
          </>
        }
      />

      {error ? (
        <div className="banner banner-danger mb-5">
          <Icon className="banner-icon" name="alert" />
          <div>
            <div className="banner-title">Weekly updates could not be loaded</div>
            <div>{error}</div>
          </div>
          <Button onClick={() => setLoadKey((key) => key + 1)} size="sm">
            Try again
          </Button>
        </div>
      ) : null}

      <section className="card">
        <div className="card-head">
          <div>
            <h3>Weekly updates</h3>
            <div className="card-sub">
              {rows ? `${rows.length} update${rows.length === 1 ? "" : "s"}` : "Loading"}
            </div>
          </div>
        </div>
        <div className="card-body flush">
          {busy && rows === null ? (
            <div className="route-state">Loading weekly updates...</div>
          ) : rows && rows.length ? (
            <Table
              columns={columns}
              getRowKey={(row) => row.id}
              onRowClick={(row) => navigate(`/weekly-update/${row.id}`)}
              rows={rows}
            />
          ) : (
            <EmptyState
              icon="send"
              title={error ? "No weekly update data available" : "No weekly updates yet"}
            >
              {error
                ? "Retry when the connection is available."
                : "Create one to send this week's announcements to parents by email."}
            </EmptyState>
          )}
        </div>
      </section>
    </>
  );
}
