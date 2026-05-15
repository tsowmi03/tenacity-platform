/* =========================================================
   Enrolments — list, detail, accept/edit/archive/delete flows
   ========================================================= */

const enrolStatusTabs = [
  { id: "active", label: "Active queue", match: (e) => !e.archived && e.status !== "deleted" },
  { id: "archived", label: "Archived", match: (e) => e.archived || e.status === "archived" },
  { id: "deleted", label: "Deleted", match: (e) => e.status === "deleted" },
];

const EnrolmentsList = () => {
  const toast = useToast();
  const [tab, setTab] = useState("active");
  const [statusFilter, setStatusFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PER = 10;

  const filtered = useMemo(() => {
    const t = enrolStatusTabs.find((x) => x.id === tab);
    let rows = ENROLMENTS.filter(t.match);
    if (tab === "active" && statusFilter !== "all") rows = rows.filter((e) => e.status === statusFilter);
    if (yearFilter !== "all") rows = rows.filter((e) => e.studentYear === yearFilter);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((e) =>
        `${e.studentFirstName} ${e.studentLastName}`.toLowerCase().includes(q) ||
        `${e.carerFirstName} ${e.carerLastName}`.toLowerCase().includes(q) ||
        e.carerEmail.toLowerCase().includes(q)
      );
    }
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  }, [tab, statusFilter, yearFilter, search]);

  const pageRows = filtered.slice((page - 1) * PER, page * PER);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER));
  const counts = useMemo(() => Object.fromEntries(enrolStatusTabs.map(t => [t.id, ENROLMENTS.filter(t.match).length])), []);

  const years = [...new Set(ENROLMENTS.map((e) => e.studentYear))].sort();

  return (
    <Fragment>
      <PageHead
        title="Enrolments"
        sub="Review submissions, accept new families, and manage the intake queue."
        actions={
          <Fragment>
            <Button variant="secondary" icon="download">Export</Button>
            <Button variant="primary" icon="plus" onClick={() => toast.info("Manual enrolments", "New enrolments come in via the public form. Use 'New parent' to add an existing family directly.")}>New manual enrolment</Button>
          </Fragment>
        }
      />

      <div className="tabs">
        {enrolStatusTabs.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => { setTab(t.id); setPage(1); }}>
            {t.label} <span className="count">{counts[t.id]}</span>
          </button>
        ))}
      </div>

      <div className="filter-bar">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search by student, carer, or email…" className="grow"/>
        {tab === "active" && (
          <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{maxWidth: 180}}>
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
          </select>
        )}
        <select className="select" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} style={{maxWidth: 160}}>
          <option value="all">All years</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <Button variant="ghost" size="sm" icon="filter">More filters</Button>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Carer</th>
                <th>Classes</th>
                <th>Status</th>
                <th>Submitted</th>
                <th className="col-actions"></th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((e) => (
                <tr key={e.id} className="row-link" onClick={() => navigate(`/enrolments/${e.id}`)}>
                  <td>
                    <div className="row gap-3">
                      <Avatar name={`${e.studentFirstName} ${e.studentLastName}`} size="sm"/>
                      <div className="row-meta">
                        <span className="primary">{e.studentFirstName} {e.studentLastName}</span>
                        <span className="secondary">{e.studentYear} · {e.studentSubjects.join(", ") || "—"}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="row-meta">
                      <span className="primary">{e.carerFirstName} {e.carerLastName}</span>
                      <span className="secondary">{e.carerEmail}</span>
                    </div>
                  </td>
                  <td>
                    {e.classes.length === 0 ? <span className="muted">No class selected</span> :
                      <div className="col gap-1">
                        {e.classes.map((c, i) => {
                          const cls = findClass(c.id);
                          return <div key={i} className="text-sm">{cls?.type || c.id} · <span className="muted">{c.day} {c.startTime}</span></div>;
                        })}
                      </div>
                    }
                  </td>
                  <td><StatusBadge status={e.status}/></td>
                  <td className="cell-muted">{fmt.relTime(e.createdAt)}</td>
                  <td className="col-actions" onClick={(ev) => ev.stopPropagation()}>
                    <Button size="sm" variant="secondary" iconRight="chevron-right" onClick={() => navigate(`/enrolments/${e.id}`)}>Open</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pageRows.length === 0 && <Empty title="No enrolments match" msg="Try adjusting filters or search." icon="search"/>}
        </div>
        {totalPages > 1 && <Pagination page={page} totalPages={totalPages} totalRows={filtered.length} onChange={setPage}/>}
      </div>
    </Fragment>
  );
};

/* ============ DETAIL ============ */
const EnrolmentDetail = ({ id }) => {
  const toast = useToast();
  const e = ENROLMENTS.find((x) => x.id === id);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!e) return <Empty title="Enrolment not found" msg="It may have been deleted or the link is incorrect." icon="x-circle" action={<Button onClick={() => navigate("/enrolments")} icon="chevron-left">Back to list</Button>}/>;

  const isPending = e.status === "pending";
  const isAccepted = e.status === "accepted";
  const isArchived = e.status === "archived" || e.archived;
  const isDeleted = e.status === "deleted";
  const canEdit = isPending || (isArchived && !isDeleted);
  const canAccept = isPending;

  const onAccept = () => {
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      setAcceptOpen(false);
      toast.success("Enrolment accepted", `Parent account and student record provisioned for ${e.studentFirstName} ${e.studentLastName}. Welcome email sent.`);
    }, 900);
  };
  const onArchive = () => {
    toast.success("Enrolment archived", "Moved to archive — you can unarchive at any time.");
  };
  const onUnarchive = () => {
    toast.success("Enrolment restored", "Moved back to active queue.");
  };

  return (
    <Fragment>
      <PageHead
        crumbs={[{ label: "Enrolments", href: "#/enrolments" }, { label: `${e.studentFirstName} ${e.studentLastName}` }]}
        title={`${e.studentFirstName} ${e.studentLastName}`}
        sub={`Submitted ${fmt.dateTime(e.createdAt)} · ${e.studentYear} · ID ${e.id}`}
        actions={
          <Fragment>
            {canEdit && <Button variant="secondary" icon="edit" onClick={() => setEditing(true)}>Edit</Button>}
            {isArchived && !isDeleted && <Button variant="secondary" icon="refresh" onClick={onUnarchive}>Unarchive</Button>}
            {(isPending) && <Button variant="secondary" icon="archive" onClick={onArchive}>Archive</Button>}
            {canAccept && <Button variant="primary" icon="check" onClick={() => setAcceptOpen(true)}>Accept enrolment</Button>}
            {!isDeleted && <Button variant="danger-outline" icon="trash" onClick={() => setDeleteOpen(true)}>Delete</Button>}
          </Fragment>
        }
      />

      {/* Status banner */}
      {isAccepted && e.createdParentId && (
        <Banner kind="success" title="Accepted and provisioned" action={
          <Button size="sm" variant="secondary" onClick={() => navigate(`/people/parents/${e.createdParentId}`)}>View parent</Button>
        }>
          Parent account <span className="text-mono">{e.createdParentId}</span> and student record <span className="text-mono">{e.createdStudentId}</span> were created on {fmt.date(e.acceptedAt)}.
          This enrolment is now frozen — edits are no longer accepted.
        </Banner>
      )}
      {isArchived && !isAccepted && (
        <Banner kind="info" title="Archived">
          Archived {e.archivedAt ? fmt.date(e.archivedAt) : ""}. You can still edit and restore this enrolment.
        </Banner>
      )}
      {isDeleted && (
        <Banner kind="danger" title="Soft deleted" action={
          <Button size="sm" variant="danger-outline" onClick={() => setPurgeOpen(true)}>Purge permanently</Button>
        }>
          Deleted {e.deletedAt ? fmt.date(e.deletedAt) : ""}{e.deleteReason ? ` · Reason: ${e.deleteReason}` : ""}. No accepted records were created, so purge is available.
        </Banner>
      )}

      <div className="detail-grid mt-5">
        {/* MAIN */}
        <div className="col gap-5">
          {/* Student details */}
          <div className="card">
            <div className="card-head"><h3><span className="brand-stripe"></span>Student</h3></div>
            <div className="card-body">
              <dl className="dlist">
                <dt>Full name</dt><dd>{e.studentFirstName} {e.studentLastName}</dd>
                <dt>Year level</dt><dd>{e.studentYear}</dd>
                <dt>Subjects</dt><dd className="row gap-2 wrap">{e.studentSubjects.map((s, i) => <Badge key={i} tone="brand">{s}</Badge>)}</dd>
              </dl>
            </div>
          </div>

          {/* Carer details */}
          <div className="card">
            <div className="card-head"><h3><span className="brand-stripe"></span>Carer</h3></div>
            <div className="card-body">
              <dl className="dlist">
                <dt>Full name</dt><dd>{e.carerFirstName} {e.carerLastName}</dd>
                <dt>Email</dt><dd><a href={`mailto:${e.carerEmail}`}>{e.carerEmail}</a></dd>
                <dt>Phone</dt><dd><a href={`tel:${e.carerPhone}`}>{e.carerPhone}</a></dd>
              </dl>
            </div>
          </div>

          {/* Class selections */}
          <div className="card">
            <div className="card-head">
              <h3><span className="brand-stripe"></span>Class selections</h3>
              <span className="text-sm muted">{e.classes.length} selected</span>
            </div>
            <div className="card-body flush">
              {e.classes.length === 0 ? <Empty title="No classes selected" msg="Carer did not select any classes during intake." icon="classes"/> : (
                <table className="table">
                  <thead><tr><th>Class</th><th>Day & time</th><th>Capacity</th></tr></thead>
                  <tbody>
                    {e.classes.map((c, i) => {
                      const cls = findClass(c.id);
                      return (
                        <tr key={i}>
                          <td className="cell-strong">{cls?.type || c.id}</td>
                          <td>{cls?.day || c.day} · {cls?.startTime || c.startTime}–{cls?.endTime || "—"}</td>
                          <td className="cell-muted">
                            {cls ? `${cls.enrolledStudents.length}/${cls.capacity}` : "—"}
                            {cls && cls.enrolledStudents.length >= cls.capacity && <Badge tone="danger" className="ml-2" dot>Full</Badge>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Emergency & care notes */}
          <div className="card">
            <div className="card-head"><h3><span className="brand-stripe"></span>Emergency & care</h3></div>
            <div className="card-body">
              <dl className="dlist">
                <dt>Emergency contact</dt>
                <dd>{e.emergencyContactFirstName} {e.emergencyContactLastName} ({e.emergencyContactRelation}) · <span className="muted">{e.emergencyContactPhone}</span></dd>
                <dt>Allergies / medical</dt>
                <dd>{e.allergies || <span className="muted">None listed</span>}</dd>
                <dt>Permission to leave</dt>
                <dd>{e.permissionToLeave ? <Badge tone="success" dot>Granted</Badge> : <Badge tone="warn" dot>Not granted</Badge>}</dd>
                <dt>Additional info</dt>
                <dd style={{whiteSpace: "pre-wrap"}}>{e.additionalInfo || <span className="muted">—</span>}</dd>
              </dl>
            </div>
          </div>
        </div>

        {/* SIDEBAR */}
        <div className="col gap-5">
          <div className="card">
            <div className="card-head"><h3><span className="brand-stripe"></span>Lifecycle</h3></div>
            <div className="card-body">
              <div className="col gap-3">
                <div className="row gap-3">
                  <div style={{width: 28, height: 28, borderRadius: "50%", background: "var(--success-100)", color: "var(--success-700)", display: "grid", placeItems: "center", flexShrink: 0}}><Icon name="check" size={14}/></div>
                  <div className="grow">
                    <div className="weight-600">Submitted</div>
                    <div className="text-xs muted">{fmt.dateTime(e.createdAt)}</div>
                  </div>
                </div>
                <div className="row gap-3">
                  <div style={{width: 28, height: 28, borderRadius: "50%", background: isAccepted ? "var(--success-100)" : "var(--ink-100)", color: isAccepted ? "var(--success-700)" : "var(--ink-400)", display: "grid", placeItems: "center", flexShrink: 0}}>
                    <Icon name={isAccepted ? "check" : "circle"} size={14}/>
                  </div>
                  <div className="grow">
                    <div className={isAccepted ? "weight-600" : "muted weight-500"}>Accepted</div>
                    <div className="text-xs muted">{isAccepted ? fmt.dateTime(e.acceptedAt) : "Awaiting review"}</div>
                  </div>
                </div>
                {(isArchived || isDeleted) && (
                  <div className="row gap-3">
                    <div style={{width: 28, height: 28, borderRadius: "50%", background: isDeleted ? "var(--danger-100)" : "var(--ink-100)", color: isDeleted ? "var(--danger-700)" : "var(--ink-700)", display: "grid", placeItems: "center", flexShrink: 0}}>
                      <Icon name={isDeleted ? "trash" : "archive"} size={14}/>
                    </div>
                    <div className="grow">
                      <div className="weight-600">{isDeleted ? "Deleted" : "Archived"}</div>
                      <div className="text-xs muted">{fmt.dateTime(e.deletedAt || e.archivedAt)}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3><span className="brand-stripe"></span>Quick checks</h3></div>
            <div className="card-body">
              <ul style={{listStyle: "none", padding: 0, margin: 0}} className="col gap-2">
                <li className="row gap-2">
                  <Icon name={e.carerEmail.includes("@") ? "check-circle" : "x-circle"} size={16} style={{color: e.carerEmail.includes("@") ? "var(--success-500)" : "var(--danger-500)"}}/>
                  <span className="text-sm">Carer email format valid</span>
                </li>
                <li className="row gap-2">
                  <Icon name={e.classes.length > 0 ? "check-circle" : "alert"} size={16} style={{color: e.classes.length > 0 ? "var(--success-500)" : "var(--warn-500)"}}/>
                  <span className="text-sm">{e.classes.length > 0 ? "Class selected" : "No class selected"}</span>
                </li>
                <li className="row gap-2">
                  <Icon name={e.emergencyContactPhone && e.emergencyContactPhone !== "—" ? "check-circle" : "alert"} size={16} style={{color: e.emergencyContactPhone && e.emergencyContactPhone !== "—" ? "var(--success-500)" : "var(--warn-500)"}}/>
                  <span className="text-sm">Emergency contact captured</span>
                </li>
                <li className="row gap-2">
                  <Icon name={e.allergies && e.allergies.toLowerCase().includes("none") === false && e.allergies !== "" ? "alert" : "check-circle"} size={16} style={{color: e.allergies && e.allergies.toLowerCase().includes("none") === false && e.allergies !== "" ? "var(--warn-500)" : "var(--success-500)"}}/>
                  <span className="text-sm">{e.allergies && !e.allergies.toLowerCase().includes("none") && e.allergies !== "" ? "Allergies noted — review" : "No allergies flagged"}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Accept modal */}
      <Modal open={acceptOpen} onClose={() => setAcceptOpen(false)} size="lg" title="Accept enrolment?"
        subtitle="This provisions a parent account, creates the student record, links them, adds the student to selected classes, generates future attendance, and sends a welcome email."
        footer={<Fragment>
          <Button variant="secondary" onClick={() => setAcceptOpen(false)} disabled={busy}>Cancel</Button>
          <Button variant="primary" icon="check" onClick={onAccept} loading={busy}>Accept & provision</Button>
        </Fragment>}>
        <div className="grid grid-2 gap-4">
          <div>
            <div className="text-xs weight-700 muted" style={{textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8}}>Will create</div>
            <ul className="col gap-2" style={{listStyle: "none", padding: 0}}>
              <li className="row gap-2"><Icon name="user-plus" size={16} style={{color: "var(--success-500)"}}/>Parent account · <span className="text-mono">{e.carerEmail}</span></li>
              <li className="row gap-2"><Icon name="graduation" size={16} style={{color: "var(--success-500)"}}/>Student · {e.studentFirstName} {e.studentLastName}</li>
              <li className="row gap-2"><Icon name="link" size={16} style={{color: "var(--success-500)"}}/>Parent-student link</li>
              <li className="row gap-2"><Icon name="mail" size={16} style={{color: "var(--success-500)"}}/>Welcome email via SendGrid</li>
            </ul>
          </div>
          <div>
            <div className="text-xs weight-700 muted" style={{textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8}}>Will modify</div>
            <ul className="col gap-2" style={{listStyle: "none", padding: 0}}>
              {e.classes.map((c, i) => {
                const cls = findClass(c.id);
                return <li key={i} className="row gap-2"><Icon name="classes" size={16} style={{color: "var(--brand-blue)"}}/>Add to {cls?.type || c.id}</li>;
              })}
              {e.classes.length === 0 && <li className="muted">No class enrolment changes.</li>}
              <li className="row gap-2"><Icon name="attendance" size={16} style={{color: "var(--brand-blue)"}}/>Append to future attendance docs</li>
            </ul>
          </div>
        </div>
        <Banner kind="info" title="Idempotent" className="mt-4">
          <div className="mt-3"></div>
          If a parent already exists with this email, we'll reuse the account and only link the new student.
        </Banner>
      </Modal>

      {/* Edit panel */}
      <Panel open={editing} onClose={() => setEditing(false)} size="lg" title="Edit enrolment" subtitle="Only pending or archived enrolments can be edited."
        footer={<Fragment>
          <Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => { setEditing(false); toast.success("Enrolment updated"); }}>Save changes</Button>
        </Fragment>}>
        <EditEnrolmentForm enrolment={e}/>
      </Panel>

      {/* Soft delete modal */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Soft delete this enrolment?" danger icon="trash"
        subtitle="The record is preserved with a deleted status and reason. It will not appear in active queues."
        footer={<Fragment>
          <Button variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button variant="danger" onClick={() => { setDeleteOpen(false); toast.warn("Enrolment deleted", "Soft delete recorded."); }}>Delete enrolment</Button>
        </Fragment>}>
        <div className="field">
          <label className="label">Reason <span className="opt">optional</span></label>
          <textarea className="textarea" placeholder="e.g. Duplicate submission, family withdrew, etc."></textarea>
        </div>
      </Modal>

      {/* Purge confirm */}
      <TypedConfirm
        open={purgeOpen} onClose={() => setPurgeOpen(false)}
        title="Permanently purge enrolment?"
        subtitle="This is irreversible. Only allowed when no accepted records (parent / student) were created."
        expected={e.id}
        confirmLabel="Purge permanently"
        banner={<Banner kind="danger" title="Irreversible">The enrolment document will be deleted from Firestore.</Banner>}
        onConfirm={() => { setPurgeOpen(false); toast.error("Purged", "Enrolment permanently removed."); navigate("/enrolments"); }}
      />
    </Fragment>
  );
};

/* ============ EDIT FORM (in panel) ============ */
const EditEnrolmentForm = ({ enrolment: e }) => {
  return (
    <div className="col gap-5">
      <div>
        <h4 className="mb-3">Student</h4>
        <div className="grid grid-2">
          <div className="field"><label className="label">First name <span className="req">*</span></label><input className="input" defaultValue={e.studentFirstName}/></div>
          <div className="field"><label className="label">Last name <span className="req">*</span></label><input className="input" defaultValue={e.studentLastName}/></div>
          <div className="field"><label className="label">Year level</label>
            <select className="select" defaultValue={e.studentYear}>
              {Array.from({length: 12}, (_, i) => `Year ${i+1}`).map((y) => <option key={y}>{y}</option>)}
            </select>
          </div>
          <div className="field"><label className="label">Subjects <span className="opt">comma-separated</span></label><input className="input" defaultValue={e.studentSubjects.join(", ")}/></div>
        </div>
      </div>

      <div>
        <h4 className="mb-3">Carer</h4>
        <div className="grid grid-2">
          <div className="field"><label className="label">First name</label><input className="input" defaultValue={e.carerFirstName}/></div>
          <div className="field"><label className="label">Last name</label><input className="input" defaultValue={e.carerLastName}/></div>
          <div className="field"><label className="label">Email</label><input className="input" type="email" defaultValue={e.carerEmail}/></div>
          <div className="field"><label className="label">Phone</label><input className="input" defaultValue={e.carerPhone}/></div>
        </div>
      </div>

      <div>
        <h4 className="mb-3">Emergency contact</h4>
        <div className="grid grid-2">
          <div className="field"><label className="label">First name</label><input className="input" defaultValue={e.emergencyContactFirstName}/></div>
          <div className="field"><label className="label">Last name</label><input className="input" defaultValue={e.emergencyContactLastName}/></div>
          <div className="field"><label className="label">Phone</label><input className="input" defaultValue={e.emergencyContactPhone}/></div>
          <div className="field"><label className="label">Relation</label><input className="input" defaultValue={e.emergencyContactRelation}/></div>
        </div>
      </div>

      <div>
        <h4 className="mb-3">Care notes</h4>
        <div className="col gap-3">
          <div className="field"><label className="label">Allergies / medical</label><textarea className="textarea" defaultValue={e.allergies}/></div>
          <div className="field">
            <label className="label">Permission to leave class unaccompanied</label>
            <label className="checkbox"><input type="checkbox" defaultChecked={!!e.permissionToLeave}/> Granted</label>
          </div>
          <div className="field"><label className="label">Additional info</label><textarea className="textarea" defaultValue={e.additionalInfo}/></div>
        </div>
      </div>
    </div>
  );
};

/* ============ ROUTER ============ */
const Enrolments = ({ route }) => {
  if (route.subRoute) return <EnrolmentDetail id={route.subRoute}/>;
  return <EnrolmentsList/>;
};

window.Views = Object.assign(window.Views || {}, { Enrolments });
