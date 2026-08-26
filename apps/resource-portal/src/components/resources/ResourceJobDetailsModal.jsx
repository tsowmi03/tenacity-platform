import React from "react";
import Button from "../Button";
import Icon from "../Icon";
import Modal from "../Modal";
import { answerModeLabel, resourceLabel } from "./resourceTypes";
import { modelLabel, requestedModelForJob } from "./modelOptions";

function capitalise(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

function providerLabel(value) {
  if (value === "openai") return "OpenAI";
  if (value === "anthropic") return "Anthropic";
  return capitalise(value);
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

function DetailRow({ label, children }) {
  return (
    <div className="rg-details-row">
      <dt className="rg-details-label">{label}</dt>
      <dd className="rg-details-value">{children}</dd>
    </div>
  );
}

// Shows the inputs a generation was created from — type, prompt, attached
// reference files, and the rest of the request metadata — so tutors can see
// exactly what produced a resource (and reproduce or tweak it).
export default function ResourceJobDetailsModal({ job, open, onClose, onDownload, onDownloadFile, onEdit, onPreview, onRegenerate, onRevise }) {
  if (!job) return null;

  const files = Array.isArray(job.uploadedFiles) && job.uploadedFiles.length
    ? job.uploadedFiles
    : job.uploadedFileName
      ? [{ name: job.uploadedFileName }]
      : [];
  const topics = Array.isArray(job.extractedTopics)
    ? job.extractedTopics.filter(Boolean)
    : [];
  const prompt = String(job.customPrompt || "").trim();
  const subtitle = [
    job.studentName || "Unknown student",
    `Year ${job.year || "—"} ${capitalise(job.subject)}`.trim(),
  ].join("  ·  ");

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={resourceLabel(job.resourceType)}
      subtitle={subtitle}
      footer={
        <div className="row gap-2">
          {onEdit ? (
            <Button icon="edit" onClick={() => onEdit(job)} variant="secondary">
              Edit
            </Button>
          ) : null}
          {onRegenerate ? (
            <Button icon="refresh" onClick={() => onRegenerate(job)} variant="secondary">
              Regenerate
            </Button>
          ) : null}
          {onRevise ? (
            <Button icon="sparkles" onClick={() => onRevise(job)} variant="secondary">
              Revise
            </Button>
          ) : null}
          {job.status === "complete" && job.previewPath && onPreview ? (
            <Button icon="eye" onClick={() => onPreview(job)} variant="secondary">
              Preview
            </Button>
          ) : null}
          {job.status === "complete" && onDownload ? (
            <Button icon="download" onClick={() => onDownload(job)} variant="secondary">
              Download .docx
            </Button>
          ) : null}
          <Button onClick={onClose} variant="primary">Close</Button>
        </div>
      }
    >
      <dl className="rg-details">
        <DetailRow label="Type">{resourceLabel(job.resourceType)}</DetailRow>
        <DetailRow label="Subject">{capitalise(job.subject) || "—"}</DetailRow>
        <DetailRow label="Year">{job.year || "—"}</DetailRow>
        <DetailRow label="Answers">{answerModeLabel(job.answerMode, job.subject)}</DetailRow>
        <DetailRow label="Student">{job.studentName || "—"}</DetailRow>
        <DetailRow label="Requested by">{job.createdByName || "—"}</DetailRow>
        {job.derivation ? (
          <DetailRow label="Built from">
            {job.derivation === "revision"
              ? "An earlier version of this resource, revised"
              : "An earlier version of this resource, with the inputs changed"}
          </DetailRow>
        ) : null}
        {job.revisionInstruction ? (
          <DetailRow label="Change requested">
            <pre className="rg-details-prompt">{job.revisionInstruction}</pre>
          </DetailRow>
        ) : null}
        {job.revisionChanges?.summary ? (
          <DetailRow label="What changed">{job.revisionChanges.summary}</DetailRow>
        ) : null}
        <DetailRow label="Created">{formatDate(job.createdAtIso)}</DetailRow>
        {job.completedAtIso ? (
          <DetailRow label="Completed">{formatDate(job.completedAtIso)}</DetailRow>
        ) : null}
        <DetailRow label="Requested model">
          {modelLabel(requestedModelForJob(job))}
        </DetailRow>
        {job.effectiveModel || job.status === "complete" ? (
          <DetailRow label="Effective model">
            {modelLabel(job.effectiveModel || job.model)}
            {job.fallbackUsed ? " (backup model used)" : ""}
          </DetailRow>
        ) : null}
        {job.effectiveProvider ? (
          <DetailRow label="Effective provider">{providerLabel(job.effectiveProvider)}</DetailRow>
        ) : null}
        {job.fallbackUsed && job.failover ? (
          <>
            <DetailRow label="Fallback reason">
              {job.failover.safeReason || job.failover.reasonCode || "Primary model did not complete"}
            </DetailRow>
            <DetailRow label="Fallback queued">
              {formatDate(job.failoverQueuedAtIso)}
            </DetailRow>
          </>
        ) : null}
        {job.sourcePlanner?.effectiveModel ? (
          <DetailRow label="Source planner">
            {modelLabel(job.sourcePlanner.effectiveModel)}
            {job.sourcePlanner.fallbackUsed ? " (backup curator used)" : ""}
            {job.sourcePlanner.alternateWorkRequired ? " · alternate work selected" : ""}
          </DetailRow>
        ) : null}
        {topics.length ? (
          <DetailRow label="Topics">
            <div className="rg-details-chips">
              {topics.map((topic) => (
                <span className="rg-details-chip" key={topic}>{topic}</span>
              ))}
            </div>
          </DetailRow>
        ) : null}
        <DetailRow label="Attached files">
          {files.length ? (
            <ul className="rg-details-files">
              {files.map((file, index) => (
                <li key={file.path || file.name || index}>
                  <Icon name="file-text" size={13} />
                  {file.path && onDownloadFile ? (
                    <button
                      className="rg-details-file-link"
                      onClick={() => onDownloadFile(file)}
                      title={`Download ${file.name || "file"}`}
                      type="button"
                    >
                      <span>{file.name || "Unnamed file"}</span>
                      <Icon name="download" size={13} />
                    </button>
                  ) : (
                    <span>{file.name || "Unnamed file"}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <span className="muted">No files attached</span>
          )}
        </DetailRow>
        <DetailRow label="Prompt">
          {prompt ? (
            <pre className="rg-details-prompt">{prompt}</pre>
          ) : (
            <span className="muted">No custom prompt provided</span>
          )}
        </DetailRow>
      </dl>
    </Modal>
  );
}
