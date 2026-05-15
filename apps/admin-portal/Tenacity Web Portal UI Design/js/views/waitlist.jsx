/* =========================================================
   Waitlist
   ========================================================= */

const waitTabs = [
  { id: "active", label: "Active", match: (w) => w.status === "active" },
  { id: "offered", label: "Offered", match: (w) => w.status === "offered" },
  { id: "accepted", label: "Accepted", match: (w) => w.status === "accepted" },
  { id: "history", label: "History", match: (w) => ["declined", "expired", "cancelled"].includes(w.status) },
];

const Waitlist = ({ route }) => {
  const toast = useToast();
  const [tab, setTab] = useState("active");
  const [classFilter, setClassFilter] = useState(route.query?.classId || "all");
  const [search, setSearch] = useState("");
  const [promoteEntry, setPromoteEntry] = useState(null);
  const [updateEntry, setUpdateEntry] = useState(null);

  const counts = Object.fromEntries(waitTabs.map(t => [t.id, WAITLIST.filter(t.match).length]));

  const rows = useMemo(() => {
    const tabDef = waitTabs.find((x) => x.id === tab);
    let r = WAITLIST.filter(tabDef.match);
    if (classFilter !== "all") r = r.filter((w) => w.classId === classFilter);
    if (search) {
      const q = search.toLowerCase();
      r = r.filter((w) => {
        const s = findStudent(w.studentId);
        const p = findUser(w.parentId);
        return (s && studentName(s).toLowerCase().includes(q)) || (p && userName(p).toLowerCase().includes(q));
      });
    }
    return r.sort((a, b) => b.createdAt - a.createdAt);
  }, [tab, classFilter, search]);

  return (
    <Fragment>
      <PageHead
        title="Waitlist"
        sub="Manage offers and promotions. Promoting an entry adds the student to the class roster and future attendance."
      />

      <div className="grid grid-4 mb-5">
        <StatCard label="Active waiting" value={counts.active} icon="waitlist" accent="#4A90C4"/>
        <StatCard label="Offered (awaiting response)" value={counts.offered} icon="send" accent="#C58A1E"/>
        <StatCard label="Accepted (this term)" value={counts.accepted} icon="check-circle" accent="#1FA968"/>
        <StatCard label="Declined / expired" value={counts.history} icon="x-circle" accent="#5A6A82"/>
      </div>

      <div className="tabs">
        {waitTabs.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            {t.label} <span className="count">{counts[t.id]}</span>
          </button>
        ))}
      </div>

      <div className="filter-bar">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by parent or student…" className="grow"/>
        <select className="select" value={classFilter} onChange={(e) => setClassFilter(e.target.value)} style={{maxWidth: 260}}>
          <option value="all">All classes</option>
          {CLASSES.map((c) => <option key={c.id} value={c.id}>{c.type} · {c.day}</option>)}
        </select>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Parent</th>
                <th>Class</th>
                <th>Reason</th>
                <th>Added</th>
                <th>Status</th>
                <th className="col-actions"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => {
                const stu = findStudent(w.studentId);
                const par = findUser(w.parentId);
                const cls = findClass(w.classId);
                return (
                  <tr key={w.id}>
                    <td>
                      <div className="row gap-3">
                        <Avatar name={studentName(stu)} size="sm"/>
                        <div className="row-meta">
                          <span className="primary">{studentName(stu)}</span>
                          <span className="secondary">{stu?.grade}</span>
                        </div>
                      </div>
                    </td>
                    <td className="cell-muted">{userName(par)}</td>
                    <td>
                      <div className="row-meta">
                        <span className="primary">{cls?.type}</span>
                        <span className="secondary">{cls?.day} {cls?.startTime}</span>
                      </div>
                    </td>
                    <td className="text-sm muted" style={{maxWidth: 280}}>{w.reason}</td>
                    <td className="cell-muted">{fmt.relTime(w.createdAt)}</td>
                    <td><StatusBadge status={w.status}/></td>
                    <td className="col-actions">
                      <div className="row gap-1">
                        {(w.status === "active" || w.status === "offered") && (
                          <Button size="sm" variant="primary" icon="arrow-up" onClick={() => setPromoteEntry(w)}>Promote</Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setUpdateEntry(w)}>Update status</Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <Empty title="No waitlist entries match" icon="search"/>}
        </div>
      </div>

      {/* Promote modal */}
      <Modal open={!!promoteEntry} onClose={() => setPromoteEntry(null)} size="lg" title="Promote to permanent enrolment"
        subtitle="Adds the student to the class roster and appends them to future attendance documents."
        footer={<Fragment>
          <Button variant="secondary" onClick={() => setPromoteEntry(null)}>Cancel</Button>
          <Button variant="primary" icon="arrow-up" onClick={() => { setPromoteEntry(null); toast.success("Promoted to permanent enrolment", "Student added to class and future attendance updated."); }}>Promote</Button>
        </Fragment>}>
        {promoteEntry && (() => {
          const stu = findStudent(promoteEntry.studentId);
          const cls = findClass(promoteEntry.classId);
          const futureAttendance = ATTENDANCE.filter((a) => a.classId === cls?.id && a.date > TODAY).length;
          return (
            <Fragment>
              <Banner kind="info" title="Calls promoteWaitlistEntry"><div className="mt-3"></div>This existing app callable will handle the enrolment write atomically.</Banner>
              <div className="grid grid-2 gap-4 mt-4">
                <div>
                  <div className="text-xs muted weight-700" style={{textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6}}>Student</div>
                  <div className="row gap-2"><Avatar name={studentName(stu)} size="sm"/><span className="weight-600">{studentName(stu)}</span></div>
                  <div className="text-sm muted mt-1">{stu?.grade}</div>
                </div>
                <div>
                  <div className="text-xs muted weight-700" style={{textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6}}>Target class</div>
                  <div className="weight-600">{cls?.type}</div>
                  <div className="text-sm muted mt-1">{cls?.day} · {cls?.startTime}–{cls?.endTime} · {cls?.enrolledStudents.length}/{cls?.capacity}</div>
                </div>
              </div>
              <div className="row gap-5 mt-4" style={{padding: "16px", background: "var(--ink-50)", borderRadius: "var(--r-md)"}}>
                <div>
                  <div className="text-xs muted weight-700" style={{textTransform: "uppercase", letterSpacing: "0.08em"}}>Class roster</div>
                  <div className="weight-600 mt-1">+1 enrolled</div>
                </div>
                <div>
                  <div className="text-xs muted weight-700" style={{textTransform: "uppercase", letterSpacing: "0.08em"}}>Future attendance</div>
                  <div className="weight-600 mt-1">~{futureAttendance} docs updated</div>
                </div>
                <div>
                  <div className="text-xs muted weight-700" style={{textTransform: "uppercase", letterSpacing: "0.08em"}}>Waitlist status</div>
                  <div className="weight-600 mt-1">→ Accepted</div>
                </div>
              </div>
            </Fragment>
          );
        })()}
      </Modal>

      {/* Update status modal */}
      <Modal open={!!updateEntry} onClose={() => setUpdateEntry(null)} title="Update waitlist status"
        footer={<Fragment>
          <Button variant="secondary" onClick={() => setUpdateEntry(null)}>Cancel</Button>
          <Button variant="primary" onClick={() => { setUpdateEntry(null); toast.success("Waitlist status updated"); }}>Update</Button>
        </Fragment>}>
        <div className="field">
          <label className="label">New status</label>
          <select className="select" defaultValue={updateEntry?.status}>
            {["active", "offered", "declined", "expired", "cancelled"].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <span className="hint">Calls updateWaitlistEntryStatus.</span>
        </div>
        <div className="field mt-3">
          <label className="label">Note <span className="opt">optional</span></label>
          <textarea className="textarea" placeholder="Internal note about this status change…"/>
        </div>
      </Modal>
    </Fragment>
  );
};

window.Views = Object.assign(window.Views || {}, { Waitlist });
