import React, { useEffect, useState } from "react";
import { updateStudent } from "../backend/studentsApi";
import Button from "./Button";
import Modal from "./Modal";

function parseSubjects(str) {
  return str.split(",").map((s) => s.trim()).filter(Boolean);
}

export default function EditStudentModal({ open, record, onClose, onSuccess }) {
  const [form, setForm] = useState({ firstName: "", lastName: "", grade: "", subjects: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && record) {
      const subjectArr = record.subjects || record.studentSubjects || [];
      setForm({
        firstName: record.firstName || "",
        lastName:  record.lastName  || "",
        grade:     record.grade || record.studentYear || record.year || "",
        subjects:  Array.isArray(subjectArr) ? subjectArr.join(", ") : String(subjectArr || ""),
      });
      setError("");
    }
  }, [open, record]);

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleClose() {
    if (!busy) onClose?.();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await updateStudent(record.id, {
        firstName: form.firstName.trim(),
        lastName:  form.lastName.trim(),
        grade:     form.grade.trim(),
        subjects:  parseSubjects(form.subjects),
      });
      onSuccess?.();
    } catch (err) {
      setError(err?.message || "Failed to update student.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Edit student"
      subtitle="Name, year, and subjects. Parent links are managed separately."
      busy={busy}
      onClose={handleClose}
      footer={
        <>
          <Button disabled={busy} onClick={handleClose} variant="secondary">Cancel</Button>
          <Button form="edit-student-form" loading={busy} type="submit" variant="primary">Save changes</Button>
        </>
      }
    >
      {error ? (
        <div className="banner banner-danger mb-5">
          <div><div className="banner-title">Could not update</div><div>{error}</div></div>
        </div>
      ) : null}

      <form className="grid gap-4" id="edit-student-form" onSubmit={handleSubmit}>
        <div className="grid grid-2" style={{ gap: "var(--s-3)" }}>
          <div className="field">
            <span className="label">First name <span className="req">*</span></span>
            <input
              autoComplete="off"
              className="input"
              disabled={busy}
              required
              value={form.firstName}
              onChange={(e) => set("firstName", e.target.value)}
            />
          </div>
          <div className="field">
            <span className="label">Last name <span className="req">*</span></span>
            <input
              autoComplete="off"
              className="input"
              disabled={busy}
              required
              value={form.lastName}
              onChange={(e) => set("lastName", e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <span className="label">Year <span className="req">*</span></span>
          <input
            autoComplete="off"
            className="input"
            disabled={busy}
            required
            value={form.grade}
            onChange={(e) => set("grade", e.target.value)}
          />
        </div>
        <div className="field">
          <span className="label">Subjects <span className="label-hint">comma-separated, optional</span></span>
          <input
            autoComplete="off"
            className="input"
            disabled={busy}
            placeholder="Maths, English"
            value={form.subjects}
            onChange={(e) => set("subjects", e.target.value)}
          />
        </div>
      </form>
    </Modal>
  );
}
