import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../AuthProvider";
import { listEnrolments } from "../backend/enrolmentsApi";
import Badge from "../components/Badge";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import Table from "../components/Table";

export default function EnrolmentPortalPage() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [searchParams] = useSearchParams();

  const enrolmentId = useMemo(() => {
    return searchParams.get("enrolmentId") || "";
  }, [searchParams]);

  const [listBusy, setListBusy] = useState(false);
  const [listError, setListError] = useState("");
  const [enrolments, setEnrolments] = useState([]);
  const [listTab, setListTab] = useState("pending");
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState("all");

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
    return () => {
      cancelled = true;
    };
  }, [enrolmentId, user, isAdmin]);

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
      new Set(enrolments.map((enrolment) => String(enrolment.studentYear || "").trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [enrolments]);

  const visibleEnrolments = useMemo(() => {
    const queryText = search.trim().toLowerCase();
    return enrolments.filter((enrolment) => {
      const status = visibleStatus(enrolment);
      if (!status) return false;
      if (listTab !== "all" && status !== listTab) return false;
      if (yearFilter !== "all" && String(enrolment.studentYear || "") !== yearFilter) return false;
      if (!queryText) return true;

      const haystack = [
        enrolment.studentName,
        enrolment.carerName,
        enrolment.carerEmail,
        enrolment.studentFirstName,
        enrolment.studentLastName,
      ].join(" ").toLowerCase();
      return haystack.includes(queryText);
    });
  }, [enrolments, listTab, search, yearFilter]);

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
          ["pending", "Active queue"],
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
            placeholder="Search by student, carer, or email"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <select className="select enrolment-year-filter" value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
          <option value="all">All years</option>
          {yearOptions.map((year) => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h3>Enrolment records</h3>
            <div className="card-sub">Review active intake records and archived history.</div>
          </div>
          <Badge tone="brand" dot>Live data</Badge>
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
            <>
              {visibleEnrolments.length === 0 ? (
                <EmptyState icon="enrol" title="No enrolments found">
                  No records match the selected filters.
                </EmptyState>
              ) : (
                <Table
                  columns={[
                    {
                      key: "student",
                      header: "Student",
                      render: (row) => {
                        const studentName = `${row.studentFirstName} ${row.studentLastName}`.trim();
                        return (
                          <div className="row-meta">
                            <span className="primary">{studentName || "(Unnamed student)"}</span>
                            <span className="secondary">{row.studentYear || "No year"}</span>
                          </div>
                        );
                      },
                    },
                    {
                      key: "carer",
                      header: "Carer",
                      render: (row) => row.carerName || "-",
                    },
                    {
                      key: "carerEmail",
                      header: "Carer email",
                      render: (row) => row.carerEmail || "-",
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
                  ]}
                  getRowKey={(row) => row.id}
                  onRowClick={(row) => navigate(`/enrolments/${encodeURIComponent(row.id)}`)}
                  rows={visibleEnrolments}
                />
              )}
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
