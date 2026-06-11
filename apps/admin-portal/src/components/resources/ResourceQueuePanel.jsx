import React, { useMemo, useState } from "react";
import { deleteResourceJob, downloadResourceJob, retryResourceJob } from "../../backend/resourcesApi";
import Badge from "../Badge";
import Button from "../Button";
import ConfirmDialog from "../ConfirmDialog";
import EmptyState from "../EmptyState";
import Icon from "../Icon";
import { useToast } from "../ToastProvider";
import { resourceLabel } from "./resourceTypes";

function capitalise(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

function formatDate(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncate(value, length = 120) {
  if (!value || value.length <= length) return value;
  return `${value.slice(0, length).trim()}...`;
}

function warningSummary(job) {
  const warnings = Array.isArray(job?.warnings) ? job.warnings : [];
  if (!warnings.length) return "";
  const first = warnings[0]?.message || "An optional diagram was omitted.";
  return warnings.length > 1 ? `${first} (+${warnings.length - 1} more)` : first;
}

const STATUS_BADGES = {
  pending: { tone: "neutral", label: "Queued", icon: "clock" },
  processing: { tone: "info", label: "Generating", icon: "sparkles" },
  complete: { tone: "success", label: "Ready", icon: "check-circle" },
  failed: { tone: "danger", label: "Failed", icon: "x-circle" },
};

export default function ResourceQueuePanel({
  error,
  historyError,
  historyJobs: historySourceJobs = [],
  historyLoading,
  jobs,
  loading,
  selectedStudentName,
}) {
  const toast = useToast();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [expandedErrors, setExpandedErrors] = useState(() => new Set());

  const activeJobs = jobs.filter((job) => ["pending", "processing"].includes(job.status));
  const historyJobs = historySourceJobs.filter((job) => ["complete", "failed"].includes(job.status));

  const filteredHistory = useMemo(() => {
    const needle = historyQuery.trim().toLowerCase();
    if (!needle) return historyJobs;
    return historyJobs.filter((job) => {
      return [
        job.studentName,
        resourceLabel(job.resourceType),
        job.createdByName,
        job.subject,
      ].some((value) => String(value || "").toLowerCase().includes(needle));
    });
  }, [historyJobs, historyQuery]);
  const hasHistorySearch = Boolean(historyQuery.trim());
  const historySubtitle = selectedStudentName
    ? `Completed and failed resources for ${selectedStudentName}.`
    : "Completed and failed resources.";
  const emptyHistoryTitle = hasHistorySearch
    ? "No resources found"
    : selectedStudentName
      ? `No resources for ${selectedStudentName}`
      : "No resource history yet";
  const emptyHistoryCopy = hasHistorySearch
    ? "Try another search term."
    : selectedStudentName
      ? "Generated resources for this student will appear here."
      : "Completed and failed resources will appear here.";

  async function download(job) {
    try {
      await downloadResourceJob(job);
    } catch (downloadError) {
      toast.error("Download failed", downloadError?.message || "Could not fetch the generated document.");
    }
  }

  async function retry(job) {
    try {
      await retryResourceJob(job.jobId || job.id);
      toast.success("Retry queued", "The job has been returned to the queue.");
    } catch (retryError) {
      toast.error("Retry failed", retryError?.message || "Could not retry this job.");
    }
  }

  async function deleteHistoryJob() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await deleteResourceJob(deleteTarget.jobId || deleteTarget.id);
      toast.success("Resource deleted", "The history item has been removed.");
      setDeleteTarget(null);
    } catch (deleteError) {
      toast.error("Delete failed", deleteError?.message || "Could not delete this history item.");
    } finally {
      setDeleting(false);
    }
  }

  function toggleError(jobId) {
    setExpandedErrors((current) => {
      const next = new Set(current);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  }

  return (
    <section className="rg-queue">
      <div className="card">
        <div className="card-head">
          <div>
            <h3>Live queue</h3>
            <div className="card-sub">Pending and processing jobs update from Firestore.</div>
          </div>
          {activeJobs.length ? <Badge tone="info" dot>{activeJobs.length} active</Badge> : null}
        </div>

        {error ? (
          <div className="banner banner-danger rg-card-banner">
            <Icon name="alert" />
            <div>
              <div className="banner-title">Could not load resource jobs</div>
              <div>{error}</div>
            </div>
          </div>
        ) : loading ? (
          <div className="rg-queue-empty">
            <span className="spinner" />
            <div className="weight-600">Loading queue...</div>
          </div>
        ) : activeJobs.length ? (
          <ul className="rg-job-list">
            {activeJobs.map((job) => (
              <ResourceJobRow
                expanded={expandedErrors.has(job.jobId || job.id)}
                job={job}
                key={job.jobId || job.id}
                onDownload={download}
                onRetry={retry}
                onToggleError={() => toggleError(job.jobId || job.id)}
              />
            ))}
          </ul>
        ) : (
          <div className="rg-queue-empty">
            <div className="rg-queue-empty-icon"><Icon name="sparkles" size={20} /></div>
            <div className="weight-600">Nothing generating right now</div>
            <div className="text-sm muted">Submitted jobs will appear here first.</div>
          </div>
        )}
      </div>

      <div className="card mt-4">
        <button className="card-head rg-history-head" onClick={() => setHistoryOpen((current) => !current)} type="button">
          <div>
            <h3>History</h3>
            <div className="card-sub">{historySubtitle}</div>
          </div>
          <div className="row gap-2">
            <Badge tone="neutral">{filteredHistory.length}</Badge>
            <Icon name={historyOpen ? "chevron-up" : "chevron-down"} size={16} />
          </div>
        </button>

        {historyOpen ? (
          <>
            <div className="rg-history-filter">
              <div className="field-search">
                <Icon className="search-icon" name="search" size={16} />
                <input onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Filter by student, type, or tutor..." type="search" value={historyQuery} />
              </div>
            </div>
            {historyError ? (
              <div className="banner banner-danger rg-card-banner">
                <Icon name="alert" />
                <div>
                  <div className="banner-title">Could not load resource history</div>
                  <div>{historyError}</div>
                </div>
              </div>
            ) : historyLoading ? (
              <div className="rg-queue-empty">
                <span className="spinner" />
                <div className="weight-600">Loading history...</div>
              </div>
            ) : filteredHistory.length ? (
              <ul className="rg-job-list">
                {filteredHistory.map((job) => (
                  <ResourceJobRow
                    expanded={expandedErrors.has(job.jobId || job.id)}
                    job={job}
                    key={job.jobId || job.id}
                    onDownload={download}
                    onDelete={() => setDeleteTarget(job)}
                    onRetry={retry}
                    onToggleError={() => toggleError(job.jobId || job.id)}
                  />
                ))}
              </ul>
            ) : (
              <div className="rg-history-empty">
                <EmptyState icon={hasHistorySearch ? "search" : "file-text"} title={emptyHistoryTitle}>{emptyHistoryCopy}</EmptyState>
              </div>
            )}
          </>
        ) : null}
      </div>

      <ConfirmDialog
        busy={deleting}
        confirmLabel="Delete resource"
        message={
          deleteTarget
            ? `This removes ${resourceLabel(deleteTarget.resourceType)} for ${deleteTarget.studentName || "this student"} from resource history. Generated files and uploaded references for this job will also be removed where present.`
            : ""
        }
        onCancel={() => !deleting && setDeleteTarget(null)}
        onConfirm={deleteHistoryJob}
        open={Boolean(deleteTarget)}
        title="Delete resource history item"
      />
    </section>
  );
}

function ResourceJobRow({ expanded, job, onDelete, onDownload, onRetry, onToggleError }) {
  const status = STATUS_BADGES[job.status] || STATUS_BADGES.pending;
  const createdLabel = formatDate(job.completedAtIso || job.startedAtIso || job.createdAtIso);
  const warning = warningSummary(job);

  return (
    <li className={`rg-job rg-job-${job.status || "pending"}`}>
      <div className="rg-job-status" aria-hidden="true">
        {job.status === "processing" ? <span className="spinner" /> : <Icon name={status.icon} size={16} />}
      </div>
      <div className="rg-job-main">
        <div className="rg-job-title">
          <span className="weight-600">{job.studentName || "Unknown student"}</span>
          <span className="muted">-</span>
          <span>{resourceLabel(job.resourceType)}</span>
        </div>
        <div className="rg-job-meta">
          <span>Year {job.year || "-"} {capitalise(job.subject)}</span>
          <span>-</span>
          <span>{createdLabel}</span>
        </div>
        {job.status === "failed" && job.error ? (
          <button className="rg-error-toggle" onClick={onToggleError} type="button">
            <Icon name="alert" size={12} />
            {expanded ? job.error : truncate(job.error)}
          </button>
        ) : null}
        {warning ? (
          <div className="rg-warning-note" role="status">
            <Icon name="alert" size={12} />
            <span>{warning}</span>
          </div>
        ) : null}
      </div>
      <div className="rg-job-actions">
        <Badge tone={status.tone} dot={job.status === "processing"}>{status.label}</Badge>
        {job.status === "complete" ? (
          <Button icon="download" onClick={() => onDownload(job)} size="sm" variant="primary">.docx</Button>
        ) : null}
        {job.status === "failed" ? (
          <Button icon="refresh" onClick={() => onRetry(job)} size="sm" variant="secondary">Retry</Button>
        ) : null}
        {onDelete && ["complete", "failed"].includes(job.status) ? (
          <Button
            aria-label="Delete resource history item"
            className="btn-icon rg-delete-action"
            icon="trash"
            onClick={() => onDelete(job)}
            size="sm"
            title="Delete"
            variant="ghost"
          />
        ) : null}
      </div>
    </li>
  );
}
