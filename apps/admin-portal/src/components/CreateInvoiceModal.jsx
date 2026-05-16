import React, { useEffect, useMemo, useState } from "react";
import { createInvoice, createInvoiceDraft } from "../backend/invoicesApi";
import { listStudents } from "../backend/studentsApi";
import { listUsers } from "../backend/usersApi";
import Badge from "./Badge";
import Button from "./Button";
import Icon from "./Icon";
import LineItemsEditor, { emptyLineItem, lineItemsSum, normalizeLineItemsForSubmit } from "./LineItemsEditor";
import Modal from "./Modal";

function fullName(r) {
  return `${String(r?.firstName || "").trim()} ${String(r?.lastName || "").trim()}`.trim();
}
function userName(u) {
  return u?.displayName || fullName(u) || u?.email || u?.uid || "";
}
function studentName(s) {
  return s?.displayName || fullName(s) || s?.id || "";
}

function ParentPicker({ users, value, onChange, disabled }) {
  const [search, setSearch] = useState("");
  const parents = useMemo(() => users.filter((u) => u.role === "parent"), [users]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return parents;
    return parents.filter((u) => {
      const name  = userName(u).toLowerCase();
      const email = (u.email || "").toLowerCase();
      const id    = (u.uid || u.id || "").toLowerCase();
      return name.includes(q) || email.includes(q) || id.includes(q);
    });
  }, [parents, search]);

  return (
    <div className="check-list-wrap">
      <div className="check-list-search">
        <Icon className="search-icon" name="search" size={13} />
        <input
          disabled={disabled}
          placeholder="Search parents"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="check-list-body">
        {filtered.length === 0 ? (
          <div className="muted text-sm p-3">No parents found.</div>
        ) : filtered.map((u) => {
          const id = u.uid || u.id;
          const selected = value === id;
          return (
            <label className={`check-list-item${selected ? " checked" : ""}`} key={id}>
              <input
                checked={selected}
                disabled={disabled}
                name="parent-picker"
                type="radio"
                onChange={() => onChange(u)}
              />
              <div className="row-meta grow">
                <span className="primary">{userName(u)}</span>
                <span className="secondary">{u.email || ""}</span>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function StudentPicker({ students, value, onChange, disabled, restrictParentId, allUsersById }) {
  const [search, setSearch]   = useState("");
  const [showAll, setShowAll] = useState(false);

  const linkedToParent = useMemo(() => {
    if (!restrictParentId) return students;
    return students.filter((s) => {
      const parents = s.parents || s.parentIds || [];
      if (Array.isArray(parents) && parents.includes(restrictParentId)) return true;
      const u = allUsersById?.get(restrictParentId);
      const uStudents = u?.students || u?.studentIds || [];
      return Array.isArray(uStudents) && uStudents.includes(s.id);
    });
  }, [allUsersById, restrictParentId, students]);

  const source = (restrictParentId && !showAll) ? linkedToParent : students;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return source;
    return source.filter((s) => {
      const name = studentName(s).toLowerCase();
      const grade = String(s.grade || s.studentYear || "").toLowerCase();
      return name.includes(q) || grade.includes(q);
    });
  }, [search, source]);

  function toggle(id) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  }

  return (
    <>
      <div className="row gap-2 mb-2" style={{ alignItems: "center", justifyContent: "space-between" }}>
        <span className="muted text-sm">
          {restrictParentId
            ? `Showing ${showAll ? "all students" : "students linked to selected parent"}`
            : "Select students billed on this invoice"}
        </span>
        {restrictParentId ? (
          <button
            className="text-sm"
            disabled={disabled}
            onClick={() => setShowAll((v) => !v)}
            style={{ background: "none", border: "none", color: "var(--brand-navy)", cursor: "pointer", fontWeight: 600 }}
            type="button"
          >
            {showAll ? "Only linked" : "Show all students"}
          </button>
        ) : null}
      </div>
      <div className="check-list-wrap">
        <div className="check-list-search">
          <Icon className="search-icon" name="search" size={13} />
          <input
            disabled={disabled}
            placeholder="Search students"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="check-list-body">
          {filtered.length === 0 ? (
            <div className="muted text-sm p-3">No students found.</div>
          ) : filtered.map((s) => {
            const checked = value.includes(s.id);
            return (
              <label className={`check-list-item${checked ? " checked" : ""}`} key={s.id}>
                <input
                  checked={checked}
                  disabled={disabled}
                  type="checkbox"
                  onChange={() => toggle(s.id)}
                />
                <div className="row-meta grow">
                  <span className="primary">{studentName(s)}</span>
                  <span className="secondary">{s.grade || s.studentYear || ""}</span>
                </div>
              </label>
            );
          })}
        </div>
      </div>
    </>
  );
}

export default function CreateInvoiceModal({ open, mode = "invoice", onClose, onSuccess }) {
  const [users,    setUsers]    = useState([]);
  const [students, setStudents] = useState([]);
  const [loading,  setLoading]  = useState(false);

  const [parentId,       setParentId]      = useState("");
  const [parentName,     setParentName]    = useState("");
  const [parentEmail,    setParentEmail]   = useState("");
  const [studentIds,     setStudentIds]    = useState([]);
  const [weeks,          setWeeks]         = useState("1");
  const [dueDate,        setDueDate]       = useState("");
  const [invoiceNumber,  setInvoiceNumber] = useState("");
  const [adminNotes,     setAdminNotes]    = useState("");
  const [lineItems,      setLineItems]     = useState([emptyLineItem()]);
  const [useOverride,    setUseOverride]   = useState(false);
  const [overrideAmount, setOverrideAmount] = useState("");

  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setParentId("");
    setParentName("");
    setParentEmail("");
    setStudentIds([]);
    setWeeks("1");
    setInvoiceNumber("");
    setAdminNotes("");
    setLineItems([emptyLineItem()]);
    setUseOverride(false);
    setOverrideAmount("");
    setError("");
    const defaultDue = new Date();
    defaultDue.setDate(defaultDue.getDate() + 14);
    setDueDate(defaultDue.toISOString().slice(0, 10));

    let cancelled = false;
    setLoading(true);
    Promise.all([listUsers(), listStudents()]).then(([u, s]) => {
      if (cancelled) return;
      setUsers(u);
      setStudents(s);
    }).catch(() => {}).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, mode]);

  const usersById = useMemo(() => new Map(users.map((u) => [u.uid || u.id, u])), [users]);

  function selectParent(u) {
    setParentId(u.uid || u.id);
    setParentName(userName(u));
    setParentEmail(u.email || "");
    setStudentIds([]);
  }

  function handleClose() {
    if (!busy) onClose?.();
  }

  const lineTotal     = lineItemsSum(lineItems);
  const effectiveDue  = useOverride && overrideAmount !== "" ? Number(overrideAmount) : lineTotal;
  const overrideNum   = useOverride ? Number(overrideAmount) : undefined;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!parentId)               { setError("Select a parent."); return; }
    if (!parentName.trim())      { setError("Parent name is required."); return; }
    if (!parentEmail.trim())     { setError("Parent email is required."); return; }
    if (studentIds.length === 0) { setError("Select at least one student."); return; }
    if (lineItems.length === 0)  { setError("Add at least one line item."); return; }

    const cleanedItems = normalizeLineItemsForSubmit(lineItems);
    const allLinesValid = cleanedItems.every((it) => it.description && Number.isFinite(it.quantity) && Number.isFinite(it.unitAmount) && Number.isFinite(it.lineTotal));
    if (!allLinesValid) { setError("Each line item needs a description and numeric quantity, unit, and total."); return; }

    const weeksNum = parseInt(weeks, 10);
    if (!Number.isFinite(weeksNum) || weeksNum < 0) { setError("Weeks must be a non-negative integer."); return; }

    if (useOverride && (!Number.isFinite(overrideNum) || overrideNum < 0)) {
      setError("Override amount must be a non-negative number.");
      return;
    }

    setBusy(true);
    try {
      const payload = {
        parentId,
        parentName: parentName.trim(),
        parentEmail: parentEmail.trim(),
        studentIds,
        weeks: weeksNum,
        amountDue: Math.round((useOverride ? overrideNum : lineTotal) * 100) / 100,
        amountDueComputed: lineTotal,
        dueDate: new Date(`${dueDate}T23:59:59`).toISOString(),
        lineItems: cleanedItems,
      };
      if (useOverride) payload.amountDueOverride = overrideNum;
      if (invoiceNumber.trim()) payload.invoiceNumber = invoiceNumber.trim();
      if (adminNotes.trim())     payload.adminNotes    = adminNotes.trim();

      const result = mode === "draft"
        ? await createInvoiceDraft(payload)
        : await createInvoice(payload);
      onSuccess?.(result);
    } catch (err) {
      setError(err?.message || "Failed to create invoice.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={mode === "draft" ? "Create invoice draft" : "Create invoice"}
      subtitle={
        mode === "draft"
          ? "Drafts live in invoiceDrafts and don't trigger Xero/SendGrid until promoted."
          : "Creates the invoice document. Xero side effects come from existing Firestore triggers (e.g. onInvoiceCreated)."
      }
      size="lg"
      busy={busy}
      onClose={handleClose}
      footer={
        <>
          <Button disabled={busy} onClick={handleClose} variant="secondary">Cancel</Button>
          <Button form="create-invoice-form" loading={busy} type="submit" variant="primary">
            {mode === "draft" ? "Create draft" : "Create invoice"}
          </Button>
        </>
      }
    >
      {error ? (
        <div className="banner banner-danger mb-4">
          <div><div className="banner-title">Could not create</div><div>{error}</div></div>
        </div>
      ) : null}

      {mode !== "draft" ? (
        <div className="banner banner-info mb-4">
          <Icon className="banner-icon" name="alert" />
          <div>
            <div className="banner-title">Heads up — Xero / SendGrid triggers may fire</div>
            <div>Existing Firestore triggers may push this invoice to Xero or send a notification once it's written. Use New draft if you want to stage without side effects.</div>
          </div>
        </div>
      ) : null}

      {loading ? <div className="route-inline-state">Loading form data…</div> : (
        <form className="grid gap-5" id="create-invoice-form" onSubmit={handleSubmit}>

          <div>
            <h4 className="mb-3">Parent <span className="req">*</span></h4>
            <ParentPicker
              disabled={busy}
              users={users}
              value={parentId}
              onChange={selectParent}
            />
            {parentId ? (
              <div className="grid grid-2 mt-3" style={{ gap: "var(--s-3)" }}>
                <div className="field">
                  <span className="label">Name on invoice</span>
                  <input
                    className="input"
                    disabled={busy}
                    value={parentName}
                    onChange={(e) => setParentName(e.target.value)}
                  />
                </div>
                <div className="field">
                  <span className="label">Email on invoice</span>
                  <input
                    className="input"
                    disabled={busy}
                    type="email"
                    value={parentEmail}
                    onChange={(e) => setParentEmail(e.target.value)}
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div>
            <h4 className="mb-3">Students <span className="req">*</span></h4>
            <StudentPicker
              allUsersById={usersById}
              disabled={busy || !parentId}
              restrictParentId={parentId}
              students={students}
              value={studentIds}
              onChange={setStudentIds}
            />
            {!parentId ? <span className="label-hint">Pick a parent first.</span> : null}
          </div>

          <div className="grid grid-2" style={{ gap: "var(--s-3)" }}>
            <div className="field">
              <span className="label">Weeks <span className="req">*</span></span>
              <input
                className="input"
                disabled={busy}
                min={0}
                required
                step={1}
                type="number"
                value={weeks}
                onChange={(e) => setWeeks(e.target.value)}
              />
            </div>
            <div className="field">
              <span className="label">Due date <span className="req">*</span></span>
              <input
                className="input"
                disabled={busy}
                required
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className="field">
              <span className="label">Invoice number <span className="label-hint">optional — auto-assigned if blank</span></span>
              <input
                autoComplete="off"
                className="input"
                disabled={busy}
                placeholder="e.g. INV-001234"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
              />
            </div>
            <div className="field">
              <span className="label">Admin notes <span className="label-hint">optional</span></span>
              <textarea
                className="textarea"
                disabled={busy}
                rows={2}
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
              />
            </div>
          </div>

          <div>
            <h4 className="mb-3">Line items <span className="req">*</span></h4>
            <LineItemsEditor disabled={busy} items={lineItems} onChange={setLineItems} />
          </div>

          <div>
            <h4 className="mb-3">Amount due</h4>
            <label className="checkbox mb-2">
              <input
                checked={useOverride}
                disabled={busy}
                type="checkbox"
                onChange={(e) => {
                  setUseOverride(e.target.checked);
                  if (!e.target.checked) setOverrideAmount("");
                }}
              />
              <span>Use admin override amount instead of line item total</span>
            </label>
            {useOverride ? (
              <>
                <div className="field">
                  <span className="label">Override amount ($) <span className="req">*</span></span>
                  <input
                    className="input text-mono text-right"
                    disabled={busy}
                    min={0}
                    step="any"
                    type="number"
                    value={overrideAmount}
                    onChange={(e) => setOverrideAmount(e.target.value)}
                    style={{ maxWidth: 240 }}
                  />
                </div>
                <div className="banner banner-warn mt-3">
                  <Icon className="banner-icon" name="alert" />
                  <div>
                    <div className="banner-title">Override must match line items</div>
                    <div>The backend requires the override to equal the sum of line items. Add an <span className="text-mono">Admin adjustment</span> line so the totals match.</div>
                  </div>
                </div>
              </>
            ) : null}
            <div className="row gap-4 mt-3" style={{ padding: "10px 14px", background: "var(--ink-50)", borderRadius: "var(--r-md)" }}>
              <div className="grow">
                <div className="text-xs muted" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>Line total</div>
                <div className="text-mono" style={{ fontWeight: 700, marginTop: 4 }}>{lineTotal.toFixed(2)}</div>
              </div>
              <div className="grow">
                <div className="text-xs muted" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>Final amount due</div>
                <div className="text-mono" style={{ fontWeight: 700, marginTop: 4 }}>{effectiveDue.toFixed(2)}</div>
              </div>
              <div>
                <Badge tone={useOverride ? "warn" : "neutral"}>{useOverride ? "Override" : "Computed"}</Badge>
              </div>
            </div>
          </div>

        </form>
      )}
    </Modal>
  );
}
