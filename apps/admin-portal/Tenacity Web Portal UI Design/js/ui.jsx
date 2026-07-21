/* =========================================================
   Tenacity Portal — Shared UI components & icons
   Exposes globals via window.* for cross-file use.
   ========================================================= */

const { useState, useEffect, useRef, useMemo, useCallback, createContext, useContext, Fragment } = React;

/* ============ ICONS (Lucide-style strokes) ============ */
const Icon = ({ name, size = 18, className = "", style = {} }) => {
  const stroke = "currentColor";
  const sw = 1.75;
  const props = {
    width: size, height: size,
    viewBox: "0 0 24 24", fill: "none",
    stroke, strokeWidth: sw,
    strokeLinecap: "round", strokeLinejoin: "round",
    className, style,
    "aria-hidden": "true",
  };
  switch (name) {
    case "dashboard": return <svg {...props}><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>;
    case "enrol": return <svg {...props}><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>;
    case "people": return <svg {...props}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
    case "classes": return <svg {...props}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>;
    case "attendance": return <svg {...props}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>;
    case "waitlist": return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
    case "invoice": return <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/></svg>;
    case "reports": return <svg {...props}><path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-5"/></svg>;
    case "settings": return <svg {...props}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6 1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
    case "search": return <svg {...props}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>;
    case "bell": return <svg {...props}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>;
    case "menu": return <svg {...props}><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>;
    case "plus": return <svg {...props}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
    case "minus": return <svg {...props}><line x1="5" y1="12" x2="19" y2="12"/></svg>;
    case "x": return <svg {...props}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
    case "check": return <svg {...props}><polyline points="20 6 9 17 4 12"/></svg>;
    case "check-circle": return <svg {...props}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;
    case "x-circle": return <svg {...props}><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>;
    case "alert": return <svg {...props}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
    case "info": return <svg {...props}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>;
    case "edit": return <svg {...props}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
    case "trash": return <svg {...props}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>;
    case "archive": return <svg {...props}><rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><line x1="10" y1="12" x2="14" y2="12"/></svg>;
    case "filter": return <svg {...props}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>;
    case "download": return <svg {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
    case "upload": return <svg {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>;
    case "chevron-down": return <svg {...props}><polyline points="6 9 12 15 18 9"/></svg>;
    case "chevron-up": return <svg {...props}><polyline points="18 15 12 9 6 15"/></svg>;
    case "chevron-right": return <svg {...props}><polyline points="9 18 15 12 9 6"/></svg>;
    case "chevron-left": return <svg {...props}><polyline points="15 18 9 12 15 6"/></svg>;
    case "arrow-up": return <svg {...props}><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>;
    case "arrow-down": return <svg {...props}><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>;
    case "arrow-right": return <svg {...props}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>;
    case "external": return <svg {...props}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>;
    case "more": return <svg {...props}><circle cx="12" cy="12" r="1.5"/><circle cx="5" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>;
    case "user": return <svg {...props}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
    case "user-plus": return <svg {...props}><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="17" y1="11" x2="23" y2="11"/></svg>;
    case "users": return <svg {...props}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
    case "mail": return <svg {...props}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>;
    case "phone": return <svg {...props}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>;
    case "calendar": return <svg {...props}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
    case "clock": return <svg {...props}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
    case "book": return <svg {...props}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>;
    case "graduation": return <svg {...props}><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 1.5 2.5 3 6 3s6-1.5 6-3v-5"/></svg>;
    case "lightning": return <svg {...props}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
    case "wallet": return <svg {...props}><path d="M21 12V7H5a2 2 0 0 1-2-2c0-1.1.9-2 2-2h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z"/></svg>;
    case "credit-card": return <svg {...props}><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>;
    case "file-text": return <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>;
    case "refresh": return <svg {...props}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>;
    case "shield": return <svg {...props}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
    case "link": return <svg {...props}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.71"/></svg>;
    case "unlink": return <svg {...props}><path d="M18.84 12.25l1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M5.17 11.75l-1.71 1.71a5 5 0 0 0 7.07 7.07l1.71-1.71"/><line x1="8" y1="2" x2="8" y2="5"/><line x1="2" y1="8" x2="5" y2="8"/><line x1="16" y1="19" x2="16" y2="22"/><line x1="19" y1="16" x2="22" y2="16"/></svg>;
    case "logout": return <svg {...props}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
    case "eye": return <svg {...props}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
    case "play": return <svg {...props}><polygon points="5 3 19 12 5 21 5 3"/></svg>;
    case "send": return <svg {...props}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
    case "circle": return <svg {...props}><circle cx="12" cy="12" r="10"/></svg>;
    case "sparkles": return <svg {...props}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>;
    case "star": return <svg {...props}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
    case "tag": return <svg {...props}><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>;
    case "list": return <svg {...props}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>;
    case "grid": return <svg {...props}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>;
    case "play-circle": return <svg {...props}><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>;
    case "warning-tri": return <svg {...props}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
    case "database": return <svg {...props}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v6c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 11v6c0 1.7 4 3 9 3s9-1.3 9-3v-6"/></svg>;
    case "key": return <svg {...props}><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>;
    case "logo": return <svg {...props} viewBox="0 0 24 24"><path d="M3 9l9-4 9 4-9 4-9-4z"/><path d="M6 10v4c0 1.5 2.5 3 6 3s6-1.5 6-3v-4"/></svg>;
    default: return <svg {...props}><circle cx="12" cy="12" r="9"/></svg>;
  }
};

/* ============ BUTTON ============ */
const Button = ({ children, variant = "secondary", size, icon, iconRight, loading, disabled, type = "button", className = "", ...rest }) => {
  const cls = ["btn", `btn-${variant}`, size ? `btn-${size}` : "", className].filter(Boolean).join(" ");
  return (
    <button type={type} className={cls} disabled={disabled || loading} {...rest}>
      {loading ? <span className="spinner"></span> : icon ? <Icon name={icon} size={size === "sm" ? 14 : 16} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={size === "sm" ? 14 : 16} /> : null}
    </button>
  );
};

/* ============ BADGE ============ */
const Badge = ({ children, tone = "neutral", dot = false, outline = false, className = "" }) => {
  const cls = ["badge", outline ? "badge-outline" : `badge-${tone}`, className].filter(Boolean).join(" ");
  return (
    <span className={cls}>
      {dot && <span className="dot-glyph"></span>}
      {children}
    </span>
  );
};

/* ============ MODAL ============ */
const Modal = ({ open, onClose, title, subtitle, size, danger, children, footer, icon }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`modal ${size || ""} ${danger ? "danger" : ""}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          {danger && <div className="icon-wrap"><Icon name={icon || "alert"} size={20} /></div>}
          <div className="grow">
            {title && <h3>{title}</h3>}
            {subtitle && <div className="modal-sub">{subtitle}</div>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
};

/* ============ PANEL (slide-over) ============ */
const Panel = ({ open, onClose, title, subtitle, size, children, footer, headerExtra }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <Fragment>
      <div className="panel-overlay" onClick={onClose} />
      <div className={`panel ${size || ""}`} role="dialog" aria-modal="true">
        <div className="panel-head">
          <div className="grow">
            {title && <h3>{title}</h3>}
            {subtitle && <div className="modal-sub">{subtitle}</div>}
          </div>
          {headerExtra}
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="panel-body">{children}</div>
        {footer && <div className="panel-foot">{footer}</div>}
      </div>
    </Fragment>
  );
};

/* ============ TOASTS ============ */
const ToastCtx = createContext(null);
const useToast = () => useContext(ToastCtx);

const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((t) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((p) => [...p, { id, kind: "info", ...t }]);
    setTimeout(() => setToasts((p) => p.filter((x) => x.id !== id)), t.duration || 4200);
  }, []);
  const api = useMemo(() => ({
    info: (title, msg) => push({ kind: "info", title, msg }),
    success: (title, msg) => push({ kind: "success", title, msg }),
    warn: (title, msg) => push({ kind: "warn", title, msg }),
    error: (title, msg) => push({ kind: "error", title, msg }),
  }), [push]);
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((t) => {
          const iconName = t.kind === "success" ? "check-circle" : t.kind === "warn" ? "warning-tri" : t.kind === "error" ? "x-circle" : "info";
          return (
            <div key={t.id} className={`toast ${t.kind}`}>
              <Icon name={iconName} className="toast-icon" size={18} />
              <div className="grow">
                <div className="toast-title">{t.title}</div>
                {t.msg && <div className="toast-msg">{t.msg}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
};

/* ============ STAT CARD ============ */
const StatCard = ({ label, value, unit, icon, trend, foot, accent }) => (
  <div className="stat-card">
    <div className="stat-label">
      {icon && <div className="stat-icon" style={accent ? { background: accent + "1A", color: accent } : {}}><Icon name={icon} size={16} /></div>}
      <span>{label}</span>
    </div>
    <div className="stat-value">
      {unit && <span className="unit">{unit}</span>}
      {value}
    </div>
    {(trend || foot) && (
      <div className="stat-foot">
        {trend && <span className={`trend-${trend.dir}`}>
          <Icon name={trend.dir === "up" ? "arrow-up" : trend.dir === "down" ? "arrow-down" : "circle"} size={12} style={{verticalAlign: "-2px"}}/> {trend.label}
        </span>}
        {foot && <span>{foot}</span>}
      </div>
    )}
  </div>
);

/* ============ EMPTY ============ */
const Empty = ({ icon = "search", title, msg, action }) => (
  <div className="empty">
    <div className="empty-icon"><Icon name={icon} size={22}/></div>
    <div className="empty-title">{title}</div>
    {msg && <div>{msg}</div>}
    {action && <div style={{marginTop: 16}}>{action}</div>}
  </div>
);

/* ============ BANNER ============ */
const Banner = ({ kind = "info", title, children, action }) => {
  const icon = kind === "warn" ? "warning-tri" : kind === "danger" ? "alert" : kind === "success" ? "check-circle" : "info";
  return (
    <div className={`banner banner-${kind}`}>
      <Icon name={icon} className="banner-icon" size={18} />
      <div className="grow">
        {title && <div className="banner-title">{title}</div>}
        {children && <div>{children}</div>}
      </div>
      {action}
    </div>
  );
};

/* ============ PAGINATION ============ */
const Pagination = ({ page = 1, totalPages = 1, totalRows, onChange }) => {
  const pages = [];
  for (let i = 1; i <= totalPages; i++) pages.push(i);
  return (
    <div className="pagination">
      <span>{totalRows != null ? `${totalRows} ${totalRows === 1 ? "result" : "results"}` : `Page ${page} of ${totalPages}`}</span>
      <div className="pages">
        <button className="page-btn" onClick={() => onChange?.(Math.max(1, page - 1))} disabled={page === 1}><Icon name="chevron-left" size={14}/></button>
        {pages.map((p) => (
          <button key={p} className={`page-btn ${p === page ? "active" : ""}`} onClick={() => onChange?.(p)}>{p}</button>
        ))}
        <button className="page-btn" onClick={() => onChange?.(Math.min(totalPages, page + 1))} disabled={page === totalPages}><Icon name="chevron-right" size={14}/></button>
      </div>
    </div>
  );
};

/* ============ STATUS HELPERS ============ */
const statusToBadge = (status) => {
  switch (status) {
    case "active": case "accepted": case "paid": return { tone: "success", label: status };
    case "pending": case "draft": case "offered": return { tone: "warn", label: status };
    case "archived": case "inactive": case "expired": case "cancelled": case "declined": return { tone: "neutral", label: status };
    case "deleted": case "overdue": return { tone: "danger", label: status };
    case "unpaid": return { tone: "info", label: status };
    default: return { tone: "neutral", label: status };
  }
};
const StatusBadge = ({ status }) => {
  const { tone, label } = statusToBadge(status);
  return <Badge tone={tone} dot>{label}</Badge>;
};

/* ============ AVATAR FROM NAME ============ */
const initials = (s) => {
  const parts = (s || "").split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase();
};
const Avatar = ({ name, size = "md" }) => <div className={`avatar ${size}`}>{initials(name)}</div>;

/* ============ FORMATTERS ============ */
const fmt = {
  money: (n) => "$" + (n || 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  moneyShort: (n) => "$" + (n || 0).toLocaleString("en-AU", { maximumFractionDigits: 0 }),
  date: (d) => {
    if (!d) return "—";
    const date = d instanceof Date ? d : new Date(d);
    return date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  },
  dateShort: (d) => {
    if (!d) return "—";
    const date = d instanceof Date ? d : new Date(d);
    return date.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  },
  dateTime: (d) => {
    if (!d) return "—";
    const date = d instanceof Date ? d : new Date(d);
    return date.toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  },
  relTime: (d) => {
    if (!d) return "—";
    const date = d instanceof Date ? d : new Date(d);
    const diff = (Date.now() - date.getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return Math.floor(diff / 60) + "m ago";
    if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + "d ago";
    return fmt.date(d);
  },
};

/* ============ TYPED CONFIRMATION HELPER ============ */
const TypedConfirm = ({ open, onClose, title, subtitle, expected, expectedLabel, danger = true, confirmLabel = "Delete", confirmKind = "danger", banner, children, onConfirm, busy }) => {
  const [val, setVal] = useState("");
  useEffect(() => { if (open) setVal(""); }, [open]);
  const matched = val === expected;
  return (
    <Modal open={open} onClose={onClose} title={title} subtitle={subtitle} danger={danger} icon="warning-tri"
      footer={<Fragment>
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant={confirmKind} onClick={onConfirm} disabled={!matched || busy} loading={busy}>{confirmLabel}</Button>
      </Fragment>}>
      {banner && <div className="mb-4">{banner}</div>}
      {children && <div className="mb-4">{children}</div>}
      <div className="field">
        <label className="label">Type <span className="text-mono" style={{background: "var(--ink-100)", padding: "2px 6px", borderRadius: 4}}>{expected}</span> to confirm</label>
        <input className={`input ${val && !matched ? "error-state" : ""}`} placeholder={expectedLabel || expected} value={val} onChange={(e) => setVal(e.target.value)} autoFocus />
      </div>
    </Modal>
  );
};

/* ============ TABLE FILTER BAR ============ */
const SearchInput = ({ value, onChange, placeholder = "Search…", className = "" }) => (
  <div className={`field-search ${className}`} style={{ position: "relative", minWidth: 240 }}>
    <Icon name="search" size={16} className="search-icon" />
    <input className="input" style={{ paddingLeft: 34 }} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
  </div>
);

/* ============ EXPORT to window ============ */
Object.assign(window, {
  Icon, Button, Badge, Modal, Panel, ToastProvider, useToast,
  StatCard, Empty, Banner, Pagination, StatusBadge, Avatar, TypedConfirm,
  SearchInput, fmt, initials, useState, useEffect, useRef, useMemo, useCallback, createContext, useContext, Fragment,
});
