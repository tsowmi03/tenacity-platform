import React, { useState } from "react";
import Button from "../Button";
import { MAX_CUSTOM_PROMPT, clarifiedResourcePrompt } from "./clarifiedPrompt";

const MAX_NOTE = 500;

// Shown on a job the planner stopped because it could not tell what to cover,
// or (RES-101) because a text the tutor named couldn't be found. Answering
// queues a new job; the stopped one stays in history as the earlier version.
export default function ResourceClarificationForm({ busy, job, onEdit, onSubmit }) {
  const [topics, setTopics] = useState([]);
  const [note, setNote] = useState("");
  const options = Array.isArray(job.clarificationOptions) ? job.clarificationOptions : [];
  // A missing text takes exactly one choice: another text, an original or
  // leaving it out can't be combined.
  const kind = job.clarificationKind || null;
  const singleChoice = kind === "missing-text" && options.length > 0;
  const noteId = `rg-clarify-note-${job.jobId || job.id}`;
  const tooLong = clarifiedResourcePrompt(job.customPrompt, { topics, note, kind }).length > MAX_CUSTOM_PROMPT;
  const canSubmit = !busy && !tooLong &&
    (singleChoice ? topics.length === 1 : topics.length > 0 || note.trim().length > 0);

  function toggle(option) {
    if (singleChoice) {
      setTopics([option]);
      return;
    }
    setTopics((current) =>
      current.includes(option)
        ? current.filter((topic) => topic !== option)
        : [...current, option]
    );
  }

  return (
    <form
      className="rg-clarify"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) onSubmit(kind ? { topics, note: note.trim(), kind } : { topics, note: note.trim() });
      }}
    >
      <p className="rg-clarify-question">{job.error}</p>
      {options.length ? (
        <div className="rg-clarify-options" role={singleChoice ? "radiogroup" : undefined}>
          {options.map((option) => (
            <label className="rg-clarify-option" key={option}>
              <input
                checked={topics.includes(option)}
                disabled={busy}
                name={singleChoice ? `rg-clarify-choice-${job.jobId || job.id}` : undefined}
                onChange={() => toggle(option)}
                type={singleChoice ? "radio" : "checkbox"}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      ) : null}
      <div className="field">
        <label className="label" htmlFor={noteId}>
          {options.length ? "Anything else?" : "Your answer"}
        </label>
        <textarea
          className="textarea"
          disabled={busy}
          id={noteId}
          maxLength={MAX_NOTE}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          value={note}
        />
      </div>
      {tooLong ? (
        <p className="rg-warning-note" role="alert">
          This answer makes the request too long. Shorten it or edit the whole request.
        </p>
      ) : null}
      <div className="rg-clarify-actions">
        <Button disabled={!canSubmit} size="sm" type="submit" variant="primary">
          {busy ? "Sending…" : "Continue"}
        </Button>
        {onEdit ? (
          <Button disabled={busy} onClick={() => onEdit(job)} size="sm" type="button" variant="ghost">
            Edit the whole request
          </Button>
        ) : null}
      </div>
    </form>
  );
}
