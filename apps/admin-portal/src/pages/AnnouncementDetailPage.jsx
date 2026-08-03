import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getCachedAnnouncement,
  getCachedUsers,
  loadCachedAnnouncement,
  loadCachedUsers,
} from "../backend/announcementReportingCache";
import Badge from "../components/Badge";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import Table from "../components/Table";
import {
  announcementAudienceLabel,
  buildAnnouncementReadership,
  userDisplayName,
  userKind,
} from "./announcementReadership";

const REPORTING_TIME_ZONE = "Australia/Sydney";

function formatDateTime(iso) {
  if (!iso) return "Date not recorded";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Date not recorded";
  return date.toLocaleString("en-AU", {
    timeZone: REPORTING_TIME_ZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function roleLabel(role) {
  if (role === "parent") return "Parent";
  if (role === "tutor") return "Tutor";
  if (role === "admin") return "Admin";
  return "Unknown";
}

export default function AnnouncementDetailPage() {
  const { announcementId } = useParams();
  const navigate = useNavigate();
  const initialAnnouncement = getCachedAnnouncement(announcementId);
  const initialUsers = getCachedUsers();
  const [announcement, setAnnouncement] = useState(() => initialAnnouncement ?? null);
  const [users, setUsers] = useState(() => initialUsers ?? null);
  const [busy, setBusy] = useState(() => initialAnnouncement === undefined || initialUsers === undefined);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(() => initialAnnouncement === null);
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [loadKey, setLoadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError("");
    setNotFound(false);

    Promise.all([
      loadCachedAnnouncement(announcementId, { force: loadKey > 0 }),
      loadCachedUsers({ force: loadKey > 0 }),
    ])
      .then(([announcementRow, userRows]) => {
        if (cancelled) return;
        setAnnouncement(announcementRow);
        setUsers(userRows);
        setNotFound(!announcementRow);
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
  }, [announcementId, loadKey]);

  const readership = useMemo(
    () => buildAnnouncementReadership(announcement, users ?? []),
    [announcement, users],
  );

  const roles = useMemo(
    () => [...new Set(readership.eligible.map((user) => String(user.role || "").toLowerCase()))].sort(),
    [readership.eligible],
  );

  const visibleUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return readership.eligible.filter((user) => {
      if (tab === "opened" && !user.opened) return false;
      if (tab === "not-opened" && user.opened) return false;
      if (roleFilter !== "all" && String(user.role || "").toLowerCase() !== roleFilter) return false;
      if (!query) return true;
      return [userDisplayName(user), user.email, user.role]
        .some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [readership.eligible, roleFilter, search, tab]);

  if (busy && (!announcement || users === null)) {
    return <div className="route-state">Loading announcement reporting...</div>;
  }

  if (notFound || (!announcement && error)) {
    return (
      <>
        <PageHeader
          title={notFound ? "Announcement not found" : "Announcement unavailable"}
          subtitle={notFound ? "The announcement may have been deleted." : error}
          crumbs={[{ label: "Announcements", href: "/announcements" }, { label: "Detail" }]}
          actions={<Button onClick={() => navigate("/announcements")}>Back to announcements</Button>}
        />
        {error ? (
          <div className="banner banner-danger">
            <Icon className="banner-icon" name="alert" />
            <div><div className="banner-title">Reporting data could not be loaded</div><div>{error}</div></div>
            <Button onClick={() => setLoadKey((key) => key + 1)} size="sm">Try again</Button>
          </div>
        ) : null}
      </>
    );
  }

  if (!announcement) return null;

  const columns = [
    {
      key: "user",
      header: "User",
      render: (user) => (
        <div className="row-meta">
          <span className="primary">{userDisplayName(user)}</span>
          <span className="secondary">{user.email || "No email recorded"}</span>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (user) => <Badge tone="brand">{roleLabel(String(user.role || "").toLowerCase())}</Badge>,
    },
    {
      key: "status",
      header: "Opening status",
      render: (user) => (
        <Badge dot tone={user.opened ? "success" : "neutral"}>
          {user.opened ? "Opened" : "Not opened"}
        </Badge>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={announcement.title || "Untitled announcement"}
        subtitle="Mobile app announcement opening report."
        crumbs={[{ label: "Announcements", href: "/announcements" }, { label: "Detail" }]}
        actions={(
          <Button disabled={busy} icon="refresh" onClick={() => setLoadKey((key) => key + 1)}>
            Refresh
          </Button>
        )}
      />

      {error ? (
        <div className="banner banner-danger mb-5">
          <Icon className="banner-icon" name="alert" />
          <div><div className="banner-title">Refresh failed</div><div>{error}</div></div>
        </div>
      ) : null}

      <section className="announcement-detail-layout mb-6">
        <article className="card announcement-copy-card">
          <div className="card-head">
            <div>
              <div className="announcement-detail-badges">
                <Badge tone="brand">{announcementAudienceLabel(announcement.audience)}</Badge>
                <Badge dot tone={announcement.archived ? "neutral" : "success"}>
                  {announcement.archived ? "Archived" : "Published"}
                </Badge>
              </div>
              <div className="card-sub">Published {formatDateTime(announcement.createdAtIso)}</div>
            </div>
          </div>
          <div className="card-body">
            <div className="announcement-body">{announcement.body || "No announcement text was recorded."}</div>
          </div>
        </article>

        <aside className="grid announcement-detail-stats">
          <StatCard icon="people" label="Current audience" value={readership.eligible.length} foot={announcementAudienceLabel(announcement.audience)} />
          <StatCard icon="eye" label="Opened" value={readership.opened.length} foot="Announcement detail opened" />
          <StatCard icon="clock" label="Not opened" value={readership.notOpened.length} foot="Current eligible users" />
        </aside>
      </section>

      <div className="banner banner-info mb-5">
        <Icon className="banner-icon" name="info" />
        <div>
          <div className="banner-title">Current-account report</div>
          <div>
            This report compares the announcement with current eligible accounts. It cannot show when an announcement was opened or preserve the original audience at publication time.
          </div>
        </div>
      </div>

      <section className="card announcement-readership-card">
        <div className="card-head">
          <div>
            <h3>Audience opening status</h3>
            <div className="card-sub">Select a user to open their People record.</div>
          </div>
        </div>
        <div className="card-body">
          <div className="tabs" role="tablist" aria-label="Opening status">
            {[
              { key: "all", label: "All", count: readership.eligible.length },
              { key: "opened", label: "Opened", count: readership.opened.length },
              { key: "not-opened", label: "Not opened", count: readership.notOpened.length },
            ].map((item) => (
              <button
                aria-label={`${item.label} ${item.count}`}
                aria-selected={tab === item.key}
                className={`tab ${tab === item.key ? "active" : ""}`}
                key={item.key}
                onClick={() => setTab(item.key)}
                role="tab"
                type="button"
              >
                {item.label}<span className="count">{item.count}</span>
              </button>
            ))}
          </div>

          <div className="filter-bar announcement-user-filters">
            <div className="field-search grow">
              <Icon className="search-icon" name="search" size={16} />
              <input
                aria-label="Search audience users"
                className="input"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name or email"
                value={search}
              />
            </div>
            <select
              aria-label="Filter audience by role"
              className="select"
              onChange={(event) => setRoleFilter(event.target.value)}
              value={roleFilter}
            >
              <option value="all">All roles</option>
              {roles.map((role) => <option key={role} value={role}>{roleLabel(role)}s</option>)}
            </select>
          </div>

          {visibleUsers.length ? (
            <Table
              columns={columns}
              getRowKey={(user) => user.uid || user.id}
              onRowClick={(user) => {
                const kind = userKind(user);
                const id = user.uid || user.id;
                if (kind && id) navigate(`/people/${kind}/${id}`);
              }}
              rows={visibleUsers}
            />
          ) : (
            <EmptyState icon="people" title="No users match this view">
              Change the status tab, role filter, or search.
            </EmptyState>
          )}
        </div>
      </section>
    </>
  );
}
