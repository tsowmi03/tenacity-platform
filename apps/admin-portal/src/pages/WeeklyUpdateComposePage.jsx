import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { loadAnnouncementReportingOverview } from "../backend/announcementReportingCache";
import {
  createWeeklyUpdate,
  deleteWeeklyUpdate,
  getWeeklyUpdate,
  previewWeeklyUpdate,
  saveWeeklyUpdate,
  sendWeeklyUpdate,
  sendWeeklyUpdateTest,
} from "../backend/weeklyUpdateApi";
import {
  BLOCK_TYPES,
  DEFAULT_CTA,
  DEFAULT_MASTHEAD_EYEBROW,
  announcementIdsFromBlocks,
  blockRendersInEmail,
  blockTypeLabel,
  moveBlock,
  newBlock,
} from "../backend/weeklyUpdateBlocks";
import Badge from "../components/Badge";
import Button from "../components/Button";
import ConfirmDialog from "../components/ConfirmDialog";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import { useToast } from "../components/ToastProvider";
import WeeklyUpdateBlockFields from "./WeeklyUpdateBlockFields";
import useInlinePreviewEditing from "./useInlinePreviewEditing";
import {
  DEFAULT_DIGEST_WINDOW,
  DIGEST_WINDOWS,
  digestCandidates,
  draftBlockers,
  recipientSummary,
  statusLabel,
  statusTone,
} from "./weeklyUpdateDigest";

const REPORTING_TIME_ZONE = "Australia/Sydney";

const EMPTY_DRAFT = {
  subject: "",
  preheader: "",
  masthead: { eyebrow: DEFAULT_MASTHEAD_EYEBROW },
  cta: { ...DEFAULT_CTA },
  blocks: [],
  status: "draft",
};

/**
 * The pseudo-block id the renderer uses for fields that belong to the email
 * itself rather than to a block.
 */
const CHROME_BLOCK = "__chrome";

/**
 * One inline edit applied to a draft.
 *
 * The field names are the renderer's, asserted in
 * `backend/firebase/functions/test/unit/weeklyUpdateBlocks.test.js`. An
 * unrecognised one returns the draft untouched rather than inventing a key,
 * because a typo here would otherwise write a field nothing ever reads.
 */
export function applyInlineEdit(draft, { blockId, field, value }) {
  if (!draft || !blockId || !field) return draft;

  if (blockId === CHROME_BLOCK) {
    const [group, key] = field.split(".");
    if (group !== "masthead" && group !== "cta") return draft;
    if (!key) return draft;
    return { ...draft, [group]: { ...(draft[group] ?? {}), [key]: value } };
  }

  const index = (draft.blocks ?? []).findIndex((block) => block.id === blockId);
  if (index === -1) return draft;

  const blocks = draft.blocks.map((block, blockIndex) => {
    if (blockIndex !== index) return block;

    const link = field.match(/^links\.(\d+)\.label$/);
    if (link) {
      const linkIndex = Number(link[1]);
      const links = (block.links ?? []).map((entry, entryIndex) =>
        entryIndex === linkIndex ? { ...entry, label: value } : entry
      );
      return { ...block, links };
    }
    return { ...block, [field]: value };
  });

  return { ...draft, blocks };
}

function formatDate(iso) {
  if (!iso) return "Date not recorded";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Date not recorded";
  return date.toLocaleDateString("en-AU", {
    timeZone: REPORTING_TIME_ZONE,
    day: "numeric",
    month: "short",
  });
}

function errorMessage(error, fallback) {
  return error?.userMessage || error?.message || fallback;
}

export default function WeeklyUpdateComposePage() {
  const { blastId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const isNew = !blastId || blastId === "new";

  const [draft, setDraft] = useState(null);
  const [savedId, setSavedId] = useState(isNew ? null : blastId);
  const [announcements, setAnnouncements] = useState(null);
  const [users, setUsers] = useState(null);
  const [windowId, setWindowId] = useState(DEFAULT_DIGEST_WINDOW);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setLoadError("");

    Promise.all([
      loadAnnouncementReportingOverview(),
      isNew ? Promise.resolve(EMPTY_DRAFT) : getWeeklyUpdate(blastId),
    ])
      .then(([[announcementRows, userRows], loadedDraft]) => {
        if (cancelled) return;
        setAnnouncements(announcementRows);
        setUsers(userRows);
        if (!loadedDraft) {
          setLoadError("That weekly update no longer exists.");
          return;
        }
        setDraft(loadedDraft);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(errorMessage(error, "Failed to load this weekly update."));
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [blastId, isNew]);

  const readOnly = draft?.status === "sent" || draft?.status === "sending";
  const blocks = draft?.blocks ?? [];
  const selectedAnnouncementIds = useMemo(
    () => announcementIdsFromBlocks(blocks),
    [blocks]
  );

  const candidates = useMemo(
    () =>
      digestCandidates(announcements ?? [], {
        windowId,
        selectedIds: selectedAnnouncementIds,
      }),
    [announcements, windowId, selectedAnnouncementIds]
  );

  const announcementOptions = useMemo(
    () =>
      candidates.map((announcement) => ({
        id: announcement.id,
        label: `${announcement.title || "Untitled announcement"} · ${formatDate(
          announcement.createdAtIso
        )}`,
      })),
    [candidates]
  );

  const recipients = useMemo(() => recipientSummary(users ?? []), [users]);

  const blockers = useMemo(
    () => (draft ? draftBlockers(draft, { eligible: recipients.eligible }) : []),
    [draft, recipients.eligible]
  );

  // The email leaves out a block with nothing in it, so one can be sitting in the
  // list below and absent from the preview. Saying which ones is kinder than
  // letting someone conclude the preview is broken.
  const emptyBlockPositions = useMemo(
    () =>
      blocks
        .map((block, index) => (blockRendersInEmail(block) ? null : index + 1))
        .filter(Boolean),
    [blocks]
  );

  const update = useCallback((patch) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const setBlocks = useCallback((next) => {
    setDraft((current) =>
      current
        ? { ...current, blocks: typeof next === "function" ? next(current.blocks) : next }
        : current
    );
  }, []);

  const patchBlock = useCallback(
    (index, fields) => {
      setBlocks((current) =>
        current.map((block, blockIndex) =>
          blockIndex === index ? { ...block, ...fields } : block
        )
      );
    },
    [setBlocks]
  );

  const addBlock = useCallback(
    (type) => {
      const block = newBlock(type);
      if (block) setBlocks((current) => [...current, block]);
    },
    [setBlocks]
  );

  const duplicateBlock = useCallback(
    (index) => {
      setBlocks((current) => {
        const source = current[index];
        if (!source) return current;
        // Same content, new id: two blocks sharing one id would make the reorder
        // controls and React's reconciliation act on whichever came first.
        const copy = { ...source, id: newBlock(source.type)?.id ?? `${source.id}-copy` };
        return [...current.slice(0, index + 1), copy, ...current.slice(index + 1)];
      });
    },
    [setBlocks]
  );

  const persist = useCallback(async () => {
    if (!draft) return null;
    setSaving(true);
    try {
      if (savedId) {
        await saveWeeklyUpdate(savedId, draft);
        return savedId;
      }
      const created = await createWeeklyUpdate(draft);
      setSavedId(created.id);
      // Keep the URL in step so a refresh reopens the saved draft.
      navigate(`/weekly-update/${created.id}`, { replace: true });
      return created.id;
    } finally {
      setSaving(false);
    }
  }, [draft, navigate, savedId]);

  // Creating a brand-new draft's first preview fires two of these concurrently:
  // `handlePreview` calls it directly, and `persist()` navigating to the new
  // draft's URL changes `blastId`, which re-triggers the effect below for the
  // same id. Without ordering, whichever response lands last wins — including
  // the older of the two landing after a newer edit's request. The generation
  // counter drops any response that is not from the most recently issued call.
  const previewRequestRef = useRef(0);

  const refreshPreview = useCallback(async (id) => {
    if (!id) return;
    const requestId = ++previewRequestRef.current;
    setPreviewing(true);
    setPreviewError("");
    try {
      const result = await previewWeeklyUpdate(id);
      if (previewRequestRef.current !== requestId) return;
      setPreviewHtml(result?.html ?? "");
    } catch (error) {
      if (previewRequestRef.current !== requestId) return;
      setPreviewError(errorMessage(error, "Could not render the preview."));
    } finally {
      if (previewRequestRef.current === requestId) setPreviewing(false);
    }
  }, []);

  // An already-saved draft previews as soon as it opens. This only reads, so
  // opening a blank composer does not quietly create a draft to render.
  useEffect(() => {
    if (isNew) return;
    refreshPreview(blastId);
  }, [blastId, isNew, refreshPreview]);

  // Editing the copy in the preview itself. The edit lands in the same draft
  // state the fields below write to, so the two stay one source of truth: type
  // in the preview and the field updates, and Save sends what you can see.
  const previewFrameRef = useRef(null);

  const handleInlineEdit = useCallback((edit) => {
    setDraft((current) => applyInlineEdit(current, edit));
  }, []);

  useInlinePreviewEditing({
    frameRef: previewFrameRef,
    html: previewHtml,
    enabled: !readOnly,
    onEdit: handleInlineEdit,
  });

  async function handleSave() {
    try {
      await persist();
      toast.success("Draft saved");
    } catch (error) {
      toast.error("Could not save draft", errorMessage(error, "Try again."));
    }
  }

  // The callable renders whatever is stored, so unsaved edits have to be
  // persisted first or the preview would show the previous version.
  async function handlePreview() {
    try {
      const id = await persist();
      await refreshPreview(id);
    } catch (error) {
      setPreviewError(errorMessage(error, "Could not save the draft to preview it."));
    }
  }

  async function handleTestSend() {
    const address = testEmail.trim();
    if (!address) return;
    setSending(true);
    try {
      const id = await persist();
      const result = await sendWeeklyUpdateTest(id, [address]);
      const toneFn = result?.failureCount ? toast.warn : toast.success;
      toneFn(
        result?.failureCount ? "Test send failed" : "Test sent",
        `${address}: ${result?.successCount ?? 0} delivered`
      );
    } catch (error) {
      toast.error("Could not send test", errorMessage(error, "Try again."));
    } finally {
      setSending(false);
    }
  }

  async function handleSend() {
    setConfirmSend(false);
    setSending(true);
    try {
      const id = await persist();
      const result = await sendWeeklyUpdate(id);
      // The callable resolves even when every recipient was rejected, so the
      // toast has to read the counts. Reporting that as success would leave an
      // admin believing parents were emailed when none were.
      const delivered = result?.successCount ?? 0;
      const failed = result?.failureCount ?? 0;
      const detail = `${delivered} of ${result?.recipientCount ?? 0} parents emailed`;
      if (!delivered) {
        toast.error("Weekly update could not be delivered", detail);
      } else if (failed) {
        toast.warn("Weekly update partly delivered", detail);
      } else {
        toast.success("Weekly update sent", detail);
      }
      const refreshed = await getWeeklyUpdate(id).catch(() => null);
      if (refreshed) setDraft(refreshed);
    } catch (error) {
      toast.error("Could not send update", errorMessage(error, "Try again."));
      // The send may have claimed the draft before failing; show its real state.
      if (savedId) {
        const refreshed = await getWeeklyUpdate(savedId).catch(() => null);
        if (refreshed) setDraft(refreshed);
      }
    } finally {
      setSending(false);
    }
  }

  async function handleDelete() {
    if (!savedId) {
      navigate("/weekly-update");
      return;
    }
    try {
      await deleteWeeklyUpdate(savedId);
      toast.success("Draft deleted");
      navigate("/weekly-update");
    } catch (error) {
      toast.error("Could not delete draft", errorMessage(error, "Try again."));
    }
  }

  if (!draft) {
    if (busy) return <div className="route-state">Loading weekly update...</div>;
    return (
      <>
        <PageHeader
          title="Weekly update"
          crumbs={[
            { label: "Weekly update", href: "/weekly-update" },
            { label: "Not found" },
          ]}
        />
        <div className="banner banner-danger mb-5">
          <Icon className="banner-icon" name="alert" />
          <div>
            <div className="banner-title">This weekly update could not be opened</div>
            <div>{loadError || "Try again from the weekly update list."}</div>
          </div>
          <Button onClick={() => navigate("/weekly-update")} size="sm">
            Back to list
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={draft.subject || "New weekly update"}
        subtitle={
          readOnly
            ? "This update has been sent and can no longer be edited."
            : "Build the email out of blocks, reorder them, then send to parents."
        }
        crumbs={[
          { label: "Weekly update", href: "/weekly-update" },
          { label: savedId ? "Edit" : "New" },
        ]}
        actions={
          <>
            <Badge tone={statusTone(draft.status)}>{statusLabel(draft.status)}</Badge>
            {readOnly ? null : (
              <>
                <Button icon="check" onClick={handleSave} loading={saving}>
                  Save draft
                </Button>
                <Button
                  variant="primary"
                  icon="send"
                  onClick={() => setConfirmSend(true)}
                  disabled={blockers.length > 0 || sending}
                  loading={sending}
                >
                  Send now
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="grid-3 mb-5">
        <StatCard
          icon="people"
          label="Parents who will receive this"
          value={recipients.eligible}
          foot={recipients.unusable ? `${recipients.unusable} without a usable email` : null}
        />
        <StatCard icon="x-circle" label="Opted out" value={recipients.optedOut} />
        <StatCard
          icon="list"
          label="Content blocks"
          value={blocks.length}
          foot={`${selectedAnnouncementIds.length} announcement${
            selectedAnnouncementIds.length === 1 ? "" : "s"
          }`}
        />
      </div>

      {draft.status === "sent" ? (
        <div className="banner mb-5">
          <Icon className="banner-icon" name="check-circle" />
          <div>
            <div className="banner-title">Sent to {draft.recipientCount ?? 0} parents</div>
            <div>
              {draft.successCount ?? 0} delivered
              {draft.failureCount ? `, ${draft.failureCount} failed` : ""}.
            </div>
          </div>
        </div>
      ) : null}

      {blockers.length && !readOnly ? (
        <div className="banner banner-warn mb-5">
          <Icon className="banner-icon" name="alert" />
          <div>
            <div className="banner-title">Not ready to send</div>
            <ul className="banner-list">
              {blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <section className="card mb-5">
        <div className="card-head">
          <div>
            <h3>Email details</h3>
            <div className="card-sub">
              What a parent sees in their inbox list, and the banner at the top of the
              email.
            </div>
          </div>
        </div>
        <div className="card-body field-section">
          <div className="field">
            <span className="label">Subject</span>
            <input
              className="input"
              disabled={readOnly}
              maxLength={200}
              onChange={(event) => update({ subject: event.target.value })}
              placeholder="Week of 4 August - Tenacity updates"
              value={draft.subject}
            />
            <span className="hint">Also the headline inside the email.</span>
          </div>

          <div className="field">
            <span className="label">Preview text</span>
            <input
              className="input"
              disabled={readOnly}
              maxLength={140}
              onChange={(event) => update({ preheader: event.target.value })}
              placeholder="Exam timetables are out, plus a parking change"
              value={draft.preheader ?? ""}
            />
            <span className="hint">
              The line shown beside the subject in the inbox. Left empty, the first
              block's text is used.
            </span>
          </div>

          <div className="field">
            <span className="label">Banner label</span>
            <input
              className="input"
              disabled={readOnly}
              maxLength={60}
              onChange={(event) =>
                update({ masthead: { ...draft.masthead, eyebrow: event.target.value } })
              }
              placeholder={DEFAULT_MASTHEAD_EYEBROW}
              value={draft.masthead?.eyebrow ?? ""}
            />
            <span className="hint">Small caps line above the headline.</span>
          </div>

          <div className="field">
            <span className="label">Banner headline</span>
            <input
              className="input"
              disabled={readOnly}
              maxLength={120}
              onChange={(event) =>
                update({ masthead: { ...draft.masthead, title: event.target.value } })
              }
              placeholder={draft.subject || "Uses the subject"}
              value={draft.masthead?.title ?? ""}
            />
            <span className="hint">
              Leave empty to use the subject. Editing the headline in the preview
              fills this in, so clear it to follow the subject again.
            </span>
          </div>
        </div>
      </section>

      <section className="card mb-5">
        <div className="card-head">
          <div>
            <h3>Content blocks</h3>
            <div className="card-sub">
              The email is built top to bottom from these. Reorder with the arrows.
            </div>
          </div>
          <select
            className="select"
            disabled={readOnly}
            onChange={(event) => setWindowId(event.target.value)}
            value={windowId}
          >
            {DIGEST_WINDOWS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="card-body">
          {blocks.length === 0 ? (
            <div className="route-inline-state">
              Nothing in this update yet. Add a block below.
            </div>
          ) : (
            <div className="block-list">
              {blocks.map((block, index) => (
                <div className="block-card" key={block.id ?? `block-${index}`}>
                  <div className="block-card-head">
                    <span className="block-card-type">
                      {index + 1}. {blockTypeLabel(block.type)}
                    </span>
                    {readOnly ? null : (
                      <div className="block-card-tools">
                        <Button
                          size="sm"
                          icon="chevron-up"
                          aria-label={`Move block ${index + 1} up`}
                          disabled={index === 0}
                          onClick={() => setBlocks((current) => moveBlock(current, index, -1))}
                        />
                        <Button
                          size="sm"
                          icon="chevron-down"
                          aria-label={`Move block ${index + 1} down`}
                          disabled={index === blocks.length - 1}
                          onClick={() => setBlocks((current) => moveBlock(current, index, 1))}
                        />
                        <Button size="sm" onClick={() => duplicateBlock(index)}>
                          Duplicate
                        </Button>
                        <Button
                          size="sm"
                          icon="trash"
                          aria-label={`Remove block ${index + 1}`}
                          onClick={() =>
                            setBlocks((current) =>
                              current.filter((_, i) => i !== index)
                            )
                          }
                        />
                      </div>
                    )}
                  </div>
                  <div className="block-card-body field-section">
                    <WeeklyUpdateBlockFields
                      block={block}
                      announcementOptions={announcementOptions}
                      disabled={readOnly}
                      onChange={(fields) => patchBlock(index, fields)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {readOnly ? null : (
            <div className="block-add">
              <span className="label">Add a block</span>
              <div className="block-add-row">
                {BLOCK_TYPES.map((option) => (
                  <Button
                    key={option.id}
                    size="sm"
                    icon="plus"
                    title={option.hint}
                    onClick={() => addBlock(option.id)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="card mb-5">
        <div className="card-head">
          <div>
            <h3>Closing panel</h3>
            <div className="card-sub">
              The navy panel at the end of every update. Clear every field to leave it
              out.
            </div>
          </div>
        </div>
        <div className="card-body field-section">
          <div className="field">
            <span className="label">Label</span>
            <input
              className="input"
              disabled={readOnly}
              maxLength={40}
              onChange={(event) =>
                update({ cta: { ...draft.cta, eyebrow: event.target.value } })
              }
              value={draft.cta?.eyebrow ?? ""}
            />
          </div>
          <div className="field">
            <span className="label">Heading</span>
            <input
              className="input"
              disabled={readOnly}
              maxLength={80}
              onChange={(event) =>
                update({ cta: { ...draft.cta, title: event.target.value } })
              }
              value={draft.cta?.title ?? ""}
            />
          </div>
          <div className="field">
            <span className="label">Text</span>
            <textarea
              className="textarea"
              disabled={readOnly}
              onChange={(event) =>
                update({ cta: { ...draft.cta, body: event.target.value } })
              }
              rows={2}
              value={draft.cta?.body ?? ""}
            />
          </div>
          <div className="field">
            <span className="label">Button label</span>
            <input
              className="input"
              disabled={readOnly}
              maxLength={40}
              onChange={(event) =>
                update({ cta: { ...draft.cta, label: event.target.value } })
              }
              placeholder="Leave empty for no button"
              value={draft.cta?.label ?? ""}
            />
          </div>
          <div className="field">
            <span className="label">Button link</span>
            <input
              className="input"
              disabled={readOnly}
              onChange={(event) =>
                update({ cta: { ...draft.cta, url: event.target.value } })
              }
              placeholder="https://tenacitytutoring.com/app"
              value={draft.cta?.url ?? ""}
            />
          </div>
        </div>
      </section>

      {/*
        Sent updates are deliberately left without a preview. Announcements can
        be edited or archived after a send, so re-rendering one would show an
        email that is not what went out — the stored `announcementSnapshots`
        are the record of that, not this.
      */}
      {readOnly ? null : (
        <section className="card mb-5">
          <div className="card-head">
            <div>
              <h3>Preview</h3>
              <div className="card-sub">
                Rendered by the same code that sends, so this is the email parents get.
                Click any copy below to edit it here. Adding, reordering or removing a
                block happens in Content, then refresh — which saves the draft first.
              </div>
            </div>
            <Button
              icon="refresh"
              size="sm"
              onClick={handlePreview}
              disabled={previewing || saving}
              loading={previewing}
            >
              Refresh preview
            </Button>
          </div>
          <div className="card-body">
            {previewError ? (
              <div className="banner banner-warn">
                <Icon className="banner-icon" name="alert" />
                <div>
                  <div className="banner-title">Preview unavailable</div>
                  <div>{previewError}</div>
                </div>
              </div>
            ) : previewHtml ? (
              // `allow-same-origin` and nothing else. Scripts stay blocked, so
              // no code in the frame can use the relaxed origin; it is there so
              // this document can reach in and make the copy editable. Still no
              // forms, no popups and no navigating the tab away.
              <>
                <iframe
                  className="email-preview"
                  ref={previewFrameRef}
                  title="Weekly update preview"
                  sandbox="allow-same-origin"
                  srcDoc={previewHtml}
                />
                {emptyBlockPositions.length ? (
                  <div className="hint mt-3">
                    {emptyBlockPositions.length === 1
                      ? `Block ${emptyBlockPositions[0]} is empty, so the email leaves it out — a send would too.`
                      : `Blocks ${emptyBlockPositions.join(", ")} are empty, so the email leaves them out — a send would too.`}{" "}
                    Add copy under Content blocks to see it here.
                  </div>
                ) : null}
              </>
            ) : (
              <div className="route-inline-state">
                {previewing
                  ? "Rendering preview..."
                  : "Refresh to render this draft as an email."}
              </div>
            )}
          </div>
        </section>
      )}

      {readOnly ? null : (
        <section className="card mb-5">
          <div className="card-head">
            <div>
              <h3>Send a test first</h3>
              <div className="card-sub">
                Delivers this exact email to one address. Parents are not emailed and the draft
                stays a draft.
              </div>
            </div>
          </div>
          <div className="card-body">
            <div className="field mb-4">
              <span className="label">Test address</span>
              <input
                className="input"
                onChange={(event) => setTestEmail(event.target.value)}
                placeholder="you@tenacitytutoring.com"
                type="email"
                value={testEmail}
              />
            </div>
            <Button
              icon="send"
              onClick={handleTestSend}
              disabled={!testEmail.trim() || sending}
              loading={sending}
            >
              Send test
            </Button>
          </div>
        </section>
      )}

      {readOnly ? null : (
        <section className="card mb-5">
          <div className="card-body">
            <Button icon="trash" onClick={handleDelete}>
              Delete draft
            </Button>
          </div>
        </section>
      )}

      <ConfirmDialog
        open={confirmSend}
        tone="danger"
        title="Send this weekly update?"
        message={`This emails ${recipients.eligible} parent${
          recipients.eligible === 1 ? "" : "s"
        } straight away. It cannot be recalled.`}
        confirmLabel="Send now"
        busy={sending}
        onConfirm={handleSend}
        onCancel={() => setConfirmSend(false)}
      />
    </>
  );
}
