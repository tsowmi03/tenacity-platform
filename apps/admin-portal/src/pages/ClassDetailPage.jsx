import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { deleteClass, getClass } from "../backend/classesApi";
import { generateAttendanceForClass, listAttendance } from "../backend/attendanceApi";
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

function className(c) {
  return c?.type || c?.name || c?.id || "Unnamed class";
}

function classTime(c) {
  if (!c?.startTime) return "";
  return c.endTime ? `${c.startTime}–${c.endTime}` : c.startTime;
}

function fullName(r) {
  return `${String(r?.firstName || "").trim()} ${String(r?.lastName || "").trim()}`.trim();
}
function displayUser(u) {
  return u?.displayName || fullName(u) || u?.email || u?.uid || "Unknown";
}
function displayStudent(s) {
  return s?.displayName || fullName(s) || s?.id || "Unknown";
}
function termLabel(t) {
  return `${t.year} Term ${t.termNum}${t.status === "active" ? " (active)" : ""}`;
}

function CheckList({ items, selected, onToggle, getKey, getLabel, getSub, placeholder, disabled }) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const label = getLabel(item).toLowerCase();
      const sub = getSub ? getSub(item).toLowerCase() : "";
      return label.includes(q) || sub.includes(q);
    });
  }, [getLabel, getSub, items, search]);
  return (
    <div className="check-list-wrap">
      <div className="check-list-search">
        <Icon className="search-icon" name="search" size={13} />
        <input disabled={disabled} placeholder={placeholder || "Search"} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="check-list-body">
        {filtered.length === 0 ? <div className="muted text-sm p-3">No records found.</div> : filtered.map((item) => {
          const key = getKey(item);
          const checked = selected.includes(key);
          return (
            <label className={`check-list-item${checked ? " checked" : ""}`} key={key}>
              <input checked={checked} disabled={disabled} type="checkbox" onChange={() => onToggle(key)} />
              <div className="row-meta grow">
                <span className="primary">{getLabel(item)}</span>
                {getSub ? <span className="secondary">{getSub(item)}</span> : null}
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
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

  // modal states
  const [editOpen,   setEditOpen]   = useState(false);
  const [genOpen,    setGenOpen]    = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // generate attendance form state
  const [genTermIds, setGenTermIds]   = useState([]);
  const [genFromDate, setGenFromDate] = useState("");
  const [genOverwrite, setGenOverwrite] = useState(false);
  const [genBusy,    setGenBusy]     = useState(false);
  const [genError,   setGenError]    = useState("");

  // delete form state
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
      if (!rR.value) throw new Error(`Class not found: ${classId}`);

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
    if (genOpen) {
      setGenFromDate(new Date().toISOString().slice(0, 10));
      setGenOverwrite(false);
      setGenError("");
      const active = terms.filter((t) => t.status === "active").map((t) => t.id);
      setGenTermIds(active.length ? active : terms.slice(0, 1).map((t) => t.id));
    }
  }, [genOpen, terms]);

  useEffect(() => {
    if (deleteOpen) {
      setDelTyped("");
      setDelAckAtt(false);
      setDelError("");
    }
  }, [deleteOpen]);

  const usersById    = useMemo(() => new Map(users.map((u) => [u.uid || u.id, u])),   [users]);
  const studentsById = useMemo(() => new Map(students.map((s) => [s.id, s])),          [students]);

  const assignedTutors    = useMemo(() => (record?.tutors || []).map((id) => usersById.get(id)).filter(Boolean), [record, usersById]);
  const enrolledStudents  = useMemo(() => (record?.enrolledStudents || []).map((id) => studentsById.get(id)).filter(Boolean), [record, studentsById]);
  const activeWaitlist    = useMemo(() => waitlist.filter((w) => w.status === "active" || w.status === "offered"), [waitlist]);

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

  async function handleGenerateAttendance() {
    setGenError("");
    setGenBusy(true);
    try {
      const result = await generateAttendanceForClass({
        classId,
        termIds:  genTermIds,
        fromDate: genFromDate || undefined,
        overwrite: genOverwrite,
      });
      setGenOpen(false);
      reload();
      const written    = result?.written    ?? result?.docsWritten    ?? "?";
      const skipped    = result?.skipped    ?? result?.docsSkipped    ?? "?";
      const considered = result?.considered ?? result?.docsConsidered ?? "?";
      toast.success("Attendance generated", `Wrote ${written} of ${considered} docs. Skipped ${skipped} existing.`);
    } catch (err) {
      setGenError(err?.message || "Failed to generate attendance.");
    } finally {
      setGenBusy(false);
    }
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

  const title     = record ? className(record) : "Class detail";
  const subtitle  = record ? `${record.day || ""}${classTime(record) ? ` · ${classTime(record)}` : ""}${record.capacity ? ` · capacity ${record.capacity}` : ""}`.replace(/^·\s*/, "") : "";
  const enrolled  = record?.enrolledStudents?.length ?? 0;
  const capacity  = record?.capacity ?? 0;
  const pct       = capacity > 0 ? Math.round((enrolled / capacity) * 100) : 0;

  return (
    <>
      <PageHeader
        title={busy ? "Class detail" : title}
        subtitle={subtitle}
        crumbs={[{ label: "Overview", href: "/" }, { label: "Classes", href: "/classes" }, { label: classId }]}
        actions={
          <div className="row gap-2">
            <Button variant="secondary" onClick={() => navigate("/classes")}>Back to classes</Button>
            {!busy && !error && record ? (
              <>
                <Button variant="secondary" onClick={() => setGenOpen(true)}>Generate attendance</Button>
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
            <StatCard icon="people"     label="Enrolled"       value={`${enrolled} / ${capacity}`} foot={`${pct}% of capacity`} />
            <StatCard icon="people"     label="Tutors"         value={assignedTutors.length}       foot={assignedTutors.length === 0 ? "Unassigned" : assignedTutors.map((t) => t.firstName || displayUser(t)).join(", ")} />
            <StatCard icon="waitlist"   label="Waitlist"       value={activeWaitlist.length}       foot="Active or offered" />
            <StatCard icon="attendance" label="Attendance docs" value={attendance.length}           foot="All terms" />
          </section>

          <div className="detail-grid">
            {/* Roster */}
            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Permanent roster</h3>
                  <div className="card-sub">Enrolled students. Edit the class to add or remove students.</div>
                </div>
                <Badge tone="neutral">{enrolled} enrolled</Badge>
              </div>
              <div className="card-body flush">
                {enrolledStudents.length === 0 ? (
                  <EmptyState icon="people" title="No students enrolled">
                    Add students through the Edit class form.
                  </EmptyState>
                ) : (
                  <Table
                    columns={[
                      { key: "name",     header: "Student",  render: (row) => displayStudent(row) },
                      { key: "year",     header: "Year",     render: (row) => row.grade || row.studentYear || "-" },
                      { key: "subjects", header: "Subjects", render: (row) => {
                        const subs = row.subjects || row.studentSubjects || [];
                        return Array.isArray(subs) && subs.length ? subs.slice(0, 2).join(", ") + (subs.length > 2 ? ` +${subs.length - 2}` : "") : "-";
                      }},
                    ]}
                    getRowKey={(row) => row.id}
                    onRowClick={(row) => navigate(`/people/students/${row.id}`)}
                    rows={enrolledStudents}
                  />
                )}
              </div>
            </div>

            {/* Right column */}
            <div className="col gap-5">
              {/* Class details */}
              <div className="card">
                <div className="card-head">
                  <h3>Class details</h3>
                  <Badge tone="brand">class</Badge>
                </div>
                <div className="card-body field-section">
                  <div className="field-readonly"><span className="label">ID</span><div className="readonly-box text-mono">{record.id}</div></div>
                  <div className="field-readonly"><span className="label">Day</span><div className="readonly-box">{record.day || "(empty)"}</div></div>
                  <div className="field-readonly"><span className="label">Time</span><div className="readonly-box">{classTime(record) || "(empty)"}</div></div>
                  <div className="field-readonly"><span className="label">Capacity</span><div className="readonly-box">{record.capacity ?? "(empty)"}</div></div>
                  <div className="field-readonly"><span className="label">Created</span><div className="readonly-box">{record.createdAtIso || "(empty)"}</div></div>
                </div>
              </div>

              {/* Tutors */}
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

            {/* Attendance docs */}
            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Attendance docs</h3>
                  <div className="card-sub">Weekly attendance documents. Daily marking stays in the Flutter app.</div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setGenOpen(true)}>
                  Generate
                </Button>
              </div>
              <div className="card-body flush">
                {attendance.length === 0 ? (
                  <EmptyState icon="attendance" title="No attendance docs">
                    Generate attendance docs for this class from the Generate attendance modal.
                  </EmptyState>
                ) : (
                  <Table
                    columns={[
                      { key: "week",   header: "Week",    render: (row) => <span className="text-mono">W{row.weekNum ?? "-"}</span> },
                      { key: "termId", header: "Term",    render: (row) => row.termId || row.id.split("_")[0] || "-" },
                      { key: "status", header: "Status",  render: (row) => row.cancelled
                        ? <Badge tone="danger" dot>Cancelled</Badge>
                        : <Badge tone="success" dot>Active</Badge>
                      },
                      { key: "count",  header: "Students", render: (row) => Array.isArray(row.attendance) ? row.attendance.length : "-" },
                    ]}
                    getRowKey={(row) => row.id}
                    rows={attendance}
                  />
                )}
              </div>
            </div>

            {/* Waitlist summary */}
            {activeWaitlist.length > 0 ? (
              <aside className="card">
                <div className="card-head">
                  <div>
                    <h3>Waitlist ({activeWaitlist.length})</h3>
                    <div className="card-sub">Active and offered entries. Manage from the Waitlist page.</div>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => navigate("/waitlist")}>
                    Manage
                  </Button>
                </div>
                <div className="card-body flush">
                  <Table
                    columns={[
                      { key: "student", header: "Student", render: (row) => {
                        const s = studentsById.get(row.studentId);
                        return s ? displayStudent(s) : row.studentId;
                      }},
                      { key: "status", header: "Status", render: (row) => <Badge tone={row.status === "offered" ? "warn" : "neutral"} dot>{row.status}</Badge> },
                    ]}
                    getRowKey={(row) => row.id}
                    rows={activeWaitlist.slice(0, 8)}
                  />
                </div>
              </aside>
            ) : null}
          </div>
        </>
      ) : null}

      {/* Edit modal */}
      <EditClassModal
        open={editOpen}
        record={record}
        users={users}
        students={students}
        onClose={() => setEditOpen(false)}
        onSuccess={handleEditSuccess}
      />

      {/* Generate attendance modal */}
      <Modal
        open={genOpen}
        title="Generate attendance"
        subtitle="Write weekly attendance docs for this class. Existing docs are skipped unless overwrite is on."
        size="lg"
        busy={genBusy}
        onClose={() => { if (!genBusy) setGenOpen(false); }}
        footer={
          <>
            <Button disabled={genBusy} onClick={() => setGenOpen(false)} variant="secondary">Cancel</Button>
            <Button disabled={genBusy || genTermIds.length === 0} loading={genBusy} onClick={handleGenerateAttendance} variant="primary">
              Run generation
            </Button>
          </>
        }
      >
        {genError ? (
          <div className="banner banner-danger mb-4">
            <div><div className="banner-title">Generation failed</div><div>{genError}</div></div>
          </div>
        ) : null}

        <div className="grid gap-4">
          <div className="field">
            <span className="label">Terms to generate for <span className="req">*</span></span>
            <CheckList
              disabled={genBusy}
              items={terms}
              selected={genTermIds}
              placeholder="Search terms"
              getKey={(t) => t.id}
              getLabel={(t) => termLabel(t)}
              onToggle={(id) => setGenTermIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])}
            />
          </div>
          <div className="field">
            <span className="label">From date <span className="label-hint">optional — defaults to term start</span></span>
            <input
              className="input"
              disabled={genBusy}
              type="date"
              value={genFromDate}
              onChange={(e) => setGenFromDate(e.target.value)}
            />
          </div>
          <div className={`propagation-row${genOverwrite ? " warn" : ""}`}>
            <div>
              <div className="prop-label">Overwrite existing docs</div>
              <div className="prop-sub">{genOverwrite ? "Existing attendance docs for matching weeks will be replaced." : "Weeks that already have docs are skipped."}</div>
            </div>
            <div
              className={`switch${genOverwrite ? " on" : ""}`}
              role="switch"
              aria-checked={genOverwrite}
              onClick={() => !genBusy && setGenOverwrite((v) => !v)}
            />
          </div>
          {genOverwrite ? (
            <div className="banner banner-warn">
              <Icon className="banner-icon" name="alert" />
              <div><div className="banner-title">Overwrite is destructive</div><div>Existing attendance lists for matching weeks will be replaced with the current class roster.</div></div>
            </div>
          ) : null}
        </div>
      </Modal>

      {/* Delete modal */}
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
              <span>I understand that all attendance subcollection entries will also be deleted (<span className="text-mono">deleteAttendance: true</span>).</span>
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
