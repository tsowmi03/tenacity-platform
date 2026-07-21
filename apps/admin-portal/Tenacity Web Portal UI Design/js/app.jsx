/* =========================================================
   Tenacity Portal — App Shell, Router, Auth Context
   ========================================================= */

const NAV = [
  { section: "Overview", items: [
    { id: "dashboard",   label: "Dashboard",   icon: "dashboard" },
  ]},
  { section: "Operations", items: [
    { id: "enrolments",  label: "Enrolments",  icon: "enrol", badgeKey: "pendingEnrolments" },
    { id: "waitlist",    label: "Waitlist",    icon: "waitlist", badgeKey: "activeWaitlist" },
    { id: "people",      label: "People",      icon: "people" },
    { id: "classes",     label: "Classes",     icon: "classes" },
    { id: "attendance",  label: "Attendance",  icon: "attendance" },
  ]},
  { section: "Finance", items: [
    { id: "invoices",    label: "Invoices",    icon: "invoice", badgeKey: "overdueInvoices" },
    { id: "reports",     label: "Reports",     icon: "reports" },
  ]},
  { section: "System", items: [
    { id: "settings",    label: "Settings",    icon: "settings" },
  ]},
];

const AuthCtx = createContext(null);
const useAuth = () => useContext(AuthCtx);

/* ============ HASH ROUTER ============ */
const parseHash = () => {
  const h = window.location.hash.slice(1) || "/dashboard";
  const [path, qs = ""] = h.split("?");
  const segs = path.split("/").filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(qs));
  return { path, segs, route: segs[0] || "dashboard", subRoute: segs[1] || null, id: segs[2] || null, action: segs[3] || null, query };
};

const useRoute = () => {
  const [r, setR] = useState(parseHash());
  useEffect(() => {
    const onChange = () => setR(parseHash());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return r;
};

const navigate = (path) => { window.location.hash = path; };

/* ============ SIDEBAR ============ */
const Sidebar = ({ collapsed, badges }) => {
  const route = useRoute();
  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="logo-mark"><img src="assets/logo-icon.png" alt="Tenacity" /></div>
        <div className="brand-text">
          <span className="name">TENACITY</span>
          <span className="tagline">Admin Portal</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Primary">
        {NAV.map((section) => (
          <div key={section.section}>
            <div className="nav-section-label">{section.section}</div>
            {section.items.map((item) => {
              const active = route.route === item.id;
              const badge = item.badgeKey ? badges[item.badgeKey] : null;
              return (
                <a key={item.id} href={`#/${item.id}`}
                  className={`nav-item ${active ? "active" : ""}`}
                  aria-current={active ? "page" : undefined}>
                  <span className="nav-icon"><Icon name={item.icon} size={18} /></span>
                  <span className="nav-label">{item.label}</span>
                  {badge ? <span className="nav-badge">{badge}</span> : null}
                </a>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-foot">
        <span className="env-pill">PROD</span>
        <span className="env-text">tenacity-tutoring-b8eb2</span>
      </div>
    </aside>
  );
};

/* ============ TOPBAR ============ */
const Topbar = ({ onToggleSidebar, user }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <header className="topbar">
      <button className="collapse-btn" onClick={onToggleSidebar} aria-label="Toggle sidebar">
        <Icon name="menu" size={20} />
      </button>

      <div className="topbar-search">
        <Icon name="search" size={16} className="search-icon" />
        <input placeholder="Search enrolments, parents, students, invoices…" />
        <span className="kbd-hint">⌘K</span>
      </div>

      <div className="topbar-actions">
        <button className="icon-btn" aria-label="Notifications">
          <Icon name="bell" size={20} />
          <span className="dot" />
        </button>

        <div style={{ position: "relative" }} ref={menuRef}>
          <button className="user-menu" onClick={() => setMenuOpen((o) => !o)}>
            <Avatar name={`${user.firstName} ${user.lastName}`} size="md" />
            <div className="um-info">
              <span className="um-name">{user.firstName} {user.lastName}</span>
              <span className="um-role">Admin · {user.email.split("@")[0]}</span>
            </div>
            <Icon name="chevron-down" size={16} style={{ color: "var(--ink-500)" }} />
          </button>
          {menuOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 6px)", right: 0,
              background: "var(--white)", border: "1px solid var(--ink-200)",
              borderRadius: "var(--r-md)", boxShadow: "var(--shadow-lg)",
              minWidth: 240, padding: 6, zIndex: 50,
            }}>
              <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--ink-100)" }}>
                <div style={{ fontWeight: 600, color: "var(--ink-900)" }}>{user.firstName} {user.lastName}</div>
                <div style={{ fontSize: 12.5, color: "var(--ink-500)" }}>{user.email}</div>
                <div style={{ marginTop: 6 }}><Badge tone="brand" dot>role: admin</Badge></div>
              </div>
              <button className="nav-item" style={{ color: "var(--ink-700)", padding: "8px 10px", width: "100%", justifyContent: "flex-start" }}>
                <Icon name="user" size={16} /> <span>My profile</span>
              </button>
              <button className="nav-item" style={{ color: "var(--ink-700)", padding: "8px 10px", width: "100%", justifyContent: "flex-start" }}
                onClick={() => navigate("/settings")}>
                <Icon name="settings" size={16} /> <span>Settings</span>
              </button>
              <button className="nav-item" style={{ color: "var(--danger-700)", padding: "8px 10px", width: "100%", justifyContent: "flex-start", borderTop: "1px solid var(--ink-100)" }}
                onClick={() => { window.location.href = "index.html"; }}>
                <Icon name="logout" size={16} /> <span>Sign out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

/* ============ PAGE HEADER ============ */
const PageHead = ({ title, sub, crumbs, actions }) => (
  <div className="page-head">
    <div className="page-head-title">
      {crumbs && (
        <div className="crumbs">
          {crumbs.map((c, i) => (
            <Fragment key={i}>
              {i > 0 && <Icon name="chevron-right" size={12} className="sep" />}
              {c.href ? <a href={c.href}>{c.label}</a> : <span>{c.label}</span>}
            </Fragment>
          ))}
        </div>
      )}
      <h1>{title}</h1>
      {sub && <div className="sub">{sub}</div>}
    </div>
    {actions && <div className="page-head-actions">{actions}</div>}
  </div>
);

/* ============ ROUTER ============ */
const Router = () => {
  const route = useRoute();
  const view = route.route;
  const V = window.Views || {};
  // Re-mount when navigating to a different top-level route so stale state clears
  switch (view) {
    case "dashboard":  return <V.Dashboard route={route} />;
    case "enrolments": return <V.Enrolments route={route} />;
    case "people":     return <V.People route={route} />;
    case "classes":    return <V.Classes route={route} />;
    case "attendance": return <V.Attendance route={route} />;
    case "waitlist":   return <V.Waitlist route={route} />;
    case "invoices":   return <V.Invoices route={route} />;
    case "reports":    return <V.Reports route={route} />;
    case "settings":   return <V.Settings route={route} />;
    default:           return <V.Dashboard route={route} />;
  }
};

/* ============ APP ============ */
const App = () => {
  const [collapsed, setCollapsed] = useState(false);
  const currentUser = USERS.find((u) => u.uid === "u_admin_01");

  // Badges (live counts)
  const badges = useMemo(() => ({
    pendingEnrolments: ENROLMENTS.filter((e) => e.status === "pending").length,
    activeWaitlist: WAITLIST.filter((w) => w.status === "active" || w.status === "offered").length,
    overdueInvoices: INVOICES.filter((i) => i.status === "overdue").length,
  }), []);

  return (
    <AuthCtx.Provider value={{ user: currentUser, isAdmin: true }}>
      <ToastProvider>
        <div className={`shell ${collapsed ? "collapsed" : ""}`}>
          <Sidebar collapsed={collapsed} badges={badges} />
          <Topbar onToggleSidebar={() => setCollapsed((c) => !c)} user={currentUser} />
          <main className="main">
            <div className="main-inner">
              <Router />
            </div>
          </main>
        </div>
      </ToastProvider>
    </AuthCtx.Provider>
  );
};

Object.assign(window, { App, PageHead, navigate, useRoute, useAuth, AuthCtx, NAV });
