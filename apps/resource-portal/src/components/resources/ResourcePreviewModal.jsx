import React from "react";
import Button from "../Button";
import Icon from "../Icon";
import Modal from "../Modal";

// Renders a PDF inside a modal via the browser's built-in viewer. Shared by
// the per-type exemplar preview in the job builder and the generated-output
// preview in job details — callers supply a URL (static asset or object URL)
// plus optional loading/error state while the PDF is being fetched.
//
// `onRevise` is offered here because reading the document is where a tutor
// notices what is wrong with it; the exemplar preview passes no handler.
export default function ResourcePreviewModal({
  open,
  onClose,
  title,
  subtitle,
  src,
  loading = false,
  error = "",
  downloadLabel,
  onDownload,
  onRevise,
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="rg-preview-modal"
      title={title || "Preview"}
      subtitle={subtitle}
      footer={
        <div className="row gap-2">
          {onRevise ? (
            <Button icon="sparkles" onClick={onRevise} variant="secondary">
              Revise
            </Button>
          ) : null}
          {onDownload ? (
            <Button icon="download" onClick={onDownload} variant="secondary">
              {downloadLabel || "Download .docx"}
            </Button>
          ) : null}
          <Button onClick={onClose} variant="primary">Close</Button>
        </div>
      }
    >
      {loading ? (
        <div className="rg-preview-status">
          <span className="spinner" />
          <div className="weight-600">Loading preview...</div>
        </div>
      ) : error ? (
        <div className="rg-preview-status">
          <Icon name="alert" size={20} />
          <div className="weight-600">Preview unavailable</div>
          <div className="text-sm muted">{error}</div>
        </div>
      ) : src ? (
        <iframe className="rg-preview-frame" src={src} title={title || "Resource preview"} />
      ) : null}
    </Modal>
  );
}
