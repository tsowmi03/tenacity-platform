/**
 * The composer's half of the weekly update's content model.
 *
 * `backend/firebase/functions/src/email/weeklyUpdateBlocks.js` is the authority:
 * it decides what a block means and it is what renders the email. This file
 * mirrors only what the composer needs to edit one — the type list, the defaults
 * a new block starts with, the legacy conversion, and what counts as content.
 *
 * The duplication is the same trade the recipient rules in `weeklyUpdateDigest.js`
 * already make: the Functions package is CommonJS and this app is an ESM Vite
 * build, with no workspace linking them. Both test suites assert the same legacy
 * fixture converts to the same blocks, so the two cannot drift silently.
 */

/** Protocols we will put behind a link in an email. Mirrors `richText.js`. */
const ALLOWED_PROTOCOLS = ["http://", "https://", "mailto:"];

export function safeUrl(value) {
  const url = String(value ?? "").trim();
  if (!url) return "";
  const lower = url.toLowerCase();
  return ALLOWED_PROTOCOLS.some((protocol) => lower.startsWith(protocol)) ? url : "";
}

/** The hint shown under every rich-text field, so the syntax is discoverable. */
export const RICH_TEXT_HINT =
  "**bold**, *italic*, [label](https://…), and lines starting with - become bullets.";

/**
 * Chrome copy that used to be hardcoded in the renderer. The composer seeds the
 * form with these so the text is visible and editable rather than implied; the
 * renderer applies the same defaults for any draft that has never stored them.
 * Mirrors `weeklyUpdateBlocks.js` in the Functions package.
 */
export const DEFAULT_MASTHEAD_EYEBROW = "Weekly family update";

export const DEFAULT_CTA = {
  eyebrow: "Stay connected",
  title: "Everything else, all in one place",
  body: "Open the Tenacity app for timetables, invoices and messages.",
  label: "",
  url: "",
};

export const TEXT_TONES = [
  { id: "plain", label: "Plain" },
  { id: "note", label: "Highlighted note" },
  { id: "card", label: "Card" },
];

export const CALLOUT_TONES = [
  { id: "info", label: "Information" },
  { id: "warn", label: "Warning" },
  { id: "success", label: "Positive" },
];

export const SPACER_SIZES = [
  { id: "sm", label: "Small" },
  { id: "md", label: "Medium" },
  { id: "lg", label: "Large" },
];

export const ALIGNMENTS = [
  { id: "left", label: "Left" },
  { id: "center", label: "Centred" },
];

/**
 * Every block type, in the order the "add" row offers them: the ones used on
 * every update first, structural filler last.
 */
export const BLOCK_TYPES = [
  {
    id: "text",
    label: "Text",
    hint: "A paragraph or two, optionally boxed.",
    create: () => ({ type: "text", tone: "plain", eyebrow: "", title: "", body: "" }),
  },
  {
    id: "announcement",
    label: "Announcement",
    hint: "Pulls the copy from an existing announcement.",
    create: () => ({ type: "announcement", announcementId: "", eyebrow: "" }),
  },
  {
    id: "heading",
    label: "Heading",
    hint: "Introduces the blocks under it.",
    create: () => ({ type: "heading", eyebrow: "", title: "" }),
  },
  {
    id: "callout",
    label: "Callout",
    hint: "Something parents must not miss.",
    create: () => ({ type: "callout", tone: "info", title: "", body: "" }),
  },
  {
    id: "button",
    label: "Button",
    hint: "One clear action.",
    create: () => ({ type: "button", label: "", url: "", align: "left" }),
  },
  {
    id: "linkList",
    label: "Links",
    hint: "A short list of places to go.",
    create: () => ({ type: "linkList", title: "", links: [{ label: "", url: "" }] }),
  },
  {
    id: "signature",
    label: "Signature",
    hint: "Sign the update off.",
    create: () => ({ type: "signature", name: "", role: "", body: "" }),
  },
  { id: "divider", label: "Divider", hint: "A rule.", create: () => ({ type: "divider" }) },
  {
    id: "spacer",
    label: "Spacer",
    hint: "Extra breathing room.",
    create: () => ({ type: "spacer", size: "md" }),
  },
];

export function blockTypeLabel(type) {
  return BLOCK_TYPES.find((option) => option.id === type)?.label ?? "Block";
}

/**
 * Ids only have to be unique within one draft; they exist so React keys and the
 * reorder controls survive a block moving, not to be referenced from anywhere.
 */
let blockCounter = 0;
export function newBlock(type) {
  const definition = BLOCK_TYPES.find((option) => option.id === type);
  if (!definition) return null;
  blockCounter += 1;
  return { id: `b${Date.now().toString(36)}${blockCounter}`, ...definition.create() };
}

function trimmed(value) {
  return String(value ?? "").trim();
}

/**
 * Whether a body has anything in it once bullet markers are discounted, matching
 * `isEmptyRichText` in the Functions package. A body of `- ` renders an empty
 * bullet, so it is not content.
 */
function hasProse(value) {
  return String(value ?? "")
    .split("\n")
    .some((line) => line.replace(/^\s*[-*]\s+/, "").trim());
}

/**
 * Whether a block puts anything in the email. Mirrors `blockHasContent` in the
 * Functions package; dividers and spacers never count.
 */
export function blockHasContent(block) {
  if (!block) return false;
  switch (block.type) {
    case "text":
      return Boolean(trimmed(block.title)) || hasProse(block.body);
    case "announcement":
      return Boolean(trimmed(block.announcementId));
    case "heading":
      return Boolean(trimmed(block.title) || trimmed(block.eyebrow));
    case "callout":
      return Boolean(trimmed(block.title)) || hasProse(block.body);
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
 * A draft written before blocks existed, as blocks.
 *
 * Must stay in step with `blocksFromLegacy` in the Functions package: the same
 * fixture is asserted in both test suites. The inserted spacer is not cosmetic —
 * it is what makes the converted draft render byte-identically to the old fixed
 * layout.
 */
export function blocksFromLegacy({ intro = "", announcementIds = [], sections = [] } = {}) {
  const blocks = [];

  if (trimmed(intro)) {
    blocks.push({
      id: "legacy-intro",
      type: "text",
      tone: "note",
      eyebrow: "",
      title: "",
      body: String(intro),
    });
  }

  if (announcementIds.length) {
    blocks.push({
      id: "legacy-announcements-heading",
      type: "heading",
      eyebrow: "Important information",
      title: "This week's announcements",
    });
    announcementIds.forEach((announcementId, index) => {
      blocks.push({
        id: `legacy-announcement-${index}`,
        type: "announcement",
        announcementId,
        eyebrow: "",
      });
    });
    blocks.push({ id: "legacy-announcements-spacer", type: "spacer", size: "sm" });
  }

  if (sections.length) {
    blocks.push({
      id: "legacy-sections-heading",
      type: "heading",
      eyebrow: "At a glance",
      title: "In this week's update",
    });
    sections.forEach((section, index) => {
      blocks.push({
        id: `legacy-section-${index}`,
        type: "text",
        tone: "card",
        eyebrow: "",
        title: String(section?.title ?? ""),
        body: String(section?.body ?? ""),
      });
    });
  }

  return blocks;
}

/** The blocks with `index` moved by `delta`, or the same list if it cannot move. */
export function moveBlock(blocks, index, delta) {
  const target = index + delta;
  if (target < 0 || target >= blocks.length) return blocks;
  const next = [...blocks];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function announcementIdsFromBlocks(blocks) {
  return (Array.isArray(blocks) ? blocks : [])
    .filter((block) => block?.type === "announcement")
    .map((block) => trimmed(block.announcementId))
    .filter(Boolean);
}

/**
 * Mistakes inside blocks, in the words the composer shows.
 *
 * Kept apart from `draftBlockers` because these are per-block and countable:
 * "two buttons need a valid link" is actionable, "something is wrong" is not.
 */
export function blockProblems(blocks) {
  const problems = [];
  (Array.isArray(blocks) ? blocks : []).forEach((block, index) => {
    const position = `Block ${index + 1} (${blockTypeLabel(block?.type)})`;
    switch (block?.type) {
      case "announcement":
        if (!trimmed(block.announcementId)) {
          problems.push(`${position}: choose an announcement.`);
        }
        break;
      case "button":
        if (!trimmed(block.label)) problems.push(`${position}: add a label.`);
        if (!safeUrl(block.url)) {
          problems.push(`${position}: add a link starting with https://.`);
        }
        break;
      case "linkList":
        (block.links ?? []).forEach((link, linkIndex) => {
          const label = trimmed(link.label);
          const url = trimmed(link.url);
          if (!label && !url) return;
          if (!label) problems.push(`${position}, link ${linkIndex + 1}: add a label.`);
          if (!safeUrl(url)) {
            problems.push(
              `${position}, link ${linkIndex + 1}: add a link starting with https://.`
            );
          }
        });
        break;
      default:
        break;
    }
  });
  return problems;
}
