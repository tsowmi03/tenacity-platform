import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../AuthProvider";
import {
  cancelResourceJob,
  deleteResourceJob,
  downloadResourceJob,
  downloadResourceUpload,
  resubmitResourceJob,
  retryResourceJob,
} from "../../backend/resourcesApi";
import Badge from "../Badge";
import Button from "../Button";
import ConfirmDialog from "../ConfirmDialog";
import EmptyState from "../EmptyState";
import Icon from "../Icon";
import { useToast } from "../ToastProvider";
import ResourceJobDetailsModal from "./ResourceJobDetailsModal";
import ResourcePreviewModal from "./ResourcePreviewModal";
import { useResourcePreview } from "./useResourcePreview";
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
  cancelled: { tone: "neutral", label: "Cancelled", icon: "x-circle" },
};

const HISTORY_PAGE_SIZE = 10;

const HISTORY_STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "complete", label: "Ready" },
  { key: "failed", label: "Failed" },
  { key: "cancelled", label: "Cancelled" },
];

export default function ResourceQueuePanel({
  error,
  historyError,
  historyJobs: historySourceJobs = [],
  historyLoading,
  jobs,
  loading,
  selectedStudentName,
}) {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [expandedErrors, setExpandedErrors] = useState(() => new Set());
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const [detailsTarget, setDetailsTarget] = useState(null);
  const [regenerateTarget, setRegenerateTarget] = useState(null);
  const [regenerating, setRegenerating] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [visibleCount, setVisibleCount] = useState(HISTORY_PAGE_SIZE);
  const preview = useResourcePreview();

  const activeJobs = jobs.filter((job) => ["pending", "processing"].includes(job.status));
  const historyJobs = historySourceJobs.filter((job) =>
    ["complete", "failed", "cancelled"].includes(job.status)
  );

  const filteredHistory = useMemo(() => {
    const needle = historyQuery.trim().toLowerCase();
    return historyJobs.filter((job) => {
      if (statusFilter !== "all" && job.status !== statusFilter) return false;
      if (!needle) return true;
      return [
        job.studentName,
        resourceLabel(job.resourceType),
        job.createdByName,
        job.subject,
      ].some((value) => String(value || "").toLowerCase().includes(needle));
    });
  }, [historyJobs, historyQuery, statusFilter]);

  // Reset the visible window whenever the filters change so "Show more" always
  // starts from the top of the newly filtered list.
  useEffect(() => {
    setVisibleCount(HISTORY_PAGE_SIZE);
  }, [historyQuery, statusFilter]);

  const visibleHistory = filteredHistory.slice(0, visibleCount);
  const hasMoreHistory = filteredHistory.length > visibleCount;
  const isExpanded = visibleCount > HISTORY_PAGE_SIZE;
  const isFiltering = Boolean(historyQuery.trim()) || statusFilter !== "all";
  const historySubtitle = selectedStudentName
    ? `Completed, failed, and cancelled resources for ${selectedStudentName}.`
    : "Completed, failed, and cancelled resources.";
  const emptyHistoryTitle = isFiltering
    ? "No resources found"
    : selectedStudentName
      ? `No resources for ${selectedStudentName}`
      : "No resource history yet";
  const emptyHistoryCopy = isFiltering
    ? "Try another search term or status filter."
    : selectedStudentName
      ? "Generated resources for this student will appear here."
      : "Completed and failed resources will appear here.";

  async function download(job) {
    try {
      await downloadResourceJob(job);
    } catch (downloadError) {
      toast.error(
        "Download failed",
        downloadError?.userMessage || downloadError?.message || "Could not fetch the generated document."
      );
    }
  }

  async function downloadUpload(file) {
    try {
      await downloadResourceUpload(file);
    } catch (downloadError) {
      toast.error(
        "Download failed",
        downloadError?.userMessage || downloadError?.message || "Could not fetch this reference file."
      );
    }
  }

  async function retry(job) {
    try {
      await retryResourceJob(job.jobId || job.id);
      toast.success("Retry queued", "The job has been returned to the queue.");
    } catch (retryError) {
      toast.error(
        "Retry failed",
        retryError?.userMessage || retryError?.message || "Could not retry this job."
      );
    }
  }

  // Resubmit a past job as a brand-new generation using the same student,
  // prompt, and attached files. Unlike Retry (which re-runs the same job in
  // place), this creates a fresh job that appears in the live queue.
  async function regenerate() {
    if (!regenerateTarget || regenerating) return;
    setRegenerating(true);
    try {
      await resubmitResourceJob(regenerateTarget);
      toast.success(
        "Regeneration queued",
        "A new generation using the same inputs is now in the live queue."
      );
      setRegenerateTarget(null);
      setDetailsTarget(null);
    } catch (regenerateError) {
      toast.error(
        "Couldn't regenerate",
        regenerateError?.userMessage || regenerateError?.message || "Try again in a moment."
      );
    } finally {
      setRegenerating(false);
    }
  }

  async function cancelJob(job) {
    const jobId = job.jobId || job.id;
    setCancellingId(jobId);
    try {
      const result = await cancelResourceJob(jobId);
      if (result?.status === "cancelling") {
        toast.info("Stopping generation", "We're stopping this job — it will show as cancelled shortly.");
      } else {
        toast.success("Job cancelled", "The queued job was removed before it started generating.");
      }
      setCancelTarget(null);
    } catch (cancelError) {
      toast.error(
        "Couldn't stop the job",
        cancelError?.userMessage || cancelError?.message || "Try again in a moment."
      );
    } finally {
      setCancellingId(null);
    }
  }

  // Queued jobs are cancelled outright; in-progress jobs confirm first because
  // the partly-generated work is discarded (and may have already incurred cost).
  function requestCancel(job) {
    if (job.status === "processing") setCancelTarget(job);
    else cancelJob(job);
  }

  async function deleteHistoryJob() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await deleteResourceJob(deleteTarget.jobId || deleteTarget.id);
      toast.success("Resource deleted", "The history item has been removed.");
      setDeleteTarget(null);
    } catch (deleteError) {
      toast.error(
        "Delete failed",
        deleteError?.userMessage || deleteError?.message || "Could not delete this history item."
      );
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
                cancelling={cancellingId === (job.jobId || job.id)}
                expanded={expandedErrors.has(job.jobId || job.id)}
                job={job}
                key={job.jobId || job.id}
                onCancel={isAdmin || job.createdBy === user?.uid ? requestCancel : undefined}
                onDownload={download}
                onPreview={preview.open}
                onRetry={retry}
                onToggleError={() => toggleError(job.jobId || job.id)}
                onViewDetails={setDetailsTarget}
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
              <div aria-label="Filter by status" className="rg-history-status" role="group">
                {HISTORY_STATUS_FILTERS.map((filter) => (
                  <button
                    aria-pressed={statusFilter === filter.key}
                    className={`rg-history-status-btn${statusFilter === filter.key ? " is-active" : ""}`}
                    key={filter.key}
                    onClick={() => setStatusFilter(filter.key)}
                    type="button"
                  >
                    {filter.label}
                  </button>
                ))}
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
              <>
                <ul className="rg-job-list">
                  {visibleHistory.map((job) => (
                    <ResourceJobRow
                      expanded={expandedErrors.has(job.jobId || job.id)}
                      job={job}
                      key={job.jobId || job.id}
                      onDownload={download}
                      onPreview={preview.open}
                      onDelete={isAdmin ? () => setDeleteTarget(job) : undefined}
                      onRegenerate={isAdmin || job.createdBy === user?.uid ? setRegenerateTarget : undefined}
                      onRetry={isAdmin || job.createdBy === user?.uid ? retry : undefined}
                      onToggleError={() => toggleError(job.jobId || job.id)}
                      onViewDetails={setDetailsTarget}
                    />
                  ))}
                </ul>
                {hasMoreHistory || isExpanded ? (
                  <div className="rg-history-more">
                    <span className="text-sm muted">
                      Showing {visibleHistory.length} of {filteredHistory.length}
                    </span>
                    <div className="row gap-2">
                      {isExpanded ? (
                        <Button onClick={() => setVisibleCount(HISTORY_PAGE_SIZE)} size="sm" variant="ghost">
                          Show less
                        </Button>
                      ) : null}
                      {hasMoreHistory ? (
                        <Button onClick={() => setVisibleCount((current) => current + HISTORY_PAGE_SIZE)} size="sm" variant="secondary">
                          Show more
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="rg-history-empty">
                <EmptyState icon={isFiltering ? "search" : "file-text"} title={emptyHistoryTitle}>{emptyHistoryCopy}</EmptyState>
              </div>
            )}
          </>
        ) : null}
      </div>

      <ConfirmDialog
        busy={Boolean(cancellingId)}
        confirmLabel="Stop generation"
        message="The resource generated so far will be discarded. Generation may have already started, so this can still incur a small AI cost. You can re-run it later from history."
        onCancel={() => !cancellingId && setCancelTarget(null)}
        onConfirm={() => cancelTarget && cancelJob(cancelTarget)}
        open={Boolean(cancelTarget)}
        title="Stop this generation?"
      />

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

      <ConfirmDialog
        busy={regenerating}
        confirmLabel="Regenerate"
        message={
          regenerateTarget
            ? `This starts a new generation of ${resourceLabel(regenerateTarget.resourceType)} for ${regenerateTarget.studentName || "this student"}, using the same prompt, answer mode, and attached files. The original resource is kept, and this incurs a new AI cost.`
            : ""
        }
        onCancel={() => !regenerating && setRegenerateTarget(null)}
        onConfirm={regenerate}
        open={Boolean(regenerateTarget)}
        title="Regenerate this resource?"
      />

      <ResourceJobDetailsModal
        job={detailsTarget}
        onClose={() => setDetailsTarget(null)}
        onDownload={download}
        onDownloadFile={
          detailsTarget && (isAdmin || detailsTarget.createdBy === user?.uid)
            ? downloadUpload
            : undefined
        }
        onPreview={preview.open}
        onRegenerate={
          detailsTarget &&
          detailsTarget.status === "complete" &&
          (isAdmin || detailsTarget.createdBy === user?.uid)
            ? setRegenerateTarget
            : undefined
        }
        open={Boolean(detailsTarget)}
      />

      <ResourcePreviewModal
        open={Boolean(preview.target)}
        onClose={preview.close}
        title={preview.target ? `${resourceLabel(preview.target.resourceType)} — preview` : "Preview"}
        subtitle={
          preview.target
            ? `${preview.target.studentName || "Unknown student"}  ·  Year ${preview.target.year || "—"} ${capitalise(preview.target.subject)}`
            : ""
        }
        src={preview.url}
        loading={preview.loading}
        error={preview.error}
        onDownload={preview.target ? () => download(preview.target) : undefined}
      />
    </section>
  );
}

function ResourceJobRow({ cancelling, expanded, job, onCancel, onDelete, onDownload, onPreview, onRegenerate, onRetry, onToggleError, onViewDetails }) {
  const status = STATUS_BADGES[job.status] || STATUS_BADGES.pending;
  const createdLabel = formatDate(job.completedAtIso || job.startedAtIso || job.createdAtIso);
  const warning = warningSummary(job);
  const isActive = ["pending", "processing"].includes(job.status);
  const stopRequested = Boolean(job.cancelRequested) || cancelling;

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
          job.errorDetail ? (
            <div className="rg-error">
              <button
                aria-expanded={expanded}
                className="rg-error-toggle"
                onClick={onToggleError}
                type="button"
              >
                <Icon name="alert" size={12} />
                <span className="rg-error-message">{job.error}</span>
                <Icon name={expanded ? "chevron-up" : "chevron-down"} size={12} />
              </button>
              {expanded ? <pre className="rg-error-detail">{job.errorDetail}</pre> : null}
            </div>
          ) : (
            <div className="rg-error-toggle rg-error-static">
              <Icon name="alert" size={12} />
              <span className="rg-error-message">{job.error}</span>
            </div>
          )
        ) : null}
        {warning ? (
          <div className="rg-warning-note" role="status">
            <Icon name="alert" size={12} />
            <span>{warning}</span>
          </div>
        ) : null}
      </div>
      <div className="rg-job-actions">
        <Badge tone={status.tone} dot={job.status === "processing"}>
          {stopRequested && job.status === "processing" ? "Stopping…" : status.label}
        </Badge>
        {onViewDetails ? (
          <Button
            aria-label="View generation details"
            icon="info"
            onClick={() => onViewDetails(job)}
            size="sm"
            title="View details"
            variant="ghost"
          >
            Details
          </Button>
        ) : null}
        {job.status === "complete" && job.previewPath && onPreview ? (
          <Button
            icon="eye"
            onClick={() => onPreview(job)}
            size="sm"
            title="Preview before downloading"
            variant="secondary"
          >
            Preview
          </Button>
        ) : null}
        {job.status === "complete" ? (
          <Button icon="download" onClick={() => onDownload(job)} size="sm" variant="primary">.docx</Button>
        ) : null}
        {job.status === "complete" && onRegenerate ? (
          <Button
            icon="refresh"
            onClick={() => onRegenerate(job)}
            size="sm"
            title="Generate again with the same inputs"
            variant="secondary"
          >
            Regenerate
          </Button>
        ) : null}
        {isActive && onCancel ? (
          <Button
            disabled={stopRequested}
            onClick={() => onCancel(job)}
            size="sm"
            variant="secondary"
          >
            {job.status === "processing" ? "Stop" : "Cancel"}
          </Button>
        ) : null}
        {["failed", "cancelled"].includes(job.status) && onRetry ? (
          <Button icon="refresh" onClick={() => onRetry(job)} size="sm" variant="secondary">Retry</Button>
        ) : null}
        {onDelete && ["complete", "failed", "cancelled"].includes(job.status) ? (
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
