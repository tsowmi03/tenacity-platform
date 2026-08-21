/**
 * Selection helpers for the weekly parent update.
 *
 * The recipient count shown while composing is computed here from the user list
 * the portal already loads, rather than asking the backend. `sendParentEmailBlast`
 * re-derives the same set at send time and is the authority; these rules are
 * kept deliberately identical so the preview does not mislead.
 */

import {
  blockHasContent,
  blockProblems,
  describeBlockProblem,
  safeUrl,
} from "../backend/weeklyUpdateBlocks";

const PARENT_VISIBLE_AUDIENCES = ["parent", "all"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const DIGEST_WINDOWS = [
  { id: "7", label: "Last 7 days", days: 7 },
  { id: "14", label: "Last 14 days", days: 14 },
  { id: "30", label: "Last 30 days", days: 30 },
  { id: "all", label: "All time", days: null },
];

export const DEFAULT_DIGEST_WINDOW = "7";

export function digestWindow(windowId) {
  return (
    DIGEST_WINDOWS.find((option) => option.id === windowId) ?? DIGEST_WINDOWS[0]
  );
}

/** Announcements a parent could receive: not archived, not staff-only. */
export function isParentVisibleAnnouncement(announcement) {
  return (
    Boolean(announcement) &&
    announcement.archived !== true &&
    PARENT_VISIBLE_AUDIENCES.includes(announcement.audience)
  );
}

/**
 * Parent-visible announcements inside the window, newest first. Anything
 * already selected stays listed even if it has aged out, so narrowing the
 * window never silently drops it from the email.
 */
export function digestCandidates(
  announcements,
  { windowId = DEFAULT_DIGEST_WINDOW, selectedIds = [], now = Date.now() } = {}
) {
  const { days } = digestWindow(windowId);
  const cutoff = days === null ? null : now - days * 24 * 60 * 60 * 1000;
  const selected = new Set(selectedIds);

  return (Array.isArray(announcements) ? announcements : [])
    .filter(isParentVisibleAnnouncement)
    .filter((announcement) => {
      if (selected.has(announcement.id)) return true;
      if (cutoff === null) return true;
      const createdAt = Date.parse(announcement.createdAtIso ?? "");
      return Number.isFinite(createdAt) && createdAt >= cutoff;
    })
    .sort((left, right) =>
      String(right.createdAtIso || "").localeCompare(String(left.createdAtIso || ""))
    );
}

function normaliseEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return EMAIL_RE.test(email) ? email : "";
}

/**
 * How many parents the send would reach.
 *
 * Deduped by email so a shared family inbox counts once, and an opt-out
 * suppresses the whole address rather than one account, both matching the
 * backend — see `resolveParentRecipients` for why the address is the unit.
 */
export function recipientSummary(users) {
  const parents = (Array.isArray(users) ? users : []).filter(
    (user) => user?.role === "parent"
  );

  const seen = new Set();
  let optedOut = 0;
  let unusable = 0;

  const suppressed = new Set();
  parents.forEach((user) => {
    if (user.emailBlastOptOut !== true) return;
    const email = normaliseEmail(user.email);
    if (email) suppressed.add(email);
  });

  parents.forEach((user) => {
    const email = normaliseEmail(user.email);
    if (user.emailBlastOptOut === true || (email && suppressed.has(email))) {
      optedOut += 1;
      return;
    }
    if (!email) {
      unusable += 1;
      return;
    }
    seen.add(email);
  });

  return {
    total: parents.length,
    eligible: seen.size,
    optedOut,
    unusable,
  };
}

/**
 * Blocks a send that would produce an empty, broken or unaddressed email.
 *
 * Per-block mistakes come from `blockProblems` so they can name the block that
 * needs fixing; a draft with a button pointing nowhere is not "incomplete", it
 * has one identifiable thing wrong with it.
 */
export function draftBlockers(draft, { eligible = 0 } = {}) {
  const blockers = [];
  const blocks = Array.isArray(draft?.blocks) ? draft.blocks : [];

  if (!String(draft?.subject || "").trim()) blockers.push("Add a subject.");
  if (!blocks.some(blockHasContent)) {
    blockers.push("Add a block with something in it.");
  }
  blockers.push(
    ...blockProblems(blocks).map((problem) =>
      describeBlockProblem(problem, blocks[problem.index])
    )
  );

  // The closing panel's button is held to the same rule as a button block. It
  // was not, which let an update go out with a button that rendered as a
  // dead `href="#"` — the one mistake in the email a parent would actually try
  // to click.
  if (String(draft?.cta?.label || "").trim() && !safeUrl(draft?.cta?.url)) {
    blockers.push("The closing panel's button needs a link starting with https://.");
  }

  if (!eligible) blockers.push("No parents are eligible to receive this update.");
  return blockers;
}

export function statusTone(status) {
  if (status === "sent") return "success";
  if (status === "failed") return "danger";
  if (status === "sending") return "warn";
  return "neutral";
}

export function statusLabel(status) {
  if (status === "sent") return "Sent";
  if (status === "failed") return "Failed";
  if (status === "sending") return "Sending";
  return "Draft";
}
