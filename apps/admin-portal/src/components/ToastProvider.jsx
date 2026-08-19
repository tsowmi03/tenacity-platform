import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
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
    (tone, title, message, duration = 4500, action = null) => {
      const id = _id++;
      setToasts((prev) => [...prev, { id, tone, title, message, action }]);
      if (duration > 0) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss]
  );

  // Memoised so effects can depend on the toast object without re-subscribing
  // on every render.
  const toast = useMemo(
    () => ({
      success: (title, msg) => push("success", title, msg),
      error:   (title, msg) => push("error",   title, msg),
      warn:    (title, msg) => push("warn",    title, msg),
      info:    (title, msg) => push("info",    title, msg),
      // Stays put until the user acts on it or dismisses it.
      persistent: (tone, title, msg, action) => push(tone, title, msg, 0, action),
    }),
    [push]
  );

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
              {t.action ? (
                <button
                  className="toast-action"
                  onClick={() => {
                    dismiss(t.id);
                    t.action.onClick();
                  }}
                  type="button"
                >
                  {t.action.label}
                </button>
              ) : null}
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
