import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listClasses } from "../backend/classesApi";
import { listEnrolments } from "../backend/enrolmentsApi";
import { listInvoiceDrafts, listInvoices } from "../backend/invoicesApi";
import { incomeReport } from "../backend/reportsApi";
import { listRecentAuditLogs } from "../backend/auditApi";
import { listTerms } from "../backend/settingsApi";
import Badge from "../components/Badge";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function startOfMonthIsoDate() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function endOfTodayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function dateAtTime(dateText, timeText) {
  return new Date(`${dateText}T${timeText}`);
}

function incomePayload() {
  const fromDate = startOfMonthIsoDate();
  const toDate = endOfTodayIsoDate();
  return {
    fromDate: dateAtTime(fromDate, "00:00:00").toISOString(),
    toDate: dateAtTime(toDate, "23:59:59").toISOString(),
    basis: "paid",
    status: "all",
    groupBy: "day",
  };
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
    revenue: null,
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
      incomeReport(incomePayload()),
      listEnrolments({ archived: false }),
      listInvoices(),
      listInvoiceDrafts(),
      listClasses(),
      listTerms(),
      listRecentAuditLogs(5),
    ]).then(([revenueR, enrolmentsR, invoicesR, draftsR, classesR, termsR, auditR]) => {
      if (cancelled) return;

      setData({
        revenue: revenueR.status === "fulfilled" ? revenueR.value : null,
        enrolments: enrolmentsR.status === "fulfilled" ? enrolmentsR.value : [],
        invoices: invoicesR.status === "fulfilled" ? invoicesR.value : [],
        drafts: draftsR.status === "fulfilled" ? draftsR.value : [],
        classes: classesR.status === "fulfilled" ? classesR.value : [],
        terms: termsR.status === "fulfilled" ? termsR.value : [],
        auditLogs: auditR.status === "fulfilled" ? auditR.value : [],
      });

      setErrors({
        revenue: revenueR.status === "rejected" ? revenueR.reason?.message || "Revenue report failed." : "",
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
    const pendingEnrolments = data.enrolments.filter(isPendingEnrolment);
    const unpaidInvoices = data.invoices.filter((invoice) => invoice.status === "unpaid");
    const overdueInvoices = data.invoices.filter((invoice) => invoice.status === "overdue");
    const nextDay = nextDayName();
    const upcomingClasses = data.classes
      .filter((row) => String(row.day || "").toLowerCase() === nextDay.toLowerCase())
      .sort((a, b) => String(a.startTime || "").localeCompare(String(b.startTime || "")));

    return {
      currentMonthRevenue: Number(data.revenue?.summary?.totalPaid ?? 0),
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
            <Badge tone="brand" dot>Live report</Badge>
          </div>
          <div className="card-body">
            <RevenueTrend report={data.revenue} busy={busy} error={errors.revenue} />
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
