/* =========================================================
   Dashboard
   ========================================================= */

const Dashboard = ({ route }) => {
  const auth = useAuth();
  const pending = ENROLMENTS.filter((e) => e.status === "pending");
  const overdue = INVOICES.filter((i) => i.status === "overdue");
  const unpaid = INVOICES.filter((i) => i.status === "unpaid");
  const totalUnpaidAmt = [...overdue, ...unpaid].reduce((s, i) => s + i.amountDue, 0);
  const totalPaidAmt = INVOICES.filter((i) => i.status === "paid").reduce((s, i) => s + i.amountDue, 0);
  const classesNeedingSetup = CLASSES.filter((c) => c.tutors.length === 0 || c.enrolledStudents.length === 0);
  const waitlistActive = WAITLIST.filter((w) => w.status === "active");
  const waitlistOffered = WAITLIST.filter((w) => w.status === "offered");
  const activeTerm = TERMS.find((t) => t.status === "active");

  return (
    <Fragment>
      <PageHead
        title={`Welcome back, ${auth.user.firstName}.`}
        sub={`It's ${fmt.date(TODAY)}. Here's where Tenacity stands today.`}
      />

      <div className="hero mb-6">
        <div>
          <Badge tone="brand" outline className="mb-3" style={{background: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.2)", color: "var(--white)"}}>
            <span className="dot-glyph" style={{background: "var(--brand-blue-400)"}}></span>
            Active term · {activeTerm.year} Term {activeTerm.termNum}
          </Badge>
          <h2>Term {activeTerm.termNum}, {activeTerm.year}</h2>
          <div className="hero-sub">
            Week {Math.ceil((TODAY - activeTerm.startDate) / (7 * 86400000))} of {activeTerm.weeksNum}.
            Running {fmt.date(activeTerm.startDate)} → {fmt.date(activeTerm.endDate)}.
          </div>
          <div className="hero-stat-row">
            <div>
              <div className="hero-stat-label">Students enrolled</div>
              <div className="hero-stat-value">{STUDENTS.filter(s => s.parents.length > 0).length}</div>
            </div>
            <div>
              <div className="hero-stat-label">Active classes</div>
              <div className="hero-stat-value">{CLASSES.length}</div>
            </div>
            <div>
              <div className="hero-stat-label">Tutors on roster</div>
              <div className="hero-stat-value">{USERS.filter(u => u.role === "tutor").length}</div>
            </div>
            <div>
              <div className="hero-stat-label">Term revenue (paid)</div>
              <div className="hero-stat-value">{fmt.moneyShort(totalPaidAmt)}</div>
            </div>
          </div>
        </div>
        <div className="col gap-2" style={{minWidth: 220}}>
          <Button variant="accent" icon="plus" onClick={() => navigate("/people/new")}>New user</Button>
          <Button variant="secondary" icon="plus" style={{background: "rgba(255,255,255,0.10)", borderColor: "rgba(255,255,255,0.25)", color: "var(--white)"}} onClick={() => navigate("/classes/new")}>New class</Button>
          <Button variant="secondary" icon="plus" style={{background: "rgba(255,255,255,0.10)", borderColor: "rgba(255,255,255,0.25)", color: "var(--white)"}} onClick={() => navigate("/invoices/new")}>New invoice</Button>
          <Button variant="secondary" icon="reports" style={{background: "rgba(255,255,255,0.10)", borderColor: "rgba(255,255,255,0.25)", color: "var(--white)"}} onClick={() => navigate("/reports")}>Run report</Button>
        </div>
      </div>

      {/* Stat row */}
      <div className="grid grid-4 mb-6">
        <StatCard label="Pending enrolments" value={pending.length} icon="enrol" accent="#4A90C4" trend={{dir: "up", label: "+2 this week"}} foot="Awaiting review" />
        <StatCard label="Overdue invoices" value={overdue.length} icon="invoice" accent="#D63C49" foot={`${fmt.money(overdue.reduce((s, i) => s + i.amountDue, 0))} outstanding`} />
        <StatCard label="Unpaid (current)" value={unpaid.length} icon="wallet" accent="#C58A1E" foot={`${fmt.money(unpaid.reduce((s, i) => s + i.amountDue, 0))} due soon`} />
        <StatCard label="Waitlist activity" value={waitlistActive.length + waitlistOffered.length} icon="waitlist" accent="#1FA968" foot={`${waitlistOffered.length} offered · ${waitlistActive.length} waiting`} />
      </div>

      {/* Two-column queues */}
      <div className="grid grid-2 mb-6">
        {/* Pending enrolments */}
        <div className="card">
          <div className="card-head">
            <div>
              <h3><span className="brand-stripe"></span>Pending enrolments</h3>
              <div className="card-sub">Review and accept to provision accounts.</div>
            </div>
            <a href="#/enrolments" className="row gap-1 text-sm weight-600" style={{color: "var(--brand-navy)"}}>View all <Icon name="arrow-right" size={14}/></a>
          </div>
          <div className="card-body flush">
            {pending.length === 0 ? <Empty title="Inbox zero." msg="No pending enrolments." icon="check-circle"/> : (
              <table className="table">
                <tbody>
                  {pending.slice(0, 4).map((e) => (
                    <tr key={e.id} className="row-link" onClick={() => navigate(`/enrolments/${e.id}`)}>
                      <td>
                        <div className="row gap-3">
                          <Avatar name={`${e.studentFirstName} ${e.studentLastName}`} size="sm" />
                          <div className="row-meta">
                            <span className="primary">{e.studentFirstName} {e.studentLastName}</span>
                            <span className="secondary">{e.studentYear} · {e.studentSubjects.join(", ")}</span>
                          </div>
                        </div>
                      </td>
                      <td className="cell-muted">{fmt.relTime(e.createdAt)}</td>
                      <td className="col-right"><Button size="sm" variant="primary" onClick={(ev) => { ev.stopPropagation(); navigate(`/enrolments/${e.id}`); }}>Review</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Overdue invoices */}
        <div className="card">
          <div className="card-head">
            <div>
              <h3><span className="brand-stripe"></span>Outstanding payments</h3>
              <div className="card-sub">{fmt.money(totalUnpaidAmt)} unpaid across {unpaid.length + overdue.length} invoices.</div>
            </div>
            <a href="#/invoices?status=overdue" className="row gap-1 text-sm weight-600" style={{color: "var(--brand-navy)"}}>All invoices <Icon name="arrow-right" size={14}/></a>
          </div>
          <div className="card-body flush">
            {[...overdue, ...unpaid].length === 0 ? <Empty title="All paid up." icon="check-circle"/> : (
              <table className="table">
                <tbody>
                  {[...overdue, ...unpaid].slice(0, 4).map((inv) => (
                    <tr key={inv.id} className="row-link" onClick={() => navigate(`/invoices/${inv.id}`)}>
                      <td>
                        <div className="row-meta">
                          <span className="primary">{inv.invoiceNumber}</span>
                          <span className="secondary">{inv.parentName}</span>
                        </div>
                      </td>
                      <td><StatusBadge status={inv.status}/></td>
                      <td className="cell-muted">Due {fmt.dateShort(inv.dueDate)}</td>
                      <td className="col-right cell-strong num">{fmt.money(inv.amountDue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Three-column quick info */}
      <div className="grid grid-3 mb-6">
        {/* Class health */}
        <div className="card">
          <div className="card-head">
            <h3><span className="brand-stripe"></span>Class health</h3>
            <a href="#/classes" className="text-sm weight-600" style={{color: "var(--brand-navy)"}}>View all</a>
          </div>
          <div className="card-body flush">
            {classesNeedingSetup.length === 0 ? <Empty title="All classes set up" icon="check-circle"/> : classesNeedingSetup.map((c) => (
              <div key={c.id} style={{ padding: "14px 24px", borderBottom: "1px solid var(--ink-100)" }}>
                <div className="row between">
                  <div className="row-meta">
                    <span className="primary">{c.type}</span>
                    <span className="secondary">{c.day} · {c.startTime}–{c.endTime}</span>
                  </div>
                  <a href={`#/classes/${c.id}`}><Icon name="chevron-right" size={16} style={{color: "var(--ink-400)"}}/></a>
                </div>
                <div className="row gap-2 mt-2 wrap">
                  {c.tutors.length === 0 && <Badge tone="warn" dot>No tutor</Badge>}
                  {c.enrolledStudents.length === 0 && <Badge tone="warn" dot>No students</Badge>}
                  {c.enrolledStudents.length >= c.capacity && <Badge tone="danger" dot>Full</Badge>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Waitlist */}
        <div className="card">
          <div className="card-head">
            <h3><span className="brand-stripe"></span>Waitlist</h3>
            <a href="#/waitlist" className="text-sm weight-600" style={{color: "var(--brand-navy)"}}>Manage</a>
          </div>
          <div className="card-body flush">
            {[...waitlistOffered, ...waitlistActive].slice(0, 5).map((w) => {
              const stu = findStudent(w.studentId);
              const cls = findClass(w.classId);
              return (
                <div key={w.id} style={{ padding: "14px 24px", borderBottom: "1px solid var(--ink-100)" }}>
                  <div className="row between gap-3">
                    <div className="row-meta grow">
                      <span className="primary">{studentName(stu)}</span>
                      <span className="secondary">{cls?.type} · {cls?.day}</span>
                    </div>
                    <StatusBadge status={w.status}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent activity */}
        <div className="card">
          <div className="card-head">
            <h3><span className="brand-stripe"></span>Recent activity</h3>
            <a href="#/settings" className="text-sm weight-600" style={{color: "var(--brand-navy)"}}>Audit log</a>
          </div>
          <div className="card-body flush">
            {ADMIN_AUDIT_LOG.slice(0, 5).map((log) => {
              const actor = findUser(log.actor);
              return (
                <div key={log.id} style={{ padding: "14px 24px", borderBottom: "1px solid var(--ink-100)" }}>
                  <div className="row gap-3">
                    <Avatar name={userName(actor)} size="sm"/>
                    <div className="grow">
                      <div className="text-sm" style={{color: "var(--ink-900)"}}>
                        <span className="weight-600">{userName(actor)}</span> · <span className="muted">{log.summary}</span>
                      </div>
                      <div className="text-xs muted" style={{marginTop: 2}}>
                        <span className="text-mono">{log.action}</span> · {fmt.relTime(log.at)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* System warnings */}
      {SYSTEM_STATUS.runtimeWarning && (
        <Banner kind="warn" title="Heads-up: Node 20 runtime decommissions Oct 30, 2026" action={
          <Button size="sm" variant="secondary" onClick={() => navigate("/settings")}>Open settings</Button>
        }>
          {SYSTEM_STATUS.runtimeWarning} Plan a backend runtime migration before then.
        </Banner>
      )}
    </Fragment>
  );
};

window.Views = Object.assign(window.Views || {}, { Dashboard });
