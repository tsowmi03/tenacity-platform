import React, { useEffect, useState } from "react";
import { createStudent } from "../backend/studentsApi";
import Button from "./Button";
import Modal from "./Modal";

function initForm() {
  return { firstName: "", lastName: "", grade: "", subjects: "" };
}

function parseSubjects(str) {
  return str.split(",").map((s) => s.trim()).filter(Boolean);
}

export default function CreateStudentModal({ open, onClose, onSuccess }) {
  const [form, setForm] = useState(initForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setForm(initForm());
      setError("");
    }
  }, [open]);

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
      const result = await createStudent({
        firstName: form.firstName.trim(),
        lastName:  form.lastName.trim(),
        grade:     form.grade.trim(),
        subjects:  parseSubjects(form.subjects),
      });
      onSuccess?.(result);
    } catch (err) {
      setError(err?.message || "Failed to create student.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Create student"
      subtitle="Creates a new student record. You can link parents after creation."
      busy={busy}
      onClose={handleClose}
      footer={
        <>
          <Button disabled={busy} onClick={handleClose} variant="secondary">Cancel</Button>
          <Button form="create-student-form" loading={busy} type="submit" variant="primary">Create student</Button>
        </>
      }
    >
      {error ? (
        <div className="banner banner-danger mb-5">
          <div>
            <div className="banner-title">Could not create student</div>
            <div>{error}</div>
          </div>
        </div>
      ) : null}

      <form className="grid gap-4" id="create-student-form" onSubmit={handleSubmit}>
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
          <span className="label">Year / Grade <span className="req">*</span></span>
          <input
            autoComplete="off"
            className="input"
            disabled={busy}
            placeholder="e.g. Year 10"
            required
            value={form.grade}
            onChange={(e) => set("grade", e.target.value)}
          />
        </div>

        <div className="field">
          <span className="label">
            Subjects <span className="opt">(optional)</span>
          </span>
          <input
            autoComplete="off"
            className="input"
            disabled={busy}
            placeholder="Maths, English, Physics"
            value={form.subjects}
            onChange={(e) => set("subjects", e.target.value)}
          />
          <span className="hint">Comma-separated.</span>
        </div>
      </form>
    </Modal>
  );
}
