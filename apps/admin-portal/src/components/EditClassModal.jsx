import React, { useEffect, useMemo, useState } from "react";
import { updateClass } from "../backend/classesApi";
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

  const sorted = useMemo(() => {
    function lastName(item) {
      const label = getLabel(item);
      const parts = label.trim().split(/\s+/);
      return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : label.toLowerCase();
    }
    return [...filtered].sort((a, b) => {
      const aKey = getKey(a);
      const bKey = getKey(b);
      const aSelected = selected.includes(aKey) ? 0 : 1;
      const bSelected = selected.includes(bKey) ? 0 : 1;
      if (aSelected !== bSelected) return aSelected - bSelected;
      const la = lastName(a);
      const lb = lastName(b);
      if (la !== lb) return la.localeCompare(lb);
      return getLabel(a).localeCompare(getLabel(b));
    });
  }, [filtered, selected, getKey, getLabel]);

  return (
    <div className="check-list-wrap">
      <div className="check-list-search">
        <Icon className="search-icon" name="search" size={13} />
        <input
          disabled={disabled}
          placeholder={placeholder || "Search"}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="check-list-body">
        {sorted.length === 0 ? (
          <div className="muted text-sm p-3">No records found.</div>
        ) : (
          sorted.map((item) => {
            const key = getKey(item);
            const checked = selected.includes(key);
            return (
              <label className={`check-list-item${checked ? " checked" : ""}`} key={key}>
                <input
                  checked={checked}
                  disabled={disabled}
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

export default function EditClassModal({ open, record, users, students, onClose, onSuccess }) {
  const [form, setForm] = useState({
    name: "", day: "Monday", startTime: "", endTime: "", capacity: "8",
  });
  const [tutorIds,    setTutorIds]    = useState([]);
  const [enrolledIds, setEnrolledIds] = useState([]);
  const [propagate,   setPropagate]   = useState(true);
  const [fromDate,    setFromDate]    = useState("");
  const [busy,        setBusy]        = useState(false);
  const [error,       setError]       = useState("");

  useEffect(() => {
    if (open && record) {
      setForm({
        name:      record.type || record.name || "",
        day:       record.day  || "Monday",
        startTime: record.startTime || "",
        endTime:   record.endTime   || "",
        capacity:  String(record.capacity || "8"),
      });
      setTutorIds(Array.isArray(record.tutors)           ? record.tutors           : []);
      setEnrolledIds(Array.isArray(record.enrolledStudents) ? record.enrolledStudents : []);
      setPropagate(true);
      setFromDate(new Date().toISOString().slice(0, 10));
      setError("");
    }
  }, [open, record]);

  const tutors = useMemo(() => (users || []).filter((u) => u.role === "tutor" || u.role === "admin"), [users]);

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
      const updates = {
        type:             form.name.trim(),
        day:              form.day,
        startTime:        form.startTime.trim(),
        endTime:          form.endTime.trim(),
        capacity:         cap,
        tutors:           tutorIds,
        enrolledStudents: enrolledIds,
      };
      const propagationOptions = {
        propagateAttendance: propagate,
        ...(propagate && fromDate ? { attendanceFromDate: fromDate } : {}),
      };
      await updateClass(record.id, updates, propagationOptions);
      onSuccess?.();
    } catch (err) {
      setError(err?.message || "Failed to update class.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Edit class"
      subtitle="Changes to day, time, tutors, or roster can propagate to future attendance docs."
      size="lg"
      busy={busy}
      onClose={handleClose}
      footer={
        <>
          <Button disabled={busy} onClick={handleClose} variant="secondary">Cancel</Button>
          <Button form="edit-class-form" loading={busy} type="submit" variant="primary">Save changes</Button>
        </>
      }
    >
      {error ? (
        <div className="banner banner-danger mb-5">
          <div><div className="banner-title">Could not update</div><div>{error}</div></div>
        </div>
      ) : null}

      <form className="grid gap-5" id="edit-class-form" onSubmit={handleSubmit}>

        <div>
          <h4 className="mb-3">Basic details</h4>
          <div className="grid gap-4">
            <div className="field">
              <span className="label">Class name <span className="req">*</span></span>
              <input
                autoComplete="off"
                className="input"
                disabled={busy}
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
          <h4 className="mb-3">Tutors</h4>
          <CheckList
            disabled={busy}
            items={tutors}
            selected={tutorIds}
            placeholder="Search tutors"
            getKey={(u) => u.uid || u.id}
            getLabel={(u) => displayUser(u)}
            getSub={(u) => u.email || ""}
            onToggle={(id) => !busy && toggleItem(id, setTutorIds)}
          />
        </div>

        <div>
          <h4 className="mb-3">Permanent roster</h4>
          <CheckList
            disabled={busy}
            items={students || []}
            selected={enrolledIds}
            placeholder="Search students"
            getKey={(s) => s.id}
            getLabel={(s) => displayStudent(s)}
            getSub={(s) => s.grade || s.studentYear || ""}
            onToggle={(id) => !busy && toggleItem(id, setEnrolledIds)}
          />
        </div>

        <div>
          <h4 className="mb-3">Attendance propagation</h4>
          <div className={`propagation-row${propagate ? " warn" : ""}`}>
            <div>
              <div className="prop-label">Update future attendance docs</div>
              <div className="prop-sub">Changes to day, time, tutors, or roster apply to attendance entries from the selected date onwards.</div>
            </div>
            <div
              className={`switch${propagate ? " on" : ""}`}
              role="switch"
              aria-checked={propagate}
              onClick={() => !busy && setPropagate((p) => !p)}
            />
          </div>
          {propagate ? (
            <div className="field mt-3">
              <span className="label">From date <span className="label-hint">defaults to today</span></span>
              <input
                className="input"
                disabled={busy}
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
          ) : null}
        </div>

      </form>
    </Modal>
  );
}
