/* =========================================================
   Invoices — list, detail, create, edit, drafts, Xero warnings
   ========================================================= */

const invoiceTabs = [
  { id: "all", label: "All", match: () => true },
  { id: "unpaid", label: "Unpaid", match: (i) => i.status === "unpaid" },
  { id: "overdue", label: "Overdue", match: (i) => i.status === "overdue" },
  { id: "paid", label: "Paid", match: (i) => i.status === "paid" },
  { id: "drafts", label: "Drafts", match: null }, // special
];

const InvoicesList = ({ initialTab }) => {
  const [tab, setTab] = useState(initialTab || "all");
  const [search, setSearch] = useState("");
  const [parentFilter, setParentFilter] = useState("all");
  const [xeroFilter, setXeroFilter] = useState("all");

  const filtered = useMemo(() => {
    if (tab === "drafts") {
      let r = [...INVOICE_DRAFTS];
      if (search) r = r.filter((d) => d.parentName.toLowerCase().includes(search.toLowerCase()));
      return r;
    }
    const tabDef = invoiceTabs.find((x) => x.id === tab);
    let r = INVOICES.filter(tabDef.match);
    if (search) {
      const q = search.toLowerCase();
      r = r.filter((i) => i.invoiceNumber.toLowerCase().includes(q) || i.parentName.toLowerCase().includes(q));
    }
    if (parentFilter !== "all") r = r.filter((i) => i.parentId === parentFilter);
    if (xeroFilter === "synced") r = r.filter((i) => !!i.xeroInvoiceId);
    if (xeroFilter === "unsynced") r = r.filter((i) => !i.xeroInvoiceId);
    return r.sort((a, b) => b.createdAt - a.createdAt);
  }, [tab, search, parentFilter, xeroFilter]);

  const counts = {
    all: INVOICES.length,
    unpaid: INVOICES.filter(i => i.status === "unpaid").length,
    overdue: INVOICES.filter(i => i.status === "overdue").length,
    paid: INVOICES.filter(i => i.status === "paid").length,
    drafts: INVOICE_DRAFTS.length,
  };

  const totalUnpaid = INVOICES.filter(i => i.status !== "paid").reduce((s, i) => s + i.amountDue, 0);
  const totalPaid = INVOICES.filter(i => i.status === "paid").reduce((s, i) => s + i.amountDue, 0);
  const totalOverdue = INVOICES.filter(i => i.status === "overdue").reduce((s, i) => s + i.amountDue, 0);

  return (
    <Fragment>
      <PageHead
        title="Invoices"
        sub="Term billing for parents. Draft and create invoices; updates / deletes warn for Xero-synced records."
        actions={
          <Fragment>
            <Button variant="secondary" icon="download">Export</Button>
            <Button variant="secondary" icon="file-text" onClick={() => navigate("/invoices/new?draft=1")}>New draft</Button>
            <Button variant="primary" icon="plus" onClick={() => navigate("/invoices/new")}>New invoice</Button>
          </Fragment>
        }
      />

      <div className="grid grid-4 mb-5">
        <StatCard label="Term revenue (paid)" value={fmt.moneyShort(totalPaid)} icon="wallet" accent="#1FA968" foot={`${counts.paid} invoices`}/>
        <StatCard label="Outstanding" value={fmt.moneyShort(totalUnpaid)} icon="invoice" accent="#C58A1E" foot={`${counts.unpaid + counts.overdue} invoices`}/>
        <StatCard label="Overdue" value={fmt.moneyShort(totalOverdue)} icon="alert" accent="#D63C49" foot={`${counts.overdue} invoices`}/>
        <StatCard label="Drafts" value={counts.drafts} icon="file-text" accent="#4A90C4" foot="Not sent to Xero"/>
      </div>

      <div className="tabs">
        {invoiceTabs.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            {t.label} <span className="count">{counts[t.id]}</span>
          </button>
        ))}
      </div>

      <div className="filter-bar">
        <SearchInput value={search} onChange={setSearch} placeholder="Search invoice number or parent…" className="grow"/>
        <select className="select" value={parentFilter} onChange={(e) => setParentFilter(e.target.value)} style={{maxWidth: 220}}>
          <option value="all">All parents</option>
          {USERS.filter(u => u.role === "parent").map((p) => <option key={p.uid} value={p.uid}>{userName(p)}</option>)}
        </select>
        {tab !== "drafts" && (
          <select className="select" value={xeroFilter} onChange={(e) => setXeroFilter(e.target.value)} style={{maxWidth: 180}}>
            <option value="all">All Xero status</option>
            <option value="synced">Synced to Xero</option>
            <option value="unsynced">Not synced</option>
          </select>
        )}
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{tab === "drafts" ? "Draft" : "Invoice"}</th>
                <th>Parent</th>
                <th>Students</th>
                {tab !== "drafts" && <th>Status</th>}
                <th>Due</th>
                <th>Integrations</th>
                <th className="col-right">Amount</th>
                <th className="col-actions"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => {
                const students = inv.studentIds.map(findStudent).filter(Boolean);
                return (
                  <tr key={inv.id} className="row-link" onClick={() => navigate(`/invoices/${inv.id}`)}>
                    <td>
                      <div className="row-meta">
                        <span className="primary text-mono">{inv.invoiceNumber || inv.id.slice(0, 12) + "…"}</span>
                        <span className="secondary">Created {fmt.dateShort(inv.createdAt)}</span>
                      </div>
                    </td>
                    <td>
                      <div className="row-meta">
                        <span className="primary">{inv.parentName}</span>
                        <span className="secondary">{inv.parentEmail}</span>
                      </div>
                    </td>
                    <td>
                      <div className="row gap-1" style={{flexWrap: "wrap"}}>
                        {students.slice(0, 2).map((s) => <Badge key={s.id} tone="neutral">{s.firstName}</Badge>)}
                        {students.length > 2 && <span className="text-xs muted">+{students.length - 2}</span>}
                      </div>
                    </td>
                    {tab !== "drafts" && <td><StatusBadge status={inv.status}/></td>}
                    <td className="cell-muted">{fmt.dateShort(inv.dueDate)}</td>
                    <td>
                      <div className="row gap-1">
                        {inv.xeroInvoiceId
                          ? <span title="Xero synced" style={{display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: "var(--info-700)", padding: "2px 8px", background: "var(--info-100)", borderRadius: "var(--r-full)"}}><Icon name="check" size={11}/>Xero</span>
                          : <span title="Not synced to Xero" style={{display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: "var(--ink-500)", padding: "2px 8px", background: "var(--ink-100)", borderRadius: "var(--r-full)"}}>Xero —</span>
                        }
                        {inv.stripePaymentIntentId && (
                          <span title="Stripe PI exists" style={{display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: "var(--brand-navy)", padding: "2px 8px", background: "var(--brand-blue-50)", borderRadius: "var(--r-full)"}}><Icon name="credit-card" size={11}/>Stripe</span>
                        )}
                      </div>
                    </td>
                    <td className="col-right cell-strong num">{fmt.money(inv.amountDue)}</td>
                    <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="secondary" iconRight="chevron-right" onClick={() => navigate(`/invoices/${inv.id}`)}>Open</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <Empty title={`No ${tab === "drafts" ? "drafts" : "invoices"} match`} icon="search"/>}
        </div>
      </div>
    </Fragment>
  );
};

/* ============ INVOICE DETAIL ============ */
const InvoiceDetail = ({ id }) => {
  const toast = useToast();
  const inv = INVOICES.find((x) => x.id === id) || INVOICE_DRAFTS.find((x) => x.id === id);
  const isDraft = !!INVOICE_DRAFTS.find((x) => x.id === id);
  const [editOpen, setEditOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);

  if (!inv) return <Empty title="Invoice not found" icon="x-circle" action={<Button onClick={() => navigate("/invoices")}>Back</Button>}/>;

  const parent = findUser(inv.parentId);
  const students = inv.studentIds.map(findStudent).filter(Boolean);
  const lineTotal = inv.lineItems.reduce((s, l) => s + l.lineTotal, 0);
  const hasOverride = inv.amountDueOverride != null && inv.amountDueOverride !== inv.amountDueComputed;

  return (
    <Fragment>
      <PageHead
        crumbs={[{label: "Invoices", href: "#/invoices"}, {label: inv.invoiceNumber || "Draft"}]}
        title={inv.invoiceNumber || "Draft invoice"}
        sub={isDraft ? <Badge tone="warn" dot>Draft — not yet sent</Badge> : <span><StatusBadge status={inv.status}/><span className="text-mono muted" style={{marginLeft: 10}}>{inv.id}</span></span>}
        actions={<Fragment>
          {!isDraft && inv.xeroInvoiceId && <Button variant="secondary" icon="file-text" onClick={() => setPdfOpen(true)}>Get PDF</Button>}
          <Button variant="secondary" icon="edit" onClick={() => setEditOpen(true)}>Edit</Button>
          {isDraft
            ? <Button variant="primary" icon="send" onClick={() => toast.success("Draft converted to invoice", "Created and queued for Xero sync.")}>Create invoice</Button>
            : <Button variant="danger-outline" icon="trash" onClick={() => setDelOpen(true)}>Delete</Button>
          }
        </Fragment>}
      />

      {/* Xero warning */}
      {!isDraft && inv.xeroInvoiceId && (
        <Banner kind="warn" title="Synced to Xero">
          This invoice has been pushed to Xero (<span className="text-mono">{inv.xeroInvoiceId}</span>). Edits and deletions in the portal do <strong>not</strong> propagate to Xero. Update or void in Xero separately if needed.
        </Banner>
      )}

      <div className="detail-grid mt-5">
        <div className="col gap-5">
          {/* Line items */}
          <div className="card">
            <div className="card-head">
              <h3><span className="brand-stripe"></span>Line items</h3>
              <div className="text-sm muted">{inv.lineItems.length} {inv.lineItems.length === 1 ? "item" : "items"} · {inv.weeks} weeks</div>
            </div>
            <div className="card-body flush">
              <table className="table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th className="col-right">Qty</th>
                    <th className="col-right">Unit</th>
                    <th className="col-right">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.lineItems.map((li, i) => (
                    <tr key={i}>
                      <td>
                        <div className="row-meta">
                          <span className="primary">{li.description}</span>
                          {li.studentName && <span className="secondary">{li.studentName}</span>}
                          {li.isAdminAdjustment && <Badge tone="info" className="mt-1" style={{marginTop: 4}}>Admin adjustment</Badge>}
                        </div>
                      </td>
                      <td className="col-right num">{li.quantity}</td>
                      <td className="col-right num">{fmt.money(li.unitAmount)}</td>
                      <td className="col-right cell-strong num" style={{color: li.lineTotal < 0 ? "var(--success-700)" : undefined}}>{fmt.money(li.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="3" className="col-right cell-muted text-sm">Computed total</td>
                    <td className="col-right cell-strong num">{fmt.money(lineTotal)}</td>
                  </tr>
                  {hasOverride && (
                    <tr>
                      <td colSpan="3" className="col-right text-sm" style={{color: "var(--warn-700)"}}>Override (was {fmt.money(inv.amountDueComputed)})</td>
                      <td className="col-right cell-strong num" style={{color: "var(--warn-700)"}}>{fmt.money(inv.amountDueOverride)}</td>
                    </tr>
                  )}
                  <tr style={{background: "var(--brand-blue-50)"}}>
                    <td colSpan="3" className="col-right weight-700" style={{fontSize: "var(--fs-md)"}}>Amount due</td>
                    <td className="col-right num" style={{fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--fs-xl)", color: "var(--brand-navy)"}}>{fmt.money(inv.amountDue)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {inv.adminNotes && (
            <div className="card">
              <div className="card-head"><h3><span className="brand-stripe"></span>Admin notes</h3></div>
              <div className="card-body">
                <div style={{whiteSpace: "pre-wrap"}}>{inv.adminNotes}</div>
              </div>
            </div>
          )}

          {/* Integrations */}
          <div className="card">
            <div className="card-head"><h3><span className="brand-stripe"></span>Integrations</h3></div>
            <div className="card-body">
              <dl className="dlist compact">
                <dt>Xero invoice ID</dt><dd>{inv.xeroInvoiceId ? <span className="text-mono">{inv.xeroInvoiceId}</span> : <span className="muted">Not synced yet</span>}</dd>
                <dt>Xero PDF path</dt><dd>{inv.xeroInvoicePdfPath ? <span className="text-mono">{inv.xeroInvoicePdfPath}</span> : <span className="muted">Unavailable until Xero sync completes</span>}</dd>
                <dt>Stripe PaymentIntent</dt><dd>{inv.stripePaymentIntentId ? <span className="text-mono">{inv.stripePaymentIntentId}</span> : <span className="muted">No payment intent yet</span>}</dd>
                <dt>Paid at</dt><dd>{inv.paidAt ? fmt.dateTime(inv.paidAt) : <span className="muted">—</span>}</dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="col gap-5">
          <div className="card">
            <div className="card-head"><h3><span className="brand-stripe"></span>Bill to</h3></div>
            <div className="card-body">
              <a href={`#/people/parents/${inv.parentId}`} className="row gap-3" style={{textDecoration: "none", color: "inherit"}}>
                <Avatar name={inv.parentName} size="md"/>
                <div className="row-meta grow">
                  <span className="primary">{inv.parentName}</span>
                  <span className="secondary">{inv.parentEmail}</span>
                </div>
                <Icon name="chevron-right" size={16} style={{color: "var(--ink-400)"}}/>
              </a>
              {parent?.phone && <div className="text-sm muted mt-3"><Icon name="phone" size={12}/> {parent.phone}</div>}
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3><span className="brand-stripe"></span>Students</h3></div>
            <div className="card-body flush">
              {students.map((s) => (
                <a key={s.id} href={`#/people/students/${s.id}`} style={{display: "flex", padding: "12px 24px", borderBottom: "1px solid var(--ink-100)", textDecoration: "none", color: "inherit", alignItems: "center", gap: 12}}>
                  <Avatar name={studentName(s)} size="sm"/>
                  <div className="row-meta grow">
                    <span className="primary">{studentName(s)}</span>
                    <span className="secondary">{s.grade}</span>
                  </div>
                </a>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3><span className="brand-stripe"></span>Dates</h3></div>
            <div className="card-body">
              <dl className="dlist compact">
                <dt>Created</dt><dd>{fmt.dateTime(inv.createdAt)}</dd>
                <dt>Due</dt><dd>{fmt.date(inv.dueDate)}</dd>
                <dt>Weeks</dt><dd>{inv.weeks}</dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      {/* Edit invoice */}
      <Panel open={editOpen} onClose={() => setEditOpen(false)} size="lg" title="Edit invoice"
        footer={<Fragment>
          <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => { setEditOpen(false); toast.success("Invoice updated", inv.xeroInvoiceId ? "Warning: Xero copy was not updated." : ""); }}>Save changes</Button>
        </Fragment>}>
        <InvoiceForm invoice={inv} mode="edit"/>
      </Panel>

      {/* Get PDF */}
      <Modal open={pdfOpen} onClose={() => setPdfOpen(false)} title="Fetch invoice PDF"
        footer={<Fragment>
          <Button variant="secondary" onClick={() => setPdfOpen(false)}>Close</Button>
          <Button variant="primary" icon="download" onClick={() => { setPdfOpen(false); toast.success("PDF ready", "Storage download URL resolved."); }}>Download</Button>
        </Fragment>}>
        <Banner kind="info" title="adminGetInvoicePdf">
          <div className="mt-3"></div>
          Returns a Storage path. The portal will resolve a download URL for you.
        </Banner>
        <dl className="dlist compact mt-4">
          <dt>Source</dt><dd><Badge tone="success" dot>Xero (cached)</Badge></dd>
          <dt>Storage path</dt><dd className="text-mono">{inv.xeroInvoicePdfPath || "—"}</dd>
        </dl>
      </Modal>

      {/* Delete */}
      <InvoiceDeleteModal open={delOpen} onClose={() => setDelOpen(false)} invoice={inv} onConfirm={() => { setDelOpen(false); toast.error("Invoice deleted", inv.xeroInvoiceId ? "Xero invoice was NOT voided automatically." : "Removed from Firestore."); navigate("/invoices"); }}/>
    </Fragment>
  );
};

/* ============ INVOICE FORM ============ */
const InvoiceForm = ({ invoice, mode }) => {
  const [parentId, setParentId] = useState(invoice?.parentId || "");
  const [studentIds, setStudentIds] = useState(invoice?.studentIds || []);
  const [weeks, setWeeks] = useState(invoice?.weeks || 10);
  const [dueDate, setDueDate] = useState(invoice?.dueDate ? new Date(invoice.dueDate).toISOString().slice(0, 10) : daysAhead(14).toISOString().slice(0, 10));
  const [items, setItems] = useState(invoice?.lineItems || [{ description: "", quantity: 1, unitAmount: 0, lineTotal: 0 }]);
  const [override, setOverride] = useState(invoice?.amountDueOverride != null);
  const [overrideAmt, setOverrideAmt] = useState(invoice?.amountDueOverride || 0);
  const [adminNotes, setAdminNotes] = useState(invoice?.adminNotes || "");

  const parent = findUser(parentId);
  const parentStudents = parent ? STUDENTS.filter((s) => parent.students.includes(s.id)) : [];

  const computed = items.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitAmount) || 0), 0);
  const finalDue = override ? Number(overrideAmt) : computed;
  const overrideValid = !override || Math.abs(finalDue - computed) < 0.01 || items.some((l) => l.isAdminAdjustment); // simplified check

  const updateItem = (i, field, val) => {
    const next = [...items];
    next[i] = { ...next[i], [field]: val };
    if (field === "quantity" || field === "unitAmount") {
      next[i].lineTotal = (Number(next[i].quantity) || 0) * (Number(next[i].unitAmount) || 0);
    }
    setItems(next);
  };
  const addItem = () => setItems([...items, { description: "", quantity: 1, unitAmount: 0, lineTotal: 0 }]);
  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i));
  const addAdjustment = () => {
    setItems([...items, { description: "Admin adjustment", quantity: 1, unitAmount: 0, lineTotal: 0, isAdminAdjustment: true }]);
  };

  return (
    <div className="col gap-5">
      <div>
        <h4 className="mb-3">Bill to</h4>
        <div className="grid grid-2 gap-4">
          <div className="field"><label className="label">Parent <span className="req">*</span></label>
            <select className="select" value={parentId} onChange={(e) => { setParentId(e.target.value); setStudentIds([]); }}>
              <option value="">— Select a parent —</option>
              {USERS.filter(u => u.role === "parent").map((p) => <option key={p.uid} value={p.uid}>{userName(p)} · {p.email}</option>)}
            </select>
          </div>
          <div className="field"><label className="label">Due date <span className="req">*</span></label>
            <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}/>
          </div>
          <div className="field"><label className="label">Students billed <span className="req">*</span></label>
            <select className="select" multiple value={studentIds} onChange={(e) => setStudentIds([...e.target.selectedOptions].map(o => o.value))} style={{height: 90}}>
              {parentStudents.map((s) => <option key={s.id} value={s.id}>{studentName(s)} · {s.grade}</option>)}
            </select>
            <span className="hint">{!parent ? "Select a parent first." : `${parentStudents.length} linked students available.`}</span>
          </div>
          <div className="field"><label className="label">Weeks <span className="req">*</span></label>
            <input className="input" type="number" min="1" value={weeks} onChange={(e) => setWeeks(e.target.value)}/>
          </div>
        </div>
      </div>

      <div>
        <div className="row between mb-3">
          <h4>Line items</h4>
          <div className="row gap-2">
            <Button size="sm" variant="ghost" icon="plus" onClick={addAdjustment}>Add adjustment</Button>
            <Button size="sm" variant="secondary" icon="plus" onClick={addItem}>Add item</Button>
          </div>
        </div>
        <div className="card" style={{border: "1px solid var(--ink-200)"}}>
          <table className="table">
            <thead>
              <tr>
                <th style={{width: "40%"}}>Description</th>
                <th>Student</th>
                <th className="col-right" style={{width: 80}}>Qty</th>
                <th className="col-right" style={{width: 110}}>Unit</th>
                <th className="col-right" style={{width: 120}}>Line total</th>
                <th style={{width: 40}}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((li, i) => (
                <tr key={i}>
                  <td>
                    <input className="input" value={li.description} onChange={(e) => updateItem(i, "description", e.target.value)} placeholder="e.g. Senior Yr 9/10 — 10 weeks"/>
                    {li.isAdminAdjustment && <Badge tone="info" className="mt-1" style={{marginTop: 4}}>Admin adjustment</Badge>}
                  </td>
                  <td>
                    <select className="select" value={li.studentName || ""} onChange={(e) => updateItem(i, "studentName", e.target.value)} style={{height: 32, padding: "0 8px"}}>
                      <option value="">—</option>
                      {parentStudents.map((s) => <option key={s.id} value={studentName(s)}>{studentName(s)}</option>)}
                    </select>
                  </td>
                  <td><input className="input num" type="number" value={li.quantity} onChange={(e) => updateItem(i, "quantity", e.target.value)} style={{textAlign: "right"}}/></td>
                  <td><input className="input num" type="number" step="0.01" value={li.unitAmount} onChange={(e) => updateItem(i, "unitAmount", e.target.value)} style={{textAlign: "right"}}/></td>
                  <td className="col-right cell-strong num">{fmt.money(li.lineTotal)}</td>
                  <td><button className="icon-btn" onClick={() => removeItem(i)}><Icon name="x" size={14}/></button></td>
                </tr>
              ))}
              <tr style={{background: "var(--ink-25)"}}>
                <td colSpan="4" className="col-right cell-muted">Computed total</td>
                <td className="col-right cell-strong num">{fmt.money(computed)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h4 className="mb-3">Override & finalisation</h4>
        <div className="row between" style={{padding: "12px 14px", background: "var(--ink-50)", borderRadius: "var(--r-md)"}}>
          <div>
            <div className="weight-600">Override payable amount</div>
            <div className="text-xs muted">Use only with a balancing admin-adjustment line item.</div>
          </div>
          <div className={`switch ${override ? "on" : ""}`} onClick={() => setOverride(!override)}/>
        </div>
        {override && (
          <div className="field mt-3"><label className="label">Override amount due</label>
            <div className="input-group" style={{maxWidth: 240}}>
              <div className="input-prefix">$</div>
              <input className="input num" type="number" step="0.01" value={overrideAmt} onChange={(e) => setOverrideAmt(e.target.value)} style={{textAlign: "right"}}/>
            </div>
            {!overrideValid && <span className="error mt-2"><Icon name="alert" size={12}/> Override must match line item total or include an admin adjustment line.</span>}
          </div>
        )}
      </div>

      <div>
        <h4 className="mb-3">Admin notes</h4>
        <textarea className="textarea" value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} placeholder="Internal notes about this invoice…"/>
      </div>

      <div className="row gap-5" style={{padding: "16px", background: "var(--brand-blue-50)", borderRadius: "var(--r-md)"}}>
        <div className="grow">
          <div className="text-xs muted weight-700" style={{textTransform: "uppercase", letterSpacing: "0.08em"}}>Total payable</div>
          <div style={{fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 700, color: "var(--brand-navy)", lineHeight: 1, marginTop: 4}}>{fmt.money(finalDue)}</div>
        </div>
        <div style={{textAlign: "right"}}>
          <div className="text-xs muted">{items.length} line items · {weeks} weeks</div>
          <div className="text-xs muted">{studentIds.length} student{studentIds.length === 1 ? "" : "s"} billed</div>
        </div>
      </div>

      {mode !== "edit" && (
        <Banner kind="warn" title="Heads-up: Xero invoice will be created on submit"><div className="mt-3"></div>An on-create trigger pushes new invoices to Xero and emails the parent. Use "Save as draft" if you want to review before that happens.</Banner>
      )}
    </div>
  );
};

/* ============ NEW INVOICE PAGE ============ */
const NewInvoice = ({ asDraft }) => {
  const toast = useToast();
  return (
    <Fragment>
      <PageHead
        crumbs={[{label: "Invoices", href: "#/invoices"}, {label: asDraft ? "New draft" : "New invoice"}]}
        title={asDraft ? "New invoice draft" : "Create new invoice"}
        sub={asDraft ? "Drafts live in invoiceDrafts and do not trigger Xero." : "Creates in invoices — Xero trigger will fire on save."}
      />
      <div className="card">
        <div className="card-body">
          <InvoiceForm mode="create"/>
        </div>
        <div style={{borderTop: "1px solid var(--ink-200)", padding: "16px 24px", display: "flex", justifyContent: "flex-end", gap: 8, background: "var(--ink-25)", borderRadius: "0 0 var(--r-lg) var(--r-lg)"}}>
          <Button variant="secondary" onClick={() => navigate("/invoices")}>Cancel</Button>
          <Button variant="ghost" icon="file-text" onClick={() => { toast.success("Draft saved", "Draft stored in invoiceDrafts."); navigate("/invoices?tab=drafts"); }}>Save as draft</Button>
          <Button variant="primary" icon="send" onClick={() => { toast.success("Invoice created", "Xero sync triggered. Email queued."); navigate("/invoices"); }}>Create & send</Button>
        </div>
      </div>
    </Fragment>
  );
};

/* ============ DELETE INVOICE MODAL ============ */
const InvoiceDeleteModal = ({ open, onClose, invoice, onConfirm }) => {
  const [val, setVal] = useState("");
  const [ackXero, setAckXero] = useState(false);
  const expectedId = invoice?.invoiceNumber || invoice?.id || "";
  useEffect(() => { if (open) { setVal(""); setAckXero(false); } }, [open]);
  const matched = val === expectedId;
  const xeroAck = !invoice?.xeroInvoiceId || ackXero;
  return (
    <Modal open={open} onClose={onClose} danger size="lg" icon="trash" title="Delete this invoice?"
      subtitle="The Firestore document and any cached PDF will be removed."
      footer={<Fragment>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="danger" disabled={!matched || !xeroAck} onClick={onConfirm}>Delete invoice permanently</Button>
      </Fragment>}>
      {invoice?.xeroInvoiceId && (
        <Banner kind="warn" title="This invoice is synced to Xero" className="mb-4">
          <div className="mt-3"></div>
          Deleting here does NOT void or delete the Xero copy. Manage Xero separately if required.
        </Banner>
      )}
      {invoice?.xeroInvoicePdfPath && (
        <div className="text-sm muted mb-4">Cached PDF at <span className="text-mono">{invoice.xeroInvoicePdfPath}</span> will be deleted.</div>
      )}
      <div className="field">
        <label className="label">Type the invoice number <span className="text-mono" style={{background: "var(--ink-100)", padding: "2px 6px", borderRadius: 4}}>{expectedId}</span> to confirm</label>
        <input className={`input ${val && !matched ? "error-state" : ""}`} value={val} onChange={(e) => setVal(e.target.value)} autoFocus/>
      </div>
      {invoice?.xeroInvoiceId && (
        <label className="checkbox mt-4">
          <input type="checkbox" checked={ackXero} onChange={(e) => setAckXero(e.target.checked)}/>
          I acknowledge that the Xero invoice will not be voided automatically.
        </label>
      )}
    </Modal>
  );
};

/* ============ ROUTER ============ */
const Invoices = ({ route }) => {
  if (route.subRoute === "new") return <NewInvoice asDraft={!!route.query?.draft}/>;
  if (route.subRoute) return <InvoiceDetail id={route.subRoute}/>;
  return <InvoicesList initialTab={route.query?.tab || route.query?.status || "all"}/>;
};

window.Views = Object.assign(window.Views || {}, { Invoices });
