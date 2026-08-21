"use strict";

/**
 * The weekly update's content model.
 *
 * A draft used to hold three fixed slots — `intro`, `announcementIds` and
 * `sections` — always rendered in that order, so an admin could not put a note
 * after an announcement or add anything the three slots did not describe. That
 * is replaced by an ordered `blocks` array.
 *
 * Drafts written before blocks existed are migrated on read rather than by a
 * backfill: `blocksFromLegacy` produces the block list whose rendered HTML is
 * byte-identical to what the fixed slots produced, so an old draft previews and
 * (for one already sent) reads back exactly as it did. Nothing has to be
 * rewritten in Firestore for the old shape to keep working.
 *
 * `apps/admin-portal/src/pages/weeklyUpdateBlocks.js` mirrors the parts the
 * composer needs, for the same reason `weeklyUpdateDigest.js` mirrors the
 * recipient rules: the portal cannot import this CommonJS module. The two are
 * pinned together by a shared fixture in both test suites.
 */

const { isEmptyRichText, safeUrl } = require("./richText");

const BLOCK_TYPES = [
  "text",
  "announcement",
  "heading",
  "callout",
  "button",
  "linkList",
  "signature",
  "divider",
  "spacer",
];

/**
 * The three tones that only ever belonged to a `text` block, and the three that
 * only ever belonged to a `callout`. The two block types are now one — a
 * callout was a text block with a louder panel around it, and asking an admin
 * to pick the type before the look meant picking between "Text / Highlighted
 * note" and "Callout / Information" with nothing to tell them apart.
 *
 * Both lists are kept because a stored `callout` still has to fall back to
 * `info` rather than `plain`: an unreadable tone should render as the callout
 * it was, not silently lose its panel.
 */
const TEXT_TONES = ["plain", "note", "card"];
const CALLOUT_TONES = ["info", "warn", "success"];
const TEXT_BLOCK_TONES = [...TEXT_TONES, ...CALLOUT_TONES];
const SPACER_SIZES = ["sm", "md", "lg"];
const ALIGNMENTS = ["left", "center"];

/** Chrome copy that used to be hardcoded in the renderer. */
const DEFAULT_MASTHEAD_EYEBROW = "Weekly family update";
const DEFAULT_NOTE_EYEBROW = "A note from Tenacity";
const DEFAULT_ANNOUNCEMENT_EYEBROW = "Announcement";
const DEFAULT_CTA = {
  eyebrow: "Stay connected",
  title: "Everything else, all in one place",
  body: "Open the Tenacity app for timetables, invoices and messages.",
  label: "",
  url: "",
};

/** The group headings the fixed-slot layout emitted, now editable blocks. */
const LEGACY_ANNOUNCEMENTS_HEADING = {
  eyebrow: "Important information",
  title: "This week's announcements",
};
const LEGACY_SECTIONS_HEADING = {
  eyebrow: "At a glance",
  title: "In this week's update",
};

function str(value) {
  return String(value ?? "");
}

function trimmed(value) {
  return str(value).trim();
}

function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

/**
 * A stored block coerced to a known shape, or null if its type is unknown.
 *
 * Unknown types are dropped rather than rendered as something else: a draft
 * saved by a newer deploy and opened by an older one should lose the block it
 * cannot draw, not silently mail a fallback.
 */
function normaliseBlock(block) {
  const type = oneOf(block?.type, BLOCK_TYPES, null);
  if (!type) return null;
  const id = trimmed(block?.id) || null;

  switch (type) {
    case "text":
      return {
        id,
        type,
        tone: oneOf(block?.tone, TEXT_BLOCK_TONES, "plain"),
        eyebrow: str(block?.eyebrow),
        title: str(block?.title),
        body: str(block?.body),
      };
    // A draft written before the merge. Converted on read for the same reason
    // the fixed slots are: the stored document is left alone until the admin
    // saves, and the resulting block renders byte-identically to the callout it
    // replaces, so an update that has already been sent still reads back as the
    // email that went out.
    case "callout":
      return {
        id,
        type: "text",
        tone: oneOf(block?.tone, CALLOUT_TONES, "info"),
        eyebrow: "",
        title: str(block?.title),
        body: str(block?.body),
      };
    case "announcement":
      // `title` and `body` are not stored: they are the announcement's own copy,
      // merged in by `buildBlastContent` so an edit to the announcement is
      // reflected until the moment the update is sent.
      return {
        id,
        type,
        announcementId: trimmed(block?.announcementId),
        eyebrow: str(block?.eyebrow),
        title: str(block?.title),
        body: str(block?.body),
      };
    case "heading":
      return { id, type, eyebrow: str(block?.eyebrow), title: str(block?.title) };
    case "button":
      return {
        id,
        type,
        label: str(block?.label),
        url: str(block?.url),
        align: oneOf(block?.align, ALIGNMENTS, "left"),
      };
    case "linkList":
      return {
        id,
        type,
        title: str(block?.title),
        links: (Array.isArray(block?.links) ? block.links : []).map((link) => ({
          label: str(link?.label),
          url: str(link?.url),
        })),
      };
    case "signature":
      return {
        id,
        type,
        name: str(block?.name),
        role: str(block?.role),
        body: str(block?.body),
      };
    case "spacer":
      return { id, type, size: oneOf(block?.size, SPACER_SIZES, "md") };
    default:
      return { id, type };
  }
}

function normaliseBlocks(blocks) {
  return (Array.isArray(blocks) ? blocks : []).map(normaliseBlock).filter(Boolean);
}

/**
 * Whether a block puts anything in the email.
 *
 * Dividers and spacers are structural, so they never count — an email made only
 * of spacers is an empty email, and the send treats it as one.
 */
function blockHasContent(block) {
  if (!block) return false;
  switch (block.type) {
    // `callout` is answered here too: this is also called on drafts that have
    // not been through `normaliseBlock`, where the pre-merge type survives.
    case "text":
    case "callout":
      return Boolean(trimmed(block.title)) || !isEmptyRichText(block.body);
    case "announcement":
      // Before resolution the id is all there is; after it, the copy is.
      return Boolean(
        trimmed(block.announcementId) || trimmed(block.title) || trimmed(block.body)
      );
    case "heading":
      return Boolean(trimmed(block.title) || trimmed(block.eyebrow));
    case "button":
      return Boolean(trimmed(block.label) && safeUrl(block.url));
    case "linkList":
      return (block.links ?? []).some(
        (link) => trimmed(link.label) && safeUrl(link.url)
      );
    case "signature":
      return Boolean(trimmed(block.name) || trimmed(block.role));
    default:
      return false;
  }
}

/**
 * The fixed-slot draft as blocks.
 *
 * The ordering and the inserted spacer are what make the rendered HTML match
 * the old layout exactly: the announcement group used to be followed by a 14px
 * spacer row that no individual panel emitted.
 *
 * @param {object} input
 * @param {string} [input.intro]
 * @param {Array<{id?: string, title?: string, body?: string}>} [input.announcements]
 * @param {Array<{title?: string, body?: string}>} [input.sections]
 */
function blocksFromLegacy({ intro = "", announcements = [], sections = [] } = {}) {
  const blocks = [];

  if (trimmed(intro)) {
    blocks.push({
      id: "legacy-intro",
      type: "text",
      tone: "note",
      eyebrow: "",
      title: "",
      body: str(intro),
    });
  }

  if (announcements.length) {
    blocks.push({
      id: "legacy-announcements-heading",
      type: "heading",
      ...LEGACY_ANNOUNCEMENTS_HEADING,
    });
    announcements.forEach((announcement, index) => {
      blocks.push({
        id: `legacy-announcement-${index}`,
        type: "announcement",
        announcementId: trimmed(announcement?.id),
        eyebrow: "",
        title: str(announcement?.title),
        body: str(announcement?.body),
      });
    });
    blocks.push({ id: "legacy-announcements-spacer", type: "spacer", size: "sm" });
  }

  if (sections.length) {
    blocks.push({
      id: "legacy-sections-heading",
      type: "heading",
      ...LEGACY_SECTIONS_HEADING,
    });
    sections.forEach((section, index) => {
      blocks.push({
        id: `legacy-section-${index}`,
        type: "text",
        tone: "card",
        eyebrow: "",
        title: str(section?.title),
        body: str(section?.body),
      });
    });
  }

  return blocks;
}

/** The masthead with its defaults applied. `title` falls back to the subject. */
function resolveMasthead(masthead, subject) {
  return {
    eyebrow:
      masthead?.eyebrow === undefined
        ? DEFAULT_MASTHEAD_EYEBROW
        : str(masthead.eyebrow),
    title: trimmed(masthead?.title) || str(subject),
  };
}

/** The closing panel with its defaults applied, or null if it was cleared. */
function resolveCta(cta) {
  if (cta === null) return null;
  const resolved = {
    eyebrow: cta?.eyebrow === undefined ? DEFAULT_CTA.eyebrow : str(cta.eyebrow),
    title: cta?.title === undefined ? DEFAULT_CTA.title : str(cta.title),
    body: cta?.body === undefined ? DEFAULT_CTA.body : str(cta.body),
    label: str(cta?.label),
    url: str(cta?.url),
  };
  const empty =
    !trimmed(resolved.eyebrow) &&
    !trimmed(resolved.title) &&
    !trimmed(resolved.body) &&
    !trimmed(resolved.label);
  return empty ? null : resolved;
}

module.exports = {
  ALIGNMENTS,
  BLOCK_TYPES,
  CALLOUT_TONES,
  DEFAULT_ANNOUNCEMENT_EYEBROW,
  DEFAULT_CTA,
  DEFAULT_MASTHEAD_EYEBROW,
  DEFAULT_NOTE_EYEBROW,
  LEGACY_ANNOUNCEMENTS_HEADING,
  LEGACY_SECTIONS_HEADING,
  SPACER_SIZES,
  TEXT_BLOCK_TONES,
  TEXT_TONES,
  blockHasContent,
  blocksFromLegacy,
  normaliseBlock,
  normaliseBlocks,
  resolveCta,
  resolveMasthead,
};
