import React, { useEffect, useMemo, useState } from "react";
import { createClass } from "../backend/classesApi";
import { listTerms } from "../backend/settingsApi";
import { listStudents } from "../backend/studentsApi";
import { listUsers } from "../backend/usersApi";
import Button from "./Button";
import Icon from "./Icon";
import Modal from "./Modal";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function fullName(r) {
  return `${String(r?.firstName || "").trim()} ${String(r?.lastName || "").trim()}`.trim();
}
function displayUser(u) {
  return u?.displayName || fullName(u) || u?.email || u?.uid || "";
}
function displayStudent(s) {
  return s?.displayName || fullName(s) || s?.id || "";
}
function termLabel(t) {
  return `${t.year} Term ${t.termNum}${t.status === "active" ? " (active)" : ""}`;
}

function CheckList({ items, selected, onToggle, getKey, getLabel, getSub, placeholder }) {
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
        <input
          placeholder={placeholder || "Search"}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="check-list-body">
        {filtered.length === 0 ? (
          <div className="muted text-sm p-3">No records found.</div>
        ) : (
          filtered.map((item) => {
            const key = getKey(item);
            const checked = selected.includes(key);
            return (
              <label className={`check-list-item${checked ? " checked" : ""}`} key={key}>
                <input
                  checked={checked}
                  type="checkbox"
                  onChange={() => onToggle(key)}
                />
                <div className="row-meta grow">
                  <span className="primary">{getLabel(item)}</span>
                  {getSub ? <span className="secondary">{getSub(item)}</span> : null}
                </div>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function CreateClassModal({ open, onClose, onSuccess }) {
  const [form, setForm] = useState({
    name: "", day: "Monday", startTime: "", endTime: "", capacity: "8",
  });
  const [tutorIds,          setTutorIds]          = useState([]);
  const [enrolledIds,       setEnrolledIds]        = useState([]);
  const [termIds,           setTermIds]            = useState([]);
  const [generateAttendance, setGenerateAttendance] = useState(false);

  const [users,    setUsers]    = useState([]);
  const [students, setStudents] = useState([]);
  const [terms,    setTerms]    = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState("");

  useEffect(() => {
    if (!open) return;
    setForm({ name: "", day: "Monday", startTime: "", endTime: "", capacity: "8" });
    setTutorIds([]);
    setEnrolledIds([]);
    setTermIds([]);
    setGenerateAttendance(false);
    setError("");

    let cancelled = false;
    setLoading(true);
    Promise.all([listUsers(), listStudents(), listTerms()]).then(([u, s, t]) => {
      if (cancelled) return;
      setUsers(u);
      setStudents(s);
      setTerms(t);
      const active = t.filter((x) => x.status === "active").map((x) => x.id);
      setTermIds(active);
    }).catch(() => {}).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  const tutors = useMemo(() => users.filter((u) => u.role === "tutor"), [users]);

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function toggleItem(id, setter) {
    setter((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function handleClose() {
    if (!busy) onClose?.();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const cap = parseInt(form.capacity, 10);
    if (!Number.isFinite(cap) || cap < 1) {
      setError("Capacity must be a positive number.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const payload = {
        type:             form.name.trim(),
        day:              form.day,
        startTime:        form.startTime.trim(),
        endTime:          form.endTime.trim(),
        capacity:         cap,
        tutors:           tutorIds,
        enrolledStudents: enrolledIds,
      };
      if (generateAttendance && termIds.length > 0) {
        payload.generateAttendance = true;
        payload.termIds = termIds;
      }
      const result = await createClass(payload);
      onSuccess?.(result);
    } catch (err) {
      setError(err?.message || "Failed to create class.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Create class"
      subtitle="Define the slot, assign tutors, and optionally build the permanent roster."
      size="lg"
      busy={busy}
      onClose={handleClose}
      footer={
        <>
          <Button disabled={busy} onClick={handleClose} variant="secondary">Cancel</Button>
          <Button form="create-class-form" loading={busy} type="submit" variant="primary">Create class</Button>
        </>
      }
    >
      {error ? (
        <div className="banner banner-danger mb-5">
          <div><div className="banner-title">Could not create</div><div>{error}</div></div>
        </div>
      ) : null}

      {loading ? <div className="route-inline-state">Loading form data…</div> : (
        <form className="grid gap-5" id="create-class-form" onSubmit={handleSubmit}>

          <div>
            <h4 className="mb-3">Basic details</h4>
            <div className="grid gap-4">
              <div className="field">
                <span className="label">Class name <span className="req">*</span></span>
                <input
                  autoComplete="off"
                  className="input"
                  disabled={busy}
                  placeholder="e.g. VCE Maths Methods"
                  required
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                />
              </div>
              <div className="grid grid-2" style={{ gap: "var(--s-3)" }}>
                <div className="field">
                  <span className="label">Day <span className="req">*</span></span>
                  <select
                    className="select"
                    disabled={busy}
                    required
                    value={form.day}
                    onChange={(e) => set("day", e.target.value)}
                  >
                    {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="field">
                  <span className="label">Capacity <span className="req">*</span></span>
                  <input
                    autoComplete="off"
                    className="input"
                    disabled={busy}
                    min={1}
                    required
                    step={1}
                    type="number"
                    value={form.capacity}
                    onChange={(e) => set("capacity", e.target.value)}
                  />
                </div>
                <div className="field">
                  <span className="label">Start time <span className="req">*</span></span>
                  <input
                    autoComplete="off"
                    className="input text-mono"
                    disabled={busy}
                    placeholder="16:30"
                    required
                    value={form.startTime}
                    onChange={(e) => set("startTime", e.target.value)}
                  />
                  <span className="label-hint">24-hour HH:mm</span>
                </div>
                <div className="field">
                  <span className="label">End time <span className="req">*</span></span>
                  <input
                    autoComplete="off"
                    className="input text-mono"
                    disabled={busy}
                    placeholder="18:00"
                    required
                    value={form.endTime}
                    onChange={(e) => set("endTime", e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          <div>
            <h4 className="mb-3">Tutors <span className="label-hint">optional</span></h4>
            <CheckList
              items={tutors}
              selected={tutorIds}
              placeholder="Search tutors"
              getKey={(u) => u.uid || u.id}
              getLabel={(u) => displayUser(u)}
              getSub={(u) => u.email || ""}
              onToggle={(id) => toggleItem(id, setTutorIds)}
            />
          </div>

          <div>
            <h4 className="mb-3">Permanent roster <span className="label-hint">optional</span></h4>
            <CheckList
              items={students}
              selected={enrolledIds}
              placeholder="Search students"
              getKey={(s) => s.id}
              getLabel={(s) => displayStudent(s)}
              getSub={(s) => s.grade || s.studentYear || ""}
              onToggle={(id) => toggleItem(id, setEnrolledIds)}
            />
          </div>

          <div>
            <h4 className="mb-3">Attendance generation</h4>
            <label className="checkbox">
              <input
                checked={generateAttendance}
                disabled={busy}
                type="checkbox"
                onChange={(e) => setGenerateAttendance(e.target.checked)}
              />
              Generate attendance docs for selected terms on creation
            </label>
            {generateAttendance ? (
              <div className="mt-3">
                <CheckList
                  items={terms}
                  selected={termIds}
                  placeholder="Search terms"
                  getKey={(t) => t.id}
                  getLabel={(t) => termLabel(t)}
                  onToggle={(id) => toggleItem(id, setTermIds)}
                />
              </div>
            ) : null}
          </div>

        </form>
      )}
    </Modal>
  );
}
