import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listClasses } from "../backend/classesApi";
import { listUsers } from "../backend/usersApi";
import Badge from "../components/Badge";
import Button from "../components/Button";
import CreateClassModal from "../components/CreateClassModal";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import Table from "../components/Table";
import { useToast } from "../components/ToastProvider";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_ORDER = Object.fromEntries(DAYS.map((d, i) => [d, i]));

function className(c) {
  return c?.type || c?.name || "Unnamed class";
}

function classTime(c) {
  if (!c?.startTime) return "-";
  return c.endTime ? `${c.startTime}–${c.endTime}` : c.startTime;
}

function fullName(r) {
  return `${String(r?.firstName || "").trim()} ${String(r?.lastName || "").trim()}`.trim();
}
function displayUser(u) {
  return u?.displayName || fullName(u) || u?.email || "";
}

function enrolledCount(c) {
  return (c.enrolledStudents || []).length;
}

function capacity(c) {
  return Number(c.capacity || 0);
}

function openSpots(c) {
  const cap = capacity(c);
  if (cap <= 0) return 0;
  return Math.max(0, cap - enrolledCount(c));
}

function capacityTone(c) {
  if (capacity(c) <= 0) return "warn";
  return openSpots(c) > 0 ? "success" : "danger";
}

function capacityLabel(c) {
  if (capacity(c) <= 0) return "Capacity unset";
  const spots = openSpots(c);
  if (spots <= 0) return "Full";
  return `${spots} ${spots === 1 ? "spot" : "spots"} open`;
}

function hasMissingTutor(c) {
  return (c.tutors || []).length === 0;
}

export default function ClassesPage() {
  const navigate = useNavigate();
  const toast    = useToast();

  const [classes,     setClasses]     = useState([]);
  const [users,       setUsers]       = useState([]);
  const [busy,        setBusy]        = useState(true);
  const [error,       setError]       = useState("");
  const [search,      setSearch]      = useState("");
  const [dayFilter,   setDayFilter]   = useState("all");
  const [statFilter,  setStatFilter]  = useState("all");
  const [createOpen,  setCreateOpen]  = useState(false);
  const [loadKey,     setLoadKey]     = useState(0);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError("");
    Promise.all([listClasses(), listUsers()]).then(([c, u]) => {
      if (cancelled) return;
      setClasses(c);
      setUsers(u);
    }).catch((e) => {
      if (!cancelled) setError(e?.message || "Failed to load classes.");
    }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [loadKey]);

  const usersById = useMemo(() => new Map(users.map((u) => [u.uid || u.id, u])), [users]);

  const counts = useMemo(() => ({
    total:  classes.length,
    open:   classes.filter((c) => openSpots(c) > 0).length,
    full:   classes.filter((c) => capacity(c) > 0 && openSpots(c) === 0).length,
    missingTutor: classes.filter(hasMissingTutor).length,
  }), [classes]);

  const visible = useMemo(() => {
    let rows = [...classes];
    if (dayFilter !== "all")   rows = rows.filter((c) => c.day === dayFilter);
    if (statFilter === "open") rows = rows.filter((c) => openSpots(c) > 0);
    if (statFilter === "full") rows = rows.filter((c) => capacity(c) > 0 && openSpots(c) === 0);
    if (statFilter === "missingTutor") rows = rows.filter(hasMissingTutor);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((c) => {
        const name = className(c).toLowerCase();
        const day  = (c.day || "").toLowerCase();
        const tutorNames = (c.tutors || []).map((id) => displayUser(usersById.get(id))).join(" ").toLowerCase();
        return name.includes(q) || day.includes(q) || tutorNames.includes(q);
      });
    }
    return rows.sort((a, b) => {
      const da = DAY_ORDER[a.day] ?? 99;
      const db = DAY_ORDER[b.day] ?? 99;
      if (da !== db) return da - db;
      return (a.startTime || "").localeCompare(b.startTime || "");
    });
  }, [classes, dayFilter, search, statFilter, usersById]);

  return (
    <>
      <PageHeader
        title="Classes"
        subtitle="Manage class slots, rosters, tutors, and attendance generation."
        crumbs={[{ label: "Overview", href: "/" }, { label: "Classes" }]}
        actions={
          <div className="row gap-2">
            <Button variant="secondary" onClick={() => navigate("/attendance")}>
              Attendance maintenance
            </Button>
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              New class
            </Button>
          </div>
        }
      />

      <section className="grid grid-4 mb-6">
        <StatCard icon="classes" label="Total classes"  value={counts.total}        foot="All slots" />
        <StatCard icon="people"  label="Has open spots" value={counts.open}         foot="Below capacity" />
        <StatCard icon="enrol"   label="Full"           value={counts.full}         foot="At capacity" />
        <StatCard icon="alert"   label="Missing tutor"  value={counts.missingTutor} foot="Action needed" />
      </section>

      <div className="filter-bar">
        <div className="field-search grow">
          <Icon className="search-icon" name="search" size={16} />
          <input
            className="input"
            placeholder="Search classes"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="select"
          value={dayFilter}
          onChange={(e) => setDayFilter(e.target.value)}
        >
          <option value="all">All days</option>
          {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select
          className="select"
          value={statFilter}
          onChange={(e) => setStatFilter(e.target.value)}
        >
          <option value="all">All capacity</option>
          <option value="open">Open spots</option>
          <option value="full">At capacity</option>
          <option value="missingTutor">Missing tutor</option>
        </select>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h3>Classes</h3>
            <div className="card-sub">Click a row to open the class detail page.</div>
          </div>
          <Badge tone="brand" dot>Live data</Badge>
        </div>
        <div className="card-body flush">
          {busy ? <div className="route-inline-state">Loading classes…</div> : null}
          {error ? (
            <div className="banner banner-danger">
              <div><div className="banner-title">Could not load classes</div><div>{error}</div></div>
            </div>
          ) : null}
          {!busy && !error ? (
            visible.length === 0 ? (
              <EmptyState icon="classes" title="No classes found">
                No classes match the selected filters.
              </EmptyState>
            ) : (
              <Table
                columns={[
                  {
                    key: "schedule",
                    header: "Schedule",
                    render: (row) => (
                      <div className="row-meta">
                        <span className="primary">{row.day || "-"}</span>
                        <span className="secondary">{classTime(row)}</span>
                      </div>
                    ),
                  },
                  {
                    key: "enrolment",
                    header: "Enrolled",
                    render: (row) => {
                      const enrolled = enrolledCount(row);
                      const cap      = capacity(row);
                      return `${enrolled} / ${cap}`;
                    },
                  },
                  {
                    key: "tutors",
                    header: "Tutors",
                    render: (row) => {
                      const ids = row.tutors || [];
                      if (ids.length === 0) return <span className="muted">Unassigned</span>;
                      const names = ids.slice(0, 2).map((id) => {
                        const u = usersById.get(id);
                        return u ? displayUser(u) : id;
                      });
                      return (
                        <span>
                          {names.join(", ")}
                          {ids.length > 2 ? ` +${ids.length - 2}` : ""}
                        </span>
                      );
                    },
                  },
                  {
                    key: "capacity",
                    header: "Capacity",
                    render: (row) => (
                      <Badge tone={capacityTone(row)} dot>{capacityLabel(row)}</Badge>
                    ),
                  },
                  {
                    key: "class",
                    header: "Class",
                    render: (row) => className(row),
                  },
                ]}
                getRowKey={(row) => row.id}
                onRowClick={(row) => navigate(`/classes/${row.id}`)}
                rows={visible}
              />
            )
          ) : null}
        </div>
      </div>

      <CreateClassModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => {
          setCreateOpen(false);
          setLoadKey((k) => k + 1);
          toast.success("Class created", "Class has been created.");
        }}
      />
    </>
  );
}
