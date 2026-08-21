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
  DEFAULT_CTA,
  DEFAULT_MASTHEAD_EYEBROW,
  announcementIdsFromBlocks,
  blockProblems,
  blockRendersInEmail,
  blockSummary,
  blockTypeLabel,
  moveBlock,
  newBlock,
  safeUrl,
} from "../backend/weeklyUpdateBlocks";
import Badge from "../components/Badge";
import Button from "../components/Button";
import ConfirmDialog from "../components/ConfirmDialog";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import { useToast } from "../components/ToastProvider";
import WeeklyUpdateBlockFields from "./WeeklyUpdateBlockFields";
import WeeklyUpdateBlockPicker from "./WeeklyUpdateBlockPicker";
import useInlinePreviewEditing from "./useInlinePreviewEditing";
import {
  DEFAULT_DIGEST_WINDOW,
  digestCandidates,
  draftBlockers,
  recipientSummary,
  statusLabel,
  statusTone,
} from "./weeklyUpdateDigest";

const REPORTING_TIME_ZONE = "Australia/Sydney";

/**
 * How long the composer waits after the last keystroke before saving.
 *
 * The preview is rendered by the backend from the stored draft, so it can only
 * be live if the draft is saved as you go. Long enough not to write on every
 * character, short enough that pausing to look at the preview is all it takes
 * to see the change.
 */
const AUTOSAVE_DELAY = 1200;

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

function formatTime(date) {
  return date.toLocaleTimeString("en-AU", {
    timeZone: REPORTING_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
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
  const [sending, setSending] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [openBlocks, setOpenBlocks] = useState(() => new Set());
  const [picking, setPicking] = useState(false);
  const [chromeOpen, setChromeOpen] = useState(false);

  // Save state. `revision` counts edits and `savedRevision` the last one
  // written, so an edit made while a save is in flight leaves the draft dirty
  // rather than being marked saved by the response to the previous version.
  const [revision, setRevision] = useState(0);
  const [savedRevision, setSavedRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [saveError, setSaveError] = useState("");
  const dirty = revision !== savedRevision;

  /**
   * Ids this page created itself.
   *
   * Saving a new draft navigates to its URL, which changes `blastId` and would
   * otherwise re-run the load below — replacing the draft being typed with the
   * copy that was just written, and losing every keystroke made while the save
   * was in flight. The page already holds the newer version, so it re-reads
   * nothing it just wrote.
   */
  const selfCreatedRef = useRef(new Set());

  useEffect(() => {
    if (!isNew && selfCreatedRef.current.has(blastId)) return undefined;

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
  const blocks = useMemo(() => draft?.blocks ?? [], [draft]);
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

  const announcementTitleById = useMemo(() => {
    const byId = new Map();
    (announcements ?? []).forEach((announcement) => {
      byId.set(announcement.id, announcement.title || "Untitled announcement");
    });
    return byId;
  }, [announcements]);

  const recipients = useMemo(() => recipientSummary(users ?? []), [users]);

  const blockers = useMemo(
    () => (draft ? draftBlockers(draft, { eligible: recipients.eligible }) : []),
    [draft, recipients.eligible]
  );

  // Keyed by block id so each block can show its own mistakes, rather than an
  // admin reading "Block 4 needs a label" at the top and counting down the list.
  const problemsByBlock = useMemo(() => {
    const byId = new Map();
    blockProblems(blocks).forEach((problem) => {
      if (!problem.id) return;
      byId.set(problem.id, [...(byId.get(problem.id) ?? []), problem]);
    });
    return byId;
  }, [blocks]);

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

  /**
   * Where the current run of edits came from.
   *
   * An edit typed into the preview must not trigger a re-render of the preview:
   * the browser is already showing the new text, and replacing the document
   * would throw away the caret mid-sentence. Edits made in the fields beside it
   * do need one, because nothing else would show them.
   */
  const editSourceRef = useRef("form");

  const mutate = useCallback((updater, source = "form") => {
    editSourceRef.current = source;
    setDraft((current) => (current ? updater(current) : current));
    setRevision((value) => value + 1);
  }, []);

  const update = useCallback(
    (patch) => mutate((current) => ({ ...current, ...patch })),
    [mutate]
  );

  const setBlocks = useCallback(
    (next) =>
      mutate((current) => ({
        ...current,
        blocks: typeof next === "function" ? next(current.blocks) : next,
      })),
    [mutate]
  );

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
    (typeId) => {
      const block = newBlock(typeId);
      if (!block) return;
      setBlocks((current) => [...current, block]);
      // A block you just added is the one you are about to fill in.
      setOpenBlocks((current) => new Set(current).add(block.id));
      setPicking(false);
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
        const copy = { ...source, id: newBlock("text")?.id ?? `${source.id}-copy` };
        return [...current.slice(0, index + 1), copy, ...current.slice(index + 1)];
      });
    },
    [setBlocks]
  );

  const toggleBlock = useCallback((id) => {
    setOpenBlocks((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allOpen = blocks.length > 0 && blocks.every((block) => openBlocks.has(block.id));

  const toggleAllBlocks = useCallback(() => {
    setOpenBlocks((current) => {
      const everyOpen =
        blocks.length > 0 && blocks.every((block) => current.has(block.id));
      return everyOpen ? new Set() : new Set(blocks.map((block) => block.id));
    });
  }, [blocks]);

  // Read inside the save chain so a queued save writes the newest draft rather
  // than the one captured when it was queued.
  const draftRef = useRef(null);
  draftRef.current = draft;
  const savedIdRef = useRef(savedId);
  savedIdRef.current = savedId;

  const persistDraft = useCallback(async () => {
    const current = draftRef.current;
    if (!current) return null;
    const id = savedIdRef.current;
    if (id) {
      await saveWeeklyUpdate(id, current);
      return id;
    }
    const created = await createWeeklyUpdate(current);
    savedIdRef.current = created.id;
    selfCreatedRef.current.add(created.id);
    setSavedId(created.id);
    // Keep the URL in step so a refresh reopens the saved draft.
    navigate(`/weekly-update/${created.id}`, { replace: true });
    return created.id;
  }, [navigate]);

  /**
   * Saves, never concurrently.
   *
   * Two writes in flight at once can land out of order, which for a whole-document
   * update means the older one wins and silently reverts what was just typed.
   * Chaining is enough: each save reads the draft when it starts, so a queued one
   * always writes something at least as new as the one before it.
   */
  const saveChainRef = useRef(Promise.resolve(null));

  const saveNow = useCallback(() => {
    const next = saveChainRef.current
      .catch(() => null)
      .then(() => persistDraft());
    saveChainRef.current = next;
    return next;
  }, [persistDraft]);

  const previewRequestRef = useRef(0);

  // Creating a brand-new draft's first preview can fire two of these
  // concurrently. Without ordering, whichever response lands last wins —
  // including the older of the two landing after a newer edit's request. The
  // generation counter drops any response that is not from the most recently
  // issued call.
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

  /**
   * Saves a pause after the last edit, then re-renders the preview.
   *
   * A new draft is only created once there is something in it: `revision` starts
   * at zero and only an edit moves it, so opening the composer and leaving does
   * not litter Firestore with empty drafts.
   */
  useEffect(() => {
    if (!draft || readOnly || !dirty) return undefined;

    const timer = setTimeout(() => {
      const at = revision;
      const source = editSourceRef.current;
      setSaving(true);
      setSaveError("");
      saveNow()
        .then((id) => {
          setSavedRevision(at);
          setSavedAt(new Date());
          if (source !== "preview") return refreshPreview(id);
          return undefined;
        })
        .catch((error) => {
          setSaveError(errorMessage(error, "Could not save. Your changes are not stored."));
        })
        .finally(() => setSaving(false));
    }, AUTOSAVE_DELAY);

    return () => clearTimeout(timer);
  }, [draft, dirty, readOnly, refreshPreview, revision, saveNow]);

  // Leaving with an unsaved edit would lose it, and the composer never asks for
  // an explicit save, so it has to be the one to warn.
  useEffect(() => {
    if (!dirty || readOnly) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, readOnly]);

  // Editing the copy in the preview itself. The edit lands in the same draft
  // state the fields beside it write to, so the two stay one source of truth:
  // type in the preview and the field updates, and both are saved together.
  const previewFrameRef = useRef(null);

  const handleInlineEdit = useCallback(
    (edit) => mutate((current) => applyInlineEdit(current, edit), "preview"),
    [mutate]
  );

  useInlinePreviewEditing({
    frameRef: previewFrameRef,
    html: previewHtml,
    enabled: !readOnly,
    onEdit: handleInlineEdit,
  });

  /** Saves any pending edit and returns the id, for an action that needs both. */
  const flush = useCallback(async () => {
    const at = revision;
    const id = await saveNow();
    setSavedRevision(at);
    setSavedAt(new Date());
    return id;
  }, [revision, saveNow]);

  async function handleRefreshPreview() {
    try {
      const id = await flush();
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
      const id = await flush();
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
      const id = await flush();
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
      if (savedIdRef.current) {
        const refreshed = await getWeeklyUpdate(savedIdRef.current).catch(() => null);
        if (refreshed) setDraft(refreshed);
      }
    } finally {
      setSending(false);
    }
  }

  async function handleDelete() {
    if (!savedIdRef.current) {
      navigate("/weekly-update");
      return;
    }
    try {
      await deleteWeeklyUpdate(savedIdRef.current);
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

  const ctaButtonUrlInvalid =
    Boolean(String(draft.cta?.label ?? "").trim()) && !safeUrl(draft.cta?.url);

  const saveStatus = readOnly
    ? null
    : saveError
    ? { tone: "error", text: saveError }
    : saving
    ? { tone: "busy", text: "Saving..." }
    : dirty
    ? { tone: "busy", text: "Unsaved changes" }
    : savedAt
    ? { tone: "ok", text: `Saved ${formatTime(savedAt)}` }
    : null;

  return (
    <>
      <PageHeader
        title={draft.subject || "New weekly update"}
        subtitle={
          readOnly
            ? "This update has been sent and can no longer be edited."
            : `Goes to ${recipients.eligible} parent${
                recipients.eligible === 1 ? "" : "s"
              }${recipients.optedOut ? `, ${recipients.optedOut} opted out` : ""}${
                recipients.unusable
                  ? `, ${recipients.unusable} without a usable email`
                  : ""
              }.`
        }
        crumbs={[
          { label: "Weekly update", href: "/weekly-update" },
          { label: savedId ? "Edit" : "New" },
        ]}
        actions={
          <>
            {saveStatus ? (
              <span className={`save-status save-status-${saveStatus.tone}`}>
                {saveStatus.tone === "busy" ? <span className="spinner" /> : null}
                {saveStatus.text}
              </span>
            ) : null}
            <Badge tone={statusTone(draft.status)}>{statusLabel(draft.status)}</Badge>
            {readOnly ? null : (
              <Button
                variant="primary"
                icon="send"
                onClick={() => setConfirmSend(true)}
                disabled={blockers.length > 0 || sending}
                loading={sending}
              >
                Send to parents
              </Button>
            )}
          </>
        }
      />

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

      <div className="wu-layout">
        <div className="wu-editor">
          {/*
            Subject, preview line, banner and closing panel are set once and
            rarely change from week to week, so they start folded away. They used
            to bracket the content — the only part that is actually rewritten
            each week — which made the page read as nine settings with an email
            somewhere in the middle.
          */}
          <section className="card wu-fold mb-4">
            <button
              aria-expanded={chromeOpen}
              className="wu-fold-head"
              onClick={() => setChromeOpen((open) => !open)}
              type="button"
            >
              <Icon name={chromeOpen ? "chevron-down" : "chevron-right"} />
              <span>
                <span className="wu-fold-title">Subject, header and footer</span>
                <span className="wu-fold-sub">
                  {draft.subject || "No subject yet"}
                </span>
              </span>
            </button>
            {chromeOpen ? (
              <div className="card-body field-section">
                <div className="field">
                  <span className="label">Subject line</span>
                  <input
                    className="input"
                    disabled={readOnly}
                    maxLength={200}
                    onChange={(event) => update({ subject: event.target.value })}
                    placeholder="Week of 4 August - Tenacity updates"
                    value={draft.subject}
                  />
                  <span className="hint">
                    What a parent sees in their inbox, and the headline at the top of
                    the email unless you set a different one below.
                  </span>
                </div>

                <div className="field">
                  <span className="label">Inbox preview line</span>
                  <input
                    className="input"
                    disabled={readOnly}
                    maxLength={140}
                    onChange={(event) => update({ preheader: event.target.value })}
                    placeholder="Exam timetables are out, plus a parking change"
                    value={draft.preheader ?? ""}
                  />
                  <span className="hint">
                    The grey line most apps show beside the subject. Left empty, the
                    first block's text is used.
                  </span>
                </div>

                {/*
                  The two banner fields sit inside a drawing of the banner. They
                  were "Banner label" and "Banner headline" with a sentence each
                  trying to explain which was which; showing where they land says
                  it without the words.
                */}
                <div className="field">
                  <span className="label">Top of the email</span>
                  <div className="chrome-mock chrome-mock-masthead">
                    <input
                      aria-label="Small label above the headline"
                      className="chrome-mock-input chrome-mock-eyebrow"
                      disabled={readOnly}
                      maxLength={60}
                      onChange={(event) =>
                        update({
                          masthead: { ...draft.masthead, eyebrow: event.target.value },
                        })
                      }
                      placeholder={DEFAULT_MASTHEAD_EYEBROW}
                      value={draft.masthead?.eyebrow ?? ""}
                    />
                    <input
                      aria-label="Headline"
                      className="chrome-mock-input chrome-mock-title"
                      disabled={readOnly}
                      maxLength={120}
                      onChange={(event) =>
                        update({
                          masthead: { ...draft.masthead, title: event.target.value },
                        })
                      }
                      placeholder={draft.subject || "Follows the subject line"}
                      value={draft.masthead?.title ?? ""}
                    />
                  </div>
                  <span className="hint">
                    Leave the headline empty to follow the subject line. Editing it in
                    the preview fills it in, so clear it to go back.
                  </span>
                </div>

                <div className="field">
                  <span className="label">Bottom of the email</span>
                  <div className="chrome-mock chrome-mock-cta">
                    <input
                      aria-label="Small label above the closing heading"
                      className="chrome-mock-input chrome-mock-eyebrow"
                      disabled={readOnly}
                      maxLength={40}
                      onChange={(event) =>
                        update({ cta: { ...draft.cta, eyebrow: event.target.value } })
                      }
                      placeholder="Stay connected"
                      value={draft.cta?.eyebrow ?? ""}
                    />
                    <input
                      aria-label="Closing heading"
                      className="chrome-mock-input chrome-mock-title"
                      disabled={readOnly}
                      maxLength={80}
                      onChange={(event) =>
                        update({ cta: { ...draft.cta, title: event.target.value } })
                      }
                      placeholder="Everything else, all in one place"
                      value={draft.cta?.title ?? ""}
                    />
                    <textarea
                      aria-label="Closing text"
                      className="chrome-mock-input chrome-mock-body"
                      disabled={readOnly}
                      onChange={(event) =>
                        update({ cta: { ...draft.cta, body: event.target.value } })
                      }
                      placeholder="Open the Tenacity app for timetables, invoices and messages."
                      rows={2}
                      value={draft.cta?.body ?? ""}
                    />
                    <div className="chrome-mock-button-row">
                      <input
                        aria-label="Closing button text"
                        className="chrome-mock-input chrome-mock-button"
                        disabled={readOnly}
                        maxLength={40}
                        onChange={(event) =>
                          update({ cta: { ...draft.cta, label: event.target.value } })
                        }
                        placeholder="No button"
                        value={draft.cta?.label ?? ""}
                      />
                      <input
                        aria-label="Closing button link"
                        className={`chrome-mock-input chrome-mock-url${
                          ctaButtonUrlInvalid ? " error-state" : ""
                        }`}
                        disabled={readOnly}
                        onChange={(event) =>
                          update({ cta: { ...draft.cta, url: event.target.value } })
                        }
                        placeholder="https://tenacitytutoring.com/app"
                        value={draft.cta?.url ?? ""}
                      />
                    </div>
                  </div>
                  {ctaButtonUrlInvalid ? (
                    <span className="error">
                      A button with no usable link renders as a dead button. Add one
                      starting with https://, or clear the button text.
                    </span>
                  ) : (
                    <span className="hint">
                      Clear every field to leave this panel out of the email.
                    </span>
                  )}
                </div>
              </div>
            ) : null}
          </section>

          <section className="card mb-4">
            <div className="card-head">
              <div>
                <h3>What's in this update</h3>
                <div className="card-sub">
                  The email is built top to bottom from these.
                </div>
              </div>
              {blocks.length ? (
                <Button size="sm" onClick={toggleAllBlocks}>
                  {allOpen ? "Collapse all" : "Expand all"}
                </Button>
              ) : null}
            </div>
            <div className="card-body">
              {blocks.length === 0 ? (
                <div className="route-inline-state">
                  Nothing in this update yet. Add a block below.
                </div>
              ) : (
                <div className="block-list">
                  {blocks.map((block, index) => {
                    const id = block.id ?? `block-${index}`;
                    const open = openBlocks.has(block.id);
                    const problems = problemsByBlock.get(block.id) ?? [];
                    const summary = blockSummary(block, {
                      announcementTitle: announcementTitleById.get(block.announcementId),
                    });
                    const omitted = !blockRendersInEmail(block);
                    return (
                      <div
                        className={`block-card${open ? " is-open" : ""}${
                          problems.length ? " has-problem" : ""
                        }`}
                        key={id}
                      >
                        <div className="block-card-head">
                          <button
                            aria-expanded={open}
                            className="block-card-toggle"
                            onClick={() => toggleBlock(block.id)}
                            type="button"
                          >
                            <Icon name={open ? "chevron-down" : "chevron-right"} />
                            <span className="block-card-index">{index + 1}</span>
                            <span className="block-card-type">
                              {blockTypeLabel(block)}
                            </span>
                            <span className="block-card-summary">
                              {summary || (
                                <em>{omitted ? "Empty, so the email leaves it out" : "Empty"}</em>
                              )}
                            </span>
                            {problems.length ? (
                              <span className="block-card-flag" title={problems[0].message}>
                                <Icon name="alert" size={15} />
                              </span>
                            ) : null}
                          </button>
                          {readOnly ? null : (
                            <div className="block-card-tools">
                              <Button
                                size="sm"
                                icon="chevron-up"
                                aria-label={`Move block ${index + 1} up`}
                                disabled={index === 0}
                                onClick={() =>
                                  setBlocks((current) => moveBlock(current, index, -1))
                                }
                              />
                              <Button
                                size="sm"
                                icon="chevron-down"
                                aria-label={`Move block ${index + 1} down`}
                                disabled={index === blocks.length - 1}
                                onClick={() =>
                                  setBlocks((current) => moveBlock(current, index, 1))
                                }
                              />
                              <Button
                                size="sm"
                                icon="copy"
                                aria-label={`Duplicate block ${index + 1}`}
                                onClick={() => duplicateBlock(index)}
                              />
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
                        {open ? (
                          <div className="block-card-body field-section">
                            <WeeklyUpdateBlockFields
                              block={block}
                              announcementOptions={announcementOptions}
                              disabled={readOnly}
                              onChange={(fields) => patchBlock(index, fields)}
                              problems={problems}
                              windowId={windowId}
                              onWindowChange={setWindowId}
                            />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}

              {readOnly ? null : picking ? (
                <WeeklyUpdateBlockPicker
                  onAdd={addBlock}
                  onClose={() => setPicking(false)}
                />
              ) : (
                <div className="block-add">
                  <Button icon="plus" onClick={() => setPicking(true)}>
                    Add a block
                  </Button>
                </div>
              )}
            </div>
          </section>

          {readOnly ? null : (
            <div className="wu-danger">
              <button className="wu-quiet-danger" onClick={handleDelete} type="button">
                Delete this draft
              </button>
            </div>
          )}
        </div>

        <aside className="wu-preview">
          <div className="wu-preview-inner">
            <div className="wu-preview-head">
              <h3>Preview</h3>
              {readOnly ? null : (
                <Button
                  icon="refresh"
                  size="sm"
                  onClick={handleRefreshPreview}
                  disabled={previewing || saving}
                  loading={previewing}
                >
                  Refresh
                </Button>
              )}
            </div>

            {/*
              Sent updates are deliberately left without a preview. Announcements
              can be edited or archived after a send, so re-rendering one would
              show an email that is not what went out — the stored
              `announcementSnapshots` are the record of that, not this.
            */}
            {readOnly ? (
              <div className="route-inline-state">
                A sent update is not re-rendered here. Announcements can change after
                a send, so this would not be the email that went out.
              </div>
            ) : (
              <>
                <p className="wu-preview-sub">
                  Rendered by the same code that sends, so this is the email parents
                  get. Click any copy in it to edit that text here.
                </p>
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
                          : `Blocks ${emptyBlockPositions.join(", ")} are empty, so the email leaves them out — a send would too.`}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="route-inline-state">
                    {previewing
                      ? "Rendering preview..."
                      : "Start writing and the email appears here."}
                  </div>
                )}

                <div className="wu-test">
                  <span className="label">Send yourself a test</span>
                  <div className="wu-test-row">
                    <input
                      aria-label="Test address"
                      className="input"
                      onChange={(event) => setTestEmail(event.target.value)}
                      placeholder="you@tenacitytutoring.com"
                      type="email"
                      value={testEmail}
                    />
                    <Button
                      icon="send"
                      onClick={handleTestSend}
                      disabled={!testEmail.trim() || sending}
                      loading={sending}
                    >
                      Send test
                    </Button>
                  </div>
                  <span className="hint">
                    Delivers this exact email to one address. Parents are not emailed
                    and the draft stays a draft.
                  </span>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>

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
