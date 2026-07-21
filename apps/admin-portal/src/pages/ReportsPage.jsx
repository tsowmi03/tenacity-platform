import React, { useMemo, useState } from "react";
import {
  attendanceReport,
  classUtilisationReport,
  exportReport,
  exportResultToBlob,
  incomeReport,
  invoiceAgingReport,
  studentEnrolmentReport,
  triggerBlobDownload,
} from "../backend/reportsApi";
import Badge from "../components/Badge";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import Table from "../components/Table";
import { useToast } from "../components/ToastProvider";

const REPORTS = [
  { key: "income",          label: "Income" },
  { key: "invoiceAging",    label: "Invoice aging" },
  { key: "attendance",      label: "Attendance" },
  { key: "studentEnrolment", label: "Student enrolment" },
  { key: "classUtilisation", label: "Class utilisation" },
];

const EXPORTABLE = new Set(["income", "invoiceAging", "attendance", "studentEnrolment"]);

function todayIso()       { return new Date().toISOString().slice(0, 10); }
function startOfMonthIso() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function isoToDateInput(iso) {
  return iso ? new Date(iso).toISOString().slice(0, 10) : "";
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Number(value || 0));
}
function formatPct(value) {
  if (value === null || value === undefined) return "—";
  return `${(Number(value) * 100).toFixed(1)}%`;
}
function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function fmtCount(n) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat().format(Number(n));
}

function buildFileName(reportType, format) {
  return `${reportType}-${todayIso()}.${format === "xlsx" ? "xlsx" : format}`;
}

function FilterCard({ children, onGenerate, busy, canGenerate = true }) {
  return (
    <div className="card mb-5">
      <div className="card-head">
        <h3>Filters</h3>
      </div>
      <div className="card-body">
        <div className="grid gap-4">{children}</div>
        <div className="row gap-2 mt-4" style={{ justifyContent: "flex-end" }}>
          <Button
            disabled={busy || !canGenerate}
            loading={busy}
            onClick={onGenerate}
            variant="primary"
          >
            Generate report
          </Button>
        </div>
      </div>
    </div>
  );
}

function ExportBar({ reportType, exportPayload, lastResult, exporting, onExport }) {
  if (!EXPORTABLE.has(reportType) || !lastResult) return null;
  return (
    <div className="row gap-2" style={{ alignItems: "center" }}>
      <span className="muted text-sm">Export</span>
      {["csv", "xlsx", "pdf"].map((fmt) => (
        <Button
          key={fmt}
          disabled={exporting !== null}
          loading={exporting === fmt}
          onClick={() => onExport(fmt, exportPayload)}
          size="sm"
          variant="secondary"
        >
          {fmt.toUpperCase()}
        </Button>
      ))}
    </div>
  );
}

// ── Income report ───────────────────────────────────────────────────────────

function IncomeReport({ runExport, exporting }) {
  const [fromDate, setFromDate] = useState(startOfMonthIso());
  const [toDate,   setToDate]   = useState(todayIso());
  const [basis,    setBasis]    = useState("created");
  const [status,   setStatus]   = useState("all");
  const [groupBy,  setGroupBy]  = useState("month");
  const [report,   setReport]   = useState(null);
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState("");
  const toast = useToast();

  function buildPayload() {
    return {
      fromDate: new Date(`${fromDate}T00:00:00`).toISOString(),
      toDate:   new Date(`${toDate}T23:59:59`).toISOString(),
      basis,
      status,
      groupBy,
    };
  }

  async function generate() {
    if (!fromDate || !toDate || fromDate > toDate) {
      setError("From date must be before or equal to To date.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const r = await incomeReport(buildPayload());
      setReport(r);
    } catch (err) {
      setError(err?.message || "Income report failed.");
      toast.error("Report failed", err?.message || "");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <FilterCard busy={busy} canGenerate={Boolean(fromDate && toDate)} onGenerate={generate}>
        <div className="grid grid-3" style={{ gap: "var(--s-3)" }}>
          <div className="field">
            <span className="label">From date <span className="req">*</span></span>
            <input className="input" disabled={busy} type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="field">
            <span className="label">To date <span className="req">*</span></span>
            <input className="input" disabled={busy} type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <div className="field">
            <span className="label">Basis</span>
            <select className="select" disabled={busy} value={basis} onChange={(e) => setBasis(e.target.value)}>
              <option value="created">Created date</option>
              <option value="due">Due date</option>
              <option value="paid">Paid date</option>
            </select>
          </div>
          <div className="field">
            <span className="label">Status</span>
            <select className="select" disabled={busy} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All</option>
              <option value="unpaid">Unpaid</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
          <div className="field">
            <span className="label">Group by</span>
            <select className="select" disabled={busy} value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
              <option value="term">Term</option>
              <option value="parent">Parent</option>
              <option value="student">Student</option>
            </select>
          </div>
        </div>
      </FilterCard>

      {error ? (
        <div className="banner banner-danger mb-5">
          <div><div className="banner-title">Could not generate</div><div>{error}</div></div>
        </div>
      ) : null}

      {report ? (
        <>
          <section className="grid grid-4 mb-5">
            <StatCard icon="invoice" label="Invoiced"      value={formatMoney(report.summary?.totalInvoiced)} foot={`${fmtCount(report.summary?.invoiceCount)} invoices`} />
            <StatCard icon="people"  label="Paid"          value={formatMoney(report.summary?.totalPaid)}    foot="Marked paid" />
            <StatCard icon="alert"   label="Unpaid"        value={formatMoney(report.summary?.totalUnpaid)}  foot="Outstanding" />
            <StatCard icon="alert"   label="Overdue"       value={formatMoney(report.summary?.totalOverdue)} foot="Past due" />
          </section>

          <div className="card">
            <div className="card-head">
              <div>
                <h3>Rows grouped by {report.filters?.groupBy}</h3>
                <div className="card-sub">Generated {formatDate(report.generatedAt)} — basis: {report.filters?.basis}</div>
              </div>
              <ExportBar reportType="income" exportPayload={buildPayload()} lastResult={report} exporting={exporting} onExport={runExport} />
            </div>
            <div className="card-body flush">
              {(report.rows || []).length === 0 ? (
                <EmptyState icon="invoice" title="No data">No invoices match the filters.</EmptyState>
              ) : (
                <Table
                  columns={[
                    { key: "key",         header: "Group",      render: (r) => <span className="text-mono">{r.key}</span> },
                    { key: "count",       header: "Invoices",   render: (r) => fmtCount(r.invoiceCount) },
                    { key: "invoiced",    header: "Invoiced",   render: (r) => formatMoney(r.totalInvoiced) },
                    { key: "paid",        header: "Paid",       render: (r) => formatMoney(r.totalPaid) },
                    { key: "unpaid",      header: "Unpaid",     render: (r) => formatMoney(r.totalUnpaid) },
                    { key: "overdue",     header: "Overdue",    render: (r) => formatMoney(r.totalOverdue) },
                    { key: "avg",         header: "Average",    render: (r) => formatMoney(r.averageInvoice) },
                  ]}
                  getRowKey={(r, i) => `${r.key}-${i}`}
                  rows={report.rows}
                />
              )}
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

// ── Invoice aging report ────────────────────────────────────────────────────

function InvoiceAgingReport({ runExport, exporting }) {
  const [asOfDate, setAsOfDate] = useState(todayIso());
  const [report,   setReport]   = useState(null);
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState("");
  const toast = useToast();

  function buildPayload() {
    return { asOfDate: new Date(`${asOfDate}T23:59:59`).toISOString() };
  }

  async function generate() {
    setError("");
    setBusy(true);
    try {
      const r = await invoiceAgingReport(buildPayload());
      setReport(r);
    } catch (err) {
      setError(err?.message || "Invoice aging report failed.");
      toast.error("Report failed", err?.message || "");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <FilterCard busy={busy} onGenerate={generate}>
        <div className="grid grid-2" style={{ gap: "var(--s-3)" }}>
          <div className="field">
            <span className="label">As of date</span>
            <input className="input" disabled={busy} type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
          </div>
        </div>
      </FilterCard>

      {error ? (
        <div className="banner banner-danger mb-5">
          <div><div className="banner-title">Could not generate</div><div>{error}</div></div>
        </div>
      ) : null}

      {report ? (
        <>
          <section className="grid grid-4 mb-5">
            <StatCard icon="invoice" label="Outstanding invoices" value={fmtCount(report.summary?.invoiceCount)}   foot={`As of ${formatDate(report.filters?.asOfDate)}`} />
            <StatCard icon="alert"   label="Total outstanding"     value={formatMoney(report.summary?.totalOutstanding)} foot="Sum of unpaid + overdue" />
            <StatCard icon="alert"   label="Missing Xero ID"        value={fmtCount(report.summary?.missingXeroId)}    foot="Not synced to Xero" />
            <StatCard icon="alert"   label="Stripe but unpaid"      value={fmtCount(report.summary?.stripeIntentButUnpaid)} foot="Possible reconciliation gaps" />
          </section>

          <div className="card mb-5">
            <div className="card-head">
              <h3>Aging buckets</h3>
              <ExportBar reportType="invoiceAging" exportPayload={buildPayload()} lastResult={report} exporting={exporting} onExport={runExport} />
            </div>
            <div className="card-body flush">
              {(report.buckets || []).length === 0 ? (
                <EmptyState icon="invoice" title="No outstanding invoices" />
              ) : (
                <Table
                  columns={[
                    { key: "bucket",  header: "Bucket",  render: (r) => r.bucket || r.label || r.key },
                    { key: "count",   header: "Invoices", render: (r) => fmtCount(r.count) },
                    { key: "balance", header: "Balance",  render: (r) => formatMoney(r.balance) },
                  ]}
                  getRowKey={(r, i) => `${r.bucket || r.key || i}`}
                  rows={report.buckets}
                />
              )}
            </div>
          </div>

          <div className="card mb-5">
            <div className="card-head">
              <h3>Parent balances</h3>
              <Badge tone="neutral">Top {Math.min((report.parentBalances || []).length, 25)}</Badge>
            </div>
            <div className="card-body flush">
              {(report.parentBalances || []).length === 0 ? (
                <EmptyState icon="people" title="No parent balances" />
              ) : (
                <Table
                  columns={[
                    { key: "parent",  header: "Parent",   render: (r) => (
                      <div className="row-meta">
                        <span className="primary">{r.parentName || r.parentId}</span>
                        <span className="secondary text-mono">{r.parentId}</span>
                      </div>
                    )},
                    { key: "count",   header: "Invoices", render: (r) => fmtCount(r.invoiceCount) },
                    { key: "balance", header: "Balance",  render: (r) => formatMoney(r.balance) },
                  ]}
                  getRowKey={(r) => r.parentId}
                  rows={(report.parentBalances || []).slice(0, 25)}
                />
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Outstanding invoices</h3>
              <Badge tone="neutral">Top 50 by days overdue</Badge>
            </div>
            <div className="card-body flush">
              {(report.invoices || []).length === 0 ? (
                <EmptyState icon="invoice" title="No outstanding invoices" />
              ) : (
                <Table
                  columns={[
                    { key: "invoiceNumber", header: "Invoice",      render: (r) => r.invoiceNumber || r.invoiceId },
                    { key: "parent",        header: "Parent",       render: (r) => r.parentName || r.parentId },
                    { key: "amount",        header: "Amount",       render: (r) => formatMoney(r.amountDue) },
                    { key: "due",           header: "Due",          render: (r) => formatDate(r.dueDate) },
                    { key: "daysOverdue",   header: "Days overdue", render: (r) => fmtCount(r.daysOverdue) },
                    { key: "status",        header: "Status",       render: (r) => <Badge tone={r.status === "overdue" ? "danger" : "warn"} dot>{r.status}</Badge> },
                  ]}
                  getRowKey={(r) => r.invoiceId || r.id}
                  rows={(report.invoices || []).slice(0, 50)}
                />
              )}
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

// ── Attendance report ───────────────────────────────────────────────────────

function AttendanceReport({ runExport, exporting }) {
  const [fromDate,         setFromDate]         = useState(startOfMonthIso());
  const [toDate,           setToDate]           = useState(todayIso());
  const [groupBy,          setGroupBy]          = useState("class");
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const [report,           setReport]           = useState(null);
  const [busy,             setBusy]             = useState(false);
  const [error,            setError]            = useState("");
  const toast = useToast();

  function buildPayload() {
    return {
      fromDate: new Date(`${fromDate}T00:00:00`).toISOString(),
      toDate:   new Date(`${toDate}T23:59:59`).toISOString(),
      groupBy,
      includeCancelled,
    };
  }

  async function generate() {
    if (!fromDate || !toDate || fromDate > toDate) {
      setError("From date must be before or equal to To date.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const r = await attendanceReport(buildPayload());
      setReport(r);
    } catch (err) {
      setError(err?.message || "Attendance report failed.");
      toast.error("Report failed", err?.message || "");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <FilterCard busy={busy} canGenerate={Boolean(fromDate && toDate)} onGenerate={generate}>
        <div className="grid grid-3" style={{ gap: "var(--s-3)" }}>
          <div className="field">
            <span className="label">From date <span className="req">*</span></span>
            <input className="input" disabled={busy} type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="field">
            <span className="label">To date <span className="req">*</span></span>
            <input className="input" disabled={busy} type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <div className="field">
            <span className="label">Group by</span>
            <select className="select" disabled={busy} value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="class">Class</option>
              <option value="student">Student</option>
              <option value="tutor">Tutor</option>
            </select>
          </div>
          <div className="field">
            <label className="checkbox">
              <input checked={includeCancelled} disabled={busy} type="checkbox" onChange={(e) => setIncludeCancelled(e.target.checked)} />
              <span>Include cancelled sessions</span>
            </label>
          </div>
        </div>
      </FilterCard>

      {error ? (
        <div className="banner banner-danger mb-5">
          <div><div className="banner-title">Could not generate</div><div>{error}</div></div>
        </div>
      ) : null}

      {report ? (
        <>
          <section className="grid grid-4 mb-5">
            <StatCard icon="attendance" label="Scheduled"          value={fmtCount(report.summary?.sessionsScheduled)} foot="Sessions" />
            <StatCard icon="attendance" label="Held"               value={fmtCount(report.summary?.sessionsHeld)}      foot="Not cancelled" />
            <StatCard icon="alert"      label="Cancelled"          value={fmtCount(report.summary?.sessionsCancelled)} foot="Sessions" />
            <StatCard icon="people"     label="Total attendances"  value={fmtCount(report.summary?.totalStudentAttendances)} foot="Student × session" />
          </section>

          <div className="card">
            <div className="card-head">
              <div>
                <h3>Rows grouped by {report.filters?.groupBy}</h3>
                <div className="card-sub">Generated {formatDate(report.generatedAt)}</div>
              </div>
              <ExportBar reportType="attendance" exportPayload={buildPayload()} lastResult={report} exporting={exporting} onExport={runExport} />
            </div>
            <div className="card-body flush">
              {(report.rows || []).length === 0 ? (
                <EmptyState icon="attendance" title="No data" />
              ) : (
                <Table
                  columns={[
                    { key: "key",        header: "Group",      render: (r) => <span className="text-mono">{r.key}</span> },
                    { key: "scheduled",  header: "Scheduled",  render: (r) => fmtCount(r.sessionsScheduled) },
                    { key: "held",       header: "Held",       render: (r) => fmtCount(r.sessionsHeld) },
                    { key: "cancelled",  header: "Cancelled",  render: (r) => fmtCount(r.sessionsCancelled) },
                    { key: "attendances", header: "Attendances", render: (r) => fmtCount(r.totalStudentAttendances) },
                    { key: "extra",      header: "Notes", render: (r) => {
                      const parts = [];
                      if (r.utilisationRate !== undefined && r.utilisationRate !== null) parts.push(`Util: ${formatPct(r.utilisationRate)}`);
                      if (r.classCount !== undefined) parts.push(`${r.classCount} classes`);
                      if (r.studentsNotPresent !== undefined) parts.push(`${r.studentsNotPresent} absent`);
                      return parts.join(" · ") || "—";
                    } },
                  ]}
                  getRowKey={(r, i) => `${r.key}-${i}`}
                  rows={report.rows}
                />
              )}
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

// ── Student enrolment report ────────────────────────────────────────────────

function StudentEnrolmentReport({ runExport, exporting }) {
  const [report, setReport] = useState(null);
  const [busy,   setBusy]   = useState(false);
  const [error,  setError]  = useState("");
  const toast = useToast();

  async function generate() {
    setError("");
    setBusy(true);
    try {
      const r = await studentEnrolmentReport();
      setReport(r);
    } catch (err) {
      setError(err?.message || "Student enrolment report failed.");
      toast.error("Report failed", err?.message || "");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <FilterCard busy={busy} onGenerate={generate}>
        <div className="muted text-sm">This report has no filters. It shows current enrolment composition and flags linkage issues.</div>
      </FilterCard>

      {error ? (
        <div className="banner banner-danger mb-5">
          <div><div className="banner-title">Could not generate</div><div>{error}</div></div>
        </div>
      ) : null}

      {report ? (
        <>
          <section className="grid grid-4 mb-5">
            <StatCard icon="people" label="Total students"        value={fmtCount(report.summary?.totalStudents)}        foot="Active records" />
            <StatCard icon="people" label="With active class"     value={fmtCount(report.summary?.studentsWithActiveClass)} foot="In a class roster" />
            <StatCard icon="alert"  label="Without class"         value={fmtCount(report.summary?.studentsWithNoActiveClass)} foot="No class assignment" />
            <StatCard icon="alert"  label="Linkage issues"        value={fmtCount(report.summary?.linkageIssueCount)}    foot="Inconsistent links" />
          </section>

          <div className="card mb-5">
            <div className="card-head">
              <h3>Students by grade</h3>
              <ExportBar reportType="studentEnrolment" exportPayload={undefined} lastResult={report} exporting={exporting} onExport={runExport} />
            </div>
            <div className="card-body flush">
              {(report.byGrade || []).length === 0 ? (
                <EmptyState icon="people" title="No students" />
              ) : (
                <Table
                  columns={[
                    { key: "grade", header: "Grade", render: (r) => r.grade || "(unknown)" },
                    { key: "count", header: "Count", render: (r) => fmtCount(r.count) },
                  ]}
                  getRowKey={(r) => r.grade}
                  rows={report.byGrade}
                />
              )}
            </div>
          </div>

          <div className="card mb-5">
            <div className="card-head">
              <h3>Students by subject</h3>
            </div>
            <div className="card-body flush">
              {(report.bySubject || []).length === 0 ? (
                <EmptyState icon="people" title="No subjects" />
              ) : (
                <Table
                  columns={[
                    { key: "subject", header: "Subject", render: (r) => r.subject },
                    { key: "count",   header: "Students", render: (r) => fmtCount(r.count) },
                  ]}
                  getRowKey={(r) => r.subject}
                  rows={report.bySubject}
                />
              )}
            </div>
          </div>

          {report.studentsWithNoClass && report.studentsWithNoClass.length > 0 ? (
            <div className="card mb-5">
              <div className="card-head">
                <h3>Students with no class</h3>
                <Badge tone="warn">{report.studentsWithNoClass.length}</Badge>
              </div>
              <div className="card-body flush">
                <Table
                  columns={[
                    { key: "name",  header: "Student", render: (r) => `${r.firstName || ""} ${r.lastName || ""}`.trim() || r.studentId },
                    { key: "grade", header: "Grade",   render: (r) => r.grade || "—" },
                    { key: "id",    header: "ID",      render: (r) => <span className="text-mono">{r.studentId}</span> },
                  ]}
                  getRowKey={(r) => r.studentId}
                  rows={report.studentsWithNoClass}
                />
              </div>
            </div>
          ) : null}

          {report.linkageIssues && report.linkageIssues.length > 0 ? (
            <div className="card">
              <div className="card-head">
                <h3>Linkage issues</h3>
                <Badge tone="danger">{report.linkageIssues.length}</Badge>
              </div>
              <div className="card-body flush">
                <Table
                  columns={[
                    { key: "type",     header: "Type",    render: (r) => <span className="text-mono">{r.type}</span> },
                    { key: "student",  header: "Student", render: (r) => <span className="text-mono">{r.studentId}</span> },
                    { key: "parent",   header: "Parent",  render: (r) => <span className="text-mono">{r.parentId || "—"}</span> },
                    { key: "details",  header: "Details", render: (r) => <span className="text-sm">{r.details}</span> },
                  ]}
                  getRowKey={(_, i) => i}
                  rows={report.linkageIssues}
                />
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}

// ── Class utilisation report ────────────────────────────────────────────────

function ClassUtilisationReport() {
  const [fromDate, setFromDate] = useState(startOfMonthIso());
  const [toDate,   setToDate]   = useState(todayIso());
  const [report,   setReport]   = useState(null);
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState("");
  const toast = useToast();

  async function generate() {
    if (!fromDate || !toDate || fromDate > toDate) {
      setError("From date must be before or equal to To date.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const r = await classUtilisationReport({
        fromDate: new Date(`${fromDate}T00:00:00`).toISOString(),
        toDate:   new Date(`${toDate}T23:59:59`).toISOString(),
      });
      setReport(r);
    } catch (err) {
      setError(err?.message || "Class utilisation report failed.");
      toast.error("Report failed", err?.message || "");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <FilterCard busy={busy} canGenerate={Boolean(fromDate && toDate)} onGenerate={generate}>
        <div className="grid grid-2" style={{ gap: "var(--s-3)" }}>
          <div className="field">
            <span className="label">From date <span className="req">*</span></span>
            <input className="input" disabled={busy} type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="field">
            <span className="label">To date <span className="req">*</span></span>
            <input className="input" disabled={busy} type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </div>
        <div className="banner banner-info mt-2">
          <Icon className="banner-icon" name="alert" />
          <div>
            <div className="banner-title">No export support</div>
            <div>Class utilisation is built on top of the attendance report. To export, use the Attendance tab with <span className="text-mono">groupBy: class</span>.</div>
          </div>
        </div>
      </FilterCard>

      {error ? (
        <div className="banner banner-danger mb-5">
          <div><div className="banner-title">Could not generate</div><div>{error}</div></div>
        </div>
      ) : null}

      {report ? (
        <>
          <section className="grid grid-4 mb-5">
            <StatCard icon="classes" label="Sessions held"        value={fmtCount(report.summary?.sessionsHeld)}              foot="Across all classes" />
            <StatCard icon="classes" label="Avg utilisation"      value={formatPct(report.summary?.averageUtilisationRate)}   foot="Attendance / capacity" />
            <StatCard icon="people"  label="Classes ≥ 80%"        value={fmtCount(report.summary?.classesAbove80Percent)}      foot="High utilisation" />
            <StatCard icon="alert"   label="Classes < 50%"        value={fmtCount(report.summary?.classesBelow50Percent)}      foot="Underused" />
          </section>

          <div className="card">
            <div className="card-head">
              <h3>Per-class utilisation</h3>
              <div className="card-sub">Generated {formatDate(report.generatedAt)}</div>
            </div>
            <div className="card-body flush">
              {(report.rows || []).length === 0 ? (
                <EmptyState icon="classes" title="No data" />
              ) : (
                <Table
                  columns={[
                    { key: "key",         header: "Class",       render: (r) => <span className="text-mono">{r.key}</span> },
                    { key: "held",        header: "Held",        render: (r) => fmtCount(r.sessionsHeld) },
                    { key: "scheduled",   header: "Scheduled",   render: (r) => fmtCount(r.sessionsScheduled) },
                    { key: "attendances", header: "Attendances", render: (r) => fmtCount(r.totalStudentAttendances) },
                    { key: "average",     header: "Avg per session", render: (r) => r.averageAttendance !== undefined && r.averageAttendance !== null ? r.averageAttendance.toFixed(2) : "—" },
                    { key: "util",        header: "Utilisation", render: (r) => formatPct(r.utilisationRate) },
                  ]}
                  getRowKey={(r, i) => `${r.key}-${i}`}
                  rows={report.rows}
                />
              )}
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

// ── Page shell ──────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [tab,       setTab]       = useState("income");
  const [exporting, setExporting] = useState(null); // format being exported, or null
  const toast = useToast();

  async function runExport(format, reportPayload) {
    if (!EXPORTABLE.has(tab)) return;
    setExporting(format);
    try {
      const fileName = buildFileName(tab, format);
      const result = await exportReport({
        reportType: tab,
        format,
        report: reportPayload,
        fileName,
      });
      const blob = exportResultToBlob(result);
      triggerBlobDownload(blob, result.fileName || fileName);
      toast.success("Export ready", `${result.fileName || fileName} (${result.rowCount ?? "?"} rows)`);
    } catch (err) {
      toast.error("Export failed", err?.message || "");
    } finally {
      setExporting(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Generated from backend callables. Date filters are inclusive; exports run server-side."
        crumbs={[{ label: "Overview", href: "/" }, { label: "Reports" }]}
      />

      <div className="tabs">
        {REPORTS.map((r) => (
          <button
            className={`tab ${tab === r.key ? "active" : ""}`}
            key={r.key}
            onClick={() => setTab(r.key)}
            type="button"
          >
            {r.label}
          </button>
        ))}
      </div>

      {tab === "income"           ? <IncomeReport           runExport={runExport} exporting={exporting} /> : null}
      {tab === "invoiceAging"     ? <InvoiceAgingReport     runExport={runExport} exporting={exporting} /> : null}
      {tab === "attendance"       ? <AttendanceReport       runExport={runExport} exporting={exporting} /> : null}
      {tab === "studentEnrolment" ? <StudentEnrolmentReport runExport={runExport} exporting={exporting} /> : null}
      {tab === "classUtilisation" ? <ClassUtilisationReport /> : null}
    </>
  );
}
