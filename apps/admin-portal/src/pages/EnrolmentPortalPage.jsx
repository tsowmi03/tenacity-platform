import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../AuthProvider";
import { archiveEnrolment, deleteEnrolment, listEnrolments } from "../backend/enrolmentsApi";
import {
  REFERRAL_SOURCE_OPTIONS,
  referralSourceLabel,
} from "../backend/referralSources";
import Badge from "../components/Badge";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import Modal from "../components/Modal";
import PageHeader from "../components/PageHeader";
import Table from "../components/Table";
import { useToast } from "../components/ToastProvider";

function SelectAllCheckbox({ allSelected, someSelected, onChange }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = someSelected;
  }, [someSelected]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={allSelected}
      aria-label="Select all"
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

export default function EnrolmentPortalPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user, isAdmin } = useAuth();
  const [searchParams] = useSearchParams();

  const enrolmentId = useMemo(() => {
    return searchParams.get("enrolmentId") || "";
  }, [searchParams]);

  const [listBusy, setListBusy]   = useState(false);
  const [listError, setListError] = useState("");
  const [enrolments, setEnrolments] = useState([]);
  const [listTab, setListTab]     = useState("pending");
  const [search, setSearch]       = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");

  // Batch selection
  const [selected, setSelected]       = useState(new Set());
  const [batchModal, setBatchModal]   = useState(null); // { action, ids, names }
  const [batchBusy, setBatchBusy]     = useState(false);
  const [batchError, setBatchError]   = useState("");

  useEffect(() => {
    const idFromQuery = String(searchParams.get("enrolmentId") || "").trim();
    if (!idFromQuery) return;
    navigate(`/enrolments/${encodeURIComponent(idFromQuery)}`, { replace: true });
  }, [navigate, searchParams]);

  useEffect(() => {
    let cancelled = false;

    async function loadEnrolments() {
      setListError("");

      if (enrolmentId) return;
      if (!user) {
        setListError("You must be signed in to view enrolments.");
        return;
      }
      if (!isAdmin) {
        setListError('Access denied: requires admin role ("role: admin").');
        return;
      }

      setListBusy(true);
      try {
        const rows = await listEnrolments();
        if (!cancelled) setEnrolments(rows);
      } catch (e) {
        console.error(e);
        if (!cancelled) setListError(e?.message || "Failed to load enrolments.");
      } finally {
        if (!cancelled) setListBusy(false);
      }
    }

    loadEnrolments();
    return () => { cancelled = true; };
  }, [enrolmentId, user, isAdmin]);

  // Clear selection when tab or filters change
  useEffect(() => {
    setSelected(new Set());
  }, [listTab, search, sourceFilter, yearFilter]);

  async function reloadEnrolments() {
    setListBusy(true);
    setListError("");
    try {
      const rows = await listEnrolments();
      setEnrolments(rows);
    } catch (e) {
      setListError(e?.message || "Failed to reload enrolments.");
    } finally {
      setListBusy(false);
    }
  }

  const counts = useMemo(() => {
    return enrolments.reduce(
      (acc, enrolment) => {
        const status = visibleStatus(enrolment);
        if (!status) return acc;
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      },
      { pending: 0, accepted: 0, archived: 0 }
    );
  }, [enrolments]);

  const yearOptions = useMemo(() => {
    return Array.from(
      new Set(enrolments.map((e) => String(e.studentYear || "").trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [enrolments]);

  const visibleEnrolments = useMemo(() => {
    const queryText = search.trim().toLowerCase();
    return enrolments.filter((enrolment) => {
      const status = visibleStatus(enrolment);
      if (!status) return false;
      if (listTab !== "all" && status !== listTab) return false;
      if (yearFilter !== "all" && String(enrolment.studentYear || "") !== yearFilter) return false;
      if (
        sourceFilter !== "all" &&
        String(enrolment.referralSource || "").trim() !== sourceFilter
      ) {
        return false;
      }
      if (!queryText) return true;
      const haystack = [
        enrolment.studentName,
        enrolment.carerName,
        enrolment.carerEmail,
        enrolment.studentFirstName,
        enrolment.studentLastName,
        enrolment.referralSource,
        referralSourceLabel(enrolment.referralSource),
        enrolment.referralSourceDetail,
      ].join(" ").toLowerCase();
      return haystack.includes(queryText);
    });
  }, [enrolments, listTab, search, sourceFilter, yearFilter]);

  // Batch actions only on accepted / archived tabs
  const batchEnabled = listTab === "accepted" || listTab === "archived";
  const batchAction  = listTab === "accepted" ? "archive" : "delete";

  const visibleIds = useMemo(() => new Set(visibleEnrolments.map((e) => e.id)), [visibleEnrolments]);
  const allSelected  = visibleIds.size > 0 && [...visibleIds].every((id) => selected.has(id));
  const someSelected = !allSelected && [...visibleIds].some((id) => selected.has(id));
  const selectedCount = [...visibleIds].filter((id) => selected.has(id)).length;

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visibleIds));
    }
  }

  function toggleOne(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function openBatchModal() {
    const ids = [...selected].filter((id) => visibleIds.has(id));
    const names = ids.map((id) => {
      const e = enrolments.find((r) => r.id === id);
      return e ? `${e.studentFirstName || ""} ${e.studentLastName || ""}`.trim() || "(unnamed)" : id;
    });
    setBatchError("");
    setBatchModal({ action: batchAction, ids, names });
  }

  async function executeBatch() {
    const { action, ids } = batchModal;
    setBatchBusy(true);
    setBatchError("");
    const results = await Promise.allSettled(
      ids.map((id) =>
        action === "archive"
          ? archiveEnrolment(id)
          : deleteEnrolment(id, "Batch deleted by admin")
      )
    );
    setBatchBusy(false);
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      setBatchError(
        `${failed.length} of ${ids.length} failed: ${failed[0].reason?.message || "Unknown error"}`
      );
      return;
    }
    setBatchModal(null);
    setSelected(new Set());
    toast.success(
      action === "archive" ? "Enrolments archived" : "Enrolments deleted",
      `${ids.length} enrolment${ids.length === 1 ? "" : "s"} ${action === "archive" ? "archived" : "deleted"}.`
    );
    await reloadEnrolments();
  }

  function statusTone(status) {
    if (status === "accepted") return "success";
    if (status === "archived") return "neutral";
    return "info";
  }

  function statusLabel(status) {
    if (status === "accepted") return "Accepted";
    if (status === "archived") return "Archived";
    return "Pending";
  }

  function visibleStatus(enrolment) {
    const status = String(enrolment?.status || "").toLowerCase();
    if (status === "accepted") return "accepted";
    if (status === "deleted") return null;
    if (enrolment?.archived || status === "archived") return "archived";
    return "pending";
  }

  const columns = [
    ...(batchEnabled ? [
      {
        key: "select",
        header: (
          <SelectAllCheckbox
            allSelected={allSelected}
            someSelected={someSelected}
            onChange={toggleAll}
          />
        ),
        render: (row) => (
          <input
            type="checkbox"
            checked={selected.has(row.id)}
            aria-label={`Select ${row.studentFirstName || ""} ${row.studentLastName || ""}`.trim() || "Select enrolment"}
            onChange={() => toggleOne(row.id)}
            onClick={(e) => e.stopPropagation()}
          />
        ),
      },
    ] : []),
    {
      key: "student",
      header: "Student",
      render: (row) => {
        const name = `${row.studentFirstName || ""} ${row.studentLastName || ""}`.trim();
        return (
          <div className="row-meta">
            <span className="primary">{name || "(Unnamed student)"}</span>
            <span className="secondary">{row.studentYear || "No year"}</span>
          </div>
        );
      },
    },
    { key: "carer",      header: "Carer",       render: (row) => row.carerName  || "-" },
    { key: "carerEmail", header: "Carer email",  render: (row) => row.carerEmail || "-" },
    {
      key: "source",
      header: "Source",
      render: (row) => referralSourceLabel(row.referralSource),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => {
        const status = visibleStatus(row);
        return <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge>;
      },
    },
    {
      key: "action",
      header: "",
      render: () => <span className="cell-muted">Open details</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Enrolments"
        subtitle="Review intake records and open a detail page before accepting an enrolment."
        crumbs={[{ label: "Overview", href: "/" }, { label: "Enrolments" }]}
        actions={<Button onClick={() => navigate("/")} variant="secondary">Back to dashboard</Button>}
      />

      <div className="tabs">
        {[
          ["pending",  "Active queue"],
          ["accepted", "Accepted"],
          ["archived", "Archived"],
        ].map(([key, label]) => (
          <button
            className={`tab ${listTab === key ? "active" : ""}`}
            disabled={listBusy}
            key={key}
            onClick={() => setListTab(key)}
            type="button"
          >
            {label}
            <span className="count">{counts[key] || 0}</span>
          </button>
        ))}
      </div>

      <div className="filter-bar">
        <div className="field-search grow">
          <Icon className="search-icon" name="search" size={16} />
          <input
            className="input"
            placeholder="Search by student, carer, email, or source"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="Filter by year"
          className="select enrolment-year-filter"
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
        >
          <option value="all">All years</option>
          {yearOptions.map((year) => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>
        <select
          aria-label="Filter by referral source"
          className="select"
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
        >
          <option value="all">All referral sources</option>
          {REFERRAL_SOURCE_OPTIONS.map((option) => (
            <option key={option.code} value={option.code}>{option.label}</option>
          ))}
        </select>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h3>Enrolment records</h3>
            <div className="card-sub">Review active intake records and archived history.</div>
          </div>
          <div className="row gap-3" style={{ alignItems: "center" }}>
            {batchEnabled && selectedCount > 0 ? (
              <Button
                variant={batchAction === "delete" ? "danger-outline" : "secondary"}
                onClick={openBatchModal}
                disabled={listBusy}
              >
                {batchAction === "archive"
                  ? `Archive ${selectedCount} selected`
                  : `Delete ${selectedCount} selected`}
              </Button>
            ) : null}
            <Badge tone="brand" dot>Live data</Badge>
          </div>
        </div>

        <div className="card-body flush">
          {listBusy ? <div className="route-inline-state">Loading enrolments...</div> : null}
          {listError ? (
            <div className="banner banner-danger">
              <div>
                <div className="banner-title">Could not load enrolments</div>
                <div>{listError}</div>
              </div>
            </div>
          ) : null}

          {!listBusy && !listError ? (
            visibleEnrolments.length === 0 ? (
              <EmptyState icon="enrol" title="No enrolments found">
                No records match the selected filters.
              </EmptyState>
            ) : (
              <Table
                columns={columns}
                getRowKey={(row) => row.id}
                onRowClick={(row) => navigate(`/enrolments/${encodeURIComponent(row.id)}`)}
                rows={visibleEnrolments}
              />
            )
          ) : null}
        </div>
      </div>

      {/* Batch confirmation modal */}
      {batchModal ? (
        <Modal
          open
          title={batchModal.action === "archive"
            ? `Archive ${batchModal.ids.length} enrolment${batchModal.ids.length === 1 ? "" : "s"}?`
            : `Delete ${batchModal.ids.length} enrolment${batchModal.ids.length === 1 ? "" : "s"}?`}
          subtitle={batchModal.action === "archive"
            ? "These enrolments will be moved to the archived history."
            : "These enrolments will be soft-deleted and removed from the portal."}
          busy={batchBusy}
          onClose={() => { if (!batchBusy) setBatchModal(null); }}
          footer={null}
        >
          {batchError ? (
            <div className="banner banner-danger mb-4">
              <div>
                <div className="banner-title">Action partially failed</div>
                <div>{batchError}</div>
              </div>
            </div>
          ) : null}

          {batchModal.action === "delete" ? (
            <div className="banner banner-danger mb-4">
              <div>
                <div className="banner-title">This action is permanent</div>
                <div>Deleted enrolments will no longer appear in the portal.</div>
              </div>
            </div>
          ) : null}

          <div className="mb-4">
            <div className="label mb-2">
              {batchModal.names.length === 1 ? "1 enrolment" : `${batchModal.names.length} enrolments`}
            </div>
            <ul style={{ margin: 0, paddingLeft: 20, maxHeight: 200, overflowY: "auto" }}>
              {batchModal.names.map((name, i) => (
                <li key={i} className="text-sm" style={{ padding: "2px 0" }}>{name}</li>
              ))}
            </ul>
          </div>

          <div className="row gap-2" style={{ justifyContent: "flex-end" }}>
            <Button disabled={batchBusy} onClick={() => setBatchModal(null)} variant="secondary">
              Cancel
            </Button>
            <Button
              loading={batchBusy}
              onClick={executeBatch}
              variant={batchModal.action === "delete" ? "danger" : "primary"}
            >
              {batchModal.action === "archive"
                ? `Archive ${batchModal.ids.length} enrolment${batchModal.ids.length === 1 ? "" : "s"}`
                : `Delete ${batchModal.ids.length} enrolment${batchModal.ids.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
