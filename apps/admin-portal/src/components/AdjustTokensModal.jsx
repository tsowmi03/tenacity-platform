import React, { useEffect, useState } from "react";
import { adjustLessonTokens } from "../backend/usersApi";
import Button from "./Button";
import Modal from "./Modal";

const MODES = [
  { key: "add",    label: "Add" },
  { key: "remove", label: "Remove" },
  { key: "set",    label: "Set total" },
];

export default function AdjustTokensModal({ open, record, onClose, onSuccess }) {
  const [mode, setMode]   = useState("add");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setMode("add");
      setValue("");
      setReason("");
      setError("");
    }
  }, [open]);

  function handleClose() {
    if (!busy) onClose?.();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      setError("Value must be a non-negative number.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const uid = record.uid || record.id;
      const trimmedReason = reason.trim() || undefined;
      if (mode === "set") {
        await adjustLessonTokens(uid, "set", n, trimmedReason);
      } else {
        const delta = mode === "remove" ? -n : n;
        await adjustLessonTokens(uid, "delta", delta, trimmedReason);
      }
      onSuccess?.();
    } catch (err) {
      setError(err?.message || "Failed to adjust tokens.");
    } finally {
      setBusy(false);
    }
  }

  const current = Number(record?.lessonTokens || 0);

  return (
    <Modal
      open={open}
      title="Adjust lesson tokens"
      subtitle={`Current balance: ${current} token${current === 1 ? "" : "s"}`}
      busy={busy}
      onClose={handleClose}
      footer={
        <>
          <Button disabled={busy} onClick={handleClose} variant="secondary">Cancel</Button>
          <Button form="adjust-tokens-form" loading={busy} type="submit" variant="primary">Apply</Button>
        </>
      }
    >
      {error ? (
        <div className="banner banner-danger mb-5">
          <div><div className="banner-title">Could not adjust</div><div>{error}</div></div>
        </div>
      ) : null}

      <form className="grid gap-4" id="adjust-tokens-form" onSubmit={handleSubmit}>
        <div className="field">
          <span className="label">Mode</span>
          <div className="row gap-3">
            {MODES.map((m) => (
              <label className="radio-label" key={m.key}>
                <input
                  checked={mode === m.key}
                  disabled={busy}
                  name="token-mode"
                  type="radio"
                  value={m.key}
                  onChange={() => setMode(m.key)}
                />
                {m.label}
              </label>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="label">
            {mode === "set" ? "New total" : "Amount"} <span className="req">*</span>
          </span>
          <input
            autoComplete="off"
            className="input"
            disabled={busy}
            min={0}
            required
            step={1}
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <div className="field">
          <span className="label">Reason <span className="label-hint">optional</span></span>
          <input
            autoComplete="off"
            className="input"
            disabled={busy}
            placeholder="e.g. Lesson cancellation credit"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </form>
    </Modal>
  );
}
