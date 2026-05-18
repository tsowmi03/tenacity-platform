import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listInvoiceDrafts, listInvoices } from "../backend/invoicesApi";
import { listStudents } from "../backend/studentsApi";
import { listUsers } from "../backend/usersApi";
import Badge from "../components/Badge";
import Button from "../components/Button";
import CreateInvoiceModal from "../components/CreateInvoiceModal";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import Table from "../components/Table";
import { useToast } from "../components/ToastProvider";

const TABS = [
  { key: "invoices", label: "Invoices" },
  { key: "drafts",   label: "Drafts" },
];

const STATUS_FILTERS = [
  { value: "all",     label: "All statuses" },
  { value: "unpaid",  label: "Unpaid" },
  { value: "paid",    label: "Paid" },
  { value: "overdue", label: "Overdue" },
];

const XERO_FILTERS = [
  { value: "all",      label: "All Xero states" },
  { value: "synced",   label: "Xero synced" },
  { value: "unsynced", label: "Not in Xero" },
];

const PAGE_SIZE = 20;

function formatMoney(value) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Number(value || 0));
}
function statusTone(status) {
  if (status === "paid")    return "success";
  if (status === "overdue") return "danger";
  return "warn";
}
function invoiceAmount(inv) {
  return Number(inv?.amountDue ?? inv?.amountDueComputed ?? inv?.total ?? inv?.totalAmount ?? 0);
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

export default function InvoicesPage() {
  const navigate = useNavigate();
  const toast    = useToast();

  const [invoices,    setInvoices]    = useState([]);
  const [drafts,      setDrafts]      = useState([]);
  const [users,       setUsers]       = useState([]);
  const [students,    setStudents]    = useState([]);
  const [busy,        setBusy]        = useState(true);
  const [error,       setError]       = useState("");
  const [warning,     setWarning]     = useState("");

  const [tab,          setTab]          = useState("invoices");
  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [xeroFilter,   setXeroFilter]   = useState("all");
  const [page,         setPage]         = useState(1);
  const [loadKey,      setLoadKey]      = useState(0);

  const [createOpen,   setCreateOpen]   = useState(false);
  const [createMode,   setCreateMode]   = useState("invoice");

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError("");
    setWarning("");
    Promise.allSettled([
      listInvoices(),
      listInvoiceDrafts(),
      listUsers(),
      listStudents(),
    ]).then(([iR, dR, uR, sR]) => {
      if (cancelled) return;
      if (iR.status === "rejected") throw iR.reason;
      setInvoices(iR.value);
      setDrafts(dR.status   === "fulfilled" ? dR.value : []);
      setUsers(uR.status    === "fulfilled" ? uR.value : []);
      setStudents(sR.status === "fulfilled" ? sR.value : []);
      const fails = [dR, uR, sR].filter((r) => r.status === "rejected");
      if (fails.length) setWarning(fails[0].reason?.message || "Some related data could not be loaded.");
    }).catch((e) => {
      if (!cancelled) setError(e?.message || "Failed to load invoices.");
    }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [loadKey]);

  useEffect(() => {
    setPage(1);
  }, [search, tab, statusFilter, xeroFilter]);

  const usersById    = useMemo(() => new Map(users.map((u)    => [u.uid || u.id, u])), [users]);
  const studentsById = useMemo(() => new Map(students.map((s) => [s.id, s])),           [students]);

  const counts = useMemo(() => ({
    invoices: invoices.length,
    drafts:   drafts.length,
    unpaid:   invoices.filter((i) => i.status === "unpaid").length,
    paid:     invoices.filter((i) => i.status === "paid").length,
    overdue:  invoices.filter((i) => i.status === "overdue").length,
  }), [invoices, drafts]);

  const baseRows = tab === "drafts" ? drafts : invoices;

  const visible = useMemo(() => {
    let rows = baseRows;
    if (tab === "invoices" && statusFilter !== "all") rows = rows.filter((i) => i.status === statusFilter);
    if (tab === "invoices" && xeroFilter   !== "all") rows = rows.filter((i) => xeroFilter === "synced" ? Boolean(i.xeroInvoiceId) : !i.xeroInvoiceId);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((row) => {
        const parent = usersById.get(row.parentId);
        const studentNames = (row.studentIds || []).map((sid) => studentName(studentsById.get(sid)) || "").join(" ");
        return [
          row.invoiceNumber || "",
          row.parentName || userName(parent),
          row.parentEmail || parent?.email || "",
          studentNames,
        ].some((v) => String(v).toLowerCase().includes(q));
      });
    }
    return rows.slice().sort((a, b) => {
      const ad = a.dueDateIso ? Date.parse(a.dueDateIso) : null;
      const bd = b.dueDateIso ? Date.parse(b.dueDateIso) : null;
      if (ad !== bd) {
        if (ad === null) return 1;
        if (bd === null) return -1;
        return ad - bd;
      }
      return invoiceAmount(b) - invoiceAmount(a);
    });
  }, [baseRows, search, statusFilter, studentsById, tab, usersById, xeroFilter]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage  = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageRows  = visible.slice(pageStart, pageStart + PAGE_SIZE);

  function reload() { setLoadKey((k) => k + 1); }

  function openCreate(mode) {
    setCreateMode(mode);
    setCreateOpen(true);
  }

  function renderPagination() {
    if (visible.length <= PAGE_SIZE) return null;
    return (
      <div className="pagination">
        <span>
          Showing {pageStart + 1}-{Math.min(pageStart + PAGE_SIZE, visible.length)} of {visible.length}
        </span>
        <div className="pages">
          <button className="page-btn" disabled={safePage === 1}         onClick={() => setPage((p) => Math.max(1, p - 1))}         type="button">Previous</button>
          <button className="page-btn active" disabled type="button">{safePage} / {pageCount}</button>
          <button className="page-btn" disabled={safePage === pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))} type="button">Next</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle="Manage parent invoices, drafts, and Xero metadata. Payment collection stays in the Flutter app."
        crumbs={[{ label: "Overview", href: "/" }, { label: "Invoices" }]}
        actions={
          <div className="row gap-2">
            <Button variant="secondary" onClick={() => openCreate("draft")}>
              New draft
            </Button>
            <Button variant="primary" onClick={() => openCreate("invoice")}>
              New invoice
            </Button>
          </div>
        }
      />

      <section className="grid grid-4 mb-6">
        <StatCard icon="invoice" label="Invoices" value={counts.invoices} foot="All time" />
        <StatCard icon="alert"   label="Unpaid"   value={counts.unpaid}   foot="Awaiting payment" />
        <StatCard icon="people"  label="Paid"     value={counts.paid}     foot="Fully settled" />
        <StatCard icon="alert"   label="Overdue"  value={counts.overdue}  foot="Past due date" />
      </section>

      <div className="tabs">
        {TABS.map((t) => (
          <button
            className={`tab ${tab === t.key ? "active" : ""}`}
            disabled={busy}
            key={t.key}
            onClick={() => setTab(t.key)}
            type="button"
          >
            {t.label}
            <span className="count">{counts[t.key] || 0}</span>
          </button>
        ))}
      </div>

      <div className="filter-bar">
        <div className="field-search grow">
          <Icon className="search-icon" name="search" size={16} />
          <input
            className="input"
            placeholder="Search by invoice number, parent, or student"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {tab === "invoices" ? (
          <>
            <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              {STATUS_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <select className="select" value={xeroFilter} onChange={(e) => setXeroFilter(e.target.value)}>
              {XERO_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </>
        ) : null}
      </div>

      {warning ? (
        <div className="banner banner-warn mb-5">
          <Icon className="banner-icon" name="alert" />
          <div><div className="banner-title">Partial data loaded</div><div>{warning}</div></div>
        </div>
      ) : null}

      <div className="card">
        <div className="card-head">
          <div>
            <h3>{tab === "drafts" ? "Drafts" : "Invoices"}</h3>
            <div className="card-sub">Click a row to open the invoice detail page.</div>
          </div>
          <Badge tone="brand" dot>Live data</Badge>
        </div>
        <div className="card-body flush">
          {busy ? <div className="route-inline-state">Loading invoices…</div> : null}
          {error ? (
            <div className="banner banner-danger">
              <div><div className="banner-title">Could not load invoices</div><div>{error}</div></div>
            </div>
          ) : null}
          {!busy && !error ? (
            visible.length === 0 ? (
              <EmptyState icon="invoice" title="No invoices found">
                No records match the selected filters.
              </EmptyState>
            ) : (
              <>
                <Table
                  columns={[
                    {
                      key: "invoice",
                      header: "Invoice",
                      render: (row) => (
                        <span className="primary">{row.invoiceNumber || "(unnumbered)"}</span>
                      ),
                    },
                    {
                      key: "parent",
                      header: "Parent",
                      render: (row) => {
                        const p = usersById.get(row.parentId);
                        return (
                          <div className="row-meta">
                            <span className="primary">{row.parentName || userName(p) || "(no parent)"}</span>
                            <span className="secondary">{row.parentEmail || p?.email || ""}</span>
                          </div>
                        );
                      },
                    },
                    {
                      key: "students",
                      header: "Students",
                      render: (row) => {
                        const ids = row.studentIds || [];
                        if (ids.length === 0) return <span className="muted">—</span>;
                        const names = ids.slice(0, 2).map((id) => studentName(studentsById.get(id))).filter(Boolean);
                        if (names.length === 0) return <span className="muted">—</span>;
                        return (
                          <span className="text-sm">
                            {names.join(", ")}
                            {ids.length > 2 ? ` +${ids.length - 2}` : ""}
                          </span>
                        );
                      },
                    },
                    {
                      key: "amount",
                      header: "Amount",
                      render: (row) => <span className="text-mono">{formatMoney(invoiceAmount(row))}</span>,
                    },
                    {
                      key: "due",
                      header: "Due",
                      render: (row) => row.dueDateIso ? new Date(row.dueDateIso).toLocaleDateString() : <span className="muted">—</span>,
                    },
                    {
                      key: "status",
                      header: "Status",
                      render: (row) => row.draft
                        ? <Badge tone="neutral" dot>draft</Badge>
                        : <Badge tone={statusTone(row.status)} dot>{row.status || "unpaid"}</Badge>,
                    },
                    {
                      key: "xero",
                      header: "Xero",
                      render: (row) => row.xeroInvoiceId
                        ? <Badge tone="brand">Synced</Badge>
                        : <span className="muted text-sm">—</span>,
                    },
                  ]}
                  getRowKey={(row) => `${tab}-${row.id}`}
                  onRowClick={(row) => navigate(`/invoices/${row.id}${row.draft ? "?draft=1" : ""}`)}
                  rows={pageRows}
                />
                {renderPagination()}
              </>
            )
          ) : null}
        </div>
      </div>

      <CreateInvoiceModal
        open={createOpen}
        mode={createMode}
        onClose={() => setCreateOpen(false)}
        onSuccess={(result) => {
          setCreateOpen(false);
          reload();
          if (result?.invoiceId || result?.draftId) {
            const id = result.invoiceId || result.draftId;
            const isDraft = Boolean(result.draftId);
            toast.success(
              isDraft ? "Draft created" : "Invoice created",
              `ID: ${id}`
            );
            navigate(`/invoices/${id}${isDraft ? "?draft=1" : ""}`);
          } else {
            toast.success(createMode === "draft" ? "Draft created" : "Invoice created");
          }
        }}
      />
    </>
  );
}
