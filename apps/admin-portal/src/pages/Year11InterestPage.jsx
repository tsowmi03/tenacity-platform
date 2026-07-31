import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthProvider";
import { triggerBlobDownload } from "../backend/reportsApi";
import {
  COURSE_OPTIONS,
  ENGLISH_COURSE_OPTIONS,
  MATHS_COURSE_OPTIONS,
  courseLabel,
  currentYearLabel,
  interestStatusLabel,
  interestStatusTone,
  preferredDayLabel,
  studentStatusLabel,
} from "../backend/year11Courses";
import {
  listYear11Interest,
  setYear11InterestArchived,
  setYear11InterestStatus,
} from "../backend/year11InterestApi";
import Badge from "../components/Badge";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import Modal from "../components/Modal";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import Table from "../components/Table";
import { useToast } from "../components/ToastProvider";

const PAGE_SIZE = 20;

function formatDate(iso) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function rowsToCsv(rows) {
  const header = [
    "Submitted",
    "Student",
    "School",
    "Current year",
    "Student status",
    "Maths",
    "English",
    "Preferred days",
    "Parent",
    "Email",
    "Phone",
    "Notes",
    "Triage status",
  ];

  const body = rows.map((row) =>
    [
      formatDate(row.createdAtIso),
      row.studentName,
      row.school,
      currentYearLabel(row.currentYear),
      studentStatusLabel(row.studentStatus),
      row.mathsCourses.map(courseLabel).join("; "),
      row.englishCourses.map(courseLabel).join("; "),
      row.preferredDays.map(preferredDayLabel).join("; "),
      row.parentName,
      row.parentEmail,
      row.parentPhone,
      row.notes,
      row.archived ? "Archived" : interestStatusLabel(row.status),
    ].map(csvCell).join(",")
  );

  return [header.map(csvCell).join(","), ...body].join("\n");
}

export default function Year11InterestPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user, isAdmin } = useAuth();

  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadKey, setLoadKey] = useState(0);

  const [tab, setTab] = useState("new");
  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [schoolFilter, setSchoolFilter] = useState("all");
  const [page, setPage] = useState(1);

  const [detail, setDetail] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError("");
      if (!user) {
        setError("You must be signed in to view Year 11 interest.");
        return;
      }
      if (!isAdmin) {
        setError('Access denied: requires admin role ("role: admin").');
        return;
      }

      setBusy(true);
      try {
        const data = await listYear11Interest();
        if (!cancelled) setRows(data);
      } catch (e) {
        console.error(e);
        if (!cancelled) setError(e?.message || "Failed to load Year 11 interest.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user, isAdmin, loadKey]);

  useEffect(() => {
    setPage(1);
  }, [tab, search, courseFilter, schoolFilter]);

  const reload = () => setLoadKey((key) => key + 1);

  const counts = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        if (row.archived) acc.archived += 1;
        else if (row.status === "contacted") acc.contacted += 1;
        else acc.new += 1;
        return acc;
      },
      { new: 0, contacted: 0, archived: 0 }
    );
  }, [rows]);

  const schoolOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.school).filter(Boolean))).sort(
      (a, b) => a.localeCompare(b)
    );
  }, [rows]);

  // Demand is measured across everything still live (new + contacted), since an
  // archived registration is one we have decided not to count.
  const liveRows = useMemo(() => rows.filter((row) => !row.archived), [rows]);

  const demand = useMemo(() => {
    return COURSE_OPTIONS.map((option) => {
      const matching = liveRows.filter((row) => row.courses.includes(option.code));
      const schools = new Set(matching.map((row) => row.school).filter(Boolean));
      return {
        code: option.code,
        label: option.label,
        students: matching.length,
        schools: schools.size,
      };
    });
  }, [liveRows]);

  // English classes are formed per school, so a raw total hides whether any one
  // school actually has a viable group.
  const englishBySchool = useMemo(() => {
    const bucket = new Map();
    liveRows.forEach((row) => {
      if (!row.englishCourses.length || !row.school) return;
      row.englishCourses.forEach((code) => {
        const key = `${row.school}||${code}`;
        bucket.set(key, (bucket.get(key) || 0) + 1);
      });
    });
    return Array.from(bucket.entries())
      .map(([key, students]) => {
        const [school, code] = key.split("||");
        return { school, code, label: courseLabel(code), students };
      })
      .sort((a, b) => b.students - a.students || a.school.localeCompare(b.school));
  }, [liveRows]);

  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return rows.filter((row) => {
      const inTab = row.archived
        ? tab === "archived"
        : tab === "archived"
        ? false
        : tab === "contacted"
        ? row.status === "contacted"
        : row.status !== "contacted";
      if (!inTab) return false;

      if (courseFilter !== "all" && !row.courses.includes(courseFilter)) return false;
      if (schoolFilter !== "all" && row.school !== schoolFilter) return false;

      if (!term) return true;
      return [row.studentName, row.parentName, row.school, row.parentEmail, row.parentPhone]
        .some((field) => String(field || "").toLowerCase().includes(term));
    });
  }, [rows, tab, search, courseFilter, schoolFilter]);

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = visibleRows.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  async function runAction(fn, successMessage) {
    setActionBusy(true);
    try {
      await fn();
      toast.success(successMessage);
      setDetail(null);
      reload();
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "Could not update this registration.");
    } finally {
      setActionBusy(false);
    }
  }

  function handleExport() {
    if (!visibleRows.length) {
      toast.error("There is nothing to export for the current filters.");
      return;
    }
    const csv = rowsToCsv(visibleRows);
    const stamp = new Date().toISOString().slice(0, 10);
    triggerBlobDownload(
      new Blob([csv], { type: "text/csv;charset=utf-8;" }),
      `year-11-interest-${stamp}.csv`
    );
  }

  const columns = [
    {
      key: "student",
      header: "Student",
      render: (row) => (
        <div className="row-meta">
          <span className="row gap-2">
            <span className="primary">{row.studentName || "(Unnamed student)"}</span>
            {row.registrationGroupId ? <Badge tone="brand">Family</Badge> : null}
          </span>
          <span className="secondary">
            {currentYearLabel(row.currentYear)} &middot;{" "}
            {studentStatusLabel(row.studentStatus)}
          </span>
        </div>
      ),
    },
    { key: "school", header: "School", render: (row) => row.school || "-" },
    {
      key: "courses",
      header: "Courses",
      render: (row) =>
        row.courses.length ? (
          <div className="row gap-2" style={{ flexWrap: "wrap" }}>
            {row.courses.map((code) => (
              <Badge key={code} outline>
                {courseLabel(code)}
              </Badge>
            ))}
          </div>
        ) : (
          "-"
        ),
    },
    {
      key: "days",
      header: "Preferred days",
      render: (row) =>
        row.preferredDays.length
          ? row.preferredDays.map(preferredDayLabel).join(", ")
          : "Any",
    },
    {
      key: "parent",
      header: "Parent",
      render: (row) => (
        <div className="row-meta">
          <span className="primary">{row.parentName || "-"}</span>
          <span className="secondary">{row.parentEmail || ""}</span>
        </div>
      ),
    },
    {
      key: "submitted",
      header: "Submitted",
      render: (row) => formatDate(row.createdAtIso),
    },
    {
      key: "status",
      header: "Status",
      render: (row) =>
        row.archived ? (
          <Badge tone="neutral">Archived</Badge>
        ) : (
          <Badge tone={interestStatusTone(row.status)}>
            {interestStatusLabel(row.status)}
          </Badge>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Year 11 interest"
        subtitle="Registrations from the public Year 11 classes form. Use the demand summary to decide which groups can open."
        crumbs={[{ label: "Overview", href: "/" }, { label: "Year 11 interest" }]}
        actions={
          <div className="row gap-2">
            <Button
              icon="download"
              onClick={handleExport}
              variant="secondary"
              disabled={busy}
            >
              Export CSV
            </Button>
            <Button onClick={() => navigate("/")} variant="secondary">
              Back to dashboard
            </Button>
          </div>
        }
      />

      {error ? (
        <div className="banner banner-danger">
          <div>
            <div className="banner-title">Could not load Year 11 interest</div>
            <div>{error}</div>
          </div>
        </div>
      ) : null}

      {!error ? (
        <>
          <div className="card">
            <div className="card-head">
              <div>
                <h3>Demand summary</h3>
                <div className="card-sub">
                  Students still active (new and contacted). Archived registrations are excluded.
                </div>
              </div>
            </div>
            <div className="card-body">
              <div className="grid grid-3">
                {demand
                  .filter((entry) =>
                    MATHS_COURSE_OPTIONS.some((o) => o.code === entry.code)
                  )
                  .map((entry) => (
                    <StatCard
                      key={entry.code}
                      label={entry.label}
                      value={entry.students}
                      icon="graduation"
                      foot={`${entry.schools} school${entry.schools === 1 ? "" : "s"}`}
                    />
                  ))}
              </div>
              <div className="grid grid-3" style={{ marginTop: 12 }}>
                {demand
                  .filter((entry) =>
                    ENGLISH_COURSE_OPTIONS.some((o) => o.code === entry.code)
                  )
                  .map((entry) => (
                    <StatCard
                      key={entry.code}
                      label={entry.label}
                      value={entry.students}
                      icon="book"
                      foot={`${entry.schools} school${entry.schools === 1 ? "" : "s"}`}
                    />
                  ))}
              </div>

              {englishBySchool.length ? (
                <div style={{ marginTop: 20 }}>
                  <div className="label mb-2">English demand by school</div>
                  <div className="card-sub mb-2">
                    English groups are formed per school, so these are the counts that decide a viable class.
                  </div>
                  <Table
                    columns={[
                      { key: "school", header: "School", render: (r) => r.school },
                      { key: "course", header: "Course", render: (r) => r.label },
                      { key: "students", header: "Students", render: (r) => r.students },
                    ]}
                    getRowKey={(r) => `${r.school}-${r.code}`}
                    rows={englishBySchool}
                  />
                </div>
              ) : null}
            </div>
          </div>

          <div className="tabs">
            {[
              ["new", "New"],
              ["contacted", "Contacted"],
              ["archived", "Archived"],
            ].map(([key, label]) => (
              <button
                className={`tab ${tab === key ? "active" : ""}`}
                disabled={busy}
                key={key}
                onClick={() => setTab(key)}
                type="button"
              >
                {label}
                <span className="count">{counts[key] || 0}</span>
              </button>
            ))}
          </div>

          <div className="filter-bar">
            <div className="field-search grow">
              <Icon className="search-icon" name="search" size={16} />
              <input
                className="input"
                placeholder="Search by student, parent, school, email or phone"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              aria-label="Filter by course"
              className="select"
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
            >
              <option value="all">All courses</option>
              {COURSE_OPTIONS.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by school"
              className="select"
              value={schoolFilter}
              onChange={(e) => setSchoolFilter(e.target.value)}
            >
              <option value="all">All schools</option>
              {schoolOptions.map((school) => (
                <option key={school} value={school}>
                  {school}
                </option>
              ))}
            </select>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h3>Registrations</h3>
                <div className="card-sub">
                  {visibleRows.length} matching registration
                  {visibleRows.length === 1 ? "" : "s"}
                </div>
              </div>
              <Badge tone="brand" dot>
                Live data
              </Badge>
            </div>

            <div className="card-body flush">
              {busy ? (
                <div className="route-inline-state">Loading Year 11 interest...</div>
              ) : null}

              {!busy ? (
                visibleRows.length === 0 ? (
                  <EmptyState icon="waitlist" title="No registrations found">
                    No records match the selected filters.
                  </EmptyState>
                ) : (
                  <>
                    <Table
                      columns={columns}
                      getRowKey={(row) => row.id}
                      onRowClick={(row) => setDetail(row)}
                      rows={pageRows}
                    />
                    {totalPages > 1 ? (
                      <div className="row gap-2 pagination">
                        <Button
                          disabled={currentPage <= 1}
                          onClick={() => setPage(currentPage - 1)}
                          variant="secondary"
                        >
                          Previous
                        </Button>
                        <span className="cell-muted">
                          Page {currentPage} of {totalPages}
                        </span>
                        <Button
                          disabled={currentPage >= totalPages}
                          onClick={() => setPage(currentPage + 1)}
                          variant="secondary"
                        >
                          Next
                        </Button>
                      </div>
                    ) : null}
                  </>
                )
              ) : null}
            </div>
          </div>
        </>
      ) : null}

      {detail ? (
        <Modal
          open
          busy={actionBusy}
          title={detail.studentName || "Registration"}
          subtitle={`${detail.school || "No school"} - submitted ${formatDate(
            detail.createdAtIso
          )}`}
          onClose={() => {
            if (!actionBusy) setDetail(null);
          }}
          footer={null}
        >
          <dl className="dlist compact">
            <dt>Current year</dt>
            <dd>{currentYearLabel(detail.currentYear)}</dd>
            <dt>Tenacity student</dt>
            <dd>{studentStatusLabel(detail.studentStatus)}</dd>
            <dt>Maths</dt>
            <dd>
              {detail.mathsCourses.length
                ? detail.mathsCourses.map(courseLabel).join(", ")
                : "None"}
            </dd>
            <dt>English</dt>
            <dd>
              {detail.englishCourses.length
                ? detail.englishCourses.map(courseLabel).join(", ")
                : "None"}
            </dd>
            <dt>Preferred days</dt>
            <dd>
              {detail.preferredDays.length
                ? detail.preferredDays.map(preferredDayLabel).join(", ")
                : "No preference given"}
            </dd>
            <dt>Parent</dt>
            <dd>{detail.parentName || "-"}</dd>
            <dt>Email</dt>
            <dd>
              {detail.parentEmail ? (
                <a href={`mailto:${detail.parentEmail}`}>{detail.parentEmail}</a>
              ) : (
                "-"
              )}
            </dd>
            <dt>Phone</dt>
            <dd>
              {detail.parentPhone ? (
                <a href={`tel:${detail.parentPhone}`}>{detail.parentPhone}</a>
              ) : (
                "-"
              )}
            </dd>
            {detail.registrationGroupSize > 1 ? (
              <>
                <dt>Family</dt>
                <dd>
                  Child {Number(detail.registrationGroupIndex || 0) + 1} of{" "}
                  {detail.registrationGroupSize} submitted together
                </dd>
              </>
            ) : null}
          </dl>

          {detail.notes ? (
            <div style={{ marginTop: 16 }}>
              <div className="label mb-2">Notes from the parent</div>
              <div className="card-sub" style={{ whiteSpace: "pre-wrap" }}>
                {detail.notes}
              </div>
            </div>
          ) : null}

          <div
            className="row gap-2"
            style={{ justifyContent: "flex-end", marginTop: 24 }}
          >
            <Button
              disabled={actionBusy}
              onClick={() => setDetail(null)}
              variant="secondary"
            >
              Close
            </Button>
            {detail.archived ? (
              <Button
                loading={actionBusy}
                onClick={() =>
                  runAction(
                    () => setYear11InterestArchived(detail.id, false),
                    "Registration restored."
                  )
                }
              >
                Restore
              </Button>
            ) : (
              <>
                <Button
                  disabled={actionBusy}
                  onClick={() =>
                    runAction(
                      () => setYear11InterestArchived(detail.id, true),
                      "Registration archived."
                    )
                  }
                  variant="secondary"
                >
                  Archive
                </Button>
                <Button
                  loading={actionBusy}
                  onClick={() =>
                    runAction(
                      () =>
                        setYear11InterestStatus(
                          detail.id,
                          detail.status === "contacted" ? "new" : "contacted"
                        ),
                      detail.status === "contacted"
                        ? "Moved back to new."
                        : "Marked as contacted."
                    )
                  }
                >
                  {detail.status === "contacted"
                    ? "Move back to new"
                    : "Mark as contacted"}
                </Button>
              </>
            )}
          </div>
        </Modal>
      ) : null}
    </>
  );
}
