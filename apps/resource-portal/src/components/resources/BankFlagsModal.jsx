import React, { useEffect, useState } from "react";
import Button from "../Button";
import Modal from "../Modal";
import { listBankFlags, resolveBankFlag } from "../../backend/resourcesApi";
import { FLAG_REASONS } from "./BankQuestionsSection";

// RES-61. Admins review flagged textbook questions: fix the tags or wording,
// hide the question so the generator never uses it again, or dismiss the flag.
const REASON_LABELS = Object.fromEntries(FLAG_REASONS);
const DIFFICULTIES = ["easy", "medium", "hard"];

function EditForm({ question, skills, onSave, busy }) {
  const [draft, setDraft] = useState({
    skill: question.skill || "",
    difficulty: question.difficulty || "medium",
    yearLevel: question.yearLevel || "",
    text: question.text || "",
  });
  const set = (patch) => setDraft((current) => ({ ...current, ...patch }));
  return (
    <div className="rg-bank-flag-form">
      <label className="label" htmlFor={`skill-${question.id}`}>Skill</label>
      <select className="input" id={`skill-${question.id}`} onChange={(e) => set({ skill: e.target.value })} value={draft.skill}>
        {(skills[question.diagramType] || [draft.skill]).map((skill) => <option key={skill} value={skill}>{skill.replace(/_/g, " ")}</option>)}
      </select>
      <label className="label mt-2" htmlFor={`difficulty-${question.id}`}>Difficulty</label>
      <select className="input" id={`difficulty-${question.id}`} onChange={(e) => set({ difficulty: e.target.value })} value={draft.difficulty}>
        {DIFFICULTIES.map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
      <label className="label mt-2" htmlFor={`year-${question.id}`}>Year level</label>
      <input className="input" id={`year-${question.id}`} onChange={(e) => set({ yearLevel: e.target.value })} value={draft.yearLevel} />
      <label className="label mt-2" htmlFor={`text-${question.id}`}>Question text (as printed)</label>
      <textarea className="input" id={`text-${question.id}`} onChange={(e) => set({ text: e.target.value })} rows={3} value={draft.text} />
      <div className="row gap-2 mt-2">
        <Button
          disabled={busy}
          onClick={() => onSave({ ...draft, yearLevel: draft.yearLevel.trim() || null })}
          size="sm"
          variant="primary"
        >
          Save changes
        </Button>
      </div>
    </div>
  );
}

export default function BankFlagsModal({ open, onClose }) {
  const [state, setState] = useState({ loading: true, error: "", flags: [], questions: {}, skills: {} });
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(null);

  async function load() {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const data = await listBankFlags();
      setState({ loading: false, error: "", flags: data.flags || [], questions: data.questions || {}, skills: data.skills || {} });
    } catch (err) {
      setState((current) => ({ ...current, loading: false, error: err?.userMessage || err?.message || "Could not load flagged questions." }));
    }
  }

  useEffect(() => {
    if (open) load();
  }, [open]);

  async function resolve(flag, resolution, updates) {
    setBusy(flag.id);
    try {
      await resolveBankFlag({ flagId: flag.id, resolution, updates });
      setEditing(null);
      await load();
    } catch (err) {
      setState((current) => ({ ...current, error: err?.userMessage || err?.message || "Could not update that question." }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      footer={<Button onClick={onClose} variant="primary">Close</Button>}
      onClose={onClose}
      open={open}
      size="lg"
      subtitle="Questions tutors have flagged in generated resources."
      title="Flagged textbook questions"
    >
      {state.error ? <div className="error mb-3">{state.error}</div> : null}
      {state.loading ? <div className="muted">Loading…</div> : null}
      {!state.loading && !state.flags.length ? <div className="muted">No open flags.</div> : null}
      <ul className="rg-bank-list">
        {state.flags.map((flag) => {
          const question = state.questions[flag.questionId];
          if (!question) return null;
          return (
            <li className="rg-bank-item" key={flag.id}>
              <div className="weight-600">{REASON_LABELS[flag.reason] || flag.reason}</div>
              <div className="text-sm muted">
                {[flag.createdByName, question.sourcePath, question.pageNumber ? `p${question.pageNumber}` : "", question.label].filter(Boolean).join(" · ")}
              </div>
              {flag.note ? <div className="text-sm mt-1">“{flag.note}”</div> : null}
              {question.image ? <img alt="Flagged diagram" className="rg-bank-image" src={question.image} /> : null}
              <div className="text-sm">{[question.stem, question.text].filter(Boolean).join(" ")}</div>
              <div className="text-sm muted mt-1">
                {[question.diagramType, question.skill, question.difficulty, question.yearLevel].filter(Boolean).join(" · ").replace(/_/g, " ")}
              </div>
              {editing === flag.id ? (
                <EditForm busy={busy === flag.id} onSave={(updates) => resolve(flag, "update", updates)} question={question} skills={state.skills} />
              ) : (
                <div className="row gap-2 mt-2">
                  <Button disabled={busy === flag.id} onClick={() => resolve(flag, "hide")} size="sm" variant="danger">Hide question</Button>
                  <Button disabled={busy === flag.id} onClick={() => setEditing(flag.id)} size="sm" variant="secondary">Edit</Button>
                  <Button disabled={busy === flag.id} onClick={() => resolve(flag, "dismiss")} size="sm" variant="secondary">Dismiss</Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
