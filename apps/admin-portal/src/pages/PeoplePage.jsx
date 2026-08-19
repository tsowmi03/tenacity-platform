import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthProvider";
import { listClasses } from "../backend/classesApi";
import { listStudents } from "../backend/studentsApi";
import { listUsers } from "../backend/usersApi";
import Badge from "../components/Badge";
import Button from "../components/Button";
import CreateStudentModal from "../components/CreateStudentModal";
import CreateUserModal from "../components/CreateUserModal";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import Table from "../components/Table";
import { useToast } from "../components/ToastProvider";

const TABS = [
  { key: "parents", label: "Parents", role: "parent" },
  { key: "tutors", label: "Tutors", role: "tutor" },
  { key: "admins", label: "Admins", role: "admin" },
  { key: "students", label: "Students" },
];

const PAGE_SIZE = 20;

function fullName(firstName, lastName) {
  return `${String(firstName || "").trim()} ${String(lastName || "").trim()}`.trim();
}

function studentName(student) {
  return student?.displayName || fullName(student?.firstName, student?.lastName) || "Unknown student";
}

function userName(user) {
  return user?.displayName || fullName(user?.firstName, user?.lastName) || user?.email || "Unknown user";
}

function studentYear(student) {
  return student?.grade || student?.studentYear || student?.year || "No year";
}

function studentSubjects(student) {
  const subjects = student?.subjects || student?.studentSubjects || [];
  return Array.isArray(subjects) ? subjects.map((subject) => String(subject || "").trim()).filter(Boolean) : [];
}

function studentParentIds(student) {
  const parents = student?.parents || student?.parentIds || [];
  return Array.isArray(parents) ? parents.filter(Boolean) : [];
}

function classStudentIds(classDoc) {
  const enrolled = classDoc?.enrolledStudents || [];
  return Array.isArray(enrolled) ? enrolled.filter(Boolean) : [];
}

function classTutorIds(classDoc) {
  const tutors = classDoc?.tutors || [];
  return Array.isArray(tutors) ? tutors.filter(Boolean) : [];
}

function matchesSearch(values, search) {
  const query = search.trim().toLowerCase();
  if (!query) return true;
  return values.some((value) => String(value || "").toLowerCase().includes(query));
}

function alphaKey(row) {
  return [
    String(row?.lastName || "").trim(),
    String(row?.firstName || "").trim(),
    String(row?.displayName || "").trim(),
    String(row?.email || "").trim(),
  ].join(" ").toLowerCase();
}

function sortByName(rows) {
  return [...rows].sort((a, b) => alphaKey(a).localeCompare(alphaKey(b), undefined, { sensitivity: "base" }));
}

function primaryParentName(student, usersById) {
  const parentId = student?.primaryParentId || studentParentIds(student)[0];
  if (!parentId) return "No primary parent";
  return userName(usersById.get(parentId));
}

export default function PeoplePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user, isAdmin } = useAuth();
  const [tab, setTab] = useState("parents");
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [users, setUsers] = useState([]);
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loadKey, setLoadKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPeople() {
      setError("");
      setWarning("");

      if (!user) {
        setError("You must be signed in to view people.");
        return;
      }
      if (!isAdmin) {
        setError('Access denied: requires admin role ("role: admin").');
        return;
      }

      setBusy(true);
      try {
        const [usersResult, studentsResult, classesResult] = await Promise.allSettled([
          listUsers(),
          listStudents(),
          listClasses(),
        ]);

        if (cancelled) return;

        if (usersResult.status === "rejected") throw usersResult.reason;
        if (studentsResult.status === "rejected") throw studentsResult.reason;

        setUsers(usersResult.value);
        setStudents(studentsResult.value);

        if (classesResult.status === "fulfilled") {
          setClasses(classesResult.value);
        } else {
          setClasses([]);
          setWarning(classesResult.reason?.message || "Could not load class counts.");
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setError(e?.message || "Failed to load people.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    }

    loadPeople();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, user, loadKey]);

  useEffect(() => {
    setPage(1);
  }, [search, tab, yearFilter]);

  const usersById = useMemo(() => new Map(users.map((row) => [row.uid || row.id, row])), [users]);

  const counts = useMemo(() => {
    return {
      parents: users.filter((row) => row.role === "parent").length,
      tutors: users.filter((row) => row.role === "tutor").length,
      admins: users.filter((row) => row.role === "admin").length,
      students: students.length,
    };
  }, [students.length, users]);

  const yearOptions = useMemo(() => {
    return Array.from(new Set(students.map(studentYear).filter((year) => year !== "No year")))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [students]);

  const visibleUsers = useMemo(() => {
    const role = TABS.find((item) => item.key === tab)?.role;
    if (!role) return [];
    return sortByName(users.filter((row) => {
      if (row.role !== role) return false;
      return matchesSearch([userName(row), row.email, row.phone], search);
    }));
  }, [search, tab, users]);

  const visibleStudents = useMemo(() => {
    return sortByName(students.filter((student) => {
      const year = studentYear(student);
      if (yearFilter !== "all" && year !== yearFilter) return false;
      const parentNames = studentParentIds(student).map((parentId) => userName(usersById.get(parentId)));
      return matchesSearch(
        [
          studentName(student),
          year,
          parentNames.join(" "),
          studentSubjects(student).join(" "),
        ],
        search
      );
    }));
  }, [search, students, usersById, yearFilter]);

  function classesForStudent(studentId) {
    return classes.filter((classDoc) => classStudentIds(classDoc).includes(studentId));
  }

  function classesForTutor(uid) {
    return classes.filter((classDoc) => classTutorIds(classDoc).includes(uid));
  }

  const activeTab = TABS.find((item) => item.key === tab);
  const activeRows = tab === "students" ? visibleStudents : visibleUsers;
  const createLabel = tab === "students"
    ? "Create student"
    : `Create ${activeTab?.label?.slice(0, -1).toLowerCase() ?? "user"}`;
  const defaultRole = activeTab?.role ?? "parent";
  const pageCount = Math.max(1, Math.ceil(activeRows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageRows = activeRows.slice(pageStart, pageStart + PAGE_SIZE);

  function renderPagination() {
    if (activeRows.length <= PAGE_SIZE) return null;

    return (
      <div className="pagination">
        <span>
          Showing {pageStart + 1}-{Math.min(pageStart + PAGE_SIZE, activeRows.length)} of {activeRows.length}
        </span>
        <div className="pages">
          <button
            className="page-btn"
            disabled={safePage === 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            type="button"
          >
            Previous
          </button>
          <button className="page-btn active" disabled type="button">
            {safePage} / {pageCount}
          </button>
          <button
            className="page-btn"
            disabled={safePage === pageCount}
            onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
            type="button"
          >
            Next
          </button>
        </div>
      </div>
    );
  }

  function renderUserTable(role, rows) {
    return (
      <Table
        columns={[
          {
            key: "name",
            header: "Name",
            render: (row) => (
              <div className="row-meta">
                <span className="primary">{userName(row)}</span>
                <span className="secondary">{row.email || row.phone || "No contact details"}</span>
              </div>
            ),
          },
          {
            key: "contact",
            header: "Contact",
            render: (row) => (
              <div className="row-meta">
                <span className="primary">{row.email || "-"}</span>
                <span className="secondary">{row.phone || "No phone"}</span>
              </div>
            ),
          },
          ...(role === "parent"
            ? [
                {
                  key: "students",
                  header: "Students",
                  render: (row) => {
                    const linked = Array.isArray(row.students) ? row.students : [];
                    return linked.length ? `${linked.length} linked` : <span className="muted">None linked</span>;
                  },
                },
                {
                  key: "tokens",
                  header: "Lesson tokens",
                  render: (row) => <Badge tone={Number(row.lessonTokens || 0) > 0 ? "brand" : "neutral"}>{Number(row.lessonTokens || 0)}</Badge>,
                },
              ]
            : []),
          ...(role === "tutor"
            ? [
                {
                  key: "classes",
                  header: "Assigned classes",
                  render: (row) => {
                    const assigned = classesForTutor(row.uid || row.id);
                    return assigned.length ? `${assigned.length} assigned` : <span className="muted">Unassigned</span>;
                  },
                },
              ]
            : []),
          {
            key: "state",
            header: "State",
            // A desktop-only affordance; the whole card is the tap target.
            mobile: "hide",
            render: () => <span className="cell-muted">Open details</span>,
          },
        ]}
        getRowKey={(row) => row.uid || row.id}
        onRowClick={(row) => navigate(`/people/${role}s/${row.uid || row.id}`)}
        rows={rows}
      />
    );
  }

  function renderStudentsTable(rows) {
    return (
      <Table
        columns={[
          {
            key: "student",
            header: "Student",
            render: (row) => {
              const parentIds = studentParentIds(row);
              return (
                <div className="row-meta">
                  <span className="primary">
                    {studentName(row)}
                    {parentIds.length === 0 ? <Badge className="ml-2" tone="warn">No parent</Badge> : null}
                  </span>
                  <span className="secondary">Primary parent: {primaryParentName(row, usersById)}</span>
                </div>
              );
            },
          },
          {
            key: "year",
            header: "Year",
            render: (row) => studentYear(row),
          },
          {
            key: "subjects",
            header: "Subjects",
            render: (row) => {
              const subjects = studentSubjects(row);
              return subjects.length ? (
                <div className="row gap-1 wrap">
                  {subjects.slice(0, 3).map((subject) => <Badge key={subject} tone="brand">{subject}</Badge>)}
                  {subjects.length > 3 ? <span className="text-xs muted">+{subjects.length - 3}</span> : null}
                </div>
              ) : <span className="muted">None set</span>;
            },
          },
          {
            key: "parents",
            header: "Parents",
            render: (row) => {
              const parentIds = studentParentIds(row);
              if (parentIds.length === 0) return <span className="muted">None linked</span>;
              return (
                <div className="col gap-1">
                  {parentIds.slice(0, 2).map((parentId) => {
                    const parent = usersById.get(parentId);
                    return (
                      <span className="text-sm" key={parentId}>
                        {parent ? userName(parent) : "Unknown parent"}
                        {row.primaryParentId === parentId ? <Badge className="ml-2" tone="brand">Primary</Badge> : null}
                      </span>
                    );
                  })}
                  {parentIds.length > 2 ? <span className="text-xs muted">+{parentIds.length - 2} more</span> : null}
                </div>
              );
            },
          },
          {
            key: "classes",
            header: "Classes",
            render: (row) => {
              const assigned = classesForStudent(row.id);
              return assigned.length ? `${assigned.length} enrolled` : <span className="muted">None</span>;
            },
          },
          {
            key: "state",
            header: "State",
            // A desktop-only affordance; the whole card is the tap target.
            mobile: "hide",
            render: () => <span className="cell-muted">Open details</span>,
          },
        ]}
        getRowKey={(row) => row.id}
        onRowClick={(row) => navigate(`/people/students/${row.id}`)}
        rows={rows}
      />
    );
  }

  return (
    <>
      <PageHeader
        title="People"
        subtitle="Review parents, tutors, admins, and student records from shared Firestore data."
        crumbs={[{ label: "Overview", href: "/" }, { label: "People" }]}
        actions={
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            {createLabel}
          </Button>
        }
      />

      <section className="grid grid-4 mb-6">
        <StatCard icon="people" label="Parents" value={counts.parents} foot="Role: parent" />
        <StatCard icon="people" label="Tutors" value={counts.tutors} foot="Role: tutor" />
        <StatCard icon="shield" label="Admins" value={counts.admins} foot="Role: admin" />
        <StatCard icon="enrol" label="Students" value={counts.students} foot="Student records" />
      </section>

      <div className="tabs">
        {TABS.map((item) => (
          <button
            className={`tab ${tab === item.key ? "active" : ""}`}
            disabled={busy}
            key={item.key}
            onClick={() => setTab(item.key)}
            type="button"
          >
            {item.label}
            <span className="count">{counts[item.key] || 0}</span>
          </button>
        ))}
      </div>

      <div className="filter-bar">
        <div className="field-search grow">
          <Icon className="search-icon" name="search" size={16} />
          <input
            className="input"
            placeholder={`Search ${activeTab?.label?.toLowerCase() || "people"}`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {tab === "students" ? (
          <select className="select enrolment-year-filter" value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
            <option value="all">All years</option>
            {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        ) : null}
      </div>

      {warning ? (
        <div className="banner banner-warn mb-5">
          <Icon className="banner-icon" name="alert" />
          <div>
            <div className="banner-title">Partial data loaded</div>
            <div>{warning}</div>
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="card-head">
          <div>
            <h3>{activeTab?.label || "People"}</h3>
            <div className="card-sub">Read-only list view. Create, edit, link, and delete actions come after list verification.</div>
          </div>
          <Badge tone="brand" dot>Live data</Badge>
        </div>

        <div className="card-body flush">
          {busy ? <div className="route-inline-state">Loading people...</div> : null}
          {error ? (
            <div className="banner banner-danger">
              <div>
                <div className="banner-title">Could not load people</div>
                <div>{error}</div>
              </div>
            </div>
          ) : null}

          {!busy && !error ? (
            activeRows.length === 0 ? (
              <EmptyState icon="people" title={`No ${activeTab?.label?.toLowerCase() || "people"} found`}>
                No records match the selected filters.
              </EmptyState>
            ) : (
              <>
                {tab === "students" ? renderStudentsTable(pageRows) : renderUserTable(activeTab.role, pageRows)}
                {renderPagination()}
              </>
            )
          ) : null}
        </div>
      </div>

      {tab === "students" ? (
        <CreateStudentModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onSuccess={(result) => {
            setCreateOpen(false);
            setLoadKey((k) => k + 1);
            toast.success("Student created", result?.studentId ? "Student record is ready." : "Student record created.");
          }}
        />
      ) : (
        <CreateUserModal
          defaultRole={defaultRole}
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onSuccess={(result) => {
            setCreateOpen(false);
            setLoadKey((k) => k + 1);
            toast.success(
              "User created",
              `${result.role.charAt(0).toUpperCase() + result.role.slice(1)} account created.`
            );
          }}
        />
      )}
    </>
  );
}
