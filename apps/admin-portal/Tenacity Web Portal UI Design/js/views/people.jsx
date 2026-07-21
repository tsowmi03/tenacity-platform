/* =========================================================
   People — users (parents / tutors / admins) + students
   ========================================================= */

const peopleTabs = [
  { id: "parents", label: "Parents", role: "parent" },
  { id: "tutors", label: "Tutors", role: "tutor" },
  { id: "admins", label: "Admins", role: "admin" },
  { id: "students", label: "Students" },
];

/* ============ LIST (all tabs) ============ */
const PeopleList = ({ initialTab }) => {
  const toast = useToast();
  const [tab, setTab] = useState(initialTab || "parents");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState("user"); // user | student

  const counts = {
    parents: USERS.filter((u) => u.role === "parent").length,
    tutors: USERS.filter((u) => u.role === "tutor").length,
    admins: USERS.filter((u) => u.role === "admin").length,
    students: STUDENTS.length,
  };

  return (
    <Fragment>
      <PageHead
        title="People"
        sub="Parents, tutors, admin team and students — manage accounts, links, and lesson tokens."
        actions={
          <Fragment>
            <Button variant="secondary" icon="download">Export</Button>
            {tab === "students"
              ? <Button variant="primary" icon="plus" onClick={() => { setCreateMode("student"); setCreateOpen(true); }}>New student</Button>
              : <Button variant="primary" icon="plus" onClick={() => { setCreateMode("user"); setCreateOpen(true); }}>New {tab.slice(0, -1)}</Button>}
          </Fragment>
        }
      />

      <div className="tabs">
        {peopleTabs.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            {t.label} <span className="count">{counts[t.id]}</span>
          </button>
        ))}
      </div>

      <div className="filter-bar">
        <SearchInput value={search} onChange={setSearch} placeholder={`Search ${tab}…`} className="grow"/>
        {tab === "parents" && (
          <select className="select" style={{maxWidth: 200}}>
            <option>All token balances</option>
            <option>Zero tokens</option>
            <option>1–5 tokens</option>
            <option>5+ tokens</option>
          </select>
        )}
        {tab === "students" && (
          <select className="select" style={{maxWidth: 160}}>
            <option>All years</option>
            {Array.from({length: 12}, (_, i) => `Year ${i+1}`).map((y) => <option key={y}>{y}</option>)}
          </select>
        )}
        <Button variant="ghost" size="sm" icon="filter">More filters</Button>
      </div>

      {tab === "students"
        ? <StudentsTable search={search}/>
        : <UsersTable role={peopleTabs.find(t => t.id === tab).role} search={search}/>}

      {/* Create modal */}
      <CreatePersonModal open={createOpen} onClose={() => setCreateOpen(false)} mode={createMode} defaultRole={peopleTabs.find(t => t.id === tab)?.role || "parent"} toast={toast}/>
    </Fragment>
  );
};

/* ============ USERS TABLE ============ */
const UsersTable = ({ role, search }) => {
  const rows = USERS.filter((u) => u.role === role).filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return userName(u).toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.phone || "").includes(search);
  });

  return (
    <div className="card">
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact</th>
              {role === "parent" && <th>Students</th>}
              {role === "parent" && <th className="col-right">Lesson tokens</th>}
              {role === "tutor" && <th>Assigned classes</th>}
              <th>Last updated</th>
              <th className="col-actions"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const assignedClasses = CLASSES.filter((c) => c.tutors.includes(u.uid));
              return (
                <tr key={u.uid} className="row-link" onClick={() => navigate(`/people/${role}s/${u.uid}`)}>
                  <td>
                    <div className="row gap-3">
                      <Avatar name={userName(u)} size="sm"/>
                      <div className="row-meta">
                        <span className="primary">{userName(u)}</span>
                        <span className="secondary text-mono">{u.uid}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="row-meta">
                      <span className="primary">{u.email}</span>
                      <span className="secondary">{u.phone}</span>
                    </div>
                  </td>
                  {role === "parent" && (
                    <td>
                      {u.students.length === 0
                        ? <span className="muted">No students linked</span>
                        : <div className="col gap-1">{u.students.map((sid) => {
                            const s = findStudent(sid);
                            return s && <span key={sid} className="text-sm">{studentName(s)} <span className="muted">· {s.grade}</span></span>;
                          })}</div>
                      }
                    </td>
                  )}
                  {role === "parent" && (
                    <td className="col-right">
                      <Badge tone={u.lessonTokens > 0 ? "brand" : "neutral"}>
                        <Icon name="lightning" size={11}/> {u.lessonTokens}
                      </Badge>
                    </td>
                  )}
                  {role === "tutor" && (
                    <td>
                      {assignedClasses.length === 0 ? <span className="muted">Unassigned</span> :
                        <div className="col gap-1">
                          {assignedClasses.slice(0, 2).map((c) => <span key={c.id} className="text-sm">{c.day} · {c.type}</span>)}
                          {assignedClasses.length > 2 && <span className="text-xs muted">+ {assignedClasses.length - 2} more</span>}
                        </div>
                      }
                    </td>
                  )}
                  <td className="cell-muted">{fmt.relTime(u.updatedAt)}</td>
                  <td className="col-actions" onClick={(ev) => ev.stopPropagation()}>
                    <Button size="sm" variant="secondary" iconRight="chevron-right" onClick={() => navigate(`/people/${role}s/${u.uid}`)}>Open</Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <Empty title={`No ${role}s match`} icon="search"/>}
      </div>
    </div>
  );
};

/* ============ STUDENTS TABLE ============ */
const StudentsTable = ({ search }) => {
  const rows = STUDENTS.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return studentName(s).toLowerCase().includes(q) ||
      s.grade.toLowerCase().includes(q) ||
      s.subjects.some((sub) => sub.toLowerCase().includes(q));
  });
  return (
    <div className="card">
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Student</th><th>Grade</th><th>Subjects</th><th>Parents</th><th>Classes</th><th className="col-actions"></th></tr></thead>
          <tbody>
            {rows.map((s) => {
              const enrolledClasses = CLASSES.filter((c) => c.enrolledStudents.includes(s.id));
              const isOrphan = s.parents.length === 0;
              return (
                <tr key={s.id} className="row-link" onClick={() => navigate(`/people/students/${s.id}`)}>
                  <td>
                    <div className="row gap-3">
                      <Avatar name={studentName(s)} size="sm"/>
                      <div className="row-meta">
                        <span className="primary">{studentName(s)} {isOrphan && <Badge tone="warn" className="ml-2">Orphan</Badge>}</span>
                        <span className="secondary text-mono">{s.id}</span>
                      </div>
                    </div>
                  </td>
                  <td>{s.grade}</td>
                  <td>
                    <div className="row gap-1 wrap">
                      {s.subjects.slice(0, 3).map((sub, i) => <Badge key={i} tone="brand">{sub}</Badge>)}
                      {s.subjects.length > 3 && <span className="text-xs muted">+{s.subjects.length - 3}</span>}
                    </div>
                  </td>
                  <td>
                    {isOrphan ? <span className="muted">— No parents —</span> :
                      <div className="col gap-1">{s.parents.map((pid) => {
                        const p = findUser(pid);
                        return p && (
                          <span key={pid} className="text-sm">
                            {userName(p)}
                            {pid === s.primaryParentId && <Badge tone="brand" className="ml-2" style={{marginLeft: 6}}>Primary</Badge>}
                          </span>
                        );
                      })}</div>
                    }
                  </td>
                  <td className="cell-muted">{enrolledClasses.length} {enrolledClasses.length === 1 ? "class" : "classes"}</td>
                  <td className="col-actions" onClick={(ev) => ev.stopPropagation()}>
                    <Button size="sm" variant="secondary" iconRight="chevron-right" onClick={() => navigate(`/people/students/${s.id}`)}>Open</Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <Empty title="No students match" icon="search"/>}
      </div>
    </div>
  );
};

/* ============ CREATE PERSON MODAL ============ */
const CreatePersonModal = ({ open, onClose, mode, defaultRole, toast }) => {
  const [role, setRole] = useState(defaultRole);
  const [sendEmail, setSendEmail] = useState(true);
  useEffect(() => { setRole(defaultRole); }, [defaultRole]);

  return (
    <Modal open={open} onClose={onClose} size={mode === "user" && role === "parent" ? "lg" : "md"}
      title={mode === "student" ? "Create student" : `Create ${role}`}
      subtitle={mode === "student" ? "Add a student record. Parent linking is optional — orphan students are allowed." : "Provision a Firebase Auth user and Firestore user document."}
      footer={<Fragment>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={() => { onClose(); toast.success(mode === "student" ? "Student created" : "User created", sendEmail && mode === "user" ? "Welcome email sent via SendGrid." : ""); }}>{mode === "student" ? "Create student" : "Create user"}</Button>
      </Fragment>}>

      {mode === "user" ? (
        <Fragment>
          <div className="field mb-4">
            <label className="label">Role <span className="req">*</span></label>
            <div className="row gap-2">
              {["parent", "tutor", "admin"].map((r) => (
                <label key={r} className={`row gap-2 weight-600 text-sm`} style={{
                  padding: "8px 14px", borderRadius: "var(--r-md)",
                  border: `1px solid ${role === r ? "var(--brand-navy)" : "var(--ink-300)"}`,
                  background: role === r ? "var(--brand-blue-50)" : "var(--white)",
                  color: role === r ? "var(--brand-navy)" : "var(--ink-700)",
                  cursor: "pointer", textTransform: "capitalize",
                }}>
                  <input type="radio" name="role" checked={role === r} onChange={() => setRole(r)} style={{display: "none"}}/>
                  <Icon name={r === "parent" ? "user" : r === "tutor" ? "graduation" : "shield"} size={14}/>
                  {r}
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-2 gap-4">
            <div className="field"><label className="label">First name <span className="req">*</span></label><input className="input"/></div>
            <div className="field"><label className="label">Last name <span className="req">*</span></label><input className="input"/></div>
            <div className="field"><label className="label">Email <span className="req">*</span></label><input className="input" type="email"/></div>
            <div className="field"><label className="label">Phone</label><input className="input"/></div>
            <div className="field"><label className="label">Temporary password <span className="opt">auto-generated if blank</span></label><input className="input" type="text"/></div>
            {role === "parent" && <div className="field"><label className="label">Starting lesson tokens</label><input className="input" type="number" defaultValue="0"/></div>}
          </div>
          {role === "parent" && (
            <div className="mt-4">
              <Banner kind="info" title="Bundle students later">
                After creating this parent, you can link existing students or add new ones from the parent detail page.
              </Banner>
            </div>
          )}
          <div className="mt-4 row between" style={{padding: "12px 14px", background: "var(--ink-50)", borderRadius: "var(--r-md)"}}>
            <div>
              <div className="weight-600">Send welcome email</div>
              <div className="text-xs muted">Triggers SendGrid welcome flow with sign-in instructions.</div>
            </div>
            <div className={`switch ${sendEmail ? "on" : ""}`} onClick={() => setSendEmail(!sendEmail)}/>
          </div>
        </Fragment>
      ) : (
        <Fragment>
          <div className="grid grid-2 gap-4">
            <div className="field"><label className="label">First name <span className="req">*</span></label><input className="input"/></div>
            <div className="field"><label className="label">Last name <span className="req">*</span></label><input className="input"/></div>
            <div className="field"><label className="label">Year level <span className="req">*</span></label>
              <select className="select">{Array.from({length: 12}, (_, i) => `Year ${i+1}`).map((y) => <option key={y}>{y}</option>)}</select>
            </div>
            <div className="field"><label className="label">Subjects <span className="opt">comma-separated</span></label><input className="input" placeholder="Maths, English"/></div>
          </div>
          <div className="field mt-4"><label className="label">Link to parents <span className="opt">optional</span></label>
            <select className="select" multiple style={{height: 100}}>
              {USERS.filter(u => u.role === "parent").map((p) => <option key={p.uid} value={p.uid}>{userName(p)} · {p.email}</option>)}
            </select>
            <span className="hint">Hold ⌘/Ctrl to select multiple. Leave empty to create an orphan student record.</span>
          </div>
        </Fragment>
      )}
    </Modal>
  );
};

/* ============ DETAIL ROUTING ============ */
const PersonDetail = ({ kind, id }) => {
  if (kind === "students") {
    const s = STUDENTS.find((x) => x.id === id);
    if (!s) return <Empty title="Student not found" icon="x-circle" action={<Button onClick={() => navigate("/people")}>Back to People</Button>}/>;
    return <StudentDetail student={s}/>;
  }
  const u = USERS.find((x) => x.uid === id);
  if (!u) return <Empty title="User not found" icon="x-circle" action={<Button onClick={() => navigate("/people")}>Back to People</Button>}/>;
  return <UserDetail user={u}/>;
};

/* ============ USER DETAIL ============ */
const UserDetail = ({ user: u }) => {
  const toast = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [tokenOpen, setTokenOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);

  const linkedStudents = u.role === "parent" ? STUDENTS.filter((s) => u.students.includes(s.id)) : [];
  const assignedClasses = u.role !== "parent" ? CLASSES.filter((c) => c.tutors.includes(u.uid)) : [];
  const userInvoices = u.role === "parent" ? INVOICES.filter((i) => i.parentId === u.uid) : [];

  const blockedFromDelete = u.role === "parent" && u.students.length > 0;
  const tabLabel = u.role === "parent" ? "Parents" : u.role === "tutor" ? "Tutors" : "Admins";

  return (
    <Fragment>
      <PageHead
        crumbs={[{label: "People", href: "#/people"}, {label: tabLabel, href: `#/people?tab=${u.role}s`}, {label: userName(u)}]}
        title={userName(u)}
        sub={<span>
          <Badge tone="brand" dot>role: {u.role}</Badge>
          <span style={{marginLeft: 10}} className="text-mono muted">{u.uid}</span>
        </span>}
        actions={<Fragment>
          {u.role === "parent" && <Button variant="secondary" icon="lightning" onClick={() => setTokenOpen(true)}>Adjust tokens</Button>}
          <Button variant="secondary" icon="edit" onClick={() => setEditOpen(true)}>Edit</Button>
          <Button variant="danger-outline" icon="trash" onClick={() => setDelOpen(true)}>Delete user</Button>
        </Fragment>}
      />

      <div className="detail-grid mt-5">
        {/* MAIN */}
        <div className="col gap-5">
          <div className="card">
            <div className="card-head"><h3><span className="brand-stripe"></span>Profile</h3></div>
            <div className="card-body">
              <div className="row gap-5 wrap">
                <Avatar name={userName(u)} size="lg"/>
                <dl className="dlist grow">
                  <dt>Email</dt><dd><a href={`mailto:${u.email}`}>{u.email}</a></dd>
                  <dt>Phone</dt><dd>{u.phone || "—"}</dd>
                  <dt>Custom claim</dt><dd className="text-mono"><Badge tone="brand">role: {u.role}</Badge></dd>
                  <dt>Created</dt><dd>{fmt.date(u.createdAt)}</dd>
                  <dt>Last updated</dt><dd>{fmt.relTime(u.updatedAt)}</dd>
                  {u.stripeCustomerId && <Fragment><dt>Stripe customer</dt><dd className="text-mono">{u.stripeCustomerId}</dd></Fragment>}
                </dl>
              </div>
            </div>
          </div>

          {u.role === "parent" && (
            <div className="card">
              <div className="card-head">
                <h3><span className="brand-stripe"></span>Linked students</h3>
                <Button size="sm" variant="secondary" icon="link" onClick={() => setLinkOpen(true)}>Link student</Button>
              </div>
              <div className="card-body flush">
                {linkedStudents.length === 0 ? <Empty title="No students linked" msg="Link an existing student or create a new one." icon="graduation"/> : (
                  <table className="table">
                    <tbody>
                      {linkedStudents.map((s) => (
                        <tr key={s.id} className="row-link" onClick={() => navigate(`/people/students/${s.id}`)}>
                          <td>
                            <div className="row gap-3">
                              <Avatar name={studentName(s)} size="sm"/>
                              <div className="row-meta">
                                <span className="primary">{studentName(s)}
                                  {s.primaryParentId === u.uid && <Badge tone="brand" style={{marginLeft: 8}}>Primary</Badge>}
                                </span>
                                <span className="secondary">{s.grade} · {s.subjects.join(", ")}</span>
                              </div>
                            </div>
                          </td>
                          <td className="col-right" onClick={(e) => e.stopPropagation()}>
                            <Button size="sm" variant="ghost" icon="unlink" onClick={() => toast.warn("Unlink student", "Confirmation flow would appear here.")}>Unlink</Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {u.role === "parent" && (
            <div className="card">
              <div className="card-head">
                <h3><span className="brand-stripe"></span>Invoices</h3>
                <a href={`#/invoices?parent=${u.uid}`} className="text-sm weight-600" style={{color: "var(--brand-navy)"}}>All invoices</a>
              </div>
              <div className="card-body flush">
                {userInvoices.length === 0 ? <Empty title="No invoices yet" icon="invoice"/> : (
                  <table className="table">
                    <thead><tr><th>Invoice</th><th>Status</th><th>Due</th><th className="col-right">Amount</th></tr></thead>
                    <tbody>
                      {userInvoices.map((inv) => (
                        <tr key={inv.id} className="row-link" onClick={() => navigate(`/invoices/${inv.id}`)}>
                          <td className="cell-strong">{inv.invoiceNumber}</td>
                          <td><StatusBadge status={inv.status}/></td>
                          <td className="cell-muted">{fmt.dateShort(inv.dueDate)}</td>
                          <td className="col-right cell-strong num">{fmt.money(inv.amountDue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {u.role !== "parent" && (
            <div className="card">
              <div className="card-head"><h3><span className="brand-stripe"></span>Assigned classes</h3></div>
              <div className="card-body flush">
                {assignedClasses.length === 0 ? <Empty title="No classes assigned" icon="classes"/> : (
                  <table className="table">
                    <tbody>
                      {assignedClasses.map((c) => (
                        <tr key={c.id} className="row-link" onClick={() => navigate(`/classes/${c.id}`)}>
                          <td>
                            <div className="row-meta">
                              <span className="primary">{c.type}</span>
                              <span className="secondary">{c.day} · {c.startTime}–{c.endTime}</span>
                            </div>
                          </td>
                          <td className="col-right cell-muted">{c.enrolledStudents.length}/{c.capacity} enrolled</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>

        {/* SIDEBAR */}
        <div className="col gap-5">
          {u.role === "parent" && (
            <div className="card">
              <div className="card-head"><h3><span className="brand-stripe"></span>Lesson tokens</h3></div>
              <div className="card-body">
                <div style={{
                  background: "linear-gradient(135deg, var(--brand-navy) 0%, var(--brand-blue) 130%)",
                  color: "var(--white)", borderRadius: "var(--r-lg)", padding: "20px",
                  textAlign: "center",
                }}>
                  <Icon name="lightning" size={26}/>
                  <div style={{fontFamily: "var(--font-display)", fontSize: 40, fontWeight: 700, marginTop: 4, lineHeight: 1}}>{u.lessonTokens}</div>
                  <div className="text-sm" style={{color: "rgba(255,255,255,0.78)"}}>available tokens</div>
                </div>
                <Button variant="secondary" className="mt-3" icon="edit" onClick={() => setTokenOpen(true)} style={{width: "100%"}}>Adjust balance</Button>
                <div className="text-xs muted mt-3">Adjustments record before/after and reason for audit.</div>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-head"><h3><span className="brand-stripe"></span>Account activity</h3></div>
            <div className="card-body flush">
              {ADMIN_AUDIT_LOG.filter((l) => l.target === u.uid || l.actor === u.uid).slice(0, 5).map((log) => (
                <div key={log.id} style={{ padding: "12px 24px", borderBottom: "1px solid var(--ink-100)" }}>
                  <div className="text-sm">{log.summary}</div>
                  <div className="text-xs muted" style={{marginTop: 2}}><span className="text-mono">{log.action}</span> · {fmt.relTime(log.at)}</div>
                </div>
              ))}
              {ADMIN_AUDIT_LOG.filter((l) => l.target === u.uid || l.actor === u.uid).length === 0 && <Empty title="No recent activity" msg="" icon="clock"/>}
            </div>
          </div>
        </div>
      </div>

      {/* Edit user */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit user"
        subtitle="Role and email changes are not handled here. Use Adjust tokens for parent token corrections — they record before/after and a reason."
        footer={<Fragment>
          <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => { setEditOpen(false); toast.success("User updated"); }}>Save</Button>
        </Fragment>}>
        <div className="grid grid-2 gap-4">
          <div className="field"><label className="label">First name</label><input className="input" defaultValue={u.firstName}/></div>
          <div className="field"><label className="label">Last name</label><input className="input" defaultValue={u.lastName}/></div>
          <div className="field"><label className="label">Phone</label><input className="input" defaultValue={u.phone}/></div>
        </div>
      </Modal>

      {/* Token adjust */}
      <TokenAdjustModal open={tokenOpen} onClose={() => setTokenOpen(false)} user={u} toast={toast}/>

      {/* Link student modal (parent) */}
      <Modal open={linkOpen} onClose={() => setLinkOpen(false)} title="Link a student to this parent"
        footer={<Fragment>
          <Button variant="secondary" onClick={() => setLinkOpen(false)}>Cancel</Button>
          <Button variant="primary" icon="link" onClick={() => { setLinkOpen(false); toast.success("Student linked"); }}>Link</Button>
        </Fragment>}>
        <div className="field">
          <label className="label">Student to link</label>
          <select className="select">
            {STUDENTS.filter(s => !u.students.includes(s.id)).map((s) => <option key={s.id} value={s.id}>{studentName(s)} · {s.grade}</option>)}
          </select>
          <span className="hint">Existing student records only. To create a new student, use New Student on the People page.</span>
        </div>
        <Banner kind="info" title="Primary parent" className="mt-3">
          If this student has no primary parent yet, they will be set as primary. Otherwise the existing primary is preserved.
        </Banner>
      </Modal>

      {/* Delete */}
      <Modal open={delOpen} onClose={() => setDelOpen(false)} danger size="lg" title="Delete this user?" icon="trash"
        subtitle="This deletes the Firebase Auth user, Firestore user doc and user tokens. The action cannot be undone."
        footer={null}>
        <UserDeleteFlow user={u} blocked={blockedFromDelete} onCancel={() => setDelOpen(false)} onConfirm={() => { setDelOpen(false); toast.error("User deleted", "Cleanup summary recorded."); navigate("/people"); }}/>
      </Modal>
    </Fragment>
  );
};

/* ============ TOKEN ADJUST ============ */
const TokenAdjustModal = ({ open, onClose, user: u, toast }) => {
  const [mode, setMode] = useState("delta");
  const [delta, setDelta] = useState(0);
  const [setVal, setSetVal] = useState(u.lessonTokens);
  const [reason, setReason] = useState("");

  useEffect(() => { if (open) { setMode("delta"); setDelta(0); setSetVal(u.lessonTokens); setReason(""); }}, [open, u.lessonTokens]);

  const after = mode === "delta" ? u.lessonTokens + Number(delta || 0) : Number(setVal || 0);
  const valid = reason.trim().length > 0 && (mode === "delta" ? delta !== 0 : after !== u.lessonTokens);

  return (
    <Modal open={open} onClose={onClose} title="Adjust lesson tokens"
      subtitle={`Records before/after to the audit log. ${userName(u)} currently has ${u.lessonTokens} tokens.`}
      footer={<Fragment>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={() => { onClose(); toast.success("Tokens adjusted", `Balance updated from ${u.lessonTokens} → ${after}.`); }} disabled={!valid}>Apply adjustment</Button>
      </Fragment>}>
      <div className="row gap-2 mb-4">
        {[
          {id: "delta", label: "Add / subtract"},
          {id: "set", label: "Set exact balance"},
        ].map((opt) => (
          <button key={opt.id}
            onClick={() => setMode(opt.id)}
            className="weight-600 text-sm"
            style={{
              padding: "10px 16px", borderRadius: "var(--r-md)",
              border: `1px solid ${mode === opt.id ? "var(--brand-navy)" : "var(--ink-300)"}`,
              background: mode === opt.id ? "var(--brand-blue-50)" : "var(--white)",
              color: mode === opt.id ? "var(--brand-navy)" : "var(--ink-700)",
              cursor: "pointer", flex: 1,
            }}>{opt.label}</button>
        ))}
      </div>

      {mode === "delta" ? (
        <div className="field"><label className="label">Delta (positive = add, negative = subtract)</label>
          <input className="input" type="number" value={delta} onChange={(e) => setDelta(e.target.value)}/>
        </div>
      ) : (
        <div className="field"><label className="label">Set balance to</label>
          <input className="input" type="number" value={setVal} onChange={(e) => setSetVal(e.target.value)}/>
        </div>
      )}

      <div className="field mt-3"><label className="label">Reason <span className="req">*</span></label>
        <textarea className="textarea" placeholder="e.g. Refund for cancelled W3 lesson, goodwill credit, transfer from sibling..." value={reason} onChange={(e) => setReason(e.target.value)}/>
        <span className="hint">Required so this change is traceable. Audit log captures actor + before/after.</span>
      </div>

      <div className="row gap-5 mt-4" style={{padding: "16px", background: "var(--ink-50)", borderRadius: "var(--r-md)"}}>
        <div>
          <div className="text-xs muted weight-700" style={{textTransform: "uppercase", letterSpacing: "0.08em"}}>Before</div>
          <div style={{fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700}}>{u.lessonTokens}</div>
        </div>
        <Icon name="arrow-right" size={20} style={{color: "var(--ink-400)", alignSelf: "center"}}/>
        <div>
          <div className="text-xs muted weight-700" style={{textTransform: "uppercase", letterSpacing: "0.08em"}}>After</div>
          <div style={{fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700, color: after > u.lessonTokens ? "var(--success-700)" : after < u.lessonTokens ? "var(--danger-700)" : "var(--ink-900)"}}>
            {after}
          </div>
        </div>
      </div>
    </Modal>
  );
};

/* ============ DELETE USER FLOW ============ */
const UserDeleteFlow = ({ user: u, blocked, onCancel, onConfirm }) => {
  const [val, setVal] = useState("");
  const matched = val === u.email;
  if (blocked) {
    return (
      <div>
        <Banner kind="danger" title="Cannot delete: parent has linked students">
          {userName(u)} has {u.students.length} linked student{u.students.length === 1 ? "" : "s"}. Unlink or delete them first.
        </Banner>
        <ul className="col gap-2 mt-4" style={{listStyle: "none", padding: 0}}>
          {u.students.map((sid) => {
            const s = findStudent(sid);
            return s && (
              <li key={sid} className="row between" style={{padding: "10px 14px", background: "var(--ink-50)", borderRadius: "var(--r-md)"}}>
                <span>{studentName(s)} · <span className="muted">{s.grade}</span></span>
                <a href={`#/people/students/${s.id}`}><Button size="sm" variant="ghost">Open</Button></a>
              </li>
            );
          })}
        </ul>
        <div className="row gap-2 mt-4" style={{justifyContent: "flex-end"}}>
          <Button variant="secondary" onClick={onCancel}>Close</Button>
        </div>
      </div>
    );
  }
  return (
    <Fragment>
      <Banner kind="danger" title="This action is permanent" className="mb-4">
        Will delete Firebase Auth user, Firestore document, FCM tokens, and remove user from any classes / future attendance docs they belong to.
      </Banner>
      <div className="field">
        <label className="label">Type the user's email <span className="text-mono" style={{background: "var(--ink-100)", padding: "2px 6px", borderRadius: 4}}>{u.email}</span> to confirm</label>
        <input className={`input ${val && !matched ? "error-state" : ""}`} value={val} onChange={(e) => setVal(e.target.value)} autoFocus/>
      </div>
      <div className="row gap-2 mt-4" style={{justifyContent: "flex-end"}}>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button variant="danger" disabled={!matched} onClick={onConfirm}>Delete user permanently</Button>
      </div>
    </Fragment>
  );
};

/* ============ STUDENT DETAIL ============ */
const StudentDetail = ({ student: s }) => {
  const toast = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const linkedParents = USERS.filter((u) => s.parents.includes(u.uid));
  const enrolledClasses = CLASSES.filter((c) => c.enrolledStudents.includes(s.id));
  const futureAttendanceCount = ATTENDANCE.filter((a) => enrolledClasses.some((c) => c.id === a.classId) && a.date > TODAY).length;
  return (
    <Fragment>
      <PageHead
        crumbs={[{label: "People", href: "#/people"}, {label: "Students", href: "#/people"}, {label: studentName(s)}]}
        title={studentName(s)}
        sub={<span><Badge tone="brand">{s.grade}</Badge><span className="text-mono muted" style={{marginLeft: 10}}>{s.id}</span></span>}
        actions={<Fragment>
          <Button variant="secondary" icon="edit" onClick={() => setEditOpen(true)}>Edit</Button>
          <Button variant="danger-outline" icon="trash" onClick={() => setDelOpen(true)}>Delete student</Button>
        </Fragment>}
      />

      <div className="detail-grid mt-5">
        <div className="col gap-5">
          <div className="card">
            <div className="card-head"><h3><span className="brand-stripe"></span>Student details</h3></div>
            <div className="card-body">
              <dl className="dlist">
                <dt>Full name</dt><dd>{studentName(s)}</dd>
                <dt>Year</dt><dd>{s.grade}</dd>
                <dt>Subjects</dt><dd className="row gap-2 wrap">{s.subjects.map((sub, i) => <Badge key={i} tone="brand">{sub}</Badge>)}</dd>
                <dt>Created</dt><dd>{fmt.date(s.createdAt)}</dd>
              </dl>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h3><span className="brand-stripe"></span>Linked parents</h3>
              <Button size="sm" variant="secondary" icon="user-plus">Link parent</Button>
            </div>
            <div className="card-body flush">
              {linkedParents.length === 0
                ? <Empty title="No parents linked" msg="This is an orphan student record. Linking enables billing and notifications." icon="users"/>
                : <table className="table">
                    <tbody>
                      {linkedParents.map((p) => (
                        <tr key={p.uid} className="row-link" onClick={() => navigate(`/people/parents/${p.uid}`)}>
                          <td>
                            <div className="row gap-3">
                              <Avatar name={userName(p)} size="sm"/>
                              <div className="row-meta">
                                <span className="primary">{userName(p)} {p.uid === s.primaryParentId && <Badge tone="brand" style={{marginLeft: 6}}>Primary</Badge>}</span>
                                <span className="secondary">{p.email}</span>
                              </div>
                            </div>
                          </td>
                          <td className="col-right" onClick={(e) => e.stopPropagation()}>
                            <div className="row gap-1" style={{justifyContent: "flex-end"}}>
                              {p.uid !== s.primaryParentId && <Button size="sm" variant="ghost" icon="star" onClick={() => toast.success("Primary parent updated")}>Make primary</Button>}
                              <Button size="sm" variant="ghost" icon="unlink" onClick={() => toast.warn("Unlink", "Confirmation flow appears here.")}>Unlink</Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
              }
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3><span className="brand-stripe"></span>Class enrolments</h3></div>
            <div className="card-body flush">
              {enrolledClasses.length === 0 ? <Empty title="Not enrolled in any classes" icon="classes"/> :
                <table className="table">
                  <tbody>{enrolledClasses.map((c) => (
                    <tr key={c.id} className="row-link" onClick={() => navigate(`/classes/${c.id}`)}>
                      <td>
                        <div className="row-meta">
                          <span className="primary">{c.type}</span>
                          <span className="secondary">{c.day} · {c.startTime}–{c.endTime}</span>
                        </div>
                      </td>
                      <td className="col-right cell-muted">{c.enrolledStudents.length}/{c.capacity} enrolled</td>
                    </tr>
                  ))}</tbody>
                </table>
              }
            </div>
          </div>
        </div>

        <div className="col gap-5">
          <div className="card">
            <div className="card-head"><h3><span className="brand-stripe"></span>Impact preview</h3></div>
            <div className="card-body">
              <div className="col gap-3">
                <div className="row between"><span className="muted">Linked parents</span><span className="weight-600">{linkedParents.length}</span></div>
                <div className="row between"><span className="muted">Enrolled classes</span><span className="weight-600">{enrolledClasses.length}</span></div>
                <div className="row between"><span className="muted">Future attendance entries</span><span className="weight-600">{futureAttendanceCount}</span></div>
              </div>
              <div className="text-xs muted mt-4">Counts shown here preview what's affected if you delete this student.</div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit student"
        footer={<Fragment>
          <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => { setEditOpen(false); toast.success("Student updated"); }}>Save</Button>
        </Fragment>}>
        <div className="grid grid-2 gap-4">
          <div className="field"><label className="label">First name</label><input className="input" defaultValue={s.firstName}/></div>
          <div className="field"><label className="label">Last name</label><input className="input" defaultValue={s.lastName}/></div>
          <div className="field"><label className="label">Year level</label>
            <select className="select" defaultValue={s.grade}>{Array.from({length: 12}, (_, i) => `Year ${i+1}`).map((y) => <option key={y}>{y}</option>)}</select>
          </div>
          <div className="field"><label className="label">Subjects</label><input className="input" defaultValue={s.subjects.join(", ")}/></div>
        </div>
        {linkedParents.length > 0 && (
          <div className="field mt-4"><label className="label">Primary parent</label>
            <select className="select" defaultValue={s.primaryParentId}>
              {linkedParents.map((p) => <option key={p.uid} value={p.uid}>{userName(p)}</option>)}
            </select>
            <span className="hint">Must be one of the currently linked parents.</span>
          </div>
        )}
      </Modal>

      {/* Delete */}
      <TypedConfirm
        open={delOpen} onClose={() => setDelOpen(false)}
        title="Delete this student?"
        subtitle="Removes the student from linked parents, classes, and future attendance, then deletes the document. Backend caps cleanup at 450 writes."
        expected={studentName(s)} confirmLabel="Delete student"
        banner={<Banner kind="danger" title="Impact preview">
          <div className="mt-3"></div>
          <ul style={{paddingLeft: 18, margin: 0}}>
            <li>Unlink from {linkedParents.length} parent{linkedParents.length === 1 ? "" : "s"}</li>
            <li>Remove from {enrolledClasses.length} class{enrolledClasses.length === 1 ? "" : "es"}</li>
            <li>Remove from {futureAttendanceCount} future attendance doc{futureAttendanceCount === 1 ? "" : "s"}</li>
          </ul>
        </Banner>}
        onConfirm={() => { setDelOpen(false); toast.error("Student deleted"); navigate("/people"); }}
      />
    </Fragment>
  );
};

/* ============ ROUTER ============ */
const People = ({ route }) => {
  // /people/parents/:uid, /people/students/:id, etc
  if (route.subRoute && route.id) return <PersonDetail kind={route.subRoute} id={route.id}/>;
  return <PeopleList initialTab={route.query?.tab || route.subRoute || "parents"}/>;
};

window.Views = Object.assign(window.Views || {}, { People });
