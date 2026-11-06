import React, { useState } from "react";
import Button from "../Button";
import { flagBankQuestion, getResourceBankQuestions } from "../../backend/resourcesApi";

// RES-61. The textbook questions a resource used, each with its original
// diagram, so a tutor can flag one that came out wrong.
export const FLAG_REASONS = [
  ["crop", "Diagram is cut off or includes something else"],
  ["text", "Question wording is wrong"],
  ["answer", "Answer is wrong"],
  ["tags", "Wrong topic, skill or year"],
  ["other", "Something else"],
];

// RES-71 / RES-80: why a diagram was drawn rather than taken from a textbook.
const DRAWN_REASONS = {
  none_suitable: "no textbook diagram fitted the skill",
  crop_taken: "its best textbook diagrams were used by other questions",
  check_disagreed: "the textbook question's answer could not be confirmed",
  no_candidates: "no textbook diagram for this year and topic",
  answer_row_unclear: "its answer could not be matched safely",
  ambiguous_number: "its question number appears more than once",
  out_of_time: "the textbook search ran out of time",
  bank_unavailable: "the textbook bank was unavailable",
};

export function questionPlace(entry) {
  const name = `Question ${entry.questionNumber}${entry.partLabel ? ` part ${entry.partLabel}` : ""}`;
  return entry.section ? `${entry.section}, ${name}` : name;
}

export function drawnReason(reason) {
  const key = String(reason || "").split(":")[0];
  return DRAWN_REASONS[key] || "the textbook step could not finish";
}

export function DrawnDiagramsList({ job }) {
  const drawn = job?.questionBankUsage?.skipped || [];
  if (!drawn.length) return null;
  return (
    <div className="rg-bank-drawn mt-2">
      <div className="text-sm muted">
        {drawn.length === 1 ? "1 diagram was" : `${drawn.length} diagrams were`} drawn because:
      </div>
      <ul className="text-sm">
        {drawn.map((entry, index) => (
          <li key={`${questionPlace(entry)}-${index}`}>{questionPlace(entry)}: {drawnReason(entry.reason)}</li>
        ))}
      </ul>
    </div>
  );
}

function sourceLine(question) {
  const file = String(question.sourcePath || "").split("/").pop();
  return [file, question.pageNumber ? `p${question.pageNumber}` : "", question.label || ""].filter(Boolean).join(" · ");
}

function FlagForm({ question, jobId, onFlagged }) {
  const [reason, setReason] = useState("crop");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await flagBankQuestion({ jobId, questionId: question.id, reason, note });
      onFlagged();
    } catch (err) {
      setError(err?.userMessage || err?.message || "Could not flag this question.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rg-bank-flag-form">
      <label className="label" htmlFor={`flag-reason-${question.id}`}>What is wrong?</label>
      <select className="input" id={`flag-reason-${question.id}`} onChange={(e) => setReason(e.target.value)} value={reason}>
        {FLAG_REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <textarea
        aria-label="Note for the admin"
        className="input mt-2"
        maxLength={1000}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional note"
        rows={2}
        value={note}
      />
      {error ? <div className="error mt-2">{error}</div> : null}
      <div className="row gap-2 mt-2">
        <Button disabled={busy} onClick={submit} size="sm" variant="primary">Send flag</Button>
      </div>
    </div>
  );
}

export default function BankQuestionsSection({ job }) {
  const [state, setState] = useState({ loading: false, error: "", questions: null });
  const [flagging, setFlagging] = useState(null);
  const [flagged, setFlagged] = useState(() => new Set());
  const used = job?.questionBankUsage?.used || [];
  if (!used.length) return <DrawnDiagramsList job={job} />;

  async function load() {
    setState({ loading: true, error: "", questions: null });
    try {
      const { questions } = await getResourceBankQuestions(job.jobId || job.id);
      setState({ loading: false, error: "", questions: questions || [] });
      setFlagged(new Set((questions || []).filter((q) => q.flaggedByMe).map((q) => q.id)));
    } catch (err) {
      setState({ loading: false, error: err?.userMessage || err?.message || "Could not load the textbook questions.", questions: null });
    }
  }

  return (
    <div className="rg-bank">
      <div className="text-sm muted">
        {used.length === 1 ? "1 question" : `${used.length} questions`} in this resource came from textbooks, with their original diagrams.
      </div>
      {!state.questions ? (
        <Button className="mt-2" disabled={state.loading} onClick={load} size="sm" variant="secondary">
          {state.loading ? "Loading…" : "Show textbook questions"}
        </Button>
      ) : null}
      {state.error ? <div className="error mt-2">{state.error}</div> : null}
      {state.questions ? (
        <ul className="rg-bank-list">
          {state.questions.map((question) => (
            <li className="rg-bank-item" key={question.id}>
              <div className="weight-600">{questionPlace(question)}{question.use === "new" ? " (new question on a textbook diagram)" : ""}</div>
              <div className="text-sm muted">{sourceLine(question)}</div>
              {question.image ? <img alt={`Diagram for question ${question.questionNumber}`} className="rg-bank-image" src={question.image} /> : null}
              {flagged.has(question.id) ? (
                <div className="text-sm muted">Flagged. An admin will review it.</div>
              ) : flagging === question.id ? (
                <FlagForm
                  jobId={job.jobId || job.id}
                  onFlagged={() => {
                    setFlagged((current) => new Set([...current, question.id]));
                    setFlagging(null);
                  }}
                  question={question}
                />
              ) : (
                <Button icon="alert" onClick={() => setFlagging(question.id)} size="sm" variant="secondary">Flag a problem</Button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      <DrawnDiagramsList job={job} />
    </div>
  );
}
