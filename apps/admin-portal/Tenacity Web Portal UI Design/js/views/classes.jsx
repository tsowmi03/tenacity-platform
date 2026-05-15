/* =========================================================
   Classes — list, detail, create, edit, delete + attendance ctrls
   ========================================================= */

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const dayOrder = (d) => DAYS.indexOf(d);

const ClassesList = () => {
  const [search, setSearch] = useState("");
  const [dayFilter, setDayFilter] = useState("all");
  const [tutorFilter, setTutorFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const rows = useMemo(() => {
    let r = [...CLASSES];
    if (search) {
      const q = search.toLowerCase();
      r = r.filter((c) => c.type.toLowerCase().includes(q));
    }
    if (dayFilter !== "all") r = r.filter((c) => c.day === dayFilter);
    if (tutorFilter !== "all") r = r.filter((c) => c.tutors.includes(tutorFilter));
    if (statusFilter === "needs") r = r.filter((c) => c.tutors.length === 0 || c.enrolledStudents.length === 0);
    if (statusFilter === "full") r = r.filter((c) => c.enrolledStudents.length >= c.capacity);
    if (statusFilter === "open") r = r.filter((c) => c.enrolledStudents.length < c.capacity);
    return r.sort((a, b) => dayOrder(a.day) - dayOrder(b.day) || a.startTime.localeCompare(b.startTime));
  }, [search, dayFilter, tutorFilter, statusFilter]);

  return (
    <Fragment>
      <PageHead
        title="Classes"
        sub={`${CLASSES.length} classes across ${new Set(CLASSES.map(c => c.day)).size} days. Set up class rosters, tutors, and attendance.`}
        actions={
          <Fragment>
            <Button variant="secondary" icon="calendar" onClick={() => navigate("/attendance")}>Attendance maintenance</Button>
            <Button variant="primary" icon="plus" onClick={() => navigate("/classes/new")}>New class</Button>
          </Fragment>
        }
      />

      <div className="filter-bar">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by class type…" className="grow"/>
        <select className="select" value={dayFilter} onChange={(e) => setDayFilter(e.target.value)} style={{maxWidth: 160}}>
          <option value="all">All days</option>
          {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="select" value={tutorFilter} onChange={(e) => setTutorFilter(e.target.value)} style={{maxWidth: 200}}>
          <option value="all">All tutors</option>
          {USERS.filter(u => u.role === "tutor").map((t) => <option key={t.uid} value={t.uid}>{userName(t)}</option>)}
        </select>
        <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{maxWidth: 180}}>
          <option value="all">All capacity states</option>
          <option value="open">Has open spots</option>
          <option value="full">At capacity</option>
          <option value="needs">Needs setup</option>
        </select>
      </div>

      <div className="grid grid-2 gap-4">
        {rows.map((c) => <ClassCard key={c.id} cls={c}/>)}
      </div>
      {rows.length === 0 && <div className="card mt-4"><Empty title="No classes match" icon="search"/></div>}
    </Fragment>
  );
};

const ClassCard = ({ cls: c }) => {
  const tutors = c.tutors.map((id) => findUser(id)).filter(Boolean);
  const waitlistCount = WAITLIST.filter((w) => w.classId === c.id && (w.status === "active" || w.status === "offered")).length;
  const pct = Math.min(100, (c.enrolledStudents.length / c.capacity) * 100);
  const isFull = c.enrolledStudents.length >= c.capacity;
  const needsSetup = c.tutors.length === 0 || c.enrolledStudents.length === 0;

  return (
    <a href={`#/classes/${c.id}`} className="card" style={{display: "block", textDecoration: "none", color: "inherit", transition: "box-shadow var(--dur), transform var(--dur)"}}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "var(--shadow-md)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "var(--shadow-xs)"; }}>
      <div className="card-body">
        <div className="row between mb-3">
          <div className="row gap-2 wrap">
            <Badge tone="brand"><Icon name="calendar" size={11}/>{c.day}</Badge>
            <Badge tone="neutral"><Icon name="clock" size={11}/>{c.startTime}–{c.endTime}</Badge>
            {isFull && <Badge tone="danger" dot>Full</Badge>}
            {needsSetup && !isFull && <Badge tone="warn" dot>Setup needed</Badge>}
            {!needsSetup && !isFull && <Badge tone="success" dot>Active</Badge>}
          </div>
          <Icon name="chevron-right" size={16} style={{color: "var(--ink-400)"}}/>
        </div>
        <h3 style={{fontSize: "var(--fs-lg)"}}>{c.type}</h3>
        <div className="text-xs muted text-mono mt-1">{c.id}</div>

        <div className="mt-4">
          <div className="row between text-sm mb-2">
            <span className="muted">Enrolment</span>
            <span className="weight-600 num">{c.enrolledStudents.length} / {c.capacity}</span>
          </div>
          <div style={{height: 6, background: "var(--ink-100)", borderRadius: 4, overflow: "hidden"}}>
            <div style={{
              width: `${pct}%`, height: "100%",
              background: isFull ? "var(--danger-500)" : pct > 80 ? "var(--warn-500)" : "var(--brand-blue)",
              transition: "width var(--dur)",
            }}/>
          </div>
        </div>

        <div className="row between mt-4">
          <div className="row gap-2" style={{flexWrap: "wrap"}}>
            {tutors.length === 0 ? <span className="text-sm" style={{color: "var(--warn-700)"}}><Icon name="alert" size={12}/> No tutor assigned</span> :
              tutors.map((t) => (
                <div key={t.uid} className="row gap-2 text-sm">
                  <Avatar name={userName(t)} size="sm"/>
                  <span>{userName(t)}</span>
                </div>
              ))}
          </div>
          {waitlistCount > 0 && (
            <Badge tone="info"><Icon name="waitlist" size={11}/> {waitlistCount} on waitlist</Badge>
          )}
        </div>
      </div>
    </a>
  );
};

/* ============ CLASS DETAIL ============ */
const ClassDetail = ({ id }) => {
  const toast = useToast();
  const c = CLASSES.find((x) => x.id === id);
  const [editOpen, setEditOpen] = useState(false);
  const [genAttOpen, setGenAttOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);

  if (!c) return <Empty title="Class not found" icon="x-circle" action={<Button onClick={() => navigate("/classes")}>Back</Button>}/>;

  const tutors = c.tutors.map(findUser).filter(Boolean);
  const students = c.enrolledStudents.map(findStudent).filter(Boolean);
  const waitlist = WAITLIST.filter((w) => w.classId === c.id && (w.status === "active" || w.status === "offered"));
  const classAttendance = ATTENDANCE.filter((a) => a.classId === c.id);

  const blockers = [];
  if (c.enrolledStudents.length > 0) blockers.push({ icon: "users", label: `${c.enrolledStudents.length} enrolled students must be unlinked first` });
  if (waitlist.length > 0) blockers.push({ icon: "waitlist", label: `${waitlist.length} waitlist entries must be cleared first` });

  return (
    <Fragment>
      <PageHead
        crumbs={[{label: "Classes", href: "#/classes"}, {label: c.type}]}
        title={c.type}
        sub={`${c.day} · ${c.startTime}–${c.endTime} · capacity ${c.capacity}`}
        actions={<Fragment>
          <Button variant="secondary" icon="attendance" onClick={() => setGenAttOpen(true)}>Generate attendance</Button>
          <Button variant="secondary" icon="edit" onClick={() => setEditOpen(true)}>Edit</Button>
          <Button variant="danger-outline" icon="trash" onClick={() => setDelOpen(true)}>Delete class</Button>
        </Fragment>}
      />

      <div className="grid grid-4 mb-5">
        <StatCard label="Enrolled" value={`${students.length}`} foot={`of ${c.capacity} capacity`} icon="users" accent="#4A90C4"/>
        <StatCard label="Tutors" value={tutors.length} icon="graduation" accent="#1B3A6B" foot={tutors.length === 0 ? "Unassigned" : tutors.map(t => t.firstName).join(", ")}/>
        <StatCard label="Waitlist" value={waitlist.length} icon="waitlist" accent="#C58A1E"/>
        <StatCard label="Attendance docs" value={classAttendance.length} icon="attendance" accent="#1FA968" foot={`for ${TERMS.find(t => t.status === "active")?.id}`}/>
      </div>

      <div className="detail-grid">
        <div className="col gap-5">
          {/* Roster */}
          <div className="card">
            <div className="card-head">
              <h3><span className="brand-stripe"></span>Permanent roster</h3>
              <Button size="sm" variant="secondary" icon="user-plus">Add student</Button>
            </div>
            <div className="card-body flush">
              {students.length === 0 ? <Empty title="No students enrolled" icon="users"/> : (
                <table className="table">
                  <thead><tr><th>Student</th><th>Grade</th><th>Subjects</th><th>Parent</th><th className="col-actions"></th></tr></thead>
                  <tbody>
                    {students.map((s) => {
                      const primary = findUser(s.primaryParentId);
                      return (
                        <tr key={s.id} className="row-link" onClick={() => navigate(`/people/students/${s.id}`)}>
                          <td>
                            <div className="row gap-3">
                              <Avatar name={studentName(s)} size="sm"/>
                              <span className="cell-strong">{studentName(s)}</span>
                            </div>
                          </td>
                          <td>{s.grade}</td>
                          <td className="cell-muted">{s.subjects.slice(0, 2).join(", ")}{s.subjects.length > 2 && ` +${s.subjects.length - 2}`}</td>
                          <td className="cell-muted">{primary ? userName(primary) : <span className="muted">—</span>}</td>
                          <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                            <Button size="sm" variant="ghost" icon="unlink" onClick={() => toast.warn("Remove student", "Confirmation flow appears here.")}>Remove</Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Attendance summary */}
          <div className="card">
            <div className="card-head">
              <h3><span className="brand-stripe"></span>Attendance · {TERMS.find(t => t.status === "active")?.id}</h3>
              <div className="row gap-2">
                <Button size="sm" variant="ghost" icon="refresh">Repair</Button>
                <a href="#/attendance" className="text-sm weight-600" style={{color: "var(--brand-navy)"}}>Maintenance</a>
              </div>
            </div>
            <div className="card-body flush">
              {classAttendance.length === 0 ? <Empty title="No attendance docs yet" msg="Generate attendance for this class." icon="attendance" action={<Button size="sm" variant="primary" onClick={() => setGenAttOpen(true)}>Generate</Button>}/> : (
                <table className="table">
                  <thead><tr><th>Week</th><th>Date</th><th>Students listed</th><th>Tutors</th><th>Status</th></tr></thead>
                  <tbody>
                    {classAttendance.map((a) => (
                      <tr key={a.id}>
                        <td className="text-mono cell-strong">W{a.weekNum}</td>
                        <td>{fmt.date(a.date)}</td>
                        <td>{a.attendance.length}</td>
                        <td>{a.tutors.map((tid) => findUser(tid)?.firstName).filter(Boolean).join(", ")}</td>
                        <td>{a.cancelled ? <Badge tone="danger" dot>Cancelled</Badge> : <Badge tone="success" dot>Active</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="text-xs muted" style={{padding: "10px 24px"}}>
                Daily attendance marking happens in the Flutter app. This is a maintenance view only.
              </div>
            </div>
          </div>
        </div>

        <div className="col gap-5">
          {/* Class info */}
          <div className="card">
            <div className="card-head"><h3><span className="brand-stripe"></span>Class details</h3></div>
            <div className="card-body">
              <dl className="dlist compact">
                <dt>ID</dt><dd className="text-mono">{c.id}</dd>
                <dt>Day</dt><dd>{c.day}</dd>
                <dt>Time</dt><dd>{c.startTime}–{c.endTime}</dd>
                <dt>Capacity</dt><dd>{c.capacity}</dd>
                <dt>Created</dt><dd>{fmt.date(c.createdAt)}</dd>
              </dl>
            </div>
          </div>

          {/* Tutors */}
          <div className="card">
            <div className="card-head"><h3><span className="brand-stripe"></span>Tutors</h3></div>
            <div className="card-body">
              {tutors.length === 0 ? <Banner kind="warn" title="No tutor assigned"><div className="mt-3"></div>Assign a tutor through Edit class.</Banner> :
                <div className="col gap-3">
                  {tutors.map((t) => (
                    <a key={t.uid} href={`#/people/tutors/${t.uid}`} className="row gap-3" style={{textDecoration: "none", color: "inherit"}}>
                      <Avatar name={userName(t)} size="sm"/>
                      <div className="row-meta grow">
                        <span className="primary">{userName(t)}</span>
                        <span className="secondary">{t.email}</span>
                      </div>
                    </a>
                  ))}
                </div>
              }
            </div>
          </div>

          {waitlist.length > 0 && (
            <div className="card">
              <div className="card-head">
                <h3><span className="brand-stripe"></span>Waitlist ({waitlist.length})</h3>
                <a href={`#/waitlist?classId=${c.id}`} className="text-sm weight-600" style={{color: "var(--brand-navy)"}}>Manage</a>
              </div>
              <div className="card-body flush">
                {waitlist.map((w) => {
                  const stu = findStudent(w.studentId);
                  return (
                    <div key={w.id} style={{ padding: "12px 24px", borderBottom: "1px solid var(--ink-100)" }}>
                      <div className="row between gap-3">
                        <div className="row-meta grow">
                          <span className="primary">{studentName(stu)}</span>
                          <span className="secondary text-xs">Added {fmt.relTime(w.createdAt)}</span>
                        </div>
                        <StatusBadge status={w.status}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit class */}
      <Panel open={editOpen} onClose={() => setEditOpen(false)} title={`Edit ${c.type}`} subtitle="Changes to day/time/roster default to propagating to future attendance docs."
        footer={<Fragment>
          <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => { setEditOpen(false); toast.success("Class updated", "Future attendance docs updated."); }}>Save changes</Button>
        </Fragment>}>
        <ClassForm cls={c} mode="edit"/>
      </Panel>

      {/* Generate attendance */}
      <Modal open={genAttOpen} onClose={() => setGenAttOpen(false)} size="lg" title="Generate attendance"
        subtitle="Use for repair or new-term setup. Existing docs are skipped unless overwrite is on."
        footer={<Fragment>
          <Button variant="secondary" onClick={() => setGenAttOpen(false)}>Cancel</Button>
          <Button variant="primary" icon="play" onClick={() => { setGenAttOpen(false); toast.success("Attendance generated", "Wrote 18 docs across 2 terms. Skipped 4 existing."); }}>Run generation</Button>
        </Fragment>}>
        <GenerateAttendanceForm classId={c.id}/>
      </Modal>

      {/* Delete class */}
      <Modal open={delOpen} onClose={() => setDelOpen(false)} danger icon="trash" title="Delete this class?" size="lg"
        subtitle="Deletes the class document and all attendance subcollection entries."
        footer={null}>
        <ClassDeleteFlow cls={c} blockers={blockers} onCancel={() => setDelOpen(false)} onConfirm={() => { setDelOpen(false); toast.error("Class deleted"); navigate("/classes"); }}/>
      </Modal>
    </Fragment>
  );
};

/* ============ CLASS FORM ============ */
const ClassForm = ({ cls, mode }) => {
  const [day, setDay] = useState(cls?.day || "Monday");
  const [start, setStart] = useState(cls?.startTime || "16:00");
  const [end, setEnd] = useState(cls?.endTime || "17:30");
  const [capacity, setCapacity] = useState(cls?.capacity || 8);
  const [propagate, setPropagate] = useState(true);

  return (
    <div className="col gap-5">
      <div>
        <h4 className="mb-3">Basic details</h4>
        <div className="grid grid-2 gap-4">
          <div className="field"><label className="label">Class type <span className="req">*</span></label><input className="input" defaultValue={cls?.type || ""} placeholder="e.g. VCE Maths Methods"/></div>
          <div className="field"><label className="label">Class ID <span className="opt">auto-generated if blank</span></label><input className="input text-mono" defaultValue={cls?.id || ""} placeholder="c_mon_yr5_6"/></div>
          <div className="field"><label className="label">Day <span className="req">*</span></label>
            <select className="select" value={day} onChange={(e) => setDay(e.target.value)}>
              {DAYS.map((d) => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div className="field"><label className="label">Capacity <span className="req">*</span></label>
            <input className="input" type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)}/>
          </div>
          <div className="field"><label className="label">Start time <span className="req">*</span></label>
            <input className="input text-mono" placeholder="HH:mm" value={start} onChange={(e) => setStart(e.target.value)}/>
            <span className="hint">24-hour HH:mm format (e.g. 16:30).</span>
          </div>
          <div className="field"><label className="label">End time <span className="req">*</span></label>
            <input className="input text-mono" placeholder="HH:mm" value={end} onChange={(e) => setEnd(e.target.value)}/>
          </div>
        </div>
      </div>

      <div>
        <h4 className="mb-3">Tutors</h4>
        <select className="select" multiple defaultValue={cls?.tutors || []} style={{height: 120}}>
          {USERS.filter(u => u.role === "tutor").map((t) => <option key={t.uid} value={t.uid}>{userName(t)}</option>)}
        </select>
        <span className="hint">Hold ⌘/Ctrl to select multiple.</span>
      </div>

      <div>
        <h4 className="mb-3">Permanent students</h4>
        <select className="select" multiple defaultValue={cls?.enrolledStudents || []} style={{height: 140}}>
          {STUDENTS.map((s) => <option key={s.id} value={s.id}>{studentName(s)} · {s.grade}</option>)}
        </select>
      </div>

      {mode === "edit" ? (
        <div>
          <h4 className="mb-3">Attendance propagation</h4>
          <div className="row between" style={{padding: "12px 14px", background: "var(--ink-50)", borderRadius: "var(--r-md)"}}>
            <div>
              <div className="weight-600">Update future attendance docs</div>
              <div className="text-xs muted">Changes to day, time, tutors, or roster will be reflected on attendance entries from today onwards.</div>
            </div>
            <div className={`switch ${propagate ? "on" : ""}`} onClick={() => setPropagate(!propagate)}/>
          </div>
        </div>
      ) : (
        <div>
          <h4 className="mb-3">Attendance generation</h4>
          <Banner kind="info" title="Generate attendance entries on creation">
            <div className="mt-3"></div>
            Select terms below to auto-generate weekly attendance documents. Existing entries are skipped by default.
          </Banner>
          <div className="grid grid-2 gap-3 mt-4">
            {TERMS.map((t) => (
              <label key={t.id} className="row gap-2" style={{padding: "10px 14px", background: "var(--ink-50)", borderRadius: "var(--r-md)", cursor: "pointer"}}>
                <input type="checkbox" defaultChecked={t.status === "active"}/>
                <div>
                  <div className="weight-600">{t.year} Term {t.termNum}</div>
                  <div className="text-xs muted">{t.weeksNum} weeks · {fmt.dateShort(t.startDate)}–{fmt.dateShort(t.endDate)}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/* ============ CLASS DELETE FLOW ============ */
const ClassDeleteFlow = ({ cls, blockers, onCancel, onConfirm }) => {
  const [val, setVal] = useState("");
  const [ackAtt, setAckAtt] = useState(false);
  const matched = val === cls.id;
  if (blockers.length > 0) {
    return (
      <Fragment>
        <Banner kind="danger" title="Cannot delete: prerequisites not met">
          <div className="mt-3"></div>
          Resolve the blockers below first.
        </Banner>
        <ul className="col gap-2 mt-4" style={{listStyle: "none", padding: 0}}>
          {blockers.map((b, i) => (
            <li key={i} className="row gap-2" style={{padding: "10px 14px", background: "var(--ink-50)", borderRadius: "var(--r-md)"}}>
              <Icon name={b.icon} size={16} style={{color: "var(--danger-500)"}}/>
              {b.label}
            </li>
          ))}
        </ul>
        <div className="row gap-2 mt-4" style={{justifyContent: "flex-end"}}>
          <Button variant="secondary" onClick={onCancel}>Close</Button>
        </div>
      </Fragment>
    );
  }
  return (
    <Fragment>
      <Banner kind="danger" title="This action is permanent" className="mb-4">
        Deletes the class document AND its entire attendance subcollection.
      </Banner>
      <div className="field">
        <label className="label">Type the class ID <span className="text-mono" style={{background: "var(--ink-100)", padding: "2px 6px", borderRadius: 4}}>{cls.id}</span> to confirm</label>
        <input className={`input ${val && !matched ? "error-state" : ""}`} value={val} onChange={(e) => setVal(e.target.value)} autoFocus/>
      </div>
      <label className="checkbox mt-4">
        <input type="checkbox" checked={ackAtt} onChange={(e) => setAckAtt(e.target.checked)}/>
        I understand that all attendance subcollection entries will also be deleted (<span className="text-mono">deleteAttendance: true</span>).
      </label>
      <div className="row gap-2 mt-4" style={{justifyContent: "flex-end"}}>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button variant="danger" disabled={!matched || !ackAtt} onClick={onConfirm}>Delete class permanently</Button>
      </div>
    </Fragment>
  );
};

/* ============ GENERATE ATTENDANCE FORM ============ */
const GenerateAttendanceForm = ({ classId }) => {
  const [fromDate, setFromDate] = useState(TODAY.toISOString().slice(0, 10));
  const [overwrite, setOverwrite] = useState(false);
  return (
    <div className="col gap-4">
      <div className="grid grid-2 gap-4">
        <div className="field"><label className="label">From date <span className="req">*</span></label><input className="input" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}/></div>
        <div className="field"><label className="label">Terms <span className="req">*</span></label>
          <select className="select" multiple defaultValue={TERMS.filter(t => t.status === "active").map(t => t.id)} style={{height: 80}}>
            {TERMS.map((t) => <option key={t.id} value={t.id}>{t.year} Term {t.termNum} ({t.weeksNum}w)</option>)}
          </select>
        </div>
      </div>

      <div className="row between" style={{padding: "12px 14px", background: overwrite ? "var(--warn-100)" : "var(--ink-50)", borderRadius: "var(--r-md)", border: overwrite ? "1px solid rgba(197,138,30,0.3)" : "none"}}>
        <div>
          <div className="weight-600">Overwrite existing attendance docs</div>
          <div className="text-xs muted">By default, weeks that already have docs are skipped.</div>
        </div>
        <div className={`switch ${overwrite ? "on" : ""}`} onClick={() => setOverwrite(!overwrite)}/>
      </div>

      {overwrite && <Banner kind="warn" title="Overwrite is destructive"><div className="mt-3"></div>Existing attendance lists for matching weeks will be replaced with the current class roster.</Banner>}

      <Banner kind="info" title="Estimated impact"><div className="mt-3"></div>~ <strong>10 weeks × 1 class</strong> = up to 10 attendance docs written for the selected term(s). Skipped weeks: 0–4.</Banner>
    </div>
  );
};

/* ============ CREATE NEW ============ */
const NewClass = () => {
  const toast = useToast();
  return (
    <Fragment>
      <PageHead
        crumbs={[{label: "Classes", href: "#/classes"}, {label: "New class"}]}
        title="Create new class"
        sub="Define the slot, assign tutors, add the permanent roster, and optionally generate attendance for selected terms."
      />
      <div className="card">
        <div className="card-body">
          <ClassForm mode="create"/>
        </div>
        <div className="modal-foot" style={{borderTop: "1px solid var(--ink-200)", padding: "16px 24px"}}>
          <Button variant="secondary" onClick={() => navigate("/classes")}>Cancel</Button>
          <Button variant="primary" icon="plus" onClick={() => { toast.success("Class created", "Generated 18 attendance docs for Term 2."); navigate("/classes"); }}>Create class</Button>
        </div>
      </div>
    </Fragment>
  );
};

/* ============ ROUTER ============ */
const Classes = ({ route }) => {
  if (route.subRoute === "new") return <NewClass/>;
  if (route.subRoute) return <ClassDetail id={route.subRoute}/>;
  return <ClassesList/>;
};

window.Views = Object.assign(window.Views || {}, { Classes });
