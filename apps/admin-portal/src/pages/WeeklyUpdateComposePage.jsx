import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { loadAnnouncementReportingOverview } from "../backend/announcementReportingCache";
import {
  createWeeklyUpdate,
  deleteWeeklyUpdate,
  getWeeklyUpdate,
  saveWeeklyUpdate,
  sendWeeklyUpdate,
  sendWeeklyUpdateTest,
} from "../backend/weeklyUpdateApi";
import Badge from "../components/Badge";
import Button from "../components/Button";
import ConfirmDialog from "../components/ConfirmDialog";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import { useToast } from "../components/ToastProvider";
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
  intro: "",
  announcementIds: [],
  sections: [],
  status: "draft",
};

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

  const candidates = useMemo(
    () =>
      digestCandidates(announcements ?? [], {
        windowId,
        selectedIds: draft?.announcementIds ?? [],
      }),
    [announcements, windowId, draft?.announcementIds]
  );

  const recipients = useMemo(() => recipientSummary(users ?? []), [users]);

  const blockers = useMemo(
    () => (draft ? draftBlockers(draft, { eligible: recipients.eligible }) : []),
    [draft, recipients.eligible]
  );

  const update = useCallback((patch) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const toggleAnnouncement = useCallback((announcementId) => {
    setDraft((current) => {
      if (!current) return current;
      const selected = current.announcementIds.includes(announcementId);
      return {
        ...current,
        announcementIds: selected
          ? current.announcementIds.filter((id) => id !== announcementId)
          : [...current.announcementIds, announcementId],
      };
    });
  }, []);

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

  async function handleSave() {
    try {
      await persist();
      toast.push("success", "Draft saved");
    } catch (error) {
      toast.push("error", "Could not save draft", errorMessage(error, "Try again."));
    }
  }

  async function handleTestSend() {
    const address = testEmail.trim();
    if (!address) return;
    setSending(true);
    try {
      const id = await persist();
      const result = await sendWeeklyUpdateTest(id, [address]);
      toast.push(
        result?.failureCount ? "warn" : "success",
        result?.failureCount ? "Test send failed" : "Test sent",
        `${address}: ${result?.successCount ?? 0} delivered`
      );
    } catch (error) {
      toast.push("error", "Could not send test", errorMessage(error, "Try again."));
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
      toast.push(
        "success",
        "Weekly update sent",
        `${result?.successCount ?? 0} of ${result?.recipientCount ?? 0} parents emailed`
      );
      const refreshed = await getWeeklyUpdate(id).catch(() => null);
      if (refreshed) setDraft(refreshed);
    } catch (error) {
      toast.push("error", "Could not send update", errorMessage(error, "Try again."));
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
      toast.push("success", "Draft deleted");
      navigate("/weekly-update");
    } catch (error) {
      toast.push("error", "Could not delete draft", errorMessage(error, "Try again."));
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
            : "Pick this week's announcements, add anything else, then send to parents."
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
          icon="bell"
          label="Announcements included"
          value={draft.announcementIds.length}
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
            <div>{blockers.join(" ")}</div>
          </div>
        </div>
      ) : null}

      <section className="card mb-5">
        <div className="card-head">
          <div>
            <h3>Content</h3>
            <div className="card-sub">Subject line and opening message</div>
          </div>
        </div>
        <div className="card-body">
          <div className="field mb-4">
            <span className="label">Subject</span>
            <input
              className="input"
              disabled={readOnly}
              maxLength={200}
              onChange={(event) => update({ subject: event.target.value })}
              placeholder="Week of 4 August - Tenacity updates"
              value={draft.subject}
            />
          </div>

          <div className="field">
            <span className="label">Intro</span>
            <textarea
              className="textarea"
              disabled={readOnly}
              onChange={(event) => update({ intro: event.target.value })}
              placeholder="Hi parents - a few notes for this week..."
              rows={4}
              value={draft.intro}
            />
          </div>
        </div>
      </section>

      <section className="card mb-5">
        <div className="card-head">
          <div>
            <h3>Announcements</h3>
            <div className="card-sub">
              Only parent-visible announcements are listed. Archived and staff-only ones are
              never emailed.
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
          {candidates.length === 0 ? (
            <div className="route-state">No parent announcements in this window.</div>
          ) : (
            <div className="check-list-wrap">
              <div className="check-list-body">
                {candidates.map((announcement) => {
                  const checked = draft.announcementIds.includes(announcement.id);
                  return (
                    <label
                      className={`check-list-item${checked ? " checked" : ""}`}
                      key={announcement.id}
                    >
                      <input
                        checked={checked}
                        disabled={readOnly}
                        onChange={() => toggleAnnouncement(announcement.id)}
                        type="checkbox"
                      />
                      <span className="grow">
                        <strong>{announcement.title || "Untitled announcement"}</strong>
                        <span className="muted">
                          {" "}
                          {announcement.audience} · {formatDate(announcement.createdAtIso)}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="card mb-5">
        <div className="card-head">
          <div>
            <h3>Extra sections</h3>
            <div className="card-sub">Anything that is not an announcement</div>
          </div>
          {readOnly ? null : (
            <Button
              icon="plus"
              size="sm"
              onClick={() => update({ sections: [...draft.sections, { title: "", body: "" }] })}
            >
              Add section
            </Button>
          )}
        </div>
        <div className="card-body">
          {draft.sections.length === 0 ? (
            <div className="route-state">No extra sections.</div>
          ) : (
            draft.sections.map((section, index) => (
              <div className="mb-4" key={`section-${index}`}>
                <div className="field mb-4">
                  <span className="label">Title</span>
                  <input
                    className="input"
                    disabled={readOnly}
                    onChange={(event) =>
                      update({
                        sections: draft.sections.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, title: event.target.value } : item
                        ),
                      })
                    }
                    value={section.title}
                  />
                </div>
                <div className="field mb-4">
                  <span className="label">Body</span>
                  <textarea
                    className="textarea"
                    disabled={readOnly}
                    onChange={(event) =>
                      update({
                        sections: draft.sections.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, body: event.target.value } : item
                        ),
                      })
                    }
                    rows={3}
                    value={section.body}
                  />
                </div>
                {readOnly ? null : (
                  <Button
                    icon="trash"
                    size="sm"
                    onClick={() =>
                      update({
                        sections: draft.sections.filter(
                          (item, itemIndex) => itemIndex !== index
                        ),
                      })
                    }
                  >
                    Remove section
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </section>

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
