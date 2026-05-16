/* =========================================================
   Settings & maintenance
   ========================================================= */

const Settings = () => {
  const s = SYSTEM_STATUS;
  const [activeSection, setActiveSection] = useState("overview");
  const sections = [
    { id: "overview", label: "Overview", icon: "dashboard" },
    { id: "integrations", label: "Integrations", icon: "external" },
    { id: "terms", label: "Terms & academic year", icon: "calendar" },
    { id: "audit", label: "Audit log", icon: "list" },
    { id: "maintenance", label: "Maintenance", icon: "settings" },
  ];

  return (
    <Fragment>
      <PageHead
        title="Settings"
        sub="Project info, integration status, terms management, and the admin audit trail."
      />

      <div style={{display: "grid", gridTemplateColumns: "220px 1fr", gap: 24}}>
        <aside style={{position: "sticky", top: 80, alignSelf: "start"}}>
          <div className="card" style={{padding: 6}}>
            {sections.map((sec) => (
              <button key={sec.id} onClick={() => setActiveSection(sec.id)} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", borderRadius: "var(--r-sm)",
                background: activeSection === sec.id ? "var(--brand-blue-50)" : "transparent",
                color: activeSection === sec.id ? "var(--brand-navy)" : "var(--ink-700)",
                fontWeight: activeSection === sec.id ? 600 : 500,
                fontSize: 14, textAlign: "left", cursor: "pointer",
              }}>
                <Icon name={sec.icon} size={16}/>
                <span>{sec.label}</span>
              </button>
            ))}
          </div>
        </aside>

        <div>
          {activeSection === "overview" && <OverviewSection s={s}/>}
          {activeSection === "integrations" && <IntegrationsSection s={s}/>}
          {activeSection === "terms" && <TermsSection/>}
          {activeSection === "audit" && <AuditSection/>}
          {activeSection === "maintenance" && <MaintenanceSection s={s}/>}
        </div>
      </div>
    </Fragment>
  );
};

const OverviewSection = ({ s }) => (
  <div className="col gap-4">
    <div className="card">
      <div className="card-head"><h3><span className="brand-stripe"></span>Firebase project</h3></div>
      <div className="card-body">
        <dl className="dlist">
          <dt>Project ID</dt><dd className="text-mono">{s.firebaseProject}</dd>
          <dt>Region</dt><dd className="text-mono">{s.region}</dd>
          <dt>Runtime</dt><dd>{s.runtime} <Badge tone="warn" className="ml-2" style={{marginLeft: 8}}>Decommissions 2026-10-30</Badge></dd>
          <dt>Environment</dt><dd><Badge tone="brand" dot>Production</Badge></dd>
        </dl>
      </div>
    </div>

    <Banner kind="warn" title="Runtime migration required">
      {s.runtimeWarning} Migrate Cloud Functions to Node.js 22 or later before that date to avoid disruption.
    </Banner>

    <div className="card">
      <div className="card-head"><h3><span className="brand-stripe"></span>System health</h3></div>
      <div className="card-body">
        <div className="grid grid-2 gap-3">
          <HealthRow label="Firestore" status="ok" detail="Reads/writes healthy"/>
          <HealthRow label="Cloud Functions" status="ok" detail="us-central1 · all callables responsive"/>
          <HealthRow label="Authentication" status="ok" detail="Custom claims operational"/>
          <HealthRow label="Storage" status="ok" detail="invoices/ bucket accessible"/>
          <HealthRow label="SendGrid" status="ok" detail="Welcome & invoice emails sending"/>
          <HealthRow label="Stripe webhook" status="ok" detail="Last event 2 min ago"/>
        </div>
      </div>
    </div>
  </div>
);

const HealthRow = ({ label, status, detail }) => (
  <div className="row gap-3" style={{padding: "12px 14px", background: "var(--ink-50)", borderRadius: "var(--r-md)"}}>
    <span className={`dot-status ${status === "ok" ? "success" : status === "warn" ? "warn" : "danger"}`}/>
    <div className="grow">
      <div className="weight-600">{label}</div>
      <div className="text-xs muted">{detail}</div>
    </div>
  </div>
);

const IntegrationsSection = ({ s }) => (
  <div className="col gap-4">
    <div className="card">
      <div className="card-head">
        <div>
          <h3><span className="brand-stripe"></span>Xero</h3>
          <div className="card-sub">Accounting + invoice sync · last activity {fmt.relTime(s.xeroLastSync)}</div>
        </div>
        <Badge tone="success" dot>Connected</Badge>
      </div>
      <div className="card-body">
        <dl className="dlist compact">
          <dt>Organisation</dt><dd>{s.xeroOrg}</dd>
          <dt>OAuth token</dt><dd className="text-mono">Stored in xeroTokens collection</dd>
          <dt>Auto-sync invoices</dt><dd><Badge tone="success" dot>Enabled</Badge></dd>
        </dl>
        <div className="row gap-2 mt-4">
          <Button size="sm" variant="secondary" icon="refresh">Test connection</Button>
          <Button size="sm" variant="ghost" icon="external">Open in Xero</Button>
        </div>
      </div>
    </div>

    <div className="card">
      <div className="card-head">
        <h3><span className="brand-stripe"></span>Stripe</h3>
        <Badge tone="success" dot>Connected</Badge>
      </div>
      <div className="card-body">
        <p className="muted text-sm mb-3">Parent payments are collected in the Flutter app. The portal displays Stripe metadata but does not collect payment.</p>
        <dl className="dlist compact">
          <dt>Webhook endpoint</dt><dd className="text-mono">us-central1 · stripeWebhook</dd>
          <dt>Status</dt><dd>{s.stripeStatus}</dd>
        </dl>
      </div>
    </div>

    <div className="card">
      <div className="card-head">
        <h3><span className="brand-stripe"></span>SendGrid</h3>
        <Badge tone="success" dot>Connected</Badge>
      </div>
      <div className="card-body">
        <p className="muted text-sm">Sends welcome emails on parent provisioning and enrolment-accepted confirmations. The portal does not send email directly; all sends are server-triggered.</p>
      </div>
    </div>

    {s.legacyFunctions.length > 0 && (
      <Banner kind="warn" title="Legacy functions detected">
        <div className="mt-3"></div>
        <ul style={{margin: 0, paddingLeft: 18}}>
          {s.legacyFunctions.map((f, i) => <li key={i} className="text-mono">{f}</li>)}
        </ul>
        <div className="mt-2">Cleanup is out of scope until Xero redirect URIs are verified.</div>
      </Banner>
    )}
  </div>
);

const TermsSection = () => (
  <div className="card">
    <div className="card-head">
      <h3><span className="brand-stripe"></span>Terms</h3>
      <Button size="sm" variant="primary" icon="plus">New term</Button>
    </div>
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Term</th><th>Status</th><th>Dates</th><th className="col-right">Weeks</th><th>Invoices generated</th><th className="col-actions"></th></tr></thead>
        <tbody>
          {TERMS.map((t) => (
            <tr key={t.id}>
              <td className="cell-strong">{t.year} · Term {t.termNum}</td>
              <td><StatusBadge status={t.status}/></td>
              <td>{fmt.date(t.startDate)} → {fmt.date(t.endDate)}</td>
              <td className="col-right num">{t.weeksNum}</td>
              <td>{t.invoicesGeneratedAt ? <Badge tone="success" dot>{fmt.date(t.invoicesGeneratedAt)}</Badge> : <Badge tone="neutral" dot>Not yet</Badge>}</td>
              <td className="col-actions">
                <div className="row gap-1">
                  <Button size="sm" variant="ghost" icon="edit">Edit</Button>
                  <Button size="sm" variant="ghost" icon="play">Rollover</Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const AuditSection = () => (
  <div className="col gap-4">
    <Banner kind="info" title="Best-effort audit logging">
      <div className="mt-3"></div>
      Admin mutations write to <span className="text-mono">adminAuditLogs</span>. Entries include actor, target, action, and a summary.
    </Banner>

    <div className="card">
      <div className="card-head"><h3><span className="brand-stripe"></span>Recent admin actions</h3></div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>Summary</th></tr></thead>
          <tbody>
            {ADMIN_AUDIT_LOG.map((log) => {
              const actor = findUser(log.actor);
              return (
                <tr key={log.id}>
                  <td className="cell-muted">{fmt.dateTime(log.at)}</td>
                  <td>
                    <div className="row gap-2">
                      <Avatar name={userName(actor)} size="sm"/>
                      <span className="cell-strong">{userName(actor)}</span>
                    </div>
                  </td>
                  <td><span className="text-mono text-xs">{log.action}</span></td>
                  <td><span className="text-mono text-xs muted">{log.target}</span></td>
                  <td>{log.summary}{log.reason && <span className="muted"> · {log.reason}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

const MaintenanceSection = ({ s }) => (
  <div className="col gap-4">
    <div className="card">
      <div className="card-head"><h3><span className="brand-stripe"></span>Indexes & rules</h3></div>
      <div className="card-body">
        <div className="row gap-3 mb-3" style={{padding: "12px 14px", background: "var(--ink-50)", borderRadius: "var(--r-md)"}}>
          <span className="dot-status success"/>
          <div className="grow">
            <div className="weight-600">Firestore indexes</div>
            <div className="text-xs muted">{s.indexStatus} Source-controlled in <span className="text-mono">firestore.indexes.json</span>.</div>
          </div>
        </div>
        <div className="row gap-3" style={{padding: "12px 14px", background: "var(--warn-100)", borderRadius: "var(--r-md)", border: "1px solid rgba(197,138,30,0.25)"}}>
          <span className="dot-status warn"/>
          <div className="grow">
            <div className="weight-600">Firestore rules</div>
            <div className="text-xs muted">{s.rulesStatus}</div>
          </div>
        </div>
      </div>
    </div>

    <div className="card">
      <div className="card-head"><h3><span className="brand-stripe"></span>Danger zone</h3></div>
      <div className="card-body">
        <p className="muted text-sm mb-4">These actions affect data integrity. Use with care; most are also available from individual record pages.</p>
        <div className="col gap-2">
          <DangerRow icon="refresh" title="Regenerate attendance for active term" desc="Re-runs adminRegenerateAttendanceForTerm for the current term." action="Run"/>
          <DangerRow icon="play" title="Rollover term data" desc="Moves the active term forward and re-seeds attendance / drafts. Existing app callable." action="Rollover"/>
          <DangerRow icon="database" title="Dry-run current-term invoices" desc="dryRunCurrentTermInvoices: previews invoices without writing. No Xero side effects." action="Dry run"/>
        </div>
      </div>
    </div>
  </div>
);

const DangerRow = ({ icon, title, desc, action }) => {
  const toast = useToast();
  return (
    <div className="row between gap-3" style={{padding: "14px 16px", background: "var(--ink-50)", borderRadius: "var(--r-md)"}}>
      <div className="row gap-3">
        <div style={{width: 32, height: 32, borderRadius: "var(--r-sm)", background: "var(--white)", border: "1px solid var(--ink-200)", display: "grid", placeItems: "center", color: "var(--ink-700)"}}>
          <Icon name={icon} size={14}/>
        </div>
        <div>
          <div className="weight-600">{title}</div>
          <div className="text-xs muted">{desc}</div>
        </div>
      </div>
      <Button size="sm" variant="secondary" onClick={() => toast.info(`${action} requested`, "Confirmation flow would appear here.")}>{action}</Button>
    </div>
  );
};

window.Views = Object.assign(window.Views || {}, { Settings });
