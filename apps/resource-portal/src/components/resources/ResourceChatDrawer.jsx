import React, { useEffect, useRef, useState } from "react";
import { chatAboutResource } from "../../backend/resourcesApi";
import Button from "../Button";
import Icon from "../Icon";
import { answerModeLabel, resourceLabel } from "./resourceTypes";

const MAX_PROMPT = 5000;

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

/**
 * RES-24: talk a resource through with AI before generating it. Opens beside
 * the job builder so the form stays visible, and ends with the AI's draft
 * written into the custom prompt. The transcript lives only in this component;
 * file summaries are held by the builder (`summaries`, keyed by storage path)
 * so reopening the chat doesn't re-read files.
 */
export default function ResourceChatDrawer({ draft, summaries, onSummaries, onUsePrompt, onClose }) {
  const [seededPrompt] = useState(() => (draft.customPrompt || "").trim());
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [input, setInput] = useState("");
  const [showContext, setShowContext] = useState(false);
  const [pastResources, setPastResources] = useState(null);
  const scrollRef = useRef(null);
  const mountedRef = useRef(true);
  // StrictMode runs effects twice in development; without this the opening
  // turn (and any file summarising) would be requested twice.
  const openedRef = useRef(false);

  const files = draft.uploadedFiles || [];
  const unsummarised = files.filter((file) => !summaries[file.path]);
  const latestProposalId = [...messages].reverse().find((m) => m.proposedPrompt)?.id;

  useEffect(() => {
    mountedRef.current = true;
    if (!openedRef.current) {
      openedRef.current = true;
      runTurn([]);
    }
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
          proposedPrompt: result.proposedPrompt || null,
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
    if (!value || busy) return;
    const transcript = [...messages, { id: `u${messages.length}`, role: "user", content: value }];
    setMessages(transcript);
    setInput("");
    runTurn(transcript);
  }

  function retry() {
    runTurn(messages);
  }

  const subtitle = [
    resourceLabel(draft.resourceType),
    `Year ${draft.year} ${capitalise(draft.subject)}`,
    draft.studentName,
  ].filter(Boolean).join(" · ");

  return (
    <aside aria-label="Discuss with AI" className="rg-chat-drawer" role="dialog">
      <div className="rg-chat-head">
        <div className="grow">
          <h3>Discuss with AI</h3>
          <div className="modal-sub">{subtitle}</div>
        </div>
        <button aria-label="Close" className="icon-btn" onClick={onClose} type="button">
          <Icon name="x" />
        </button>
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
                {resourceLabel(draft.resourceType)} · Year {draft.year} {capitalise(draft.subject)}
                {draft.answerMode ? ` · ${answerModeLabel(draft.answerMode, draft.subject)}` : ""}
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
                <div className="text-sm muted">Loading…</div>
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
        {seededPrompt ? (
          <div className="rg-chat-seed">
            <div className="rg-chat-context-label">Current prompt</div>
            <div className="text-sm">{seededPrompt}</div>
          </div>
        ) : null}

        {messages.map((message) => {
          if (message.role === "user") {
            return <div className="rg-chat-msg rg-chat-msg-user" key={message.id}>{message.content}</div>;
          }
          const superseded = message.proposedPrompt && message.id !== latestProposalId;
          return (
            <div className="rg-chat-ai" key={message.id}>
              <div className="rg-chat-avatar"><Icon name="sparkles" size={14} /></div>
              <div className="rg-chat-ai-col">
                <div className="rg-chat-msg rg-chat-msg-ai">{message.content}</div>
                {message.proposedPrompt ? (
                  <div className={`rg-chat-proposal${superseded ? " superseded" : ""}`}>
                    <div className="rg-chat-proposal-head">
                      <span>{superseded ? "Earlier draft" : "Draft prompt"}</span>
                      <span>{message.proposedPrompt.length} / {MAX_PROMPT}</span>
                    </div>
                    <div className="rg-chat-proposal-text">{message.proposedPrompt}</div>
                    {!superseded ? (
                      <div className="rg-chat-proposal-actions">
                        <Button icon="check" onClick={() => onUsePrompt(message.proposedPrompt)} size="sm" variant="primary">
                          Use this prompt
                        </Button>
                        <span className="text-xs muted">You can still edit it afterwards.</span>
                      </div>
                    ) : null}
                  </div>
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
            <Button onClick={retry} size="sm" variant="secondary">Try again</Button>
          </div>
        ) : null}
      </div>

      <div className="rg-chat-composer">
        <textarea
          aria-label="Message"
          className="textarea"
          disabled={busy}
          maxLength={4000}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          placeholder="Reply, or ask for changes…"
          rows={2}
          value={input}
        />
        <Button aria-label="Send" disabled={!input.trim() || busy} icon="send" onClick={() => send()} variant="primary" />
      </div>
    </aside>
  );
}
