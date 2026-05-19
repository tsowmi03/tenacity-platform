import React, { useEffect, useMemo, useState } from "react";
import { createTermsForYear, listTerms, updateTerm } from "../backend/termsApi";
import Badge from "../components/Badge";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import Modal from "../components/Modal";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import Table from "../components/Table";
import { useToast } from "../components/ToastProvider";

const STATUSES = ["upcoming", "active", "completed"];
const TERM_TIME_ZONE = "Australia/Sydney";

function nextYear() {
  return String(new Date().getFullYear() + 1);
}

function blankRows() {
  return [1, 2, 3, 4].map((termNum) => ({
    termNum,
    weeksNum: 10,
    startDate: "",
    endDate: "",
    status: "upcoming",
  }));
}

function dateInputValue(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: TERM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function formatDate(iso) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-AU", {
    timeZone: TERM_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function termLabel(term) {
  return `${term.year} Term ${term.termNum}`;
}

function statusTone(status) {
  if (status === "active") return "success";
  if (status === "upcoming") return "brand";
  if (status === "completed") return "neutral";
  return "warn";
}

function sortTerms(terms) {
  return [...terms].sort((a, b) => {
    const yearDiff = Number(b.year || 0) - Number(a.year || 0);
    if (yearDiff !== 0) return yearDiff;
    return Number(a.termNum || 0) - Number(b.termNum || 0);
  });
}

function countByStatus(terms, status) {
  return terms.filter((term) => term.status === status).length;
}

function CreateTermsModal({ open, busy, onClose, onSubmit }) {
  const [year, setYear] = useState(nextYear());
  const [terms, setTerms] = useState(blankRows);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setYear(nextYear());
    setTerms(blankRows());
    setError("");
  }, [open]);

  function updateRow(index, field, value) {
    setTerms((rows) =>
      rows.map((row, rowIndex) =>
        rowIndex === index
          ? { ...row, [field]: field === "weeksNum" ? Number(value) : value }
          : row
      )
    );
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    const selected = terms.map((term) => ({
      ...term,
      termNum: Number(term.termNum),
      weeksNum: Number(term.weeksNum),
    }));
    const missing = selected.some((term) => !term.startDate || !term.endDate || !term.weeksNum);
    if (!/^\d{4}$/.test(String(year))) {
      setError("Enter a four-digit year.");
      return;
    }
    if (missing) {
      setError("Enter start date, end date, and weeks for every term.");
      return;
    }
    await onSubmit(String(year), selected);
  }

  return (
    <Modal
      open={open}
      title="Add terms for year"
      subtitle="Create the four teaching terms used by attendance generation and reporting."
      size="xl"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button disabled={busy} onClick={onClose} variant="secondary">Cancel</Button>
          <Button loading={busy} form="create-terms-form" type="submit" variant="primary">Create terms</Button>
        </>
      }
    >
      <form id="create-terms-form" onSubmit={submit}>
        <div className="field-section">
          <label className="field-readonly">
            <span className="label">Year</span>
            <input
              className="input"
              disabled={busy}
              inputMode="numeric"
              maxLength={4}
              onChange={(event) => setYear(event.target.value)}
              value={year}
            />
          </label>

          <div className="banner banner-info">
            <Icon className="banner-icon" name="info" />
            <div>
              <div className="banner-title">Annual setup</div>
              <div>These terms are created as upcoming by default. Make one active only when the current operational term should change.</div>
            </div>
          </div>

          <div className="terms-form-grid terms-form-grid-head" aria-hidden="true">
            <span>Term</span>
            <span>Start date</span>
            <span>End date</span>
            <span>Weeks</span>
            <span>Status</span>
          </div>
          {terms.map((term, index) => (
            <div className="terms-form-grid" key={term.termNum}>
              <div className="terms-form-label">Term {term.termNum}</div>
              <input
                aria-label={`Term ${term.termNum} start date`}
                className="input"
                disabled={busy}
                onChange={(event) => updateRow(index, "startDate", event.target.value)}
                type="date"
                value={term.startDate}
              />
              <input
                aria-label={`Term ${term.termNum} end date`}
                className="input"
                disabled={busy}
                onChange={(event) => updateRow(index, "endDate", event.target.value)}
                type="date"
                value={term.endDate}
              />
              <input
                aria-label={`Term ${term.termNum} weeks`}
                className="input"
                disabled={busy}
                min={1}
                max={20}
                onChange={(event) => updateRow(index, "weeksNum", event.target.value)}
                type="number"
                value={term.weeksNum}
              />
              <select
                aria-label={`Term ${term.termNum} status`}
                className="select"
                disabled={busy}
                onChange={(event) => updateRow(index, "status", event.target.value)}
                value={term.status}
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
          ))}

          {error ? (
            <div className="banner banner-danger">
              <div><div className="banner-title">Check the term details</div><div>{error}</div></div>
            </div>
          ) : null}
        </div>
      </form>
    </Modal>
  );
}

function EditTermModal({ term, busy, onClose, onSubmit }) {
  const [form, setForm] = useState({
    startDate: "",
    endDate: "",
    weeksNum: 10,
    status: "upcoming",
  });
  const [error, setError] = useState("");

  useEffect(() => {
    if (!term) return;
    setForm({
      startDate: dateInputValue(term.startDateIso),
      endDate: dateInputValue(term.endDateIso),
      weeksNum: Number(term.weeksNum || 10),
      status: term.status || "upcoming",
    });
    setError("");
  }, [term]);

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!form.startDate || !form.endDate || !form.weeksNum) {
      setError("Enter start date, end date, and weeks.");
      return;
    }
    await onSubmit(term.id, {
      startDate: form.startDate,
      endDate: form.endDate,
      weeksNum: Number(form.weeksNum),
      status: form.status,
    });
  }

  return (
    <Modal
      open={Boolean(term)}
      title={term ? `Edit ${termLabel(term)}` : "Edit term"}
      subtitle="Update the fields that affect attendance generation and reporting periods."
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button disabled={busy} onClick={onClose} variant="secondary">Cancel</Button>
          <Button loading={busy} form="edit-term-form" type="submit" variant="primary">Save changes</Button>
        </>
      }
    >
      <form id="edit-term-form" onSubmit={submit}>
        <div className="field-section">
          <div className="banner banner-warn">
            <Icon className="banner-icon" name="alert" />
            <div>
              <div className="banner-title">Term changes affect generated data</div>
              <div>Changing dates, weeks, or status may affect attendance generation, active term summaries, and reporting filters.</div>
            </div>
          </div>

          <div className="grid grid-2">
            <label className="field-readonly">
              <span className="label">Start date</span>
              <input
                className="input"
                disabled={busy}
                onChange={(event) => setForm((prev) => ({ ...prev, startDate: event.target.value }))}
                type="date"
                value={form.startDate}
              />
            </label>
            <label className="field-readonly">
              <span className="label">End date</span>
              <input
                className="input"
                disabled={busy}
                onChange={(event) => setForm((prev) => ({ ...prev, endDate: event.target.value }))}
                type="date"
                value={form.endDate}
              />
            </label>
            <label className="field-readonly">
              <span className="label">Weeks</span>
              <input
                className="input"
                disabled={busy}
                min={1}
                max={20}
                onChange={(event) => setForm((prev) => ({ ...prev, weeksNum: Number(event.target.value) }))}
                type="number"
                value={form.weeksNum}
              />
            </label>
            <label className="field-readonly">
              <span className="label">Status</span>
              <select
                className="select"
                disabled={busy}
                onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
                value={form.status}
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </label>
          </div>

          {error ? (
            <div className="banner banner-danger">
              <div><div className="banner-title">Check the term details</div><div>{error}</div></div>
            </div>
          ) : null}
        </div>
      </form>
    </Modal>
  );
}

export default function TermsPage() {
  const toast = useToast();
  const [terms, setTerms] = useState([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loadKey, setLoadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError("");
    listTerms()
      .then((rows) => {
        if (!cancelled) setTerms(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || "Failed to load terms.");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadKey]);

  const sortedTerms = useMemo(() => sortTerms(terms), [terms]);
  const counts = useMemo(() => ({
    total: terms.length,
    active: countByStatus(terms, "active"),
    upcoming: countByStatus(terms, "upcoming"),
    completed: countByStatus(terms, "completed"),
  }), [terms]);

  async function handleCreate(year, rows) {
    setSaving(true);
    try {
      const result = await createTermsForYear(year, rows);
      setCreateOpen(false);
      setLoadKey((key) => key + 1);
      toast.success("Terms created", `${result?.terms?.length || rows.length} terms created for ${year}.`);
    } catch (err) {
      toast.error("Could not create terms", err?.message || "The backend rejected the term setup.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(termId, updates) {
    setSaving(true);
    try {
      await updateTerm(termId, updates);
      setEditing(null);
      setLoadKey((key) => key + 1);
      toast.success("Term updated", "Term details have been saved.");
    } catch (err) {
      toast.error("Could not update term", err?.message || "The backend rejected the term update.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Terms"
        subtitle="Create and maintain teaching terms used by attendance generation and reports."
        crumbs={[{ label: "Overview", href: "/" }, { label: "Terms" }]}
        actions={<Button onClick={() => setCreateOpen(true)} variant="primary">Add terms for year</Button>}
      />

      <section className="grid grid-4 mb-6">
        <StatCard icon="classes" label="Total terms" value={counts.total} foot="All years" />
        <StatCard icon="check-circle" label="Active" value={counts.active} foot="Current term" />
        <StatCard icon="attendance" label="Upcoming" value={counts.upcoming} foot="Future setup" />
        <StatCard icon="reports" label="Completed" value={counts.completed} foot="Past terms" />
      </section>

      <div className="card">
        <div className="card-head">
          <div>
            <h3>Academic terms</h3>
            <div className="card-sub">Grouped by year. Click a row to edit dates, weeks, or status.</div>
          </div>
          <Badge tone="brand" dot>Live data</Badge>
        </div>
        <div className="card-body flush">
          {busy ? <div className="route-inline-state">Loading terms...</div> : null}
          {error ? (
            <div className="banner banner-danger">
              <div><div className="banner-title">Could not load terms</div><div>{error}</div></div>
            </div>
          ) : null}
          {!busy && !error ? (
            sortedTerms.length === 0 ? (
              <EmptyState icon="classes" title="No terms yet">
                Add the next teaching year before attendance generation or term-based reports need it.
              </EmptyState>
            ) : (
              <Table
                columns={[
                  {
                    key: "term",
                    header: "Term",
                    render: (term) => <strong>{termLabel(term)}</strong>,
                  },
                  {
                    key: "dates",
                    header: "Dates",
                    render: (term) => `${formatDate(term.startDateIso)} - ${formatDate(term.endDateIso)}`,
                  },
                  {
                    key: "weeks",
                    header: "Weeks",
                    render: (term) => term.weeksNum ?? "-",
                  },
                  {
                    key: "status",
                    header: "Status",
                    render: (term) => <Badge tone={statusTone(term.status)} dot>{term.status || "unknown"}</Badge>,
                  },
                ]}
                getGroupKey={(term) => term.year || "Unknown year"}
                getRowKey={(term) => term.id}
                onRowClick={(term) => setEditing(term)}
                rows={sortedTerms}
              />
            )
          ) : null}
        </div>
      </div>

      <CreateTermsModal
        busy={saving}
        open={createOpen}
        onClose={() => !saving && setCreateOpen(false)}
        onSubmit={handleCreate}
      />
      <EditTermModal
        busy={saving}
        term={editing}
        onClose={() => !saving && setEditing(null)}
        onSubmit={handleUpdate}
      />
    </>
  );
}
