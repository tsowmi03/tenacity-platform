import React, { useState } from "react";
import Button from "../Button";
import { changedFields, draftOf } from "./bankConfig";

function ChipPicker({ choices, disabled, label, onChange, value }) {
  const selected = new Set(value);
  const toggle = (choice) => {
    const next = new Set(selected);
    if (next.has(choice)) next.delete(choice);
    else next.add(choice);
    onChange([...next]);
  };
  return (
    <div aria-label={label} className="bank-chip-picker" role="group">
      {choices.map((choice) => (
        <button
          aria-pressed={selected.has(choice.value)}
          className={`bank-chip-toggle${selected.has(choice.value) ? " on" : ""}`}
          disabled={disabled}
          key={choice.value}
          onClick={() => toggle(choice.value)}
          type="button"
        >
          {choice.label}
        </button>
      ))}
    </div>
  );
}

function Field({ busy, draft, field, onChange, options, record }) {
  const id = `bank-edit-${field.key}`;
  const value = draft[field.key];
  if (field.kind === "chips") {
    return (
      <div className="field">
        <span className="label">{field.label}</span>
        <ChipPicker choices={field.choices(options, draft, record)} disabled={busy} label={field.label} onChange={onChange} value={value} />
      </div>
    );
  }
  const common = { className: field.kind === "select" ? "select" : field.kind === "textarea" ? "textarea" : "input", disabled: busy, id, value };
  const change = (event) => onChange(event.target.value);
  return (
    <div className="field">
      <label className="label" htmlFor={id}>{field.label}</label>
      {field.kind === "textarea" ? <textarea {...common} onChange={change} rows={field.rows || 3} /> : null}
      {field.kind === "text" || field.kind === "list" ? <input {...common} onChange={change} type="text" /> : null}
      {field.kind === "number" ? <input {...common} min={0} onChange={change} type="number" /> : null}
      {field.kind === "select" ? (
        <select {...common} onChange={change}>
          <option value="">{field.nullable ? "Not set" : "Select…"}</option>
          {field.choices(options, draft, record).map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
        </select>
      ) : null}
      {field.hint ? <div className="bank-hint">{field.hint}</div> : null}
    </div>
  );
}

export default function BankEditForm({ bank, busy, error, onCancel, onSave, options, record }) {
  const fields = bank.fields.filter((field) => !field.when || field.when(record));
  const [draft, setDraft] = useState(() => draftOf(fields, record));
  const updates = changedFields(fields, record, draft);
  const dirty = Object.keys(updates).length > 0;

  function setField(field, value) {
    setDraft((current) => {
      const next = { ...current, [field.key]: value };
      for (const dependent of field.resets || []) next[dependent] = "";
      return next;
    });
  }

  return (
    <form
      className="bank-drawer-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (dirty && !busy) onSave(updates);
      }}
    >
      <div className="bank-drawer-body">
        {error ? <div className="error mb-3" role="alert">{error}</div> : null}
        <div className="bank-form-grid">
          {fields.map((field) => (
            <Field busy={busy} draft={draft} field={field} key={field.key} onChange={(value) => setField(field, value)} options={options} record={record} />
          ))}
        </div>
      </div>
      <div className="bank-drawer-foot">
        <Button disabled={busy} onClick={onCancel} variant="secondary">Cancel</Button>
        <Button disabled={!dirty} loading={busy} type="submit" variant="primary">Save changes</Button>
      </div>
    </form>
  );
}
