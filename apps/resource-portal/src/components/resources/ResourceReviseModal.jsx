import React, { useEffect, useState } from "react";
import Button from "../Button";
import Icon from "../Icon";
import Modal from "../Modal";
import { resourceLabel } from "./resourceTypes";

const MAX_INSTRUCTION = 2000;

const EXAMPLES = [
  "Replace Q3 with a harder one on the same topic",
  "Drop the diagram in Q5 and ask for it to be sketched instead",
  "Reword the last question — it repeats Q2",
];

// Asks for the one change a tutor wants made to a resource that has already
// been generated. Submitting queues a new generation built from the existing
// document rather than starting over, so everything else is kept.
export default function ResourceReviseModal({ busy = false, job, open, onClose, onSubmit }) {
  const [instruction, setInstruction] = useState("");

  // Clear the box between resources so an instruction meant for one document
  // cannot be submitted against another.
  useEffect(() => {
    if (open) setInstruction("");
  }, [open, job?.jobId]);

  if (!job) return null;

  const trimmed = instruction.trim();
  const canSubmit = trimmed.length > 0 && !busy;
  const subtitle = [
    job.studentName || "Unknown student",
    `Year ${job.year || "—"}`,
  ].join("  ·  ");

  function submit() {
    if (!canSubmit) return;
    onSubmit?.(trimmed);
  }

  return (
    <Modal
      busy={busy}
      onClose={onClose}
      open={open}
      size="lg"
      subtitle={subtitle}
      title={`Revise ${resourceLabel(job.resourceType).toLowerCase()}`}
      footer={
        <div className="row gap-2">
          <Button disabled={busy} onClick={onClose} variant="ghost">Cancel</Button>
          <Button disabled={!canSubmit} icon="sparkles" onClick={submit} variant="primary">
            {busy ? "Queueing…" : "Revise"}
          </Button>
        </div>
      }
    >
      <div className="rg-revise">
        <p className="rg-revise-lede">
          Describe the change you want. Everything you don't mention is kept as it is,
          and the current version stays in history.
        </p>

        <div className="field">
          <label className="label" htmlFor="rg-revise-instruction">
            What should change? <span className="req">*</span>
          </label>
          <textarea
            autoFocus
            className="textarea"
            disabled={busy}
            id="rg-revise-instruction"
            maxLength={MAX_INSTRUCTION}
            onChange={(event) => setInstruction(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit();
            }}
            placeholder="e.g. Replace Q3 with a harder one on quadratics"
            rows={4}
            value={instruction}
          />
          <span className="hint">
            {instruction.length}/{MAX_INSTRUCTION}
          </span>
        </div>

        <div className="rg-revise-examples">
          <div className="text-sm weight-600">Examples</div>
          <ul>
            {EXAMPLES.map((example) => (
              <li key={example}>
                <button
                  className="rg-revise-example"
                  disabled={busy}
                  onClick={() => setInstruction(example)}
                  type="button"
                >
                  {example}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="rg-revise-note">
          <Icon name="alert" size={13} />
          <span>
            This counts as a new generation, so it takes about as long as the original
            and incurs a new AI cost. To change the answer mode, marks, or resource type,
            use Edit instead.
          </span>
        </div>
      </div>
    </Modal>
  );
}
