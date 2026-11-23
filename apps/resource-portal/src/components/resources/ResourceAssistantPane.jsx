import React, { useEffect, useRef, useState } from "react";
import { chatAboutResource } from "../../backend/resourcesApi";
import Button from "../Button";
import Icon from "../Icon";
import { RESOURCE_BY_KEY, answerModeLabel, resourceLabel } from "./resourceTypes";

const MAX_MESSAGE = 4000;
const BRIEF_PREVIEW = 160;

const STARTERS = [
  "What should I make for this student?",
  "Plan revision for an upcoming test",
  "What can the generator make?",
];

function capitalise(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

function shortDate(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function chatErrorMessage(error) {
  // An unreadable reference file has a specific fix; anything else is retryable.
  if (error?.code === "failed-precondition" && error?.serverMessage) return error.serverMessage;
  return "Couldn't get a reply. Your messages are still here.";
}

// A RES-24 server returns only a draft prompt; treat it as a brief-only
// proposal so the card still works until the Functions deploy catches up.
function proposalFromResult(result) {
  if (result?.proposal) return result.proposal;
  if (result?.proposedPrompt) return { brief: result.proposedPrompt };
  return null;
}

function answersLabel(answerMode, subject) {
  return answerModeLabel(answerMode || "none", subject);
}

/**
 * The rows of a proposal card, each with what the form has now, so the tutor
 * sees exactly what Apply will change. Only rows the proposal sets are shown.
 */
export function proposalRows(proposal, draft) {
  if (!proposal) return [];
  const rows = [];
  const subject = proposal.subject || draft.subject;
  // The subject only shows when the proposal switches it.
  if (proposal.subject && proposal.subject !== draft.subject) {
    rows.push({ key: "subject", label: "Subject", value: capitalise(proposal.subject), was: capitalise(draft.subject), changed: proposal.subject !== draft.subject });
  }
  if (proposal.resourceType) {
    rows.push({
      key: "resourceType",
      label: "Type",
      value: resourceLabel(proposal.resourceType),
      was: draft.resourceType ? resourceLabel(draft.resourceType) : "Not chosen",
      changed: proposal.resourceType !== draft.resourceType,
    });
  }
  if (proposal.sections?.length) {
    rows.push({ key: "sections", label: "Sections", value: proposal.sections.join(" · "), changed: false });
  }
  const hasQuestions = RESOURCE_BY_KEY[proposal.resourceType]?.hasQuestions;
  if (proposal.resourceType && hasQuestions) {
    rows.push({
      key: "answerMode",
      label: "Answers",
      value: answersLabel(proposal.answerMode, subject),
      was: answersLabel(draft.answerMode, draft.subject),
      changed: (proposal.answerMode || "none") !== (draft.answerMode || "none"),
    });
    rows.push({
      key: "showMarks",
      label: "Marks",
      value: proposal.showMarks ? "Shown" : "Hidden",
      was: draft.showMarks ? "Shown" : "Hidden",
      changed: Boolean(proposal.showMarks) !== Boolean(draft.showMarks),
    });
  }
  if (proposal.brief) {
    rows.push({ key: "customPrompt", label: "Brief", value: proposal.brief, changed: proposal.brief.trim() !== (draft.customPrompt || "").trim() });
  }
  return rows;
}

function ProposalCard({ proposal, draft, superseded, onApply }) {
  const [showBrief, setShowBrief] = useState(false);
  const rows = proposalRows(proposal, draft);
  const changes = rows.filter((row) => row.changed && row.key !== "sections").length;
  const longBrief = (proposal.brief || "").length > BRIEF_PREVIEW;

  return (
    <div className={`rg-proposal${superseded ? " superseded" : ""}`}>
      <div className="rg-proposal-head">
        <Icon name="sparkles" size={14} />
        <span>{superseded ? "Earlier proposal" : "Proposal"}</span>
        <span className="rg-proposal-count">
          {superseded ? "" : changes ? `${changes} change${changes === 1 ? "" : "s"} to the form` : "Matches the form"}
        </span>
      </div>
      <dl className="rg-proposal-rows">
        {rows.map((row) => (
          <React.Fragment key={row.key}>
            <dt>{row.label}</dt>
            <dd>
              {row.changed && row.was && row.key !== "customPrompt" ? <s>{row.was}</s> : null}
              <span className={row.changed && row.key !== "customPrompt" ? "rg-proposal-new" : ""}>
                {row.key === "customPrompt" && longBrief && !showBrief
                  ? `${row.value.slice(0, BRIEF_PREVIEW).trimEnd()}…`
                  : row.value}
              </span>
            </dd>
          </React.Fragment>
        ))}
      </dl>
      {!superseded ? (
        <div className="rg-proposal-actions">
          <Button disabled={!changes} icon="check" onClick={() => onApply(proposal)} size="sm" variant="primary">
            {changes ? "Apply to form" : "Applied"}
          </Button>
          {longBrief ? (
            <Button onClick={() => setShowBrief((open) => !open)} size="sm" variant="ghost">
              {showBrief ? "Hide full brief" : "See full brief"}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * RES-102: the resource assistant. Sits beside the job builder, above the
 * queue, so the form and the conversation are visible together. It talks
 * about the current draft, which it reads fresh on every turn, so changing the
 * type or subject mid-conversation doesn't end it. A proposal is applied to
 * the form through onApplyProposal. The transcript lives only in this
 * component: the builder remounts it (via key) for a new student or New chat.
 */
export default function ResourceAssistantPane({ draft, summaries, onSummaries, onApplyProposal, onNewChat }) {
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [input, setInput] = useState("");
  const [showContext, setShowContext] = useState(false);
  const [pastResources, setPastResources] = useState(null);
  const scrollRef = useRef(null);
  const mountedRef = useRef(true);

  const files = draft.uploadedFiles || [];
  const unsummarised = files.filter((file) => !summaries[file.path]);
  const latestProposalId = [...messages].reverse().find((m) => m.proposal)?.id;
  const canChat = Boolean(draft.studentId) && draft.uploadProgress == null;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy, error]);

  async function runTurn(transcript) {
    setBusy(true);
    setError(null);
    try {
      const result = await chatAboutResource({ draft, fileSummaries: summaries, messages: transcript });
      if (!mountedRef.current) return;
      if (result?.fileSummaries?.length) onSummaries(result.fileSummaries);
      if (Array.isArray(result?.pastResources)) setPastResources(result.pastResources);
      setMessages([
        ...transcript,
        {
          id: `a${transcript.length}`,
          role: "assistant",
          content: result.reply,
          proposal: proposalFromResult(result),
          activity: Array.isArray(result.activity) ? result.activity : [],
          suggestions: result.suggestions || [],
        },
      ]);
    } catch (err) {
      if (mountedRef.current) setError(chatErrorMessage(err));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }

  function send(text) {
    const value = String(text ?? input).trim();
    if (!value || busy || !canChat) return;
    const transcript = [...messages, { id: `u${messages.length}`, role: "user", content: value }];
    setMessages(transcript);
    setInput("");
    runTurn(transcript);
  }

  const subtitle = draft.studentId
    ? [
        draft.studentName,
        draft.year ? `Year ${draft.year}` : null,
        capitalise(draft.subject),
        draft.resourceType ? resourceLabel(draft.resourceType) : null,
      ].filter(Boolean).join(" · ")
    : "Choose a student to start";

  return (
    <section aria-label="Resource assistant" className="rg-assistant card">
      <div className="rg-chat-head">
        <div className="grow">
          <h3>Resource assistant</h3>
          <div className="modal-sub">{subtitle}</div>
        </div>
        {messages.length ? (
          <Button disabled={busy} onClick={onNewChat} size="sm" variant="ghost">New chat</Button>
        ) : null}
      </div>

      <div className="rg-chat-context">
        <button
          aria-expanded={showContext}
          className="rg-chat-context-toggle"
          onClick={() => setShowContext((open) => !open)}
          type="button"
        >
          <Icon name={showContext ? "chevron-down" : "chevron-right"} size={14} />
          What the AI can see
          <span className="rg-chat-context-chips">
            <span className="badge badge-neutral">Form</span>
            <span className="badge badge-neutral">Generator</span>
            <span className="badge badge-neutral">{files.length} file{files.length === 1 ? "" : "s"}</span>
            {pastResources ? (
              <span className="badge badge-neutral">
                {pastResources.length} past resource{pastResources.length === 1 ? "" : "s"}
              </span>
            ) : null}
          </span>
        </button>
        {showContext ? (
          <div className="rg-chat-context-body">
            <div className="rg-chat-context-group">
              <div className="rg-chat-context-label">Form</div>
              <div className="text-sm">
                {draft.resourceType ? resourceLabel(draft.resourceType) : "No type chosen"}
                {draft.year ? ` · Year ${draft.year}` : ""} · {capitalise(draft.subject)}
                {RESOURCE_BY_KEY[draft.resourceType]?.hasQuestions && draft.answerMode
                  ? ` · ${answerModeLabel(draft.answerMode, draft.subject)}`
                  : ""}
              </div>
            </div>
            <div className="rg-chat-context-group">
              <div className="rg-chat-context-label">Generator</div>
              <div className="text-sm">
                Every resource type and its sections, the question bank&apos;s coverage, the diagrams it can
                draw, and where English texts come from.
              </div>
            </div>
            <div className="rg-chat-context-group">
              <div className="rg-chat-context-label">Reference files (summaries)</div>
              {files.length ? files.map((file) => (
                <div className="rg-chat-file" key={file.path}>
                  <div className="rg-chat-file-head">
                    <Icon name="file-text" size={14} />
                    <span className="rg-chat-file-name" title={file.name}>{file.name}</span>
                    {summaries[file.path] ? (
                      <span className="badge badge-success">Summarised</span>
                    ) : busy ? (
                      <span className="badge badge-info">Reading…</span>
                    ) : (
                      <span className="badge badge-warn">Read on next message</span>
                    )}
                  </div>
                  {summaries[file.path] ? <div className="text-xs muted">{summaries[file.path]}</div> : null}
                </div>
              )) : <div className="text-sm muted">No files attached.</div>}
            </div>
            <div className="rg-chat-context-group">
              <div className="rg-chat-context-label">
                {draft.studentName ? `${draft.studentName}'s recent resources` : "Recent resources"}
              </div>
              {pastResources === null ? (
                <div className="text-sm muted">Shown after the first reply.</div>
              ) : pastResources.length ? pastResources.map((resource, index) => (
                <div className="text-sm" key={`${resource.createdAt}-${index}`}>
                  {resourceLabel(resource.resourceType)}
                  {resource.topics?.length ? ` · ${resource.topics.join(", ")}` : ""}
                  {resource.createdAt ? <span className="muted"> · {shortDate(resource.createdAt)}</span> : null}
                </div>
              )) : <div className="text-sm muted">No completed resources yet.</div>}
            </div>
          </div>
        ) : null}
      </div>

      <div className="rg-chat-messages" ref={scrollRef}>
        {!messages.length ? (
          <div className="rg-assistant-welcome">
            <div className="rg-chat-ai">
              <div className="rg-chat-avatar"><Icon name="sparkles" size={14} /></div>
              <div className="rg-chat-msg rg-chat-msg-ai">
                {canChat
                  ? "Tell me about the student and what they need. I'll suggest the right resource, how to structure it, and write the brief. You can apply it to the form in one click."
                  : draft.studentId
                    ? "I'll be ready once the upload finishes."
                    : "Choose a student on the form, then tell me what they need. I'll suggest the right resource and how to structure it."}
              </div>
            </div>
            {canChat ? (
              <div className="rg-chat-suggestions">
                {STARTERS.map((starter) => (
                  <button key={starter} onClick={() => send(starter)} type="button">{starter}</button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {messages.map((message) => {
          if (message.role === "user") {
            return <div className="rg-chat-msg rg-chat-msg-user" key={message.id}>{message.content}</div>;
          }
          return (
            <div className="rg-chat-ai" key={message.id}>
              <div className="rg-chat-avatar"><Icon name="sparkles" size={14} /></div>
              <div className="rg-chat-ai-col">
                {message.activity?.length ? (
                  <ul aria-label="What the assistant checked" className="rg-assistant-activity">
                    {message.activity.map((line) => (
                      <li key={line}><Icon name="check" size={12} /> {line}</li>
                    ))}
                  </ul>
                ) : null}
                <div className="rg-chat-msg rg-chat-msg-ai">{message.content}</div>
                {message.proposal ? (
                  <ProposalCard
                    draft={draft}
                    onApply={onApplyProposal}
                    proposal={message.proposal}
                    superseded={message.id !== latestProposalId}
                  />
                ) : null}
                {message === messages.at(-1) && message.suggestions?.length && !busy ? (
                  <div className="rg-chat-suggestions">
                    {message.suggestions.map((suggestion) => (
                      <button key={suggestion} onClick={() => send(suggestion)} type="button">{suggestion}</button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}

        {busy ? (
          <div className="rg-chat-ai">
            <div className="rg-chat-avatar"><Icon name="sparkles" size={14} /></div>
            <div className="rg-chat-status" role="status">
              <span className="rg-chat-dots"><i /><i /><i /></span>
              {unsummarised.length
                ? `Reading ${unsummarised.length} reference file${unsummarised.length === 1 ? "" : "s"}…`
                : "Thinking…"}
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="banner banner-danger rg-chat-error" role="alert">
            <Icon name="alert" size={16} />
            <div className="grow">{error}</div>
            <Button onClick={() => runTurn(messages)} size="sm" variant="secondary">Try again</Button>
          </div>
        ) : null}
      </div>

      <div className="rg-chat-composer">
        <textarea
          aria-label="Message"
          className="textarea"
          disabled={busy || !canChat}
          maxLength={MAX_MESSAGE}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          placeholder={canChat ? "Ask about a resource, or ask for changes…" : "Choose a student first"}
          rows={2}
          value={input}
        />
        <Button aria-label="Send" disabled={!input.trim() || busy || !canChat} icon="send" onClick={() => send()} variant="primary" />
      </div>
    </section>
  );
}
