import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { listClasses } from "../backend/classesApi";
import { listInvoiceDrafts, listInvoices } from "../backend/invoicesApi";
import { deleteStudent, getStudent, listStudents, unlinkStudentFromParent } from "../backend/studentsApi";
import { deleteUser, getUser, listUsers } from "../backend/usersApi";
import AdjustTokensModal from "../components/AdjustTokensModal";
import Badge from "../components/Badge";
import Button from "../components/Button";
import ConfirmDialog from "../components/ConfirmDialog";
import EditStudentModal from "../components/EditStudentModal";
import EditUserModal from "../components/EditUserModal";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import LinkRecordModal from "../components/LinkRecordModal";
import PageHeader from "../components/PageHeader";
import StudentResourceHistory from "../components/resources/StudentResourceHistory";
import Table from "../components/Table";
import { useToast } from "../components/ToastProvider";

const USER_KINDS = new Map([
  ["parents", "parent"],
  ["tutors",  "tutor"],
  ["admins",  "admin"],
]);

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_ORDER = Object.fromEntries(DAYS.map((day, index) => [day.toLowerCase(), index]));

function fullName(firstName, lastName) {
  return `${String(firstName || "").trim()} ${String(lastName || "").trim()}`.trim();
}

function userName(user) {
  return user?.displayName || fullName(user?.firstName, user?.lastName) || user?.email || "Unknown user";
}

function studentName(student) {
  return student?.displayName || fullName(student?.firstName, student?.lastName) || "Unknown student";
}

function studentParentIds(student) {
  const parents = student?.parents || student?.parentIds || [];
  return Array.isArray(parents) ? parents.filter(Boolean) : [];
}

function userStudentIds(user) {
  const students = user?.students || user?.studentIds || [];
  return Array.isArray(students) ? students.filter(Boolean) : [];
}

function classStudentIds(classDoc) {
  const enrolled = classDoc?.enrolledStudents || [];
  return Array.isArray(enrolled) ? enrolled.filter(Boolean) : [];
}

function classTutorIds(classDoc) {
  const tutors = classDoc?.tutors || [];
  return Array.isArray(tutors) ? tutors.filter(Boolean) : [];
}

function formatValue(value) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (value === null || value === undefined || value === "") return "(empty)";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "(empty)";
  return String(value);
}

function formatMoney(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amount);
}

function formatDateTime(iso) {
  if (!iso) return "Not recorded";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Not recorded";
  return d.toLocaleString();
}

function invoiceLineItemsTotal(invoice) {
  const lines = Array.isArray(invoice?.lineItems) ? invoice.lineItems : [];
  return lines.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
}

function invoiceOriginalTotal(invoice) {
  const lineTotal = invoiceLineItemsTotal(invoice);
  if (Math.abs(lineTotal) >= 0.01) return lineTotal;
  if (typeof invoice?.amountDueComputed === "number") return invoice.amountDueComputed;
  if (typeof invoice?.total === "number") return invoice.total;
  if (typeof invoice?.totalAmount === "number") return invoice.totalAmount;
  return Number(invoice?.amountDue || 0);
}

function invoiceOutstanding(invoice) {
  if (invoice?.draft || invoice?.status === "draft" || invoice?.status === "paid") return 0;
  if (typeof invoice?.amountDue === "number") return invoice.amountDue;
  return invoiceOriginalTotal(invoice);
}

function invoicePaid(invoice) {
  if (invoice?.draft || invoice?.status === "draft") return 0;
  const originalTotal = invoiceOriginalTotal(invoice);
  if (invoice?.status === "paid") return originalTotal;
  return Math.max(0, originalTotal - invoiceOutstanding(invoice));
}

function renderField(label, value) {
  return (
    <div className="field-readonly">
      <span className="label">{label}</span>
      <div className="readonly-box">{formatValue(value)}</div>
    </div>
  );
}

function className(classDoc) {
  return classDoc?.name || classDoc?.type || "Class";
}

function classDay(classDoc) {
  return String(classDoc?.day || "").trim() || "Unscheduled";
}

function dayRank(day) {
  return DAY_ORDER[String(day || "").trim().toLowerCase()] ?? 99;
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

function formatClassTimeValue(value) {
  const minutes = timeToMinutes(value);
  if (!Number.isFinite(minutes)) return String(value || "").trim();

  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function classTime(classDoc) {
  const start = formatClassTimeValue(classDoc?.startTime);
  const end = formatClassTimeValue(classDoc?.endTime);
  if (!start) return "-";
  return end ? `${start} - ${end}` : start;
}

function sortClassesBySchedule(rows) {
  return [...rows].sort((a, b) => {
    const dayDiff = dayRank(a.day) - dayRank(b.day);
    if (dayDiff !== 0) return dayDiff;

    const timeDiff = timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
    if (timeDiff !== 0) return timeDiff;

    return className(a).localeCompare(className(b), undefined, { sensitivity: "base" });
  });
}

export default function PeopleDetailPage() {
  const navigate  = useNavigate();
  const toast     = useToast();
  const { kind, id } = useParams();

  const [record,   setRecord]   = useState(null);
  const [users,    setUsers]    = useState([]);
  const [students, setStudents] = useState([]);
  const [classes,  setClasses]  = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [busy,     setBusy]     = useState(true);
  const [error,    setError]    = useState("");
  const [warning,  setWarning]  = useState("");
  const [loadKey,  setLoadKey]  = useState(0);

  // modal open states
  const [editOpen,   setEditOpen]   = useState(false);
  const [tokensOpen, setTokensOpen] = useState(false);
  const [linkOpen,   setLinkOpen]   = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // unlink confirm
  const [unlinkTarget, setUnlinkTarget] = useState(null); // { parentId, studentId, name }
  const [mutBusy,      setMutBusy]      = useState(false);

  const isStudent = kind === "students";
  const role      = USER_KINDS.get(kind);
  const validKind = isStudent || Boolean(role);
  const canLink   = isStudent || role === "parent";

  useEffect(() => {
    let cancelled = false;

    async function loadDetail() {
      setBusy(true);
      setError("");
      setWarning("");

      if (!validKind || !id) {
        setError("Unknown people detail route.");
        setBusy(false);
        return;
      }

      try {
        const needsInvoices = role === "parent";
        const [
          recordResult,
          usersResult,
          studentsResult,
          classesResult,
          invoicesResult,
          draftsResult,
        ] = await Promise.allSettled([
          isStudent ? getStudent(id) : getUser(id),
          listUsers(),
          listStudents(),
          listClasses(),
          needsInvoices ? listInvoices()      : Promise.resolve([]),
          needsInvoices ? listInvoiceDrafts() : Promise.resolve([]),
        ]);

        if (cancelled) return;
        if (recordResult.status === "rejected") throw recordResult.reason;
        if (!recordResult.value) throw new Error(`${isStudent ? "Student" : "User"} not found: ${id}`);

        setRecord(recordResult.value);
        setUsers(usersResult.status      === "fulfilled" ? usersResult.value    : []);
        setStudents(studentsResult.status === "fulfilled" ? studentsResult.value : []);
        setClasses(classesResult.status  === "fulfilled" ? classesResult.value  : []);

        const invoiceRows = [
          ...(invoicesResult.status === "fulfilled" ? invoicesResult.value : []),
          ...(draftsResult.status   === "fulfilled" ? draftsResult.value   : []),
        ];
        setInvoices(invoiceRows);

        const optionalFailures = [usersResult, studentsResult, classesResult, invoicesResult, draftsResult]
          .filter((r) => r.status === "rejected")
          .map((r) => r.reason?.message || "Some related data could not be loaded.");
        if (optionalFailures.length) setWarning(optionalFailures[0]);
      } catch (e) {
        console.error(e);
        if (!cancelled) setError(e?.message || "Failed to load people detail.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    }

    loadDetail();
    return () => { cancelled = true; };
  }, [id, isStudent, role, validKind, loadKey]);

  const usersById    = useMemo(() => new Map(users.map((row)    => [row.uid || row.id, row])), [users]);
  const studentsById = useMemo(() => new Map(students.map((row) => [row.id, row])),             [students]);

  const linkedStudents = useMemo(() => {
    if (!record || isStudent) return [];
    const explicit = new Set(userStudentIds(record));
    const uid = record.uid || record.id;
    return students.filter((student) => {
      const parentIds = studentParentIds(student);
      return explicit.has(student.id) || parentIds.includes(uid);
    });
  }, [isStudent, record, students]);

  const linkedParents = useMemo(() => {
    if (!record || !isStudent) return [];
    return studentParentIds(record)
      .map((parentId) => usersById.get(parentId) || { uid: parentId, id: parentId })
      .filter(Boolean);
  }, [isStudent, record, usersById]);

  const assignedClasses = useMemo(() => {
    if (!record) return [];
    if (isStudent)         return classes.filter((c) => classStudentIds(c).includes(record.id));
    if (role === "tutor" || role === "admin") {
      return sortClassesBySchedule(classes.filter((c) => classTutorIds(c).includes(record.uid || record.id)));
    }
    return [];
  }, [classes, isStudent, record, role]);

  const relatedInvoices = useMemo(() => {
    if (!record) return [];
    if (isStudent) return [];
    return invoices.filter((inv) => inv.parentId === (record.uid || record.id));
  }, [invoices, isStudent, record]);

  const primaryParentName = useMemo(() => {
    if (!record || !isStudent) return "";
    const parentId = record.primaryParentId || studentParentIds(record)[0];
    if (!parentId) return "No primary parent";
    return userName(usersById.get(parentId));
  }, [isStudent, record, usersById]);

  const invoiceSummary = useMemo(() => {
    return relatedInvoices.reduce(
      (summary, invoice) => ({
        paid: summary.paid + invoicePaid(invoice),
        outstanding: summary.outstanding + invoiceOutstanding(invoice),
      }),
      { paid: 0, outstanding: 0 }
    );
  }, [relatedInvoices]);

  // ── mutation handlers ───────────────────────────────────────────────────────

  function reload() {
    setLoadKey((k) => k + 1);
  }

  function handleEditSuccess() {
    setEditOpen(false);
    reload();
    toast.success("Saved", `${isStudent ? "Student" : "Account"} details updated.`);
  }

  function handleTokensSuccess() {
    setTokensOpen(false);
    reload();
    toast.success("Tokens adjusted", "Lesson token balance has been updated.");
  }

  function handleLinkSuccess() {
    setLinkOpen(false);
    reload();
    toast.success("Linked", "Record has been linked successfully.");
  }

  async function confirmUnlink() {
    if (!unlinkTarget) return;
    setMutBusy(true);
    try {
      await unlinkStudentFromParent(unlinkTarget.parentId, unlinkTarget.studentId);
      const name = unlinkTarget.name;
      setUnlinkTarget(null);
      reload();
      toast.success("Unlinked", `${name} has been unlinked.`);
    } catch (err) {
      toast.error("Failed to unlink", err?.message || "An error occurred.");
    } finally {
      setMutBusy(false);
    }
  }

  async function handleDelete({ typed }) {
    setMutBusy(true);
    try {
      if (isStudent) {
        await deleteStudent(record.id, typed);
      } else {
        await deleteUser(record.uid || record.id, typed);
      }
      toast.success("Deleted", `${isStudent ? "Student record" : "User account"} has been deleted.`);
      navigate("/people");
    } catch (err) {
      toast.error("Delete failed", err?.message || "An error occurred.");
      setMutBusy(false);
    }
  }

  // ── render helpers ──────────────────────────────────────────────────────────

  const title    = isStudent ? studentName(record) : userName(record);
  const subtitle = "";

  function renderStudentRows(rows) {
    if (!rows.length) {
      return <EmptyState icon="people" title="No linked students">No student records are linked.</EmptyState>;
    }

    return (
      <Table
        columns={[
          { key: "name",    header: "Student", render: (row) => studentName(row) },
          { key: "year",    header: "Year",    render: (row) => row.grade || row.studentYear || row.year || "-" },
          { key: "parents", header: "Parents", render: (row) => studentParentIds(row).length },
          {
            key: "unlink",
            header: "",
            render: (row) => (
              <Button
                size="sm"
                variant="danger-outline"
                onClick={(e) => {
                  e.stopPropagation();
                  setUnlinkTarget({
                    parentId:  record.uid || record.id,
                    studentId: row.id,
                    name:      studentName(row),
                  });
                }}
              >
                Unlink
              </Button>
            ),
          },
        ]}
        getRowKey={(row) => row.id}
        onRowClick={(row) => navigate(`/people/students/${row.id}`)}
        rows={rows}
      />
    );
  }

  function renderParentRows(rows) {
    if (!rows.length) {
      return <EmptyState icon="people" title="No linked parents">No parent records are linked.</EmptyState>;
    }

    return (
      <Table
        columns={[
          { key: "name",    header: "Parent", render: (row) => userName(row) },
          { key: "email",   header: "Email",  render: (row) => row.email || "-" },
          {
            key: "primary",
            header: "Primary",
            render: (row) => (record?.primaryParentId === (row.uid || row.id) ? <Badge tone="brand">Primary</Badge> : "-"),
          },
          {
            key: "unlink",
            header: "",
            render: (row) => (
              <Button
                size="sm"
                variant="danger-outline"
                onClick={(e) => {
                  e.stopPropagation();
                  setUnlinkTarget({
                    parentId:  row.uid || row.id,
                    studentId: record.id,
                    name:      userName(row),
                  });
                }}
              >
                Unlink
              </Button>
            ),
          },
        ]}
        getRowKey={(row) => row.uid || row.id}
        onRowClick={(row) => navigate(`/people/parents/${row.uid || row.id}`)}
        rows={rows}
      />
    );
  }

  function renderClassRows(rows) {
    if (!rows.length) {
      return <EmptyState icon="classes" title="No assigned classes">No matching class assignments were found.</EmptyState>;
    }

    return (
      <Table
        columns={[
          { key: "time",     header: "Time",     render: (row) => classTime(row) },
          { key: "capacity", header: "Capacity", render: (row) => `${row.enrolledCount || 0}/${row.capacity || "-"}` },
          { key: "class",    header: "Class",    render: (row) => className(row) },
        ]}
        getGroupKey={(row) => classDay(row)}
        getRowKey={(row) => row.id}
        onRowClick={(row) => navigate(`/classes/${row.id}`)}
        rows={rows}
      />
    );
  }

  function renderInvoiceCard() {
    return (
      <aside className="card people-invoice-card">
        <div className="card-head">
          <div>
            <h3>Invoices</h3>
          </div>
        </div>
        <div className="card-body">
          <div className="people-invoice-summary">
            <div>
              <span className="label">Paid</span>
              <strong>{formatMoney(invoiceSummary.paid)}</strong>
            </div>
            <div>
              <span className="label">Outstanding</span>
              <strong>{formatMoney(invoiceSummary.outstanding)}</strong>
            </div>
          </div>
        </div>
      </aside>
    );
  }

  function renderActionsCard() {
    return (
      <aside className="card people-actions-card">
        <div className="card-head">
          <div>
            <h3>Actions</h3>
            <div className="card-sub">Edit or link records.</div>
          </div>
        </div>
        <div className="card-body grid gap-2">
          <Button onClick={() => setEditOpen(true)} variant="secondary">
            {isStudent ? "Edit student" : "Edit account"}
          </Button>
          {role === "parent" ? (
            <Button onClick={() => setTokensOpen(true)} variant="secondary">
              Adjust lesson tokens
            </Button>
          ) : null}
          {canLink ? (
            <Button onClick={() => setLinkOpen(true)} variant="secondary">
              {isStudent ? "Link parent" : "Link student"}
            </Button>
          ) : null}
          <Button onClick={() => setDeleteOpen(true)} variant="danger-outline">
            {isStudent ? "Delete student" : "Delete user"}
          </Button>
        </div>
      </aside>
    );
  }

  function renderSidePanel() {
    return (
      <div className={`people-detail-side${role === "parent" ? " people-detail-side-finance" : ""}`}>
        {role === "parent" ? renderInvoiceCard() : null}
        {renderActionsCard()}
      </div>
    );
  }

  function renderMetadata() {
    if (!record?.createdAtIso && !record?.updatedAtIso) return null;
    return (
      <div className="people-metadata">
        <div>
          <span>Created</span>
          <strong>{formatDateTime(record.createdAtIso)}</strong>
        </div>
        <div>
          <span>Updated</span>
          <strong>{formatDateTime(record.updatedAtIso)}</strong>
        </div>
      </div>
    );
  }

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <PageHeader
        title={busy ? "People detail" : title}
        subtitle={subtitle}
        crumbs={[{ label: "Overview", href: "/" }, { label: "People", href: "/people" }, { label: busy ? "Detail" : title }]}
        actions={<Button onClick={() => navigate("/people")} variant="secondary">Back to people</Button>}
      />

      {busy ? <div className="route-inline-state">Loading people detail...</div> : null}

      {error ? (
        <div className="banner banner-danger">
          <div>
            <div className="banner-title">Could not load record</div>
            <div>{error}</div>
          </div>
        </div>
      ) : null}

      {warning ? (
        <div className="banner banner-warn mb-5">
          <Icon className="banner-icon" name="alert" />
          <div>
            <div className="banner-title">Partial data loaded</div>
            <div>{warning}</div>
          </div>
        </div>
      ) : null}

      {!busy && !error && record ? (
        <div className="detail-grid">
          <div className="card">
            <div className="card-head">
              <div>
                <h3>{isStudent ? "Student details" : "Account details"}</h3>
                <div className="card-sub">{isStudent ? primaryParentName : record.email || subtitle}</div>
              </div>
              <Badge tone="brand">{isStudent ? "student" : role}</Badge>
            </div>
            <div className="card-body field-section">
              {isStudent ? (
                <>
                  {renderField("Name",           studentName(record))}
                  {renderField("Year",           record.grade || record.studentYear || record.year)}
                  {renderField("Subjects",       record.subjects || record.studentSubjects)}
                  {renderField("Primary parent", primaryParentName)}
                  {renderMetadata()}
                </>
              ) : (
                <>
                  {renderField("Name",          userName(record))}
                  {renderField("Email",         record.email)}
                  {renderField("Phone",         record.phone)}
                  {renderField("Role",          record.role)}
                  {role === "parent" ? renderField("Lesson tokens", Number(record.lessonTokens || 0)) : null}
                  {renderMetadata()}
                </>
              )}
            </div>
          </div>

          {renderSidePanel()}

          <div className="card">
            <div className="card-head">
              <div>
                <h3>{isStudent ? "Parents" : role === "parent" ? "Students" : "Classes"}</h3>
                {isStudent || role === "parent" ? (
                  <div className="card-sub">Linked relationship records. Use the unlink button to remove a link.</div>
                ) : null}
              </div>
            </div>
            <div className="card-body flush">
              {isStudent
                ? renderParentRows(linkedParents)
                : role === "parent"
                  ? renderStudentRows(linkedStudents)
                  : renderClassRows(assignedClasses)}
            </div>
          </div>

          {isStudent ? (
            <div className="card rg-detail-wide">
              <div className="card-head">
                <div>
                  <h3>Resources</h3>
                  <div className="card-sub">Generated teaching resources for this student.</div>
                </div>
              </div>
              <div className="card-body flush">
                <StudentResourceHistory studentId={record.id} />
              </div>
            </div>
          ) : null}

        </div>
      ) : null}

      {/* Edit modal */}
      {isStudent ? (
        <EditStudentModal
          open={editOpen}
          record={record}
          onClose={() => setEditOpen(false)}
          onSuccess={handleEditSuccess}
        />
      ) : (
        <EditUserModal
          open={editOpen}
          record={record}
          onClose={() => setEditOpen(false)}
          onSuccess={handleEditSuccess}
        />
      )}

      {/* Adjust tokens — parent only */}
      {role === "parent" ? (
        <AdjustTokensModal
          open={tokensOpen}
          record={record}
          onClose={() => setTokensOpen(false)}
          onSuccess={handleTokensSuccess}
        />
      ) : null}

      {/* Link record — student or parent */}
      {canLink ? (
        <LinkRecordModal
          open={linkOpen}
          record={record}
          isStudent={isStudent}
          users={users}
          students={students}
          onClose={() => setLinkOpen(false)}
          onSuccess={handleLinkSuccess}
        />
      ) : null}

      {/* Unlink confirm */}
      <ConfirmDialog
        open={Boolean(unlinkTarget)}
        title={`Unlink ${unlinkTarget?.name ?? "record"}?`}
        message="This removes the link between the parent and student. Both records will remain. The action can be reversed by re-linking."
        confirmLabel="Unlink"
        tone="danger"
        busy={mutBusy}
        onCancel={() => { if (!mutBusy) setUnlinkTarget(null); }}
        onConfirm={confirmUnlink}
      />

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteOpen}
        title={isStudent ? "Delete student record?" : "Delete user account?"}
        message={
          isStudent
            ? "This permanently deletes the student record. All class enrolments will also be removed."
            : "This permanently deletes the Firebase Auth account and Firestore user document. Parents with linked students cannot be deleted until students are unlinked."
        }
        confirmLabel={isStudent ? "Delete student" : "Delete user"}
        tone="danger"
        typedValue={isStudent ? studentName(record) : record?.email}
        busy={mutBusy}
        onCancel={() => { if (!mutBusy) setDeleteOpen(false); }}
        onConfirm={handleDelete}
      />
    </>
  );
}
