"use strict";

/**
 * Renders the weekly parent update.
 *
 * The other parent emails in this codebase split between SendGrid dynamic
 * templates (welcome, enrolment accepted) and HTML built in code (invoice paid,
 * password reset). This one builds its HTML here so the layout is versioned
 * with the sender and can be unit tested — the content varies per send, which
 * is exactly what a fixed template is bad at.
 *
 * The content is an ordered list of blocks (see `weeklyUpdateBlocks.js`). This
 * file owns how each block type is drawn and the surrounding chrome; it does not
 * decide what is in the email. Everything an admin can change is either a block
 * or a named piece of chrome copy — the layout itself, the palette and the table
 * scaffolding are not editable, because they are what keeps the email intact in
 * Outlook and on a phone.
 *
 * Layout constraints worth knowing before editing:
 *
 *   - Tables, not divs. Outlook (Word rendering engine) ignores `max-width`,
 *     so a centred `<div style="max-width:600px">` silently renders full-bleed
 *     there.
 *   - The width is fluid up to 600px, not a fixed 600px. A `width="600"` table
 *     stretches its own containing block to 600px, which defeats the
 *     `max-width:100%` meant to rescue it and pushes the content off the right
 *     of a phone screen. Outlook, which needs the fixed width and ignores
 *     `max-width`, gets it through the `mso` ghost table instead.
 *   - Inline styles only. Gmail strips `<style>` blocks in several contexts,
 *     so anything load-bearing has to sit on the element.
 *   - No web fonts, no background images, no scripts. All three are stripped or
 *     blocked somewhere that matters.
 *   - Images are blocked by default in many clients. The navy header band is a
 *     background colour rather than an image, so the brand still reads when the
 *     logo does not load — the `alt` text carries the name.
 */

const { DEFAULT_SITE_ORIGIN } = require("./unsubscribeToken");
const {
  escapeHtml,
  richTextToHtml,
  richTextToPlain,
  safeUrl,
} = require("./richText");
const {
  DEFAULT_ANNOUNCEMENT_EYEBROW,
  DEFAULT_NOTE_EYEBROW,
  blocksFromLegacy,
  normaliseBlocks,
  resolveCta,
  resolveMasthead,
} = require("./weeklyUpdateBlocks");

/** Brand palette, mirroring `apps/website/src/styles/claude-design.css`. */
const DEEP_NAVY = "#112D4F";
const NAVY = "#1B3F71";
const PRIMARY = "#1C71AF";
const SKY = "#5AA5E3";
const BLUE_100 = "#D6EBF7";
const BLUE_50 = "#EEF5FB";
const INK = "#243A57";
const INK_MUTED = "#5A6B82";
const PAGE_BG = "#FBF8F3";
const PAPER = "#FFFFFF";
const RULE = "#DDE6EF";

/**
 * Callout tones. Warning and success sit outside the brand palette on purpose:
 * a fee deadline or a "you are all set" needs to read as one at a glance, and
 * the blues cannot carry that difference on their own.
 */
const CALLOUT_TONE_STYLES = {
  info: { bg: BLUE_50, border: BLUE_100, accent: PRIMARY },
  warn: { bg: "#FDF6E7", border: "#F6E3B4", accent: "#B7791F" },
  success: { bg: "#EDF7F0", border: "#C6E7D0", accent: "#2F7A4B" },
};

const SPACER_HEIGHTS = { sm: 14, md: 28, lg: 42 };

const CONTACT_EMAIL = "enquiries@tenacitytutoring.com";
const CONTACT_PHONE = "0401 455 112";
const LOGO_PATH = "/email/logo-horizontal-white.png";
const LOGO_WIDTH = 240;
const CONTENT_WIDTH = 600;
const BODY_FONT = "Arial,Helvetica,sans-serif";
const PREHEADER_MAX = 90;

/** The absolute URL of the header logo, served by the public website. */
function logoUrlFor(origin = DEFAULT_SITE_ORIGIN) {
  return `${String(origin).replace(/\/+$/, "")}${LOGO_PATH}`;
}

function trimmed(value) {
  return String(value ?? "").trim();
}

/**
 * An empty eyebrow means "use the standard label", not "no label". Removing a
 * panel's label is not offered: it is what tells a parent skimming on a phone
 * which kind of thing they are reading.
 */
function eyebrowOr(value, fallback) {
  return trimmed(value) || fallback;
}

function toParagraphs(value) {
  return richTextToHtml(value, { linkColor: PRIMARY });
}

/** A row of vertical space. Emails cannot rely on margins collapsing sanely. */
function spacerRow(height) {
  return `<tr><td height="${height}" style="height:${height}px;font-size:0;line-height:0;">&nbsp;</td></tr>`;
}

function panel(innerHtml, { cellStyle, trailing }) {
  return [
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;">',
    "<tr>",
    `<td style="${cellStyle}">`,
    innerHtml,
    "</td>",
    "</tr>",
    spacerRow(trailing),
    "</table>",
  ].join("");
}

function eyebrowHtml(text, { fontSize, spacing, color, marginBottom }) {
  return `<p style="margin:0 0 ${marginBottom}px;font-size:${fontSize}px;line-height:1.3;font-weight:bold;letter-spacing:${spacing}px;text-transform:uppercase;color:${color};">${escapeHtml(
    text
  )}</p>`;
}

function panelTitleHtml(title, { fontSize, marginBottom }) {
  return `<h3 style="margin:0 0 ${marginBottom}px;font-size:${fontSize}px;line-height:1.35;color:${NAVY};">${escapeHtml(
    title
  )}</h3>`;
}

function renderNoteBlock(block) {
  return panel(
    [
      eyebrowHtml(eyebrowOr(block.eyebrow, DEFAULT_NOTE_EYEBROW), {
        fontSize: 11,
        spacing: 1.4,
        color: PRIMARY,
        marginBottom: 8,
      }),
      trimmed(block.title)
        ? panelTitleHtml(trimmed(block.title), { fontSize: 18, marginBottom: 9 })
        : "",
      toParagraphs(block.body),
    ].join(""),
    {
      cellStyle: `background-color:${BLUE_50};border:1px solid ${BLUE_100};border-left:4px solid ${PRIMARY};border-radius:12px;padding:20px 20px 19px;color:${INK};`,
      trailing: 28,
    }
  );
}

function renderCardBlock(block) {
  return panel(
    [
      trimmed(block.title)
        ? panelTitleHtml(trimmed(block.title), { fontSize: 18, marginBottom: 9 })
        : "",
      toParagraphs(block.body),
    ].join(""),
    {
      cellStyle: `background-color:${PAPER};border:1px solid ${RULE};border-top:4px solid ${SKY};border-radius:12px;padding:18px 20px 19px;color:${INK};`,
      trailing: 14,
    }
  );
}

/** Body copy with no panel around it, for a note that should not look boxed. */
function renderPlainBlock(block) {
  return [
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;">',
    "<tr>",
    `<td style="color:${INK};">`,
    trimmed(block.title)
      ? panelTitleHtml(trimmed(block.title), { fontSize: 18, marginBottom: 9 })
      : "",
    toParagraphs(block.body),
    "</td>",
    "</tr>",
    spacerRow(14),
    "</table>",
  ].join("");
}

function renderTextBlock(block) {
  if (block.tone === "note") return renderNoteBlock(block);
  if (block.tone === "card") return renderCardBlock(block);
  return renderPlainBlock(block);
}

function renderAnnouncementBlock(block) {
  const title = trimmed(block.title);
  return panel(
    [
      eyebrowHtml(eyebrowOr(block.eyebrow, DEFAULT_ANNOUNCEMENT_EYEBROW), {
        fontSize: 10,
        spacing: 1.3,
        color: PRIMARY,
        marginBottom: 7,
      }),
      title ? panelTitleHtml(title, { fontSize: 16, marginBottom: 8 }) : "",
      toParagraphs(block.body),
    ].join(""),
    {
      cellStyle: `background-color:${BLUE_50};border:1px solid ${BLUE_100};border-radius:12px;padding:19px 20px 18px;color:${INK};`,
      trailing: 14,
    }
  );
}

function renderHeadingBlock(block) {
  const eyebrow = trimmed(block.eyebrow);
  const title = trimmed(block.title);
  return [
    eyebrow
      ? eyebrowHtml(eyebrow, {
          fontSize: 11,
          spacing: 1.4,
          color: PRIMARY,
          marginBottom: 6,
        })
      : "",
    title
      ? `<h2 style="margin:0 0 15px;font-size:21px;line-height:1.35;color:${DEEP_NAVY};">${escapeHtml(
          title
        )}</h2>`
      : "",
  ].join("");
}

function renderCalloutBlock(block) {
  const tone = CALLOUT_TONE_STYLES[block.tone] ?? CALLOUT_TONE_STYLES.info;
  return panel(
    [
      trimmed(block.title)
        ? `<h3 style="margin:0 0 8px;font-size:16px;line-height:1.35;color:${tone.accent};">${escapeHtml(
            trimmed(block.title)
          )}</h3>`
        : "",
      toParagraphs(block.body),
    ].join(""),
    {
      cellStyle: `background-color:${tone.bg};border:1px solid ${tone.border};border-left:4px solid ${tone.accent};border-radius:12px;padding:18px 20px;color:${INK};`,
      trailing: 14,
    }
  );
}

/**
 * A padded-anchor button.
 *
 * The padding sits on the `<a>` rather than the cell so the whole shape is
 * clickable in clients that ignore a linked table cell. When the URL is not one
 * we will link to, the shape still renders unlinked: an admin looking at the
 * preview should see the button they added, and the send is blocked separately.
 */
function renderButtonBlock(block) {
  const label = trimmed(block.label);
  if (!label) return "";
  const href = safeUrl(block.url);
  const align = block.align === "center" ? "center" : "left";
  const inner = `<a href="${escapeHtml(
    href || "#"
  )}" style="display:inline-block;padding:13px 26px;font-family:${BODY_FONT};font-size:15px;line-height:1.2;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:10px;">${escapeHtml(
    label
  )}</a>`;

  return [
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;">',
    "<tr>",
    `<td align="${align}">`,
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">',
    "<tr>",
    `<td style="background-color:${PRIMARY};border-radius:10px;">`,
    inner,
    "</td>",
    "</tr>",
    "</table>",
    "</td>",
    "</tr>",
    spacerRow(14),
    "</table>",
  ].join("");
}

function renderLinkListBlock(block) {
  const links = (block.links ?? [])
    .map((link) => ({ label: trimmed(link.label), url: safeUrl(link.url) }))
    .filter((link) => link.label);
  if (!links.length) return "";

  const items = links
    .map((link) => {
      const label = escapeHtml(link.label);
      const body = link.url
        ? `<a href="${escapeHtml(
            link.url
          )}" style="color:${PRIMARY};text-decoration:underline;">${label}</a>`
        : label;
      return `<li style="margin:0 0 7px;line-height:1.6;">${body}</li>`;
    })
    .join("");

  return panel(
    [
      trimmed(block.title)
        ? panelTitleHtml(trimmed(block.title), { fontSize: 16, marginBottom: 9 })
        : "",
      `<ul style="margin:0;padding:0 0 0 22px;">${items}</ul>`,
    ].join(""),
    {
      cellStyle: `background-color:${PAPER};border:1px solid ${RULE};border-radius:12px;padding:18px 20px;color:${INK};`,
      trailing: 14,
    }
  );
}

function renderSignatureBlock(block) {
  const name = trimmed(block.name);
  const role = trimmed(block.role);
  return [
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;">',
    "<tr>",
    `<td style="border-top:1px solid ${RULE};padding:16px 0 0;color:${INK};">`,
    block.body ? toParagraphs(block.body) : "",
    name
      ? `<p style="margin:${
          block.body ? "12px 0 0" : "0"
        };font-size:15px;line-height:1.5;font-weight:bold;color:${NAVY};">${escapeHtml(
          name
        )}</p>`
      : "",
    role
      ? `<p style="margin:2px 0 0;font-size:13px;line-height:1.5;color:${INK_MUTED};">${escapeHtml(
          role
        )}</p>`
      : "",
    "</td>",
    "</tr>",
    spacerRow(14),
    "</table>",
  ].join("");
}

function renderDividerBlock() {
  return [
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">',
    spacerRow(6),
    `<tr><td height="1" style="height:1px;background-color:${RULE};font-size:0;line-height:0;">&nbsp;</td></tr>`,
    spacerRow(20),
    "</table>",
  ].join("");
}

function renderSpacerBlock(block) {
  const height = SPACER_HEIGHTS[block.size] ?? SPACER_HEIGHTS.md;
  return [
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">',
    spacerRow(height),
    "</table>",
  ].join("");
}

function renderBlock(block) {
  switch (block?.type) {
    case "text":
      return renderTextBlock(block);
    case "announcement":
      return renderAnnouncementBlock(block);
    case "heading":
      return renderHeadingBlock(block);
    case "callout":
      return renderCalloutBlock(block);
    case "button":
      return renderButtonBlock(block);
    case "linkList":
      return renderLinkListBlock(block);
    case "signature":
      return renderSignatureBlock(block);
    case "divider":
      return renderDividerBlock();
    case "spacer":
      return renderSpacerBlock(block);
    default:
      return "";
  }
}

/** The block's contribution to the plain-text alternative. */
function blockToText(block) {
  const lines = [];
  const pushBody = (body) => {
    const text = richTextToPlain(body);
    if (text) lines.push(text);
  };

  switch (block?.type) {
    case "text":
    case "callout":
    case "announcement":
      if (trimmed(block.title)) lines.push(trimmed(block.title));
      pushBody(block.body);
      break;
    case "heading":
      if (trimmed(block.title)) lines.push(trimmed(block.title));
      break;
    case "button": {
      const label = trimmed(block.label);
      const href = safeUrl(block.url);
      if (label && href) lines.push(`${label}: ${href}`);
      else if (label) lines.push(label);
      break;
    }
    case "linkList":
      if (trimmed(block.title)) lines.push(trimmed(block.title));
      (block.links ?? []).forEach((link) => {
        const label = trimmed(link.label);
        const href = safeUrl(link.url);
        if (!label) return;
        lines.push(href ? `- ${label}: ${href}` : `- ${label}`);
      });
      break;
    case "signature":
      pushBody(block.body);
      if (trimmed(block.name)) lines.push(trimmed(block.name));
      if (trimmed(block.role)) lines.push(trimmed(block.role));
      break;
    default:
      break;
  }

  return lines;
}

/**
 * The snippet clients show beside the subject in the inbox list. Without one,
 * the first text in the document gets used — which used to mean every update
 * previewed as "TENACITY TUTORING".
 *
 * An explicit `preheader` wins. Otherwise it is derived from the first block
 * with copy in it, skipping headings: "In this week's update" is filler in an
 * inbox list, and the block it introduces says something.
 */
function preheaderText({ preheader, blocks = [], subject }) {
  const collapse = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

  const explicit = collapse(preheader);
  const source =
    explicit ||
    blocks
      .filter((block) => block?.type !== "heading")
      .flatMap((block) => blockToText(block))
      .map(collapse)
      .find(Boolean) ||
    collapse(subject);

  return source.length > PREHEADER_MAX
    ? `${source.slice(0, PREHEADER_MAX - 1).trimEnd()}…`
    : source;
}

/**
 * Zero-width padding after the preheader. Gmail pads a short snippet by pulling
 * in whatever body text comes next; these invisible characters fill that space
 * so the header markup does not leak into the inbox preview.
 */
function preheaderPadding() {
  return "&#847;&zwnj;&nbsp;".repeat(20);
}

function renderCtaPanel(cta) {
  const label = trimmed(cta.label);
  const href = safeUrl(cta.url);
  return [
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;">',
    spacerRow(14),
    "<tr>",
    `<td style="background-color:${NAVY};border-radius:12px;padding:21px 22px;color:#FFFFFF;">`,
    trimmed(cta.eyebrow)
      ? `<p style="margin:0 0 6px;font-size:10px;line-height:1.3;font-weight:bold;letter-spacing:1.4px;text-transform:uppercase;color:${BLUE_100};">${escapeHtml(
          trimmed(cta.eyebrow)
        )}</p>`
      : "",
    trimmed(cta.title)
      ? `<h2 style="margin:0 0 7px;font-size:18px;line-height:1.35;color:#FFFFFF;">${escapeHtml(
          trimmed(cta.title)
        )}</h2>`
      : "",
    trimmed(cta.body)
      ? `<p style="margin:0;font-size:14px;line-height:1.55;color:${BLUE_100};">${escapeHtml(
          trimmed(cta.body)
        )}</p>`
      : "",
    label
      ? [
          '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin-top:16px;">',
          "<tr>",
          `<td style="background-color:${SKY};border-radius:10px;">`,
          `<a href="${escapeHtml(
            href || "#"
          )}" style="display:inline-block;padding:11px 22px;font-family:${BODY_FONT};font-size:14px;line-height:1.2;font-weight:bold;color:${DEEP_NAVY};text-decoration:none;border-radius:10px;">${escapeHtml(
            label
          )}</a>`,
          "</td>",
          "</tr>",
          "</table>",
        ].join("")
      : "",
    "</td>",
    "</tr>",
    "</table>",
  ].join("");
}

/**
 * @param {object} input
 * @param {string} input.subject
 * @param {string} [input.preheader] overrides the derived inbox snippet
 * @param {Array<object>} [input.blocks] the content model; see weeklyUpdateBlocks
 * @param {{eyebrow?: string, title?: string}} [input.masthead]
 * @param {object|null} [input.cta] closing panel, or null to drop it
 * @param {string} [input.intro] legacy fixed slot, converted to blocks
 * @param {Array<{title: string, body: string}>} [input.announcements] legacy slot
 * @param {Array<{title: string, body: string}>} [input.sections] legacy slot
 * @param {string} input.unsubscribeUrl
 * @param {string} [input.logoUrl] absolute; defaults to the production website
 * @returns {{ html: string, text: string }}
 */
function renderWeeklyUpdateEmail({
  subject,
  preheader = "",
  blocks,
  masthead,
  cta,
  intro = "",
  announcements = [],
  sections = [],
  unsubscribeUrl,
  logoUrl = logoUrlFor(),
}) {
  const content = normaliseBlocks(
    blocks ?? blocksFromLegacy({ intro, announcements, sections })
  );
  const chrome = resolveMasthead(masthead, subject);
  const closing = resolveCta(cta);

  const body = content.map(renderBlock).join("");

  const html = [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width,initial-scale=1" />',
    // Tells Apple Mail and Outlook.com the design handles both schemes, which
    // stops them force-inverting the palette into mud.
    '<meta name="color-scheme" content="light dark" />',
    '<meta name="supported-color-schemes" content="light dark" />',
    `<title>${escapeHtml(subject)}</title>`,
    "</head>",
    `<body style="margin:0;padding:0;width:100%;background-color:${PAGE_BG};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">`,

    `<div style="display:none;font-size:1px;color:${PAGE_BG};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(
      preheaderText({ preheader, blocks: content, subject })
    )}${preheaderPadding()}</div>`,

    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;background-color:${PAGE_BG};mso-table-lspace:0;mso-table-rspace:0;">`,
    '<tr><td align="center" style="padding:28px 12px;">',

    // Outlook only: a hard 600px cage, since it ignores the max-width below.
    `<!--[if mso]><table role="presentation" width="${CONTENT_WIDTH}" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${CONTENT_WIDTH}px;border-collapse:separate;background-color:${PAPER};border:1px solid ${RULE};border-radius:18px;box-shadow:0 12px 32px rgba(17,45,79,0.10);overflow:hidden;mso-table-lspace:0;mso-table-rspace:0;">`,

    // Masthead. The colour, not the image, carries the brand when the client
    // blocks remote images; the image styles also make its alt text readable.
    `<tr><td height="6" style="height:6px;background-color:${SKY};font-size:0;line-height:0;">&nbsp;</td></tr>`,
    `<tr><td align="center" style="background-color:${NAVY};padding:28px 24px 31px;font-family:${BODY_FONT};">`,
    `<img src="${escapeHtml(
      logoUrl
    )}" width="${LOGO_WIDTH}" alt="Tenacity Tutoring" style="display:block;width:100%;max-width:${LOGO_WIDTH}px;height:auto;margin:0 auto;border:0;outline:none;text-decoration:none;font-family:${BODY_FONT};font-size:18px;font-weight:bold;color:#ffffff;" />`,
    `<table role="presentation" width="72" cellpadding="0" cellspacing="0" border="0" style="width:72px;border-collapse:collapse;"><tr><td height="24" style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr><tr><td height="2" style="height:2px;background-color:${SKY};font-size:0;line-height:0;">&nbsp;</td></tr><tr><td height="20" style="height:20px;font-size:0;line-height:0;">&nbsp;</td></tr></table>`,
    trimmed(chrome.eyebrow)
      ? `<p style="margin:0 0 8px;font-size:11px;line-height:1.3;font-weight:bold;letter-spacing:1.7px;text-transform:uppercase;color:${BLUE_100};">${escapeHtml(
          trimmed(chrome.eyebrow)
        )}</p>`
      : "",
    `<h1 style="margin:0;max-width:500px;font-size:28px;line-height:1.25;font-weight:bold;color:#FFFFFF;">${escapeHtml(
      chrome.title
    )}</h1>`,
    "</td></tr>",

    // Editorial content. Individual panels are tables so their structure is
    // retained by Outlook's Word-based renderer.
    `<tr><td style="background-color:${PAPER};padding:30px 26px 18px;font-family:${BODY_FONT};font-size:15px;line-height:1.65;color:${INK};">`,
    body,
    closing ? renderCtaPanel(closing) : "",
    "</td></tr>",

    // Footer.
    `<tr><td style="background-color:${DEEP_NAVY};padding:23px 26px 25px;font-family:${BODY_FONT};font-size:12px;line-height:1.55;color:${BLUE_100};">`,
    '<p style="margin:0 0 3px;font-size:13px;font-weight:bold;color:#FFFFFF;">Tenacity Tutoring</p>',
    `<p style="margin:0 0 13px;"><a href="mailto:${CONTACT_EMAIL}" style="color:#FFFFFF;text-decoration:underline;">${CONTACT_EMAIL}</a> &nbsp;&middot;&nbsp; ${CONTACT_PHONE}</p>`,
    `<p style="margin:0;color:${BLUE_100};">You are receiving this because you have a parent account with Tenacity Tutoring. <a href="${escapeHtml(
      unsubscribeUrl
    )}" style="color:#FFFFFF;text-decoration:underline;">Unsubscribe from weekly updates</a>.</p>`,
    "</td></tr>",

    "</table>",
    "<!--[if mso]></td></tr></table><![endif]-->",
    "</td></tr>",
    "</table>",
    "</body>",
    "</html>",
  ].join("");

  const textParts = ["TENACITY TUTORING", subject, ""];
  content.forEach((block) => {
    const lines = blockToText(block);
    if (!lines.length) return;
    textParts.push(...lines, "");
  });
  if (closing) {
    const closingLines = [
      trimmed(closing.title),
      trimmed(closing.body),
      trimmed(closing.label) && safeUrl(closing.url)
        ? `${trimmed(closing.label)}: ${safeUrl(closing.url)}`
        : "",
    ].filter(Boolean);
    textParts.push(...closingLines, "");
  }
  textParts.push(
    `Tenacity Tutoring | ${CONTACT_EMAIL} | ${CONTACT_PHONE}`,
    "",
    `Unsubscribe from weekly updates: ${unsubscribeUrl}`
  );

  return { html, text: textParts.join("\n") };
}

module.exports = {
  CONTACT_EMAIL,
  CONTACT_PHONE,
  escapeHtml,
  logoUrlFor,
  preheaderText,
  renderWeeklyUpdateEmail,
};
