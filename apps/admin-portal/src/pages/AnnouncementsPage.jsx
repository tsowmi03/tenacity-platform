import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getCachedAnnouncements,
  getCachedUsers,
  loadAnnouncementReportingOverview,
} from "../backend/announcementReportingCache";
import Badge from "../components/Badge";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import Table from "../components/Table";
import {
  ANNOUNCEMENT_AUDIENCES,
  announcementAudienceLabel,
  buildAnnouncementReadership,
} from "./announcementReadership";

const REPORTING_TIME_ZONE = "Australia/Sydney";

function formatDateTime(iso) {
  if (!iso) return "Date not recorded";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Date not recorded";
  return date.toLocaleString("en-AU", {
    timeZone: REPORTING_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function bodyPreview(body) {
  const compact = String(body || "").replace(/\s+/g, " ").trim();
  if (!compact) return "No announcement text";
  return compact.length > 110 ? `${compact.slice(0, 107)}...` : compact;
}

export default function AnnouncementsPage() {
  const navigate = useNavigate();
  const [announcements, setAnnouncements] = useState(() => getCachedAnnouncements() ?? null);
  const [users, setUsers] = useState(() => getCachedUsers() ?? null);
  const [busy, setBusy] = useState(() => announcements === null || users === null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [audienceFilter, setAudienceFilter] = useState("all-audiences");
  const [statusFilter, setStatusFilter] = useState("published");
  const [loadKey, setLoadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError("");

    loadAnnouncementReportingOverview({ force: loadKey > 0 })
      .then(([announcementRows, userRows]) => {
        if (cancelled) return;
        setAnnouncements(announcementRows);
        setUsers(userRows);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError?.message || "Failed to load announcement reporting data.");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loadKey]);

  const rows = useMemo(() => (announcements ?? []).map((announcement) => ({
    ...announcement,
    readership: buildAnnouncementReadership(announcement, users ?? []),
  })), [announcements, users]);

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((announcement) => {
      if (audienceFilter !== "all-audiences" && announcement.audience !== audienceFilter) return false;
      if (statusFilter === "published" && announcement.archived) return false;
      if (statusFilter === "archived" && !announcement.archived) return false;
      if (!query) return true;
      return [announcement.title, announcement.body, announcementAudienceLabel(announcement.audience)]
        .some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [audienceFilter, rows, search, statusFilter]);

  const stats = useMemo(() => ({
    total: rows.length,
    published: rows.filter((row) => !row.archived).length,
    archived: rows.filter((row) => row.archived).length,
    openings: rows.reduce((sum, row) => sum + row.readership.opened.length, 0),
  }), [rows]);

  const columns = [
    {
      key: "announcement",
      header: "Announcement",
      render: (row) => (
        <div className="row-meta announcement-row-title">
          <span className="primary">{row.title || "Untitled announcement"}</span>
          <span className="secondary">{bodyPreview(row.body)}</span>
        </div>
      ),
    },
    {
      key: "audience",
      header: "Audience",
      render: (row) => <Badge tone="brand">{announcementAudienceLabel(row.audience)}</Badge>,
    },
    {
      key: "published",
      header: "Published",
      render: (row) => <span className="cell-muted">{formatDateTime(row.createdAtIso)}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge dot tone={row.archived ? "neutral" : "success"}>
          {row.archived ? "Archived" : "Published"}
        </Badge>
      ),
    },
    {
      key: "opened",
      header: "Opened",
      render: (row) => (
        <div className="announcement-opening-count">
          <span className="cell-strong num">{row.readership.opened.length} opened</span>
          <span className="cell-muted">{row.readership.eligible.length} current users</span>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Announcements"
        subtitle="See which current users have opened mobile app announcements."
        crumbs={[{ label: "Overview", href: "/" }, { label: "Announcements" }]}
        actions={(
          <Button disabled={busy} icon="refresh" onClick={() => setLoadKey((key) => key + 1)}>
            Refresh
          </Button>
        )}
      />

      <div className="banner banner-info mb-5">
        <Icon className="banner-icon" name="info" />
        <div>
          <div className="banner-title">How opening data is calculated</div>
          <div>
            Opened means the user opened the announcement detail in the mobile app. Audience totals use current user accounts, and opening times are not recorded.
          </div>
        </div>
      </div>

      <section className="grid grid-4 mb-6">
        <StatCard icon="bell" label="Announcements" value={stats.total} foot="Published and archived" />
        <StatCard icon="send" label="Published" value={stats.published} foot="Visible to their audience" />
        <StatCard icon="file-text" label="Archived" value={stats.archived} foot="Retained for reporting" />
        <StatCard icon="eye" label="Opening records" value={stats.openings} foot="Across current users" />
      </section>

      <div className="filter-bar">
        <div className="field-search grow">
          <Icon className="search-icon" name="search" size={16} />
          <input
            aria-label="Search announcements"
            className="input"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search announcements"
            value={search}
          />
        </div>
        <select
          aria-label="Filter by audience"
          className="select"
          onChange={(event) => setAudienceFilter(event.target.value)}
          value={audienceFilter}
        >
          <option value="all-audiences">All audiences</option>
          {ANNOUNCEMENT_AUDIENCES.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select
          aria-label="Filter by announcement status"
          className="select"
          onChange={(event) => setStatusFilter(event.target.value)}
          value={statusFilter}
        >
          <option value="all-statuses">All statuses</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {error ? (
        <div className="banner banner-danger mb-5">
          <Icon className="banner-icon" name="alert" />
          <div>
            <div className="banner-title">Announcements could not be loaded</div>
            <div>{error}</div>
          </div>
          <Button onClick={() => setLoadKey((key) => key + 1)} size="sm">Try again</Button>
        </div>
      ) : null}

      <section className="card">
        <div className="card-head">
          <div>
            <h3>Announcement history</h3>
            <div className="card-sub">{visibleRows.length} result{visibleRows.length === 1 ? "" : "s"}</div>
          </div>
        </div>
        <div className="card-body flush">
          {busy && (announcements === null || users === null) ? (
            <div className="route-state">Loading announcements...</div>
          ) : visibleRows.length ? (
            <Table
              columns={columns}
              getRowKey={(row) => row.id}
              onRowClick={(row) => navigate(`/announcements/${row.id}`)}
              rows={visibleRows}
            />
          ) : (
            <EmptyState icon="bell" title={error ? "No announcement data available" : "No matching announcements"}>
              {error ? "Retry when the connection is available." : "Change the search or filters to see other announcements."}
            </EmptyState>
          )}
        </div>
      </section>
    </>
  );
}
