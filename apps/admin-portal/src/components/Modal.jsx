import React, { useEffect } from "react";
import Icon from "./Icon";

export default function Modal({
  open,
  title,
  subtitle,
  size,
  busy = false,
  onClose,
  footer,
  children,
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape" && !busy) onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose?.();
      }}
    >
      <div
        className={["modal", size].filter(Boolean).join(" ")}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-head">
          <div className="grow">
            <h3>{title}</h3>
            {subtitle ? <div className="modal-sub">{subtitle}</div> : null}
          </div>
          <button
            aria-label="Close"
            className="icon-btn"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            <Icon name="x" />
          </button>
        </div>

        <div className="modal-body">{children}</div>

        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}
