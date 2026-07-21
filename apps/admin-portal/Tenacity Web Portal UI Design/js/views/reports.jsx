/* =========================================================
   Reports — Income, Aging, Attendance, Student Enrolment, Class Utilisation
   ========================================================= */

const reportTypes = [
  { id: "income", label: "Income", icon: "wallet", desc: "Invoice revenue by created / due / paid date." },
  { id: "aging", label: "Invoice aging", icon: "clock", desc: "Outstanding balances bucketed by overdue age." },
  { id: "attendance", label: "Attendance", icon: "attendance", desc: "Roster listings across classes, tutors, students." },
  { id: "enrolment", label: "Student enrolment", icon: "graduation", desc: "Linkage health, students by grade/subject/class." },
  { id: "utilisation", label: "Class utilisation", icon: "classes", desc: "Capacity used per class over a period." },
];

const Reports = ({ route }) => {
  const [type, setType] = useState(route.query?.type || "income");

  return (
    <Fragment>
      <PageHead
        title="Reports"
        sub="Cross-cutting views of operations and finance. Export to CSV, XLSX or PDF."
      />

      <div className="grid grid-5 mb-5">
        {reportTypes.map((r) => (
          <button key={r.id} onClick={() => setType(r.id)} style={{
            textAlign: "left", padding: "16px",
            borderRadius: "var(--r-lg)",
            border: `1.5px solid ${type === r.id ? "var(--brand-navy)" : "var(--ink-200)"}`,
            background: type === r.id ? "var(--brand-blue-50)" : "var(--white)",
            cursor: "pointer", transition: "all var(--dur)",
            boxShadow: type === r.id ? "var(--shadow-sm)" : "var(--shadow-xs)",
          }}>
            <div className="row gap-2 mb-2">
              <div style={{
                width: 32, height: 32, borderRadius: "var(--r-sm)",
                background: type === r.id ? "var(--brand-navy)" : "var(--ink-100)",
                color: type === r.id ? "var(--white)" : "var(--ink-700)",
                display: "grid", placeItems: "center",
              }}>
                <Icon name={r.icon} size={16}/>
              </div>
              <span className="weight-600 text-sm">{r.label}</span>
            </div>
            <div className="text-xs muted" style={{lineHeight: 1.4}}>{r.desc}</div>
          </button>
        ))}
      </div>

      {type === "income" && <IncomeReport/>}
      {type === "aging" && <AgingReport/>}
      {type === "attendance" && <AttendanceReport/>}
      {type === "enrolment" && <EnrolmentReport/>}
      {type === "utilisation" && <UtilisationReport/>}
    </Fragment>
  );
};

/* ============ EXPORT BAR ============ */
const ExportBar = ({ generatedAt, filterSummary, onExport, rowCount }) => {
  const toast = useToast();
  const doExport = (format) => {
    toast.success(`Export queued`, `Generating ${format.toUpperCase()} (${rowCount} rows). Download will start automatically.`);
  };
  return (
    <div className="row between wrap gap-3" style={{padding: "12px 18px", background: "var(--ink-25)", border: "1px solid var(--ink-200)", borderRadius: "var(--r-md)", marginBottom: 16}}>
      <div className="text-sm">
        <span className="muted">Generated</span> <span className="weight-600">{fmt.dateTime(generatedAt)}</span>
        <span className="muted" style={{marginLeft: 12}}>·</span>
        <span className="muted" style={{marginLeft: 12}}>Filters</span> <span className="weight-600">{filterSummary}</span>
        <span className="muted" style={{marginLeft: 12}}>·</span>
        <span className="muted" style={{marginLeft: 12}}>Rows</span> <span className="weight-600 num">{rowCount}</span>
      </div>
      <div className="row gap-2">
        <Button size="sm" variant="secondary" icon="download" onClick={() => doExport("csv")}>CSV</Button>
        <Button size="sm" variant="secondary" icon="download" onClick={() => doExport("xlsx")}>XLSX</Button>
        <Button size="sm" variant="secondary" icon="download" onClick={() => doExport("pdf")}>PDF</Button>
      </div>
    </div>
  );
};

/* ============ INCOME ============ */
const IncomeReport = () => {
  const [from, setFrom] = useState(new Date(2026, 3, 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(TODAY.toISOString().slice(0, 10));
  const [basis, setBasis] = useState("created");
  const [status, setStatus] = useState("all");
  const [groupBy, setGroupBy] = useState("month");

  const rows = INVOICES.filter((i) => status === "all" || i.status === status);
  const summary = {
    count: rows.length,
    totalInvoiced: rows.reduce((s, i) => s + i.amountDue, 0),
    totalPaid: rows.filter(i => i.status === "paid").reduce((s, i) => s + i.amountDue, 0),
    totalUnpaid: rows.filter(i => i.status === "unpaid").reduce((s, i) => s + i.amountDue, 0),
    totalOverdue: rows.filter(i => i.status === "overdue").reduce((s, i) => s + i.amountDue, 0),
    avgValue: rows.length ? rows.reduce((s, i) => s + i.amountDue, 0) / rows.length : 0,
    xeroSynced: rows.filter(i => !!i.xeroInvoiceId).length,
    stripePIs: rows.filter(i => !!i.stripePaymentIntentId).length,
  };

  // Group rows
  const groups = useMemo(() => {
    const map = new Map();
    rows.forEach((inv) => {
      let key;
      const d = inv.createdAt;
      if (groupBy === "month") key = d.toLocaleDateString("en-AU", { month: "short", year: "numeric" });
      else if (groupBy === "parent") key = inv.parentName;
      else key = d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
      if (!map.has(key)) map.set(key, { key, count: 0, invoiced: 0, paid: 0 });
      const g = map.get(key);
      g.count++;
      g.invoiced += inv.amountDue;
      if (inv.status === "paid") g.paid += inv.amountDue;
    });
    return [...map.values()];
  }, [rows, groupBy]);

  return (
    <Fragment>
      <FilterCard>
        <div className="grid gap-3" style={{gridTemplateColumns: "repeat(5, 1fr)"}}>
          <div className="field"><label className="label">From</label><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)}/></div>
          <div className="field"><label className="label">To</label><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)}/></div>
          <div className="field"><label className="label">Basis</label>
            <select className="select" value={basis} onChange={(e) => setBasis(e.target.value)}>
              <option value="created">Created date</option>
              <option value="due">Due date</option>
              <option value="paid">Paid date</option>
            </select>
          </div>
          <div className="field"><label className="label">Status</label>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All</option><option value="paid">Paid</option><option value="unpaid">Unpaid</option><option value="overdue">Overdue</option>
            </select>
          </div>
          <div className="field"><label className="label">Group by</label>
            <select className="select" value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
              <option value="day">Day</option><option value="week">Week</option><option value="month">Month</option><option value="term">Term</option><option value="parent">Parent</option><option value="student">Student</option>
            </select>
          </div>
        </div>
      </FilterCard>

      <ExportBar generatedAt={TODAY} filterSummary={`${from} → ${to} · ${basis} · ${status} · by ${groupBy}`} rowCount={rows.length}/>

      <div className="grid grid-4 mb-4">
        <StatCard label="Invoices" value={summary.count} icon="invoice" accent="#1B3A6B"/>
        <StatCard label="Total invoiced" value={fmt.moneyShort(summary.totalInvoiced)} icon="wallet" accent="#4A90C4"/>
        <StatCard label="Total paid" value={fmt.moneyShort(summary.totalPaid)} icon="check-circle" accent="#1FA968"/>
        <StatCard label="Average value" value={fmt.moneyShort(summary.avgValue)} icon="lightning" accent="#C58A1E"/>
      </div>
      <div className="grid grid-3 mb-5">
        <StatCard label="Unpaid (current)" value={fmt.moneyShort(summary.totalUnpaid)} icon="clock" accent="#5A6A82"/>
        <StatCard label="Overdue" value={fmt.moneyShort(summary.totalOverdue)} icon="alert" accent="#D63C49"/>
        <StatCard label="Xero synced / Stripe PIs" value={`${summary.xeroSynced} / ${summary.stripePIs}`} icon="external" accent="#3B7BAC"/>
      </div>

      <div className="card">
        <div className="card-head"><h3><span className="brand-stripe"></span>By {groupBy}</h3></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Group</th><th className="col-right">Invoices</th><th className="col-right">Invoiced</th><th className="col-right">Paid</th><th className="col-right">% paid</th></tr></thead>
            <tbody>
              {groups.map((g) => {
                const pct = g.invoiced ? (g.paid / g.invoiced) * 100 : 0;
                return (
                  <tr key={g.key}>
                    <td className="cell-strong">{g.key}</td>
                    <td className="col-right num">{g.count}</td>
                    <td className="col-right num">{fmt.money(g.invoiced)}</td>
                    <td className="col-right num">{fmt.money(g.paid)}</td>
                    <td className="col-right">
                      <div className="row gap-2" style={{justifyContent: "flex-end"}}>
                        <span className="num weight-600" style={{minWidth: 50, textAlign: "right"}}>{pct.toFixed(0)}%</span>
                        <div style={{width: 80, height: 6, background: "var(--ink-100)", borderRadius: 4, overflow: "hidden"}}>
                          <div style={{width: `${pct}%`, height: "100%", background: "var(--success-500)"}}/>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Fragment>
  );
};

/* ============ AGING ============ */
const AgingReport = () => {
  const [asOf, setAsOf] = useState(TODAY.toISOString().slice(0, 10));
  const buckets = [
    { id: "current", label: "Current", min: -999, max: 0, color: "var(--success-500)" },
    { id: "0-30", label: "1–30 days", min: 1, max: 30, color: "var(--brand-blue-500)" },
    { id: "31-60", label: "31–60 days", min: 31, max: 60, color: "var(--warn-500)" },
    { id: "61-90", label: "61–90 days", min: 61, max: 90, color: "var(--warn-700)" },
    { id: "90+", label: "90+ days", min: 91, max: 99999, color: "var(--danger-500)" },
  ];
  const unpaid = INVOICES.filter((i) => i.status !== "paid");
  const bucketed = buckets.map((b) => {
    const items = unpaid.filter((i) => {
      const daysOver = Math.floor((TODAY - i.dueDate) / 86400000);
      return daysOver >= b.min && daysOver <= b.max;
    });
    return { ...b, count: items.length, amount: items.reduce((s, i) => s + i.amountDue, 0), items };
  });
  const totalUnpaid = unpaid.reduce((s, i) => s + i.amountDue, 0);
  const parentBalances = useMemo(() => {
    const map = new Map();
    unpaid.forEach((i) => {
      if (!map.has(i.parentId)) map.set(i.parentId, { parent: i.parentName, count: 0, amount: 0, oldest: i.createdAt });
      const m = map.get(i.parentId);
      m.count++; m.amount += i.amountDue;
      if (i.createdAt < m.oldest) m.oldest = i.createdAt;
    });
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }, [unpaid]);

  return (
    <Fragment>
      <FilterCard>
        <div className="grid gap-3" style={{gridTemplateColumns: "repeat(4, 1fr)"}}>
          <div className="field"><label className="label">As of date</label><input className="input" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)}/></div>
        </div>
      </FilterCard>

      <ExportBar generatedAt={TODAY} filterSummary={`As of ${asOf}`} rowCount={unpaid.length}/>

      <div className="card mb-4">
        <div className="card-head">
          <h3><span className="brand-stripe"></span>Aging buckets</h3>
          <span className="weight-600">{fmt.money(totalUnpaid)} total unpaid</span>
        </div>
        <div className="card-body">
          <div style={{display: "flex", height: 24, borderRadius: "var(--r-sm)", overflow: "hidden", marginBottom: 16}}>
            {bucketed.map((b) => (
              <div key={b.id} style={{
                width: `${totalUnpaid ? (b.amount / totalUnpaid) * 100 : 0}%`,
                background: b.color, display: "grid", placeItems: "center",
                color: "white", fontSize: 11, fontWeight: 700,
              }} title={`${b.label}: ${fmt.money(b.amount)}`}>
                {totalUnpaid && (b.amount / totalUnpaid) > 0.05 ? `${((b.amount / totalUnpaid) * 100).toFixed(0)}%` : ""}
              </div>
            ))}
          </div>
          <div className="grid grid-5">
            {bucketed.map((b) => (
              <div key={b.id}>
                <div className="text-xs muted weight-700" style={{textTransform: "uppercase", letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 6}}>
                  <span style={{width: 8, height: 8, borderRadius: 4, background: b.color}}></span>
                  {b.label}
                </div>
                <div style={{fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, marginTop: 4}}>{fmt.moneyShort(b.amount)}</div>
                <div className="text-xs muted">{b.count} {b.count === 1 ? "invoice" : "invoices"}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3><span className="brand-stripe"></span>Top parent balances</h3></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Parent</th><th className="col-right">Invoices</th><th className="col-right">Unpaid</th><th>Oldest from</th></tr></thead>
            <tbody>
              {parentBalances.map((p, i) => (
                <tr key={i}>
                  <td className="cell-strong">{p.parent}</td>
                  <td className="col-right num">{p.count}</td>
                  <td className="col-right cell-strong num">{fmt.money(p.amount)}</td>
                  <td className="cell-muted">{fmt.date(p.oldest)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Banner kind="info" title="Quality checks" className="mt-4">
        <div className="mt-3"></div>
        <ul style={{margin: 0, paddingLeft: 18}}>
          <li>Unpaid invoices missing Xero ID: {unpaid.filter(i => !i.xeroInvoiceId).length}</li>
          <li>Unpaid invoices missing cached PDF: {unpaid.filter(i => !i.xeroInvoicePdfPath).length}</li>
          <li>Unpaid invoices with a Stripe PaymentIntent already: {unpaid.filter(i => !!i.stripePaymentIntentId).length}</li>
        </ul>
      </Banner>
    </Fragment>
  );
};

/* ============ ATTENDANCE ============ */
const AttendanceReport = () => {
  const [from, setFrom] = useState(new Date(2026, 3, 21).toISOString().slice(0, 10));
  const [to, setTo] = useState(TODAY.toISOString().slice(0, 10));
  const [groupBy, setGroupBy] = useState("class");
  const [includeCancelled, setIncludeCancelled] = useState(false);

  const rows = ATTENDANCE.filter((a) => includeCancelled || !a.cancelled);
  const summary = {
    docs: rows.length,
    cancelled: ATTENDANCE.filter(a => a.cancelled).length,
    studentRowTotal: rows.reduce((s, a) => s + a.attendance.length, 0),
  };

  return (
    <Fragment>
      <FilterCard>
        <div className="grid gap-3" style={{gridTemplateColumns: "repeat(5, 1fr)"}}>
          <div className="field"><label className="label">From</label><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)}/></div>
          <div className="field"><label className="label">To</label><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)}/></div>
          <div className="field"><label className="label">Class</label>
            <select className="select"><option>All classes</option>{CLASSES.map((c) => <option key={c.id}>{c.type}</option>)}</select>
          </div>
          <div className="field"><label className="label">Group by</label>
            <select className="select" value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
              {["day", "week", "class", "student", "tutor"].map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="label">Include cancelled</label>
            <div className="row between" style={{padding: "8px 12px", background: "var(--ink-50)", borderRadius: "var(--r-md)"}}>
              <span className="text-sm">{includeCancelled ? "Yes" : "No"}</span>
              <div className={`switch ${includeCancelled ? "on" : ""}`} onClick={() => setIncludeCancelled(!includeCancelled)}/>
            </div>
          </div>
        </div>
      </FilterCard>

      <Banner kind="info" title="Attendance data caveat" className="mb-4">
        <div className="mt-3"></div>
        Attendance docs list students who were present in the roster, not present/absent events. Use language like "students not present in attendance list" rather than definite absence.
      </Banner>

      <ExportBar generatedAt={TODAY} filterSummary={`${from} → ${to} · ${groupBy}`} rowCount={rows.length}/>

      <div className="grid grid-3 mb-4">
        <StatCard label="Attendance docs" value={summary.docs} icon="attendance" accent="#1FA968"/>
        <StatCard label="Cancelled sessions" value={summary.cancelled} icon="x-circle" accent="#D63C49"/>
        <StatCard label="Student-rows total" value={summary.studentRowTotal} icon="users" accent="#4A90C4"/>
      </div>

      <div className="card">
        <div className="card-head"><h3><span className="brand-stripe"></span>By {groupBy}</h3></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Class</th><th>Week</th><th>Date</th><th>Students listed</th><th>Tutors</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((a) => {
                const c = findClass(a.classId);
                return (
                  <tr key={a.id}>
                    <td className="cell-strong">{c?.type}</td>
                    <td className="text-mono">W{a.weekNum}</td>
                    <td>{fmt.date(a.date)}</td>
                    <td>{a.attendance.length}</td>
                    <td>{a.tutors.map(tid => findUser(tid)?.firstName).filter(Boolean).join(", ")}</td>
                    <td>{a.cancelled ? <Badge tone="danger" dot>Cancelled</Badge> : <Badge tone="success" dot>Held</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Fragment>
  );
};

/* ============ ENROLMENT ============ */
const EnrolmentReport = () => {
  const totalStudents = STUDENTS.length;
  const linkedStudents = STUDENTS.filter(s => s.parents.length > 0).length;
  const orphanStudents = STUDENTS.filter(s => s.parents.length === 0).length;
  const noClassStudents = STUDENTS.filter(s => !CLASSES.some(c => c.enrolledStudents.includes(s.id))).length;

  const byGrade = useMemo(() => {
    const m = new Map();
    STUDENTS.forEach((s) => { m.set(s.grade, (m.get(s.grade) || 0) + 1); });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, []);
  const bySubject = useMemo(() => {
    const m = new Map();
    STUDENTS.forEach((s) => s.subjects.forEach((sub) => { m.set(sub, (m.get(sub) || 0) + 1); }));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, []);
  const byClass = useMemo(() => {
    return CLASSES.map((c) => ({ name: c.type, day: c.day, count: c.enrolledStudents.length, capacity: c.capacity }));
  }, []);

  return (
    <Fragment>
      <ExportBar generatedAt={TODAY} filterSummary="All students · no filter" rowCount={totalStudents}/>

      <div className="grid grid-4 mb-5">
        <StatCard label="Total students" value={totalStudents} icon="graduation" accent="#1B3A6B"/>
        <StatCard label="Linked to a parent" value={linkedStudents} icon="link" accent="#1FA968"/>
        <StatCard label="Orphan records" value={orphanStudents} icon="alert" accent="#C58A1E" foot="No parent linked"/>
        <StatCard label="No class enrolled" value={noClassStudents} icon="x-circle" accent="#5A6A82"/>
      </div>

      <div className="grid grid-2 gap-4 mb-4">
        <div className="card">
          <div className="card-head"><h3><span className="brand-stripe"></span>By year level</h3></div>
          <div className="card-body">
            <div className="col gap-3">
              {byGrade.map(([grade, count]) => (
                <div key={grade} className="row gap-3">
                  <span className="weight-600" style={{minWidth: 70}}>{grade}</span>
                  <div style={{flex: 1, height: 8, background: "var(--ink-100)", borderRadius: 4}}>
                    <div style={{width: `${(count / totalStudents) * 100}%`, height: "100%", background: "var(--brand-blue)", borderRadius: 4}}/>
                  </div>
                  <span className="num weight-600" style={{minWidth: 30, textAlign: "right"}}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3><span className="brand-stripe"></span>By subject</h3></div>
          <div className="card-body">
            <div className="col gap-3">
              {bySubject.slice(0, 8).map(([subject, count]) => (
                <div key={subject} className="row gap-3">
                  <span className="weight-600" style={{minWidth: 140}}>{subject}</span>
                  <div style={{flex: 1, height: 8, background: "var(--ink-100)", borderRadius: 4}}>
                    <div style={{width: `${(count / totalStudents) * 100}%`, height: "100%", background: "var(--brand-navy)", borderRadius: 4}}/>
                  </div>
                  <span className="num weight-600" style={{minWidth: 30, textAlign: "right"}}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-head"><h3><span className="brand-stripe"></span>By class</h3></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Class</th><th>Day</th><th className="col-right">Enrolled</th><th className="col-right">Capacity</th><th className="col-right">Utilisation</th></tr></thead>
            <tbody>
              {byClass.map((c, i) => {
                const pct = (c.count / c.capacity) * 100;
                return (
                  <tr key={i}>
                    <td className="cell-strong">{c.name}</td>
                    <td>{c.day}</td>
                    <td className="col-right num">{c.count}</td>
                    <td className="col-right num">{c.capacity}</td>
                    <td className="col-right">
                      <div className="row gap-2" style={{justifyContent: "flex-end"}}>
                        <span className="weight-600" style={{minWidth: 50, textAlign: "right"}}>{pct.toFixed(0)}%</span>
                        <div style={{width: 80, height: 6, background: "var(--ink-100)", borderRadius: 4, overflow: "hidden"}}>
                          <div style={{width: `${pct}%`, height: "100%", background: pct >= 100 ? "var(--danger-500)" : pct > 80 ? "var(--warn-500)" : "var(--success-500)"}}/>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {orphanStudents > 0 && (
        <Banner kind="warn" title="Linkage issues">
          <div className="mt-3"></div>
          {orphanStudents} orphan student{orphanStudents === 1 ? "" : "s"} found. Link to a parent account or delete the record.
        </Banner>
      )}
    </Fragment>
  );
};

/* ============ UTILISATION ============ */
const UtilisationReport = () => {
  const rows = CLASSES.map((c) => ({
    id: c.id,
    type: c.type,
    day: c.day,
    capacity: c.capacity,
    enrolled: c.enrolledStudents.length,
    attendanceDocs: ATTENDANCE.filter(a => a.classId === c.id).length,
    avgAttendance: ATTENDANCE.filter(a => a.classId === c.id && !a.cancelled).reduce((s, a) => s + a.attendance.length, 0) / Math.max(1, ATTENDANCE.filter(a => a.classId === c.id && !a.cancelled).length) || 0,
  }));
  const totalCapacity = rows.reduce((s, r) => s + r.capacity, 0);
  const totalEnrolled = rows.reduce((s, r) => s + r.enrolled, 0);

  return (
    <Fragment>
      <FilterCard>
        <div className="grid gap-3" style={{gridTemplateColumns: "repeat(4, 1fr)"}}>
          <div className="field"><label className="label">From</label><input className="input" type="date" defaultValue="2026-04-21"/></div>
          <div className="field"><label className="label">To</label><input className="input" type="date" defaultValue={TODAY.toISOString().slice(0, 10)}/></div>
          <div className="field"><label className="label">Classes</label><select className="select" multiple style={{height: 38}}><option>All classes</option></select></div>
        </div>
      </FilterCard>

      <ExportBar generatedAt={TODAY} filterSummary={`All classes · Term 2`} rowCount={rows.length}/>

      <div className="grid grid-3 mb-4">
        <StatCard label="Overall utilisation" value={`${((totalEnrolled / totalCapacity) * 100).toFixed(0)}%`} icon="grid" accent="#4A90C4" foot={`${totalEnrolled} of ${totalCapacity} seats`}/>
        <StatCard label="Classes at capacity" value={rows.filter(r => r.enrolled >= r.capacity).length} icon="users" accent="#D63C49"/>
        <StatCard label="Classes under 50%" value={rows.filter(r => (r.enrolled / r.capacity) < 0.5).length} icon="alert" accent="#C58A1E"/>
      </div>

      <div className="card">
        <div className="card-head"><h3><span className="brand-stripe"></span>Per class</h3></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Class</th><th>Day</th><th className="col-right">Enrolled</th><th className="col-right">Capacity</th><th className="col-right">Avg listed</th><th className="col-right">Utilisation</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const pct = (r.enrolled / r.capacity) * 100;
                return (
                  <tr key={r.id}>
                    <td className="cell-strong">{r.type}</td>
                    <td>{r.day}</td>
                    <td className="col-right num">{r.enrolled}</td>
                    <td className="col-right num">{r.capacity}</td>
                    <td className="col-right num">{r.avgAttendance.toFixed(1)}</td>
                    <td className="col-right">
                      <div className="row gap-2" style={{justifyContent: "flex-end"}}>
                        <span className="weight-600 num" style={{minWidth: 50, textAlign: "right"}}>{pct.toFixed(0)}%</span>
                        <div style={{width: 80, height: 6, background: "var(--ink-100)", borderRadius: 4, overflow: "hidden"}}>
                          <div style={{width: `${Math.min(100, pct)}%`, height: "100%", background: pct >= 100 ? "var(--danger-500)" : pct > 80 ? "var(--warn-500)" : pct < 50 ? "var(--ink-300)" : "var(--success-500)"}}/>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Fragment>
  );
};

const FilterCard = ({ children }) => (
  <div className="card mb-4">
    <div className="card-head"><h3 style={{fontSize: "var(--fs-md)"}}><Icon name="filter" size={14} style={{marginRight: 6, verticalAlign: -2}}/>Filters</h3></div>
    <div className="card-body">{children}</div>
  </div>
);

window.Views = Object.assign(window.Views || {}, { Reports });
