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
import Table from "../components/Table";
import { useToast } from "../components/ToastProvider";

const USER_KINDS = new Map([
  ["parents", "parent"],
  ["tutors",  "tutor"],
  ["admins",  "admin"],
]);

function fullName(firstName, lastName) {
  return `${String(firstName || "").trim()} ${String(lastName || "").trim()}`.trim();
}

function userName(user) {
  return user?.displayName || fullName(user?.firstName, user?.lastName) || user?.email || user?.uid || "Unknown user";
}

function studentName(student) {
  return student?.displayName || fullName(student?.firstName, student?.lastName) || student?.id || "Unknown student";
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

function invoiceAmount(invoice) {
  return invoice?.amountDue ?? invoice?.amountDueComputed ?? invoice?.total ?? invoice?.totalAmount ?? 0;
}

function renderField(label, value) {
  return (
    <div className="field-readonly">
      <span className="label">{label}</span>
      <div className="readonly-box">{formatValue(value)}</div>
    </div>
  );
}

function classLabel(classDoc) {
  return [classDoc?.day, classDoc?.startTime, classDoc?.endTime].filter(Boolean).join(" ");
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
        const needsInvoices = isStudent || role === "parent";
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
    if (role === "tutor")  return classes.filter((c) => classTutorIds(c).includes(record.uid || record.id));
    return [];
  }, [classes, isStudent, record, role]);

  const relatedInvoices = useMemo(() => {
    if (!record) return [];
    if (isStudent) {
      return invoices.filter((inv) => {
        const ids = Array.isArray(inv.studentIds) ? inv.studentIds : [];
        return ids.includes(record.id) || inv.studentId === record.id;
      });
    }
    return invoices.filter((inv) => inv.parentId === (record.uid || record.id));
  }, [invoices, isStudent, record]);

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
  const subtitle = isStudent ? "Student record"    : `${role || "User"} account`;

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
          { key: "class",    header: "Class",    render: (row) => row.name || row.id },
          { key: "time",     header: "Time",     render: (row) => classLabel(row) || "-" },
          { key: "capacity", header: "Capacity", render: (row) => `${row.enrolledCount || 0}/${row.capacity || "-"}` },
        ]}
        getRowKey={(row) => row.id}
        rows={rows}
      />
    );
  }

  function renderInvoiceRows(rows) {
    if (!rows.length) {
      return <EmptyState icon="invoice" title="No related invoices">No invoices or drafts matched this record.</EmptyState>;
    }

    return (
      <Table
        columns={[
          { key: "invoice", header: "Invoice", render: (row) => row.invoiceNumber || row.id },
          { key: "status",  header: "Status",  render: (row) => <Badge tone={row.draft ? "neutral" : "brand"}>{row.draft ? "draft" : row.status || "unknown"}</Badge> },
          { key: "amount",  header: "Amount",  render: (row) => formatMoney(invoiceAmount(row)) },
        ]}
        getRowKey={(row) => `${row.draft ? "draft" : "invoice"}-${row.id}`}
        rows={rows.slice(0, 8)}
      />
    );
  }

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <PageHeader
        title={busy ? "People detail" : title}
        subtitle={subtitle}
        crumbs={[{ label: "Overview", href: "/" }, { label: "People", href: "/people" }, { label: id || "Detail" }]}
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
                <div className="card-sub">ID: <span className="text-mono">{record.uid || record.id}</span></div>
              </div>
              <Badge tone="brand">{isStudent ? "student" : role}</Badge>
            </div>
            <div className="card-body field-section">
              {isStudent ? (
                <>
                  {renderField("Name",           studentName(record))}
                  {renderField("Year",           record.grade || record.studentYear || record.year)}
                  {renderField("Subjects",       record.subjects || record.studentSubjects)}
                  {renderField("Primary parent", record.primaryParentId)}
                  {renderField("Created",        record.createdAtIso)}
                  {renderField("Updated",        record.updatedAtIso)}
                </>
              ) : (
                <>
                  {renderField("Name",          userName(record))}
                  {renderField("Email",         record.email)}
                  {renderField("Phone",         record.phone)}
                  {renderField("Role",          record.role)}
                  {role === "parent" ? renderField("Lesson tokens", Number(record.lessonTokens || 0)) : null}
                  {renderField("Created",       record.createdAtIso)}
                  {renderField("Updated",       record.updatedAtIso)}
                </>
              )}
            </div>
          </div>

          <aside className="card">
            <div className="card-head">
              <div>
                <h3>Actions</h3>
                <div className="card-sub">Manage this {isStudent ? "student record" : "account"}.</div>
              </div>
            </div>
            <div className="card-body grid gap-3">
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

          <div className="card">
            <div className="card-head">
              <div>
                <h3>{isStudent ? "Parents" : role === "parent" ? "Students" : "Classes"}</h3>
                <div className="card-sub">
                  {isStudent || role === "parent"
                    ? "Linked relationship records. Use the unlink button to remove a link."
                    : "Read-only class assignment data from Firestore."}
                </div>
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

          {(isStudent || role === "parent") ? (
            <aside className="card">
              <div className="card-head">
                <div>
                  <h3>Invoices</h3>
                  <div className="card-sub">Invoices and drafts matched by parent/student IDs.</div>
                </div>
              </div>
              <div className="card-body flush">
                {renderInvoiceRows(relatedInvoices)}
              </div>
            </aside>
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
