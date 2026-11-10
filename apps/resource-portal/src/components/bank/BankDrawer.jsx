import React, { useEffect, useRef, useState } from "react";
import { getBankRecord, hideBankRecord, resolveBankFlag, restoreBankRecord, editBankRecord } from "../../backend/resourcesApi";
import Badge from "../Badge";
import Button from "../Button";
import ConfirmDialog from "../ConfirmDialog";
import Icon from "../Icon";
import { useToast } from "../ToastProvider";
import { FLAG_REASONS } from "../resources/BankQuestionsSection";
import BankEditForm from "./BankEditForm";
import { humanise, readable, sourceLine } from "./bankConfig";

const REASON_LABELS = Object.fromEntries(FLAG_REASONS);
const ACTION_LABELS = { hide: "Hidden", restore: "Restored", edit: "Edited", dismiss: "Flag dismissed" };

export function StatusBadge({ status }) {
  if (status === "live") return <Badge dot tone="success">Live</Badge>;
  if (status === "hidden") return <Badge dot tone="neutral">Hidden</Badge>;
  return <Badge tone="warn">{humanise(status)}</Badge>;
}

function formatDate(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

// The generator can raise the same flag on every run. Resolving closes every
// open flag on a question, so they are shown once and dismissed together.
function groupFlags(flags) {
  const groups = new Map();
  for (const flag of flags) {
    const key = `${flag.reason}:${flag.note}`;
    if (groups.has(key)) groups.get(key).count += 1;
    else groups.set(key, { key, flag, count: 1 });
  }
  return [...groups.values()];
}

function Section({ title, children }) {
  return (
    <section className="bank-section">
      <h4>{title}</h4>
      {children}
    </section>
  );
}

function Prose({ title, value }) {
  if (!value) return null;
  return <Section title={title}><div className="bank-prose">{value}</div></Section>;
}

function Details({ rows }) {
  const shown = rows.filter(([, value]) => value !== null && value !== undefined && value !== "");
  if (!shown.length) return null;
  return (
    <dl className="bank-details">
      {shown.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function detailRows(bankId, r) {
  const list = (values) => (values || []).map(humanise).join(", ");
  if (bankId === "maths") {
    return [
      ["Year", r.yearLevel], ["Topic", r.topic], ["Diagram type", humanise(r.diagramType)], ["Skill", humanise(r.skill)], ["Difficulty", humanise(r.difficulty)],
      ["Context", humanise(r.context)], ["Steps", humanise(r.steps)], ["Book's answer", r.bookAnswer ? readable(r.bookAnswer) : null],
      ["Other editions", r.otherEditions || null],
    ];
  }
  if (bankId === "stimuli") {
    return [
      ["Author", r.author], ["Publication", r.publication], ["Type", humanise(r.type)], ["Year", r.yearLevel], ["Difficulty", humanise(r.difficulty)],
      ["Length", r.medium === "written" && r.wordCount ? `${r.wordCount.toLocaleString()} words` : null], ["Themes", list(r.themes)],
    ];
  }
  if (bankId === "englishQuestions") {
    return [["Type", humanise(r.questionType)], ["Skill", humanise(r.skill)], ["Difficulty", humanise(r.difficulty)], ["Marks", r.marks], ["Techniques", list(r.techniques)]];
  }
  if (bankId === "guides") return [["Question", r.label], ["Marks", r.marks]];
  return [["Author", r.author], ["Form", humanise(r.form)], ["Themes", list(r.themes)], ["Characters", (r.characters || []).join(", ")], ["Key quotes", r.quoteCount || null]];
}

function Body({ bank, detail }) {
  const { record: r, links } = detail;
  const guidesFor = (questionId) => (links.guides || []).filter((guide) => guide.questionId === questionId);
  return (
    <>
      {detail.images.length ? (
        <div className="bank-images">
          {detail.images.map((src, index) => <img alt={`${bank.singular} source ${index + 1}`} key={src.slice(-32) + index} src={src} />)}
        </div>
      ) : null}
      {bank.id === "maths" ? <Prose title="Question" value={readable([r.stem, r.text].filter(Boolean).join("\n\n"))} /> : null}
      {bank.id === "stimuli" ? <Prose title={r.medium === "visual" ? "Text in the image" : "Text"} value={r.text} /> : null}
      {bank.id === "stimuli" ? <Prose title="Description" value={r.visualDescription} /> : null}
      {bank.id === "englishQuestions" ? <Prose title="Question" value={r.text} /> : null}
      {bank.id === "guides" ? <Prose title="Marking criteria" value={r.criteria} /> : null}
      {bank.id === "guides" ? <Prose title="Sample answer" value={r.sampleAnswer} /> : null}
      {bank.id === "setTexts" ? <Prose title="Summary" value={r.summary} /> : null}
      {bank.id === "setTexts" ? <Prose title="Context" value={r.context} /> : null}
      <Section title="Details"><Details rows={detailRows(bank.id, r)} /></Section>
      {r.techniques?.length && bank.id === "stimuli" ? (
        <Section title="Techniques">
          <ul className="bank-linked">
            {r.techniques.map((entry, index) => (
              <li key={`${entry.technique}-${index}`}>
                <strong>{humanise(entry.technique)}</strong>
                <span className="bank-muted">{entry.evidence}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {links.stimuli?.length ? (
        <Section title="Stimulus">
          <ul className="bank-linked">
            {links.stimuli.map((stimulus) => (
              <li key={stimulus.id}><div className="bank-linked-head"><strong>{stimulus.title || humanise(stimulus.type)}</strong><StatusBadge status={stimulus.status} /></div></li>
            ))}
          </ul>
        </Section>
      ) : null}
      {links.questions?.length ? (
        <Section title={links.questions.length === 1 ? "Linked question" : `Linked questions (${links.questions.length})`}>
          <ul className="bank-linked">
            {links.questions.map((question) => (
              <li key={question.id}>
                <div className="bank-linked-head"><strong>{question.label ? `Question ${question.label}` : "Question"}</strong><StatusBadge status={question.status} /></div>
                <span className="bank-muted">{question.text}</span>
                {guidesFor(question.id).map((guide) => (
                  <div className="bank-linked-guide" key={guide.id}>
                    <div className="bank-linked-head"><span>Marking guide</span><StatusBadge status={guide.status} /></div>
                    <span className="bank-muted">{guide.criteria || guide.sampleAnswer}</span>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {bank.id === "englishQuestions" && links.guides?.length ? (
        <Section title="Marking guide">
          <ul className="bank-linked">
            {links.guides.map((guide) => <li key={guide.id}><div className="bank-linked-head"><span className="bank-muted">{guide.criteria || guide.sampleAnswer}</span><StatusBadge status={guide.status} /></div></li>)}
          </ul>
        </Section>
      ) : null}
      <Section title="Source"><div className="bank-source">{r.sourcePath || "Unknown"}{r.pageNumber ? `, page ${r.pageNumber}` : ""}{r.label ? `, ${r.label}` : ""}</div></Section>
      {detail.history.length ? (
        <Section title="History">
          <ul className="bank-history">
            {detail.history.map((entry) => (
              <li key={entry.id}>
                <span>
                  {ACTION_LABELS[entry.action] || humanise(entry.action)}
                  {entry.fields.length ? ` (${entry.fields.map(humanise).join(", ").toLowerCase()})` : ""}
                  {entry.cascade ? `, with ${entry.cascade} linked` : ""}
                </span>
                <span className="bank-muted">{[entry.actorName, formatDate(entry.at)].filter(Boolean).join(" · ")}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}

export default function BankDrawer({ bank, onChanged, onClose, options, recordId, summary }) {
  const toast = useToast();
  const [detail, setDetail] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [confirmHide, setConfirmHide] = useState(false);
  const closeRef = useRef(null);
  const blocked = busy || confirmHide;

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setLoadError("");
    setEditing(false);
    setActionError("");
    getBankRecord({ bank: bank.id, id: recordId })
      .then((result) => { if (!cancelled) setDetail(result); })
      .catch((err) => { if (!cancelled) setLoadError(err?.userMessage || err?.message || "Could not open this record."); });
    return () => { cancelled = true; };
  }, [bank.id, recordId]);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape" && !blocked) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [blocked, onClose]);

  async function run(action, success) {
    setBusy(true);
    setActionError("");
    try {
      const result = await action();
      setDetail(result);
      setEditing(false);
      onChanged(result.record);
      toast.success(...success(result));
    } catch (err) {
      setActionError(err?.userMessage || err?.message || "That change could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  const hide = () => {
    setConfirmHide(false);
    return run(() => hideBankRecord({ bank: bank.id, id: recordId }), ({ cascade }) => [
      "Hidden",
      cascade ? `The generator will stop using this and ${cascade} linked ${cascade === 1 ? "record" : "records"}.` : "The generator will stop using this.",
    ]);
  };
  const restore = () => run(() => restoreBankRecord({ bank: bank.id, id: recordId }), ({ cascade }) => [
    "Restored",
    cascade ? `This and ${cascade} linked ${cascade === 1 ? "record are" : "records are"} back in use.` : "The generator can use this again.",
  ]);
  const save = (updates) => run(() => editBankRecord({ bank: bank.id, id: recordId, updates }), () => ["Saved", "Your corrections are in the bank."]);

  async function dismiss(flag) {
    setBusy(true);
    setActionError("");
    try {
      await resolveBankFlag({ flagId: flag.id, resolution: "dismiss" });
      const result = await getBankRecord({ bank: bank.id, id: recordId });
      setDetail(result);
      onChanged(result.record);
      toast.success("Flags dismissed", "The question stays in use.");
    } catch (err) {
      setActionError(err?.userMessage || err?.message || "Could not dismiss that flag.");
    } finally {
      setBusy(false);
    }
  }

  const record = detail?.record;
  const title = record ? bank.title(record) : summary ? bank.title(summary) : bank.singular;

  return (
    <>
      <div
        className="bank-drawer-overlay"
        onMouseDown={(event) => { if (event.target === event.currentTarget && !blocked) onClose(); }}
      >
        <aside aria-label={bank.singular} aria-modal="true" className="bank-drawer" role="dialog">
          <header className="bank-drawer-head">
            <div className="bank-drawer-title">
              <div className="bank-eyebrow">{bank.singular}</div>
              <h3>{title}</h3>
              <div className="bank-drawer-sub">
                {record ? <StatusBadge status={record.status} /> : null}
                {(record || summary) ? <span className="bank-muted">{sourceLine(record || summary)}</span> : null}
              </div>
            </div>
            <button aria-label="Close" className="icon-btn" disabled={busy} onClick={onClose} ref={closeRef} type="button">
              <Icon name="x" />
            </button>
          </header>

          {loadError ? <div className="bank-drawer-body"><div className="error" role="alert">{loadError}</div></div> : null}
          {!detail && !loadError ? (
            <div className="bank-drawer-body" aria-busy="true">
              <div className="skeleton bank-skeleton-block" />
              <div className="skeleton bank-skeleton-line" />
              <div className="skeleton bank-skeleton-line short" />
            </div>
          ) : null}

          {detail && editing ? (
            <BankEditForm
              bank={bank}
              busy={busy}
              error={actionError}
              onCancel={() => { setEditing(false); setActionError(""); }}
              onSave={save}
              options={options}
              record={record}
            />
          ) : null}

          {detail && !editing ? (
            <>
              <div className="bank-drawer-body">
                {actionError ? <div className="error mb-3" role="alert">{actionError}</div> : null}
                {detail.flags.length ? (
                  <section className="bank-flags" aria-label="Open flags">
                    {groupFlags(detail.flags).map((group) => (
                      <div className="bank-flag" key={group.key}>
                        <Icon name="alert" size={16} />
                        <div className="grow">
                          <div className="bank-flag-reason">
                            {REASON_LABELS[group.flag.reason] || humanise(group.flag.reason)}
                            {group.count > 1 ? <span className="bank-flag-times"> ×{group.count}</span> : null}
                          </div>
                          {group.flag.note ? <div className="bank-flag-note">“{readable(group.flag.note)}”</div> : null}
                          <div className="bank-muted">{[group.flag.createdByName, formatDate(group.flag.createdAt)].filter(Boolean).join(" · ")}</div>
                        </div>
                      </div>
                    ))}
                    <div className="bank-flags-actions">
                      <Button disabled={busy} onClick={() => dismiss(detail.flags[0])} size="sm" variant="secondary">
                        {detail.flags.length > 1 ? "Dismiss all" : "Dismiss"}
                      </Button>
                    </div>
                  </section>
                ) : null}
                {record.hiddenBecauseOfStimulus && record.status === "hidden" ? (
                  <div className="bank-note">Hidden along with its stimulus. Restoring the stimulus brings this back too.</div>
                ) : null}
                <Body bank={bank} detail={detail} />
              </div>
              <div className="bank-drawer-foot">
                {record.status === "live" || record.status === "hidden" ? (
                  <Button disabled={busy} icon="edit" onClick={() => setEditing(true)} variant="secondary">Edit</Button>
                ) : null}
                {record.status === "live" ? (
                  <Button
                    icon="eye-off"
                    loading={busy}
                    onClick={() => (bank.id === "stimuli" ? setConfirmHide(true) : hide())}
                    variant="danger"
                  >
                    Hide
                  </Button>
                ) : null}
                {record.status === "hidden" ? <Button icon="refresh" loading={busy} onClick={restore} variant="primary">Restore</Button> : null}
              </div>
            </>
          ) : null}
        </aside>
      </div>
      <ConfirmDialog
        confirmLabel="Hide stimulus"
        message="Its questions and marking guides will be hidden too, unless another stimulus still uses them. You can restore it later."
        onCancel={() => setConfirmHide(false)}
        onConfirm={hide}
        open={confirmHide}
        title="Hide this stimulus?"
      />
    </>
  );
}
