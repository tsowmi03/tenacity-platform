import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listClasses } from "../backend/classesApi";
import { listEnrolments } from "../backend/enrolmentsApi";
import { listInvoiceDrafts, listInvoices } from "../backend/invoicesApi";
import { listRecentAuditLogs } from "../backend/auditApi";
import { listTerms } from "../backend/termsApi";
import Badge from "../components/Badge";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function localIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfMonthIsoDate(now = new Date()) {
  const d = dateFromValue(now) || new Date();
  return localIsoDate(new Date(d.getFullYear(), d.getMonth(), 1));
}

function endOfTodayIsoDate(now = new Date()) {
  return localIsoDate(dateFromValue(now) || new Date());
}

function nextDayName() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return DAY_NAMES[d.getDay()];
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatCount(value) {
  return new Intl.NumberFormat("en-AU").format(Number(value || 0));
}

function formatDateTime(iso) {
  if (!iso) return "No timestamp";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "No timestamp";
  return d.toLocaleString();
}

function className(row) {
  return row?.type || row?.name || "Unnamed class";
}

function classTime(row) {
  if (!row?.startTime) return "No start time";
  return row.endTime ? `${row.startTime}-${row.endTime}` : row.startTime;
}

function invoiceAmount(inv) {
  return Number(inv?.amountDue ?? inv?.amountDueComputed ?? inv?.total ?? inv?.totalAmount ?? 0);
}

function invoiceLineItemsTotal(invoice) {
  const lines = Array.isArray(invoice?.lineItems) ? invoice.lineItems : [];
  return Math.round(lines.reduce((sum, item) => sum + Number(item?.lineTotal || 0), 0) * 100) / 100;
}

function invoiceOriginalTotal(invoice) {
  const lineTotal = invoiceLineItemsTotal(invoice);
  if (Number.isFinite(lineTotal) && Math.abs(lineTotal) >= 0.01) return lineTotal;
  if (typeof invoice?.amountDueComputed === "number") return invoice.amountDueComputed;
  if (typeof invoice?.totalAmount === "number") return invoice.totalAmount;
  return Number(invoice?.amountDue || 0);
}

function dateFromValue(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function localDayKey(date) {
  return localIsoDate(date);
}

function buildCurrentMonthRevenueReport(invoices, now = new Date()) {
  const fromDate = startOfMonthIsoDate(now);
  const toDate = endOfTodayIsoDate(now);
  const rowsByDay = new Map();

  invoices.forEach((invoice) => {
    if (invoice?.status !== "paid") return;
    const paidAt = dateFromValue(invoice.paidAtIso || invoice.paidAt);
    if (!paidAt) return;

    const key = localDayKey(paidAt);
    if (key < fromDate || key > toDate) return;

    const amount = invoiceOriginalTotal(invoice);
    const existing = rowsByDay.get(key) || { key, invoiceCount: 0, totalPaid: 0 };
    existing.invoiceCount += 1;
    existing.totalPaid = Math.round((existing.totalPaid + amount) * 100) / 100;
    rowsByDay.set(key, existing);
  });

  const rows = [...rowsByDay.values()].sort((a, b) => a.key.localeCompare(b.key));
  const totalPaid = Math.round(rows.reduce((sum, row) => sum + row.totalPaid, 0) * 100) / 100;

  return {
    reportType: "dashboardRevenue",
    generatedAt: now.toISOString(),
    filters: { fromDate, toDate, basis: "paid", groupBy: "day" },
    summary: { totalPaid },
    rows,
  };
}

function isPendingEnrolment(row) {
  if (row.archived) return false;
  return !["accepted", "deleted", "archived"].includes(String(row.status || "pending").toLowerCase());
}

function auditTitle(log) {
  return log.action || log.event || log.operation || "Admin action";
}

function auditActor(log) {
  return log.actorEmail || log.adminEmail || log.userEmail || log.createdByEmail || log.actorUid || "Unknown admin";
}

function trendRows(report) {
  const rows = Array.isArray(report?.rows) ? report.rows : [];
  return rows.map((row, index) => ({
    key: row.key || row.label || `row-${index}`,
    value: Number(row.totalPaid ?? row.totalInvoiced ?? row.amount ?? 0),
  }));
}

function RevenueTrend({ report, busy, error }) {
  if (busy) return <div className="route-inline-state">Loading revenue trend...</div>;
  if (error) {
    return (
      <div className="banner banner-danger">
        <div>
          <div className="banner-title">Revenue unavailable</div>
          <div>{error}</div>
        </div>
      </div>
    );
  }

  const rows = trendRows(report);
  const max = Math.max(...rows.map((row) => row.value), 0);

  if (!rows.length || max <= 0) {
    return (
      <EmptyState icon="reports" title="No revenue this month">
        Paid invoice data for the current month will appear here.
      </EmptyState>
    );
  }

  return (
    <div className="dashboard-trend" aria-label="Current month revenue trend">
      {rows.map((row) => {
        const height = Math.max(8, Math.round((row.value / max) * 100));
        return (
          <div className="dashboard-trend-col" key={row.key}>
            <div className="dashboard-trend-value">{formatMoney(row.value)}</div>
            <div className="dashboard-trend-track">
              <div className="dashboard-trend-bar" style={{ height: `${height}%` }} />
            </div>
            <div className="dashboard-trend-label">{String(row.key).slice(5) || row.key}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();

  const [data, setData] = useState({
    enrolments: [],
    invoices: [],
    drafts: [],
    classes: [],
    terms: [],
    auditLogs: [],
  });
  const [busy, setBusy] = useState(true);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setErrors({});

    Promise.allSettled([
      listEnrolments({ archived: false }),
      listInvoices(),
      listInvoiceDrafts(),
      listClasses(),
      listTerms(),
      listRecentAuditLogs(5),
    ]).then(([enrolmentsR, invoicesR, draftsR, classesR, termsR, auditR]) => {
      if (cancelled) return;

      setData({
        enrolments: enrolmentsR.status === "fulfilled" ? enrolmentsR.value : [],
        invoices: invoicesR.status === "fulfilled" ? invoicesR.value : [],
        drafts: draftsR.status === "fulfilled" ? draftsR.value : [],
        classes: classesR.status === "fulfilled" ? classesR.value : [],
        terms: termsR.status === "fulfilled" ? termsR.value : [],
        auditLogs: auditR.status === "fulfilled" ? auditR.value : [],
      });

      setErrors({
        enrolments: enrolmentsR.status === "rejected" ? enrolmentsR.reason?.message || "Enrolments could not be loaded." : "",
        invoices: invoicesR.status === "rejected" ? invoicesR.reason?.message || "Invoices could not be loaded." : "",
        drafts: draftsR.status === "rejected" ? draftsR.reason?.message || "Draft invoices could not be loaded." : "",
        classes: classesR.status === "rejected" ? classesR.reason?.message || "Classes could not be loaded." : "",
        terms: termsR.status === "rejected" ? termsR.reason?.message || "Terms could not be loaded." : "",
        auditLogs: auditR.status === "rejected" ? auditR.reason?.message || "Audit log could not be loaded." : "",
      });
    }).finally(() => {
      if (!cancelled) setBusy(false);
    });

    return () => { cancelled = true; };
  }, []);

  const summary = useMemo(() => {
    const revenueReport = buildCurrentMonthRevenueReport(data.invoices);
    const pendingEnrolments = data.enrolments.filter(isPendingEnrolment);
    const unpaidInvoices = data.invoices.filter((invoice) => invoice.status === "unpaid");
    const overdueInvoices = data.invoices.filter((invoice) => invoice.status === "overdue");
    const nextDay = nextDayName();
    const upcomingClasses = data.classes
      .filter((row) => String(row.day || "").toLowerCase() === nextDay.toLowerCase())
      .sort((a, b) => String(a.startTime || "").localeCompare(String(b.startTime || "")));

    return {
      currentMonthRevenue: Number(revenueReport.summary?.totalPaid ?? 0),
      revenueReport,
      unpaidTotal: unpaidInvoices.reduce((sum, invoice) => sum + invoiceAmount(invoice), 0),
      overdueTotal: overdueInvoices.reduce((sum, invoice) => sum + invoiceAmount(invoice), 0),
      pendingEnrolments,
      draftCount: data.drafts.length,
      nextDay,
      upcomingClasses,
      activeTerm: data.terms.find((term) => term.status === "active") || null,
    };
  }, [data]);

  const warningCount = Object.values(errors).filter(Boolean).length;

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Revenue, pending work, upcoming classes, and recent admin activity."
        actions={
          <div className="row gap-2 wrap">
            <Button onClick={() => navigate("/enrolments")} variant="secondary">Review enrolments</Button>
            <Button iconRight="arrow-right" onClick={() => navigate("/invoices")} variant="primary">Open invoices</Button>
          </div>
        }
      />

      {warningCount ? (
        <div className="banner banner-warn mb-5">
          <Icon className="banner-icon" name="alert" />
          <div>
            <div className="banner-title">Some dashboard data could not be loaded</div>
            <div>{warningCount} source{warningCount === 1 ? "" : "s"} returned an error. Available sections still show live data.</div>
          </div>
        </div>
      ) : null}

      <section className="grid grid-4 mb-6">
        <StatCard icon="reports" label="Month revenue" value={busy ? "..." : formatMoney(summary.currentMonthRevenue)} foot="Paid invoices this month" />
        <StatCard icon="alert" label="Overdue" value={busy ? "..." : formatMoney(summary.overdueTotal)} foot="Past due invoices" />
        <StatCard icon="invoice" label="Unpaid" value={busy ? "..." : formatMoney(summary.unpaidTotal)} foot="Awaiting payment" />
        <StatCard icon="enrol" label="Pending enrolments" value={busy ? "..." : formatCount(summary.pendingEnrolments.length)} foot="Need review" />
      </section>

      <section className="grid grid-2 mb-6">
        <div className="card dashboard-revenue-card">
          <div className="card-head">
            <div>
              <h3>Revenue trend</h3>
              <div className="card-sub">Paid invoice revenue for the current month.</div>
            </div>
            <Badge tone="brand" dot>Live invoices</Badge>
          </div>
          <div className="card-body">
            <RevenueTrend report={summary.revenueReport} busy={busy} error={errors.invoices} />
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3>Pending work</h3>
              <div className="card-sub">Items most likely to need admin action.</div>
            </div>
          </div>
          <div className="card-body dashboard-list">
            <button className="dashboard-action-row" onClick={() => navigate("/enrolments")} type="button">
              <span>
                <strong>{formatCount(summary.pendingEnrolments.length)} pending enrolments</strong>
                <span>Review new enrolment submissions.</span>
              </span>
              <Icon name="chevron-right" size={16} />
            </button>
            <button className="dashboard-action-row" onClick={() => navigate("/invoices")} type="button">
              <span>
                <strong>{formatCount(summary.draftCount)} invoice drafts</strong>
                <span>Open finance queue.</span>
              </span>
              <Icon name="chevron-right" size={16} />
            </button>
            <button className="dashboard-action-row" onClick={() => navigate("/audit")} type="button">
              <span>
                <strong>{formatCount(data.auditLogs.length)} recent audit entries</strong>
                <span>Check recent admin changes.</span>
              </span>
              <Icon name="chevron-right" size={16} />
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-2">
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Tomorrow's classes</h3>
              <div className="card-sub">{summary.nextDay} class schedule.</div>
            </div>
            <Button onClick={() => navigate("/classes")} size="sm" variant="secondary">Open classes</Button>
          </div>
          <div className="card-body dashboard-list">
            {busy ? <div className="route-inline-state">Loading classes...</div> : null}
            {!busy && errors.classes ? (
              <div className="banner banner-danger">
                <div><div className="banner-title">Classes unavailable</div><div>{errors.classes}</div></div>
              </div>
            ) : null}
            {!busy && !errors.classes && summary.upcomingClasses.length === 0 ? (
              <EmptyState icon="classes" title="No classes tomorrow">No class records are scheduled for {summary.nextDay}.</EmptyState>
            ) : null}
            {!busy && !errors.classes ? summary.upcomingClasses.slice(0, 5).map((row) => (
              <button className="dashboard-action-row" key={row.id} onClick={() => navigate(`/classes/${row.id}`)} type="button">
                <span>
                  <strong>{className(row)}</strong>
                  <span>{row.day} · {classTime(row)} · {formatCount(row.enrolledCount)} enrolled</span>
                </span>
                <Icon name="chevron-right" size={16} />
              </button>
            )) : null}
            {summary.activeTerm ? (
              <div className="dashboard-term">
                <Badge tone="success" dot>Current term</Badge>
                <span>{summary.activeTerm.year} Term {summary.activeTerm.termNum}</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3>Recent audit activity</h3>
              <div className="card-sub">Latest admin actions recorded by backend writes.</div>
            </div>
            <Button onClick={() => navigate("/audit")} size="sm" variant="secondary">Open audit log</Button>
          </div>
          <div className="card-body dashboard-list">
            {busy ? <div className="route-inline-state">Loading audit log...</div> : null}
            {!busy && errors.auditLogs ? (
              <div className="banner banner-danger">
                <div><div className="banner-title">Audit log unavailable</div><div>{errors.auditLogs}</div></div>
              </div>
            ) : null}
            {!busy && !errors.auditLogs && data.auditLogs.length === 0 ? (
              <EmptyState icon="settings" title="No recent audit entries">Recent admin actions will appear here.</EmptyState>
            ) : null}
            {!busy && !errors.auditLogs ? data.auditLogs.map((log) => (
              <div className="dashboard-audit-row" key={log.id}>
                <div>
                  <strong>{auditTitle(log)}</strong>
                  <span>{auditActor(log)}</span>
                </div>
                <time>{formatDateTime(log.createdAtIso)}</time>
              </div>
            )) : null}
          </div>
        </div>
      </section>
    </>
  );
}
