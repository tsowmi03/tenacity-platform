import React, { useEffect, useMemo, useState } from "react";
import Button from "./Button";
import Icon from "./Icon";

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  tone = "danger",
  typedValue,
  reasonLabel,
  reasonRequired = false,
  busy = false,
  onCancel,
  onConfirm,
}) {
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) {
      setTyped("");
      setReason("");
    }
  }, [open]);

  const canConfirm = useMemo(() => {
    if (typedValue && typed !== typedValue) return false;
    if (reasonRequired && !reason.trim()) return false;
    return true;
  }, [reason, reasonRequired, typed, typedValue]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onCancel?.();
    }}>
      <div className={`modal ${tone === "danger" ? "danger" : ""}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          {tone === "danger" ? (
            <div className="icon-wrap"><Icon name="alert" size={20} /></div>
          ) : null}
          <div className="grow">
            <h3>{title}</h3>
            {message ? <div className="modal-sub">{message}</div> : null}
          </div>
          <button className="icon-btn" disabled={busy} onClick={onCancel} type="button" aria-label="Close">
            <Icon name="x" />
          </button>
        </div>

        <div className="modal-body grid gap-5">
          {typedValue ? (
            <div className="field">
              <span className="label">Type <span className="text-mono">{typedValue}</span> to confirm</span>
              <input
                className="input"
                disabled={busy}
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
              />
            </div>
          ) : null}

          {reasonLabel ? (
            <div className="field">
              <span className="label">{reasonLabel}{reasonRequired ? <span className="req">*</span> : null}</span>
              <textarea
                className="textarea"
                disabled={busy}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
          ) : null}
        </div>

        <div className="modal-foot">
          <Button disabled={busy} onClick={onCancel} variant="secondary">
            Cancel
          </Button>
          <Button
            disabled={!canConfirm}
            loading={busy}
            onClick={() => onConfirm?.({ typed, reason: reason.trim() })}
            variant={tone === "danger" ? "danger" : "primary"}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
