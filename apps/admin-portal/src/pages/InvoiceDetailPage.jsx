import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { deleteInvoice, getInvoice, getInvoicePdf } from "../backend/invoicesApi";
import { listStudents } from "../backend/studentsApi";
import { listUsers } from "../backend/usersApi";
import Badge from "../components/Badge";
import Button from "../components/Button";
import EditInvoiceModal from "../components/EditInvoiceModal";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import Modal from "../components/Modal";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import Table from "../components/Table";
import { useToast } from "../components/ToastProvider";

function formatMoney(value) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Number(value || 0));
}
function statusTone(status) {
  if (status === "paid")    return "success";
  if (status === "overdue") return "danger";
  return "warn";
}
function fullName(r) {
  return `${String(r?.firstName || "").trim()} ${String(r?.lastName || "").trim()}`.trim();
}
function userName(u) {
  return u?.displayName || fullName(u) || u?.email || u?.uid || "";
}
function studentName(s) {
  return s?.displayName || fullName(s) || s?.id || "";
}
function fmtDate(iso) {
  if (!iso) return "(empty)";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "(empty)";
  return d.toLocaleDateString();
}

export default function InvoiceDetailPage() {
  const navigate = useNavigate();
  const toast    = useToast();
  const { invoiceId } = useParams();
  const [params]  = useSearchParams();
  const isDraft   = params.get("draft") === "1";

  const [record,    setRecord]    = useState(null);
  const [users,     setUsers]     = useState([]);
  const [students,  setStudents]  = useState([]);
  const [busy,      setBusy]      = useState(true);
  const [error,     setError]     = useState("");
  const [warning,   setWarning]   = useState("");
  const [loadKey,   setLoadKey]   = useState(0);

  const [editOpen,    setEditOpen]    = useState(false);
  const [deleteOpen,  setDeleteOpen]  = useState(false);
  const [delTyped,    setDelTyped]    = useState("");
  const [delAckXero,  setDelAckXero]  = useState(false);
  const [delBusy,     setDelBusy]     = useState(false);
  const [delError,    setDelError]    = useState("");

  const [pdfBusy,     setPdfBusy]     = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError("");
    setWarning("");
    Promise.allSettled([
      getInvoice(invoiceId, { draft: isDraft }),
      listUsers(),
      listStudents(),
    ]).then(([rR, uR, sR]) => {
      if (cancelled) return;
      if (rR.status === "rejected") throw rR.reason;
      if (!rR.value) throw new Error(`${isDraft ? "Draft" : "Invoice"} not found: ${invoiceId}`);
      setRecord(rR.value);
      setUsers(uR.status    === "fulfilled" ? uR.value : []);
      setStudents(sR.status === "fulfilled" ? sR.value : []);
      const fails = [uR, sR].filter((r) => r.status === "rejected");
      if (fails.length) setWarning(fails[0].reason?.message || "Some related data could not be loaded.");
    }).catch((e) => {
      if (!cancelled) setError(e?.message || "Failed to load invoice.");
    }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [invoiceId, isDraft, loadKey]);

  useEffect(() => {
    if (deleteOpen) {
      setDelTyped("");
      setDelAckXero(false);
      setDelError("");
    }
  }, [deleteOpen]);

  const usersById    = useMemo(() => new Map(users.map((u)    => [u.uid || u.id, u])), [users]);
  const studentsById = useMemo(() => new Map(students.map((s) => [s.id, s])),           [students]);
  const parent       = useMemo(() => record ? usersById.get(record.parentId) : null,    [record, usersById]);
  const linkedStudents = useMemo(() => record ? (record.studentIds || []).map((id) => studentsById.get(id) || { id }) : [], [record, studentsById]);

  function reload() { setLoadKey((k) => k + 1); }

  async function handleDownloadPdf() {
    setPdfBusy(true);
    try {
      const res = await getInvoicePdf(invoiceId);
      if (res?.downloadUrl) {
        window.open(res.downloadUrl, "_blank", "noopener,noreferrer");
        toast.success("PDF opened", "Downloaded URL opened in a new tab.");
      } else if (res?.pdfPath) {
        toast.warn("PDF available", `Stored at ${res.pdfPath} but no download URL was returned.`);
      } else {
        toast.warn("No PDF yet", "This invoice has not been rendered to PDF.");
      }
    } catch (err) {
      toast.error("PDF unavailable", err?.message || "Could not retrieve invoice PDF.");
    } finally {
      setPdfBusy(false);
    }
  }

  async function handleDelete() {
    setDelError("");
    setDelBusy(true);
    try {
      await deleteInvoice(invoiceId, delTyped, delAckXero);
      toast.success("Invoice deleted", `${record?.invoiceNumber || invoiceId} has been deleted.`);
      navigate("/invoices");
    } catch (err) {
      setDelError(err?.message || "Failed to delete invoice.");
      setDelBusy(false);
    }
  }

  const amountDue        = Number(record?.amountDue ?? record?.amountDueComputed ?? 0);
  const lineItems        = Array.isArray(record?.lineItems) ? record.lineItems : [];
  const hasXero          = Boolean(record?.xeroInvoiceId);
  const hasStripe        = Boolean(record?.stripePaymentIntentId);
  const hasPdf           = Boolean(record?.xeroInvoicePdfPath);

  return (
    <>
      <PageHeader
        title={busy ? "Invoice" : (record?.invoiceNumber || record?.id || invoiceId)}
        subtitle={isDraft ? "Invoice draft" : "Invoice"}
        crumbs={[{ label: "Overview", href: "/" }, { label: "Invoices", href: "/invoices" }, { label: invoiceId }]}
        actions={
          <div className="row gap-2">
            <Button variant="secondary" onClick={() => navigate("/invoices")}>Back</Button>
            {!busy && !error && record ? (
              <>
                {!isDraft && hasPdf ? (
                  <Button loading={pdfBusy} variant="secondary" onClick={handleDownloadPdf}>
                    Download PDF
                  </Button>
                ) : null}
                {!isDraft ? (
                  <>
                    <Button variant="secondary" onClick={() => setEditOpen(true)}>Edit</Button>
                    <Button variant="danger-outline" onClick={() => setDeleteOpen(true)}>Delete</Button>
                  </>
                ) : null}
              </>
            ) : null}
          </div>
        }
      />

      {busy ? <div className="route-inline-state">Loading invoice…</div> : null}
      {error ? (
        <div className="banner banner-danger mb-5">
          <div><div className="banner-title">Could not load invoice</div><div>{error}</div></div>
        </div>
      ) : null}
      {warning ? (
        <div className="banner banner-warn mb-5">
          <Icon className="banner-icon" name="alert" />
          <div><div className="banner-title">Partial data loaded</div><div>{warning}</div></div>
        </div>
      ) : null}

      {!busy && !error && record ? (
        <>
          {hasXero && !isDraft ? (
            <div className="banner banner-info mb-5">
              <Icon className="banner-icon" name="alert" />
              <div>
                <div className="banner-title">Synced to Xero</div>
                <div>
                  Xero invoice ID: <span className="text-mono">{record.xeroInvoiceId}</span>. The portal will not push changes to Xero — make matching edits in Xero manually if customer-facing details change.
                </div>
              </div>
            </div>
          ) : null}

          <section className="grid grid-4 mb-6">
            <StatCard icon="invoice" label="Amount due" value={formatMoney(amountDue)}    foot={record.amountDueOverride ? "Includes admin override" : "Sum of line items"} />
            <StatCard icon="people"  label="Weeks"      value={record.weeks ?? "—"}        foot="Billing weeks" />
            <StatCard icon="enrol"   label="Line items" value={lineItems.length}           foot={`${lineItems.filter((i) => i.isAdminAdjustment).length} admin adjustments`} />
            <StatCard
              icon="alert"
              label="Status"
              value={isDraft ? "draft" : (record.status || "unpaid")}
              foot={record.dueDateIso ? `Due ${fmtDate(record.dueDateIso)}` : "No due date"}
            />
          </section>

          <div className="detail-grid">
            {/* Line items */}
            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Line items</h3>
                  <div className="card-sub">{lineItems.length} item{lineItems.length === 1 ? "" : "s"}.</div>
                </div>
                <Badge tone={statusTone(record.status)} dot>{isDraft ? "draft" : (record.status || "unpaid")}</Badge>
              </div>
              <div className="card-body flush">
                {lineItems.length === 0 ? (
                  <EmptyState icon="invoice" title="No line items">No line items on this {isDraft ? "draft" : "invoice"}.</EmptyState>
                ) : (
                  <Table
                    columns={[
                      {
                        key: "description",
                        header: "Description",
                        render: (item) => (
                          <div className="row-meta">
                            <span className="primary">{item.description || "(empty)"}</span>
                            {item.studentName ? <span className="secondary">{item.studentName}</span> : null}
                            {item.isAdminAdjustment ? <span className="secondary"><Badge tone="warn">Admin adjustment</Badge></span> : null}
                          </div>
                        ),
                      },
                      { key: "quantity", header: "Qty",   render: (item) => <span className="text-mono">{item.quantity ?? 0}</span> },
                      { key: "unit",     header: "Unit",  render: (item) => <span className="text-mono">{formatMoney(item.unitAmount)}</span> },
                      { key: "total",    header: "Total", render: (item) => <span className="text-mono" style={{ fontWeight: 600 }}>{formatMoney(item.lineTotal)}</span> },
                    ]}
                    getRowKey={(_, index) => index}
                    rows={lineItems}
                  />
                )}
                <div className="row gap-4" style={{ padding: "12px 16px", borderTop: "1px solid var(--ink-100)", justifyContent: "flex-end" }}>
                  <div className="row gap-4" style={{ alignItems: "baseline" }}>
                    <span className="text-sm muted">Amount due</span>
                    <span className="text-mono" style={{ fontWeight: 700, fontSize: "var(--fs-lg)" }}>{formatMoney(amountDue)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right column - parent, dates, metadata */}
            <div className="col gap-5">
              <div className="card">
                <div className="card-head">
                  <h3>Parent</h3>
                  <Badge tone="brand">customer</Badge>
                </div>
                <div className="card-body field-section">
                  <div className="field-readonly">
                    <span className="label">Name</span>
                    <div className="readonly-box">{record.parentName || userName(parent) || record.parentId || "(empty)"}</div>
                  </div>
                  <div className="field-readonly">
                    <span className="label">Email</span>
                    <div className="readonly-box">{record.parentEmail || parent?.email || "(empty)"}</div>
                  </div>
                  <div className="field-readonly">
                    <span className="label">Parent ID</span>
                    <div className="readonly-box text-mono">{record.parentId || "(empty)"}</div>
                  </div>
                  {parent ? (
                    <div>
                      <Button size="sm" variant="secondary" onClick={() => navigate(`/people/parents/${parent.uid || parent.id}`)}>
                        Open parent profile
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="card">
                <div className="card-head">
                  <h3>Students</h3>
                </div>
                <div className="card-body">
                  {linkedStudents.length === 0 ? (
                    <span className="muted">No students attached.</span>
                  ) : (
                    <div className="col gap-2">
                      {linkedStudents.map((s) => (
                        <div
                          className="row gap-3"
                          key={s.id}
                          style={{ cursor: s.firstName || s.lastName ? "pointer" : "default" }}
                          onClick={() => (s.firstName || s.lastName) && navigate(`/people/students/${s.id}`)}
                        >
                          <div className="row-meta grow">
                            <span className="primary">{studentName(s) || s.id}</span>
                            <span className="secondary text-mono">{s.id}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="card">
                <div className="card-head">
                  <h3>Dates &amp; metadata</h3>
                </div>
                <div className="card-body field-section">
                  <div className="field-readonly"><span className="label">Created</span><div className="readonly-box">{fmtDate(record.createdAtIso)}</div></div>
                  <div className="field-readonly"><span className="label">Updated</span><div className="readonly-box">{fmtDate(record.updatedAtIso)}</div></div>
                  <div className="field-readonly"><span className="label">Due date</span><div className="readonly-box">{fmtDate(record.dueDateIso)}</div></div>
                  <div className="field-readonly"><span className="label">Paid at</span><div className="readonly-box">{fmtDate(record.paidAtIso)}</div></div>
                  <div className="field-readonly"><span className="label">Weeks</span><div className="readonly-box">{record.weeks ?? "(empty)"}</div></div>
                  {record.amountDueOverride !== null && record.amountDueOverride !== undefined ? (
                    <div className="field-readonly"><span className="label">Amount override</span><div className="readonly-box text-mono">{formatMoney(record.amountDueOverride)}</div></div>
                  ) : null}
                  {record.amountDueComputed !== undefined ? (
                    <div className="field-readonly"><span className="label">Computed total</span><div className="readonly-box text-mono">{formatMoney(record.amountDueComputed)}</div></div>
                  ) : null}
                </div>
              </div>

              {(hasXero || hasStripe || hasPdf) ? (
                <div className="card">
                  <div className="card-head">
                    <h3>External systems</h3>
                  </div>
                  <div className="card-body field-section">
                    {hasXero ? (
                      <>
                        <div className="field-readonly"><span className="label">Xero invoice ID</span><div className="readonly-box text-mono">{record.xeroInvoiceId}</div></div>
                        {record.xeroInvoicePdfPath ? (
                          <div className="field-readonly"><span className="label">PDF path</span><div className="readonly-box text-mono">{record.xeroInvoicePdfPath}</div></div>
                        ) : null}
                      </>
                    ) : null}
                    {hasStripe ? (
                      <div className="field-readonly"><span className="label">Stripe payment intent</span><div className="readonly-box text-mono">{record.stripePaymentIntentId}</div></div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="card">
                <div className="card-head">
                  <h3>Admin notes</h3>
                </div>
                <div className="card-body">
                  {record.adminNotes ? (
                    <div className="text-sm" style={{ whiteSpace: "pre-wrap" }}>{record.adminNotes}</div>
                  ) : (
                    <span className="muted">No admin notes.</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {/* Edit modal (invoices only) */}
      {!isDraft ? (
        <EditInvoiceModal
          open={editOpen}
          record={record}
          onClose={() => setEditOpen(false)}
          onSuccess={(result) => {
            setEditOpen(false);
            reload();
            if (Array.isArray(result?.warnings) && result.warnings.length) {
              toast.warn("Saved with warnings", result.warnings[0]);
            } else {
              toast.success("Invoice updated", "Changes saved.");
            }
          }}
        />
      ) : null}

      {/* Delete modal */}
      {!isDraft ? (
        <Modal
          open={deleteOpen}
          title="Delete invoice?"
          subtitle="Hard-deletes the invoice from Firestore. Xero is not changed."
          busy={delBusy}
          onClose={() => { if (!delBusy) setDeleteOpen(false); }}
          footer={null}
        >
          {delError ? (
            <div className="banner banner-danger mb-4">
              <div><div className="banner-title">Delete failed</div><div>{delError}</div></div>
            </div>
          ) : null}

          <div className="banner banner-danger mb-4">
            <div><div className="banner-title">This action is permanent</div><div>The invoice document and stored PDF (if any) will be removed.</div></div>
          </div>

          {hasXero ? (
            <div className="banner banner-warn mb-4">
              <Icon className="banner-icon" name="alert" />
              <div>
                <div className="banner-title">Xero invoice will NOT be touched</div>
                <div>This invoice is synced to Xero (<span className="text-mono">{record?.xeroInvoiceId}</span>). The Xero record stays. Void or delete it in Xero manually if needed.</div>
              </div>
            </div>
          ) : null}

          <div className="field mb-4">
            <span className="label">
              Type the invoice ID <span className="text-mono" style={{ background: "var(--ink-100)", padding: "2px 6px", borderRadius: 4 }}>{invoiceId}</span> to confirm
            </span>
            <input
              autoFocus
              className={`input${delTyped && delTyped !== invoiceId ? " error-state" : ""}`}
              disabled={delBusy}
              value={delTyped}
              onChange={(e) => setDelTyped(e.target.value)}
            />
          </div>

          {hasXero ? (
            <label className="checkbox mb-4">
              <input
                checked={delAckXero}
                disabled={delBusy}
                type="checkbox"
                onChange={(e) => setDelAckXero(e.target.checked)}
              />
              <span>I understand that Xero will not be changed (<span className="text-mono">acknowledgeXeroWarning: true</span>).</span>
            </label>
          ) : null}

          <div className="row gap-2" style={{ justifyContent: "flex-end" }}>
            <Button disabled={delBusy} onClick={() => setDeleteOpen(false)} variant="secondary">Cancel</Button>
            <Button
              disabled={delBusy || delTyped !== invoiceId || (hasXero && !delAckXero)}
              loading={delBusy}
              onClick={handleDelete}
              variant="danger"
            >
              Delete invoice permanently
            </Button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
