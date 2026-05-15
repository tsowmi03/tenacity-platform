import React, { useEffect, useState } from "react";
import { createUser } from "../backend/usersApi";
import Button from "./Button";
import Modal from "./Modal";

const ROLES = [
  { value: "parent", label: "Parent" },
  { value: "tutor",  label: "Tutor" },
  { value: "admin",  label: "Admin" },
];

function initForm(role = "parent") {
  return {
    role,
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    temporaryPassword: "",
    sendWelcomeEmail: false,
    lessonTokens: "",
  };
}

export default function CreateUserModal({ open, defaultRole = "parent", onClose, onSuccess }) {
  const [form, setForm] = useState(() => initForm(defaultRole));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setForm(initForm(defaultRole));
      setError("");
    }
  }, [open, defaultRole]);

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
      const payload = {
        role: form.role,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
      };
      if (form.temporaryPassword) payload.temporaryPassword = form.temporaryPassword;
      if (form.sendWelcomeEmail) payload.sendWelcomeEmail = true;
      if (form.role === "parent" && form.lessonTokens !== "") {
        const n = Number(form.lessonTokens);
        if (!Number.isNaN(n) && n >= 0) payload.lessonTokens = n;
      }
      const result = await createUser(payload);
      onSuccess?.(result);
    } catch (err) {
      setError(err?.message || "Failed to create user.");
    } finally {
      setBusy(false);
    }
  }

  const isParent = form.role === "parent";

  return (
    <Modal
      open={open}
      title="Create user"
      subtitle="Creates a Firebase Auth account and Firestore user document."
      busy={busy}
      onClose={handleClose}
      footer={
        <>
          <Button disabled={busy} onClick={handleClose} variant="secondary">Cancel</Button>
          <Button form="create-user-form" loading={busy} type="submit" variant="primary">Create user</Button>
        </>
      }
    >
      {error ? (
        <div className="banner banner-danger mb-5">
          <div>
            <div className="banner-title">Could not create user</div>
            <div>{error}</div>
          </div>
        </div>
      ) : null}

      <form className="grid gap-4" id="create-user-form" onSubmit={handleSubmit}>
        <div className="field">
          <span className="label">
            Role <span className="req">*</span>
          </span>
          <select
            className="select"
            disabled={busy}
            required
            value={form.role}
            onChange={(e) => set("role", e.target.value)}
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

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
          <span className="label">Email <span className="req">*</span></span>
          <input
            autoComplete="off"
            className="input"
            disabled={busy}
            required
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </div>

        <div className="field">
          <span className="label">Phone <span className="req">*</span></span>
          <input
            autoComplete="off"
            className="input"
            disabled={busy}
            required
            type="tel"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
          />
        </div>

        <div className="field">
          <span className="label">
            Temporary password <span className="opt">(optional)</span>
          </span>
          <input
            autoComplete="new-password"
            className="input"
            disabled={busy}
            minLength={8}
            type="password"
            value={form.temporaryPassword}
            onChange={(e) => set("temporaryPassword", e.target.value)}
          />
          <span className="hint">If blank, the user must reset their password before signing in.</span>
        </div>

        {isParent ? (
          <div className="field">
            <span className="label">
              Lesson tokens <span className="opt">(optional)</span>
            </span>
            <input
              className="input"
              disabled={busy}
              min={0}
              placeholder="0"
              type="number"
              value={form.lessonTokens}
              onChange={(e) => set("lessonTokens", e.target.value)}
            />
          </div>
        ) : null}

        <label className="checkbox">
          <input
            checked={form.sendWelcomeEmail}
            disabled={busy}
            type="checkbox"
            onChange={(e) => set("sendWelcomeEmail", e.target.checked)}
          />
          Send welcome email
        </label>
      </form>
    </Modal>
  );
}
