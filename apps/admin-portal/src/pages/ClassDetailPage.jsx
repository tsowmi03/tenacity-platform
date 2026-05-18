import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { deleteClass, getClass } from "../backend/classesApi";
import { listAttendance } from "../backend/attendanceApi";
import { listTerms } from "../backend/settingsApi";
import { listStudents } from "../backend/studentsApi";
import { listUsers } from "../backend/usersApi";
import { listWaitlist } from "../backend/waitlistApi";
import Badge from "../components/Badge";
import Button from "../components/Button";
import EditClassModal from "../components/EditClassModal";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import Modal from "../components/Modal";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import Table from "../components/Table";
import { useToast } from "../components/ToastProvider";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function endOfCurrentWeek() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  // Advance to Sunday (getDay() 0 = Sun, so 7 - getDay() gives days until next Sunday, 0 if already Sunday)
  const daysUntilSunday = d.getDay() === 0 ? 0 : 7 - d.getDay();
  d.setDate(d.getDate() + daysUntilSunday);
  return d;
}

function className(c) {
  return c?.type || c?.name || "Unnamed class";
}

function timeToMinutes(value) {
  const text = String(value || "").trim();
  if (!text) return Number.POSITIVE_INFINITY;
  const match = text.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]m)?$/i);
  if (!match) return Number.POSITIVE_INFINITY;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const suffix = match[3]?.toLowerCase();
  if (minute < 0 || minute > 59) return Number.POSITIVE_INFINITY;
  if (suffix) {
    if (hour < 1 || hour > 12) return Number.POSITIVE_INFINITY;
    if (suffix === "pm" && hour !== 12) hour += 12;
    if (suffix === "am" && hour === 12) hour = 0;
  } else if (hour < 0 || hour > 23) {
    return Number.POSITIVE_INFINITY;
  }
  return hour * 60 + minute;
}

function formatTimeValue(value) {
  const minutes = timeToMinutes(value);
  if (!Number.isFinite(minutes)) return String(value || "").trim();
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function classTime(c) {
  const start = formatTimeValue(c?.startTime);
  if (!start) return "";
  const end = formatTimeValue(c?.endTime);
  return end ? `${start} – ${end}` : start;
}

function formatAttendanceDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function shortAttendanceDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function formatTimestamp(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const date = `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${date}, ${hh}:${mm}`;
}

function fullName(r) {
  return `${String(r?.firstName || "").trim()} ${String(r?.lastName || "").trim()}`.trim();
}
function displayUser(u) {
  return u?.displayName || fullName(u) || u?.email || "";
}
function displayStudent(s) {
  return s?.displayName || fullName(s) || "";
}

function termLabel(t) {
  if (!t) return "";
  return `Term ${t.termNum} ${t.year}`;
}

export default function ClassDetailPage() {
  const navigate = useNavigate();
  const toast    = useToast();
  const { classId } = useParams();

  const [record,    setRecord]    = useState(null);
  const [users,     setUsers]     = useState([]);
  const [students,  setStudents]  = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [terms,     setTerms]     = useState([]);
  const [waitlist,  setWaitlist]  = useState([]);
  const [busy,      setBusy]      = useState(true);
  const [error,     setError]     = useState("");
  const [warning,   setWarning]   = useState("");
  const [loadKey,   setLoadKey]   = useState(0);

  const [editOpen,   setEditOpen]   = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [docOpen,    setDocOpen]    = useState(null);

  const [delTyped,   setDelTyped]   = useState("");
  const [delAckAtt,  setDelAckAtt]  = useState(false);
  const [delBusy,    setDelBusy]    = useState(false);
  const [delError,   setDelError]   = useState("");

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError("");
    setWarning("");

    Promise.allSettled([
      getClass(classId),
      listUsers(),
      listStudents(),
      listAttendance(classId),
      listTerms(),
      listWaitlist({ classId }),
    ]).then(([rR, uR, sR, aR, tR, wR]) => {
      if (cancelled) return;
      if (rR.status === "rejected") throw rR.reason;
      if (!rR.value) throw new Error("Class not found.");

      setRecord(rR.value);
      setUsers(uR.status  === "fulfilled" ? uR.value : []);
      setStudents(sR.status === "fulfilled" ? sR.value : []);
      setAttendance(aR.status === "fulfilled" ? aR.value : []);
      setTerms(tR.status  === "fulfilled" ? tR.value : []);
      setWaitlist(wR.status === "fulfilled" ? wR.value : []);

      const fails = [uR, sR, aR, tR, wR].filter((r) => r.status === "rejected");
      if (fails.length) setWarning(fails[0].reason?.message || "Some related data could not be loaded.");
    }).catch((e) => {
      if (!cancelled) setError(e?.message || "Failed to load class.");
    }).finally(() => { if (!cancelled) setBusy(false); });

    return () => { cancelled = true; };
  }, [classId, loadKey]);

  useEffect(() => {
    if (deleteOpen) {
      setDelTyped("");
      setDelAckAtt(false);
      setDelError("");
    }
  }, [deleteOpen]);

  const usersById    = useMemo(() => new Map(users.map((u) => [u.uid || u.id, u])),   [users]);
  const studentsById = useMemo(() => new Map(students.map((s) => [s.id, s])),          [students]);
  const termsById    = useMemo(() => new Map(terms.map((t) => [t.id, t])),             [terms]);

  const assignedTutors    = useMemo(() => (record?.tutors || []).map((id) => usersById.get(id)).filter(Boolean), [record, usersById]);
  const enrolledStudents  = useMemo(
    () => (record?.enrolledStudents || [])
      .map((id) => studentsById.get(id))
      .filter(Boolean)
      .sort((a, b) => displayStudent(a).localeCompare(displayStudent(b), undefined, { sensitivity: "base" })),
    [record, studentsById]
  );
  const activeWaitlist    = useMemo(() => waitlist.filter((w) => w.status === "active" || w.status === "offered"), [waitlist]);

  const sortedAttendance = useMemo(() => {
    const cutoff = endOfCurrentWeek();
    return [...attendance]
      .filter((a) => {
        if (!a.dateIso) return true;
        return new Date(a.dateIso) <= cutoff;
      })
      .sort((a, b) => {
        const at = new Date(a.dateIso || 0).getTime();
        const bt = new Date(b.dateIso || 0).getTime();
        if (at !== bt) return bt - at;
        return (b.weekNumber || 0) - (a.weekNumber || 0);
      });
  }, [attendance]);

  const blockers = useMemo(() => {
    const list = [];
    if (enrolledStudents.length > 0) list.push(`${enrolledStudents.length} enrolled student${enrolledStudents.length !== 1 ? "s" : ""} must be removed first.`);
    if (activeWaitlist.length  > 0) list.push(`${activeWaitlist.length} active waitlist entr${activeWaitlist.length !== 1 ? "ies" : "y"} must be cleared first.`);
    return list;
  }, [activeWaitlist.length, enrolledStudents.length]);

  function reload() { setLoadKey((k) => k + 1); }

  function handleEditSuccess() {
    setEditOpen(false);
    reload();
    toast.success("Class updated", "Changes saved.");
  }

  async function handleDelete() {
    setDelError("");
    setDelBusy(true);
    try {
      await deleteClass(classId, delTyped, true);
      toast.success("Class deleted", `${className(record)} has been deleted.`);
      navigate("/classes");
    } catch (err) {
      setDelError(err?.message || "Failed to delete class.");
      setDelBusy(false);
    }
  }

  const title    = record
    ? [record.day, classTime(record)].filter(Boolean).join(" · ") || className(record)
    : "Class detail";
  const subtitle = record
    ? [className(record), record.capacity ? `capacity ${record.capacity}` : ""].filter(Boolean).join(" · ")
    : "";
  const enrolled = record?.enrolledStudents?.length ?? 0;
  const capacity = record?.capacity ?? 0;
  const pct      = capacity > 0 ? Math.round((enrolled / capacity) * 100) : 0;

  const docTutors = docOpen ? (docOpen.tutors || []).map((id) => usersById.get(id) || { uid: id }) : [];
  const docStudents = docOpen
    ? (docOpen.attendance || [])
        .map((id) => studentsById.get(id) || { id })
        .sort((a, b) => displayStudent(a).localeCompare(displayStudent(b), undefined, { sensitivity: "base" }))
    : [];
  const docTerm = docOpen ? termsById.get(docOpen.termId) : null;

  return (
    <>
      <PageHeader
        title={busy ? "Class detail" : title}
        subtitle={subtitle}
        crumbs={[
          { label: "Overview", href: "/" },
          { label: "Classes", href: "/classes" },
          { label: busy ? "Class detail" : className(record) },
        ]}
        actions={
          <div className="row gap-2">
            <Button variant="secondary" onClick={() => navigate("/classes")}>Back to classes</Button>
            {!busy && !error && record ? (
              <>
                <Button variant="secondary" onClick={() => setEditOpen(true)}>Edit</Button>
                <Button variant="danger-outline" onClick={() => setDeleteOpen(true)}>Delete</Button>
              </>
            ) : null}
          </div>
        }
      />

      {busy ? <div className="route-inline-state">Loading class…</div> : null}
      {error ? (
        <div className="banner banner-danger mb-5">
          <div><div className="banner-title">Could not load class</div><div>{error}</div></div>
        </div>
      ) : null}
      {warning ? (
        <div className="banner banner-warn mb-5">
          <Icon className="banner-icon" name="alert" />
          <div><div className="banner-title">Partial data loaded</div><div>{warning}</div></div>
        </div>
      ) : null}

      {!busy && !error && record ? (
        <>
          <section className="grid grid-4 mb-6">
            <StatCard icon="people"     label="Enrolled"        value={`${enrolled} / ${capacity || "—"}`} foot={capacity > 0 ? `${pct}% of capacity` : "Capacity unset"} />
            <StatCard icon="people"     label="Tutors"          value={assignedTutors.length} foot={assignedTutors.length === 0 ? "Unassigned" : assignedTutors.map((t) => t.firstName || displayUser(t)).join(", ")} />
            <StatCard icon="waitlist"   label="Waitlist"        value={activeWaitlist.length} foot="Active or offered" />
            <StatCard icon="attendance" label="Attendance docs" value={attendance.length}     foot="All terms" />
          </section>

          <div className="detail-grid class-detail-grid">
            <div className="col gap-5">
              <div className="card">
                <div className="card-head">
                  <div>
                    <h3>Attendance documents</h3>
                    <div className="card-sub">Weekly rolls for this class. Click a row to inspect the document.</div>
                  </div>
                  <Badge tone="neutral">{sortedAttendance.length} total</Badge>
                </div>
                <div className="card-body flush">
                  {sortedAttendance.length === 0 ? (
                    <EmptyState icon="attendance" title="No attendance documents yet">
                      Documents are generated from Attendance maintenance.
                    </EmptyState>
                  ) : (
                    <Table
                      columns={[
                        {
                          key: "when",
                          header: "Date",
                          render: (row) => (
                            <div className="row-meta">
                              <span className="primary">{shortAttendanceDate(row.dateIso)}</span>
                              <span className="secondary">Week {row.weekNumber ?? "—"}</span>
                            </div>
                          ),
                        },
                        {
                          key: "term",
                          header: "Term",
                          render: (row) => termLabel(termsById.get(row.termId)) || "—",
                        },
                        {
                          key: "tutors",
                          header: "Tutors",
                          render: (row) => {
                            const list = (row.tutors || []).map((id) => usersById.get(id)).filter(Boolean);
                            if (list.length === 0) return <span className="muted">Unassigned</span>;
                            return list.map((t) => t.firstName || displayUser(t)).join(", ");
                          },
                        },
                        {
                          key: "students",
                          header: "Students",
                          render: (row) => Array.isArray(row.attendance) ? row.attendance.length : "—",
                        },
                        {
                          key: "status",
                          header: "Status",
                          render: (row) => row.cancelled
                            ? <Badge tone="danger" dot>Cancelled</Badge>
                            : <Badge tone="success" dot>Active</Badge>,
                        },
                      ]}
                      getRowKey={(row) => row.id}
                      onRowClick={(row) => setDocOpen(row)}
                      rows={sortedAttendance}
                    />
                  )}
                </div>
              </div>

              <div className="card">
                <div className="card-head">
                  <div>
                    <h3>Waitlist</h3>
                    <div className="card-sub">Active and offered entries for this class.</div>
                  </div>
                </div>
                <div className="card-body flush">
                  {activeWaitlist.length === 0 ? (
                    <EmptyState icon="waitlist" title="No active waitlist entries">
                      Carers can add their child via the enrolment portal.
                    </EmptyState>
                  ) : (
                    <Table
                      columns={[
                        {
                          key: "student",
                          header: "Student",
                          render: (row) => {
                            const s = studentsById.get(row.studentId);
                            return s ? displayStudent(s) : <span className="muted">Unknown student</span>;
                          },
                        },
                        {
                          key: "parent",
                          header: "Parent",
                          render: (row) => {
                            const p = usersById.get(row.parentId);
                            return p ? displayUser(p) : <span className="muted">—</span>;
                          },
                        },
                        {
                          key: "status",
                          header: "Status",
                          render: (row) => <Badge tone={row.status === "offered" ? "warn" : "neutral"} dot>{row.status}</Badge>,
                        },
                      ]}
                      getRowKey={(row) => row.id}
                      rows={activeWaitlist.slice(0, 10)}
                    />
                  )}
                </div>
              </div>

              <div className="card">
                <div className="card-head">
                  <div>
                    <h3>Permanent roster</h3>
                    <div className="card-sub">Students enrolled in the recurring slot. Edit class to change.</div>
                  </div>
                  <Badge tone="neutral">{enrolled} enrolled</Badge>
                </div>
                <div className="card-body roster-card-body">
                  {enrolledStudents.length === 0 ? (
                    <EmptyState icon="people" title="No students enrolled">
                      Add students through the Edit class form.
                    </EmptyState>
                  ) : (
                    <div className="roster-chip-grid">
                      {enrolledStudents.map((s) => (
                        <button
                          className="roster-chip"
                          key={s.id}
                          onClick={() => navigate(`/people/students/${s.id}`)}
                          type="button"
                        >
                          <span className="roster-chip-name">{displayStudent(s)}</span>
                          {(s.grade || s.studentYear) ? (
                            <span className="roster-chip-meta">{s.grade || s.studentYear}</span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="col gap-5">
              <div className="card">
                <div className="card-head">
                  <h3>Class details</h3>
                  <Badge tone="brand">class</Badge>
                </div>
                <div className="card-body field-section">
                  <div className="field-readonly"><span className="label">Day</span><div className="readonly-box">{record.day || "—"}</div></div>
                  <div className="field-readonly"><span className="label">Time</span><div className="readonly-box">{classTime(record) || "—"}</div></div>
                  <div className="field-readonly"><span className="label">Capacity</span><div className="readonly-box">{record.capacity ?? "—"}</div></div>
                </div>
              </div>

              <div className="card">
                <div className="card-head">
                  <h3>Tutors</h3>
                  <Badge tone={assignedTutors.length > 0 ? "brand" : "warn"}>{assignedTutors.length > 0 ? `${assignedTutors.length} assigned` : "Unassigned"}</Badge>
                </div>
                <div className="card-body">
                  {assignedTutors.length === 0 ? (
                    <div className="banner banner-warn">
                      <div><div className="banner-title">No tutor assigned</div><div>Assign a tutor through the Edit class form.</div></div>
                    </div>
                  ) : (
                    <div className="col gap-3">
                      {assignedTutors.map((t) => (
                        <div
                          className="row gap-3 cursor-pointer"
                          key={t.uid || t.id}
                          onClick={() => navigate(`/people/tutors/${t.uid || t.id}`)}
                          style={{ cursor: "pointer" }}
                        >
                          <div className="row-meta grow">
                            <span className="primary">{displayUser(t)}</span>
                            <span className="secondary">{t.email || ""}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}

      <EditClassModal
        open={editOpen}
        record={record}
        users={users}
        students={students}
        onClose={() => setEditOpen(false)}
        onSuccess={handleEditSuccess}
      />

      <Modal
        open={Boolean(docOpen)}
        title={docOpen ? `Week ${docOpen.weekNumber ?? "—"} · ${formatAttendanceDate(docOpen.dateIso)}` : ""}
        subtitle={record ? `${className(record)} · ${record.day || ""} ${classTime(record)}`.trim() : ""}
        size="lg"
        onClose={() => setDocOpen(null)}
        footer={<Button variant="secondary" onClick={() => setDocOpen(null)}>Close</Button>}
      >
        {docOpen ? (
          <div className="attendance-doc">
            <div className="attendance-doc-meta">
              <div className="attendance-doc-meta-item">
                <span className="label">Term</span>
                <span className="value">{termLabel(docTerm) || "—"}</span>
              </div>
              <div className="attendance-doc-meta-item">
                <span className="label">Status</span>
                <span className="value">
                  {docOpen.cancelled
                    ? <Badge tone="danger" dot>Cancelled</Badge>
                    : <Badge tone="success" dot>Active</Badge>}
                </span>
              </div>
              <div className="attendance-doc-meta-item">
                <span className="label">Students</span>
                <span className="value">{docStudents.length}</span>
              </div>
              <div className="attendance-doc-meta-item">
                <span className="label">Last updated</span>
                <span className="value">{formatTimestamp(docOpen.updatedAtIso)}</span>
              </div>
            </div>

            <div className="attendance-doc-section">
              <div className="attendance-doc-section-head">
                <h4>Tutors</h4>
                <span className="muted">{docTutors.length || "None"}</span>
              </div>
              {docTutors.length === 0 ? (
                <div className="muted text-sm">No tutors recorded on this document.</div>
              ) : (
                <div className="attendance-doc-list">
                  {docTutors.map((t) => (
                    <div className="attendance-doc-row" key={t.uid || t.id}>
                      <span className="attendance-doc-row-name">{displayUser(t) || "Unknown tutor"}</span>
                      {t.email ? <span className="attendance-doc-row-meta">{t.email}</span> : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="attendance-doc-section">
              <div className="attendance-doc-section-head">
                <h4>Students</h4>
                <span className="muted">{docStudents.length || "None"}</span>
              </div>
              {docStudents.length === 0 ? (
                <div className="muted text-sm">No students were recorded for this document.</div>
              ) : (
                <div className="attendance-doc-list">
                  {docStudents.map((s) => (
                    <div className="attendance-doc-row" key={s.id}>
                      <span className="attendance-doc-row-name">{displayStudent(s) || "Unknown student"}</span>
                      {(s.grade || s.studentYear) ? (
                        <span className="attendance-doc-row-meta">{s.grade || s.studentYear}</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={deleteOpen}
        title="Delete class?"
        subtitle="Deletes the class document and its entire attendance subcollection."
        busy={delBusy}
        onClose={() => { if (!delBusy) setDeleteOpen(false); }}
        footer={null}
      >
        {delError ? (
          <div className="banner banner-danger mb-4">
            <div><div className="banner-title">Delete failed</div><div>{delError}</div></div>
          </div>
        ) : null}

        {blockers.length > 0 ? (
          <>
            <div className="banner banner-danger mb-4">
              <div><div className="banner-title">Cannot delete: prerequisites not met</div><div>Resolve the blockers below before deleting this class.</div></div>
            </div>
            <ul className="col gap-2 mb-4" style={{ listStyle: "none", padding: 0 }}>
              {blockers.map((b, i) => (
                <li className="row gap-2" key={i} style={{ padding: "10px 14px", background: "var(--ink-50)", borderRadius: "var(--r-md)" }}>
                  <Icon name="alert" size={15} style={{ color: "var(--danger-500)", flexShrink: 0 }} />
                  <span className="text-sm">{b}</span>
                </li>
              ))}
            </ul>
            <div className="row gap-2" style={{ justifyContent: "flex-end" }}>
              <Button onClick={() => setDeleteOpen(false)} variant="secondary">Close</Button>
            </div>
          </>
        ) : (
          <>
            <div className="banner banner-danger mb-4">
              <div><div className="banner-title">This action is permanent</div><div>Deletes the class document and all attendance subcollection entries. This cannot be undone.</div></div>
            </div>
            <div className="field mb-4">
              <span className="label">Type the class ID <span className="text-mono" style={{ background: "var(--ink-100)", padding: "2px 6px", borderRadius: 4 }}>{classId}</span> to confirm</span>
              <input
                autoFocus
                className={`input${delTyped && delTyped !== classId ? " error-state" : ""}`}
                disabled={delBusy}
                value={delTyped}
                onChange={(e) => setDelTyped(e.target.value)}
              />
            </div>
            <label className="checkbox mb-4">
              <input
                checked={delAckAtt}
                disabled={delBusy}
                type="checkbox"
                onChange={(e) => setDelAckAtt(e.target.checked)}
              />
              <span>I understand that all attendance documents for this class will also be deleted.</span>
            </label>
            <div className="row gap-2" style={{ justifyContent: "flex-end" }}>
              <Button disabled={delBusy} onClick={() => setDeleteOpen(false)} variant="secondary">Cancel</Button>
              <Button
                disabled={delBusy || delTyped !== classId || !delAckAtt}
                loading={delBusy}
                onClick={handleDelete}
                variant="danger"
              >
                Delete class permanently
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
