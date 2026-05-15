import React, { useEffect, useState } from "react";
import { updateUser } from "../backend/usersApi";
import Button from "./Button";
import Modal from "./Modal";

export default function EditUserModal({ open, record, onClose, onSuccess }) {
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && record) {
      setForm({
        firstName: record.firstName || "",
        lastName:  record.lastName  || "",
        phone:     record.phone     || "",
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
      await updateUser(record.uid || record.id, {
        firstName: form.firstName.trim(),
        lastName:  form.lastName.trim(),
        phone:     form.phone.trim(),
      });
      onSuccess?.();
    } catch (err) {
      setError(err?.message || "Failed to update user.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Edit account"
      subtitle="Name and phone only. Email and role changes require separate flows."
      busy={busy}
      onClose={handleClose}
      footer={
        <>
          <Button disabled={busy} onClick={handleClose} variant="secondary">Cancel</Button>
          <Button form="edit-user-form" loading={busy} type="submit" variant="primary">Save changes</Button>
        </>
      }
    >
      {error ? (
        <div className="banner banner-danger mb-5">
          <div><div className="banner-title">Could not update</div><div>{error}</div></div>
        </div>
      ) : null}

      <form className="grid gap-4" id="edit-user-form" onSubmit={handleSubmit}>
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
      </form>
    </Modal>
  );
}
