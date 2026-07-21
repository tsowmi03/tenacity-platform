import React, { createContext, useCallback, useContext, useState } from "react";
import Icon from "./Icon";

const ToastCtx = createContext(null);
let _id = 1;

function iconName(tone) {
  if (tone === "success") return "check-circle";
  if (tone === "error" || tone === "warn") return "alert";
  return "info";
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (tone, title, message, duration = 4500) => {
      const id = _id++;
      setToasts((prev) => [...prev, { id, tone, title, message }]);
      if (duration > 0) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss]
  );

  const toast = {
    success: (title, msg) => push("success", title, msg),
    error:   (title, msg) => push("error",   title, msg),
    warn:    (title, msg) => push("warn",    title, msg),
    info:    (title, msg) => push("info",    title, msg),
  };

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div className={`toast ${t.tone}`} key={t.id}>
            <div className="toast-icon">
              <Icon name={iconName(t.tone)} size={18} />
            </div>
            <div className="grow">
              <div className="toast-title">{t.title}</div>
              {t.message ? <div className="toast-msg">{t.message}</div> : null}
            </div>
            <button
              aria-label="Dismiss"
              className="icon-btn"
              onClick={() => dismiss(t.id)}
              type="button"
              style={{ color: "rgba(255,255,255,0.5)", width: 26, height: 26, minWidth: 26 }}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast requires <ToastProvider>");
  return ctx;
}
