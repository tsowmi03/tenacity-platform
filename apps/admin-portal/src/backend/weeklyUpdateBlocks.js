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
 *
 * Beyond the model, this file carries how each choice is described to an admin.
 * Those descriptions live here rather than in the components because a style is
 * only meaningful next to the others — "Card" means nothing until it sits beside
 * "Note", and splitting the list across files is how they drift apart.
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

export const DEFAULT_NOTE_EYEBROW = "A note from Tenacity";

/**
 * How a text block looks, as one list.
 *
 * `info`, `warn` and `success` used to be a separate `callout` block type. They
 * were merged because choosing the block type meant choosing the look before
 * seeing it, across two menus that overlapped: a "Text / Highlighted note" and
 * a "Callout / Information" render nearly the same panel, and nothing in either
 * menu said so. One block with one styles row means the choice is made once,
 * against swatches, and is reversible without deleting anything.
 *
 * `eyebrow` marks the one style that shows a small label above the copy — the
 * only thing that distinguishes a note from an information callout, so it is
 * what the swatch has to draw.
 */
export const TEXT_STYLES = [
  {
    id: "plain",
    label: "Plain",
    description: "Body copy with nothing around it. Use this for most writing.",
  },
  {
    id: "note",
    label: "Note",
    description: "A tinted panel under a small label, for an aside in Tenacity's voice.",
    eyebrow: true,
  },
  {
    id: "card",
    label: "Card",
    description: "A white box, for one item that should stand on its own.",
  },
  {
    id: "info",
    label: "Information",
    description: "A blue panel for something worth noticing.",
  },
  {
    id: "warn",
    label: "Warning",
    description: "An amber panel for a deadline, a closure or a change of plan.",
  },
  {
    id: "success",
    label: "Positive",
    description: "A green panel for good news or an all-clear.",
  },
];

export function textStyle(tone) {
  return TEXT_STYLES.find((style) => style.id === tone) ?? TEXT_STYLES[0];
}

/** The tones a pre-merge `callout` could hold, for converting a stored one. */
const CALLOUT_TONES = ["info", "warn", "success"];

export const SPACER_SIZES = [
  { id: "sm", label: "Small", description: "14px" },
  { id: "md", label: "Medium", description: "28px" },
  { id: "lg", label: "Large", description: "42px" },
];

export const ALIGNMENTS = [
  { id: "left", label: "Left" },
  { id: "center", label: "Centred" },
];

/**
 * The groups the "add a block" picker offers, in the order it shows them: what
 * an update is mostly made of first, the things that arrange it last.
 */
export const BLOCK_GROUPS = [
  { id: "words", label: "Words" },
  { id: "reuse", label: "From elsewhere" },
  { id: "action", label: "Somewhere to go" },
  { id: "layout", label: "Structure" },
];

/**
 * Every block type the composer can create.
 *
 * A text block appears four times, once per starting style, because the picker
 * is where the look is easiest to choose — the tiles are drawn as the panels
 * they produce. It is a starting point, not a commitment: the block's own styles
 * row offers all six and switching between them keeps the copy.
 */
export const BLOCK_TYPES = [
  {
    id: "text",
    group: "words",
    label: "Paragraph",
    hint: "Plain body copy.",
    create: () => ({ type: "text", tone: "plain", eyebrow: "", title: "", body: "" }),
  },
  {
    id: "text:note",
    group: "words",
    label: "Note",
    hint: "A tinted panel under a small label.",
    create: () => ({ type: "text", tone: "note", eyebrow: "", title: "", body: "" }),
  },
  {
    id: "text:card",
    group: "words",
    label: "Card",
    hint: "A white box for one standalone item.",
    create: () => ({ type: "text", tone: "card", eyebrow: "", title: "", body: "" }),
  },
  {
    id: "text:info",
    group: "words",
    label: "Callout",
    hint: "A coloured panel for something parents must not miss.",
    create: () => ({ type: "text", tone: "info", eyebrow: "", title: "", body: "" }),
  },
  {
    id: "announcement",
    group: "reuse",
    label: "Announcement",
    hint: "Reuses an announcement you have already written.",
    create: () => ({ type: "announcement", announcementId: "", eyebrow: "" }),
  },
  {
    id: "button",
    group: "action",
    label: "Button",
    hint: "One clear action.",
    create: () => ({ type: "button", label: "", url: "", align: "left" }),
  },
  {
    id: "linkList",
    group: "action",
    label: "Link list",
    hint: "A short list of places to go.",
    create: () => ({ type: "linkList", title: "", links: [{ label: "", url: "" }] }),
  },
  {
    id: "heading",
    group: "layout",
    label: "Heading",
    hint: "Introduces the blocks under it.",
    create: () => ({ type: "heading", eyebrow: "", title: "" }),
  },
  {
    id: "signature",
    group: "layout",
    label: "Signature",
    hint: "Signs the update off.",
    create: () => ({ type: "signature", name: "", role: "", body: "" }),
  },
  {
    id: "divider",
    group: "layout",
    label: "Divider",
    hint: "A horizontal rule.",
    create: () => ({ type: "divider" }),
  },
  {
    id: "spacer",
    group: "layout",
    label: "Gap",
    hint: "Extra breathing room.",
    create: () => ({ type: "spacer", size: "md" }),
  },
];

/**
 * What to call a block in the list.
 *
 * A text block is named by its style rather than its type: a stack of six
 * blocks all reading "Text" tells you nothing about the email's shape, which is
 * the only reason to look at the list.
 */
export function blockTypeLabel(block) {
  // Tolerates a bare type string, which is what the send blockers pass.
  const resolved = typeof block === "string" ? { type: block } : block;
  if (resolved?.type === "text") return textStyle(resolved.tone).label;
  if (resolved?.type === "callout") return textStyle(resolved.tone).label;
  const match = BLOCK_TYPES.find((option) => option.id === resolved?.type);
  return match?.label ?? "Block";
}

const SUMMARY_MAX = 68;

function firstLine(value) {
  return String(value ?? "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/[*_`#>]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
}

function clamp(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX - 1).trimEnd()}…` : text;
}

/**
 * One line describing what is in a block, for its collapsed row.
 *
 * The point of collapsing is to make the running order scannable, which only
 * works if a closed block still says which one it is. An empty block returns
 * an empty string so the caller can say "empty" in its own words.
 */
export function blockSummary(block, { announcementTitle } = {}) {
  if (!block) return "";
  switch (block.type) {
    case "text":
    case "callout":
      return clamp(trimmed(block.title) || firstLine(block.body));
    case "announcement":
      return clamp(announcementTitle || "");
    case "heading":
      return clamp(trimmed(block.title) || trimmed(block.eyebrow));
    case "button":
      return clamp(trimmed(block.label));
    case "linkList": {
      const labels = (block.links ?? []).map((link) => trimmed(link.label)).filter(Boolean);
      return clamp(labels.join(", "));
    }
    case "signature":
      return clamp(trimmed(block.name) || trimmed(block.role));
    case "spacer":
      return SPACER_SIZES.find((size) => size.id === (block.size ?? "md"))?.label ?? "";
    default:
      return "";
  }
}

/**
 * Ids only have to be unique within one draft; they exist so React keys and the
 * reorder controls survive a block moving, not to be referenced from anywhere.
 */
let blockCounter = 0;
export function newBlock(typeId) {
  const definition = BLOCK_TYPES.find((option) => option.id === typeId);
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
    case "callout":
      return Boolean(trimmed(block.title)) || hasProse(block.body);
    case "announcement":
      return Boolean(trimmed(block.announcementId));
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

/** Structural blocks earn their place without carrying copy. */
const STRUCTURAL_TYPES = new Set(["divider", "spacer"]);

/**
 * Whether the email will draw this block at all.
 *
 * Mirrors the filter in `blastContent.js`, which drops a block with nothing in
 * it because an empty panel reads as a rendering fault rather than an empty
 * field. The composer needs the same answer to explain why a block it is showing
 * is missing from the preview.
 */
export function blockRendersInEmail(block) {
  return STRUCTURAL_TYPES.has(block?.type) || blockHasContent(block);
}

/**
 * A stored block as the composer edits it.
 *
 * Only `callout` needs converting: it became three more tones of `text`. This
 * mirrors `normaliseBlock` in the Functions package, including its fallback —
 * a callout with an unreadable tone becomes `info`, not `plain`, so it cannot
 * lose its panel on the way through the composer.
 *
 * Nothing is written back until the admin saves, so opening an old update to
 * look at it does not rewrite it.
 */
export function blockForEditing(block) {
  if (block?.type !== "callout") return block;
  const { tone, ...rest } = block;
  return {
    ...rest,
    type: "text",
    tone: CALLOUT_TONES.includes(tone) ? tone : "info",
    eyebrow: "",
  };
}

export function blocksForEditing(blocks) {
  return (Array.isArray(blocks) ? blocks : []).map(blockForEditing);
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
 * Mistakes inside blocks, keyed to the block they belong to.
 *
 * Kept apart from `draftBlockers` because these are per-block and countable:
 * "two buttons need a valid link" is actionable, "something is wrong" is not.
 * The `id` is what lets the composer show the problem on the block itself
 * rather than only in a list at the top of the page.
 */
export function blockProblems(blocks) {
  const problems = [];
  (Array.isArray(blocks) ? blocks : []).forEach((block, index) => {
    const at = { id: block?.id ?? null, index, field: null };
    const add = (field, message) => problems.push({ ...at, field, message });

    switch (block?.type) {
      case "announcement":
        if (!trimmed(block.announcementId)) add("announcementId", "Choose an announcement.");
        break;
      case "button":
        if (!trimmed(block.label)) add("label", "Add a label.");
        if (!safeUrl(block.url)) add("url", "Add a link starting with https://.");
        break;
      case "linkList":
        (block.links ?? []).forEach((link, linkIndex) => {
          const label = trimmed(link.label);
          const url = trimmed(link.url);
          if (!label && !url) return;
          if (!label) add(`links.${linkIndex}.label`, `Link ${linkIndex + 1} needs a label.`);
          if (!safeUrl(url)) {
            add(
              `links.${linkIndex}.url`,
              `Link ${linkIndex + 1} needs a link starting with https://.`
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

/** A block problem as one sentence, for the send blockers at the top. */
export function describeBlockProblem(problem, block) {
  return `Block ${problem.index + 1} (${blockTypeLabel(block)}): ${
    problem.message.charAt(0).toLowerCase() + problem.message.slice(1)
  }`;
}
