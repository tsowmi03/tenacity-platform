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

/** Brand palette, mirroring `apps/website/tailwind.config.ts`. */
const NAVY = "#1B3F71";
const PRIMARY = "#1C71AF";
const INK = "#333333";
const MUTED = "#6b7280";
const PAGE_BG = "#f5f5f5";
const RULE = "#e5e7eb";

const CONTACT_EMAIL = "enquiries@tenacitytutoring.com";
const CONTACT_PHONE = "0401 455 112";
const LOGO_PATH = "/email/logo-horizontal-white.png";
const LOGO_WIDTH = 240;
const CONTENT_WIDTH = 600;
const BODY_FONT = "Arial,Helvetica,sans-serif";
const PREHEADER_MAX = 90;

const ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

/** The absolute URL of the header logo, served by the public website. */
function logoUrlFor(origin = DEFAULT_SITE_ORIGIN) {
  return `${String(origin).replace(/\/+$/, "")}${LOGO_PATH}`;
}

/** Author-entered bodies are plain text; keep their line breaks. */
function toParagraphs(value) {
  return String(value ?? "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 12px;line-height:1.5;">${escapeHtml(block).replace(
          /\n/g,
          "<br />"
        )}</p>`
    )
    .join("");
}

function renderBlock(title, body) {
  return [
    `<h2 style="margin:28px 0 8px;font-size:17px;line-height:1.3;color:${NAVY};">${escapeHtml(
      title
    )}</h2>`,
    toParagraphs(body),
  ].join("");
}

/**
 * The snippet clients show beside the subject in the inbox list. Without one,
 * the first text in the document gets used — which used to mean every update
 * previewed as "TENACITY TUTORING".
 */
function preheaderText({ intro, announcements, sections, subject }) {
  const source =
    [intro, announcements[0]?.title, sections[0]?.title, subject]
      .map((value) => String(value ?? "").replace(/\s+/g, " ").trim())
      .find(Boolean) ?? "";
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

/**
 * @param {object} input
 * @param {string} input.subject
 * @param {string} [input.intro]
 * @param {Array<{title: string, body: string}>} [input.announcements]
 * @param {Array<{title: string, body: string}>} [input.sections]
 * @param {string} input.unsubscribeUrl
 * @param {string} [input.logoUrl] absolute; defaults to the production website
 * @returns {{ html: string, text: string }}
 */
function renderWeeklyUpdateEmail({
  subject,
  intro = "",
  announcements = [],
  sections = [],
  unsubscribeUrl,
  logoUrl = logoUrlFor(),
}) {
  const body = [];

  body.push(
    `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${NAVY};">${escapeHtml(
      subject
    )}</h1>`
  );

  if (intro.trim()) body.push(toParagraphs(intro));

  if (announcements.length) {
    body.push(
      `<h2 style="margin:28px 0 8px;font-size:17px;line-height:1.3;color:${NAVY};">This week's announcements</h2>`
    );
    announcements.forEach((announcement) => {
      body.push(
        `<h3 style="margin:16px 0 4px;font-size:15px;line-height:1.3;color:${PRIMARY};">${escapeHtml(
          announcement.title
        )}</h3>`,
        toParagraphs(announcement.body)
      );
    });
  }

  sections.forEach((section) => {
    body.push(renderBlock(section.title, section.body));
  });

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
    `<body style="margin:0;padding:0;width:100%;background-color:${PAGE_BG};">`,

    `<div style="display:none;font-size:1px;color:${PAGE_BG};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(
      preheaderText({ intro, announcements, sections, subject })
    )}${preheaderPadding()}</div>`,

    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PAGE_BG};">`,
    '<tr><td align="center" style="padding:24px 12px;">',

    // Outlook only: a hard 600px cage, since it ignores the max-width below.
    `<!--[if mso]><table role="presentation" width="${CONTENT_WIDTH}" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${CONTENT_WIDTH}px;">`,

    // Header band. The colour, not the image, is what carries the brand when
    // the client blocks remote images — and the font styling on the `img` is
    // what the alt text inherits when it does not load.
    `<tr><td align="center" style="background-color:${NAVY};padding:28px 24px;">`,
    `<img src="${escapeHtml(
      logoUrl
    )}" width="${LOGO_WIDTH}" alt="Tenacity Tutoring" style="display:block;width:100%;max-width:${LOGO_WIDTH}px;height:auto;border:0;outline:none;text-decoration:none;font-family:${BODY_FONT};font-size:18px;font-weight:bold;color:#ffffff;" />`,
    "</td></tr>",

    // Body card.
    `<tr><td style="background-color:#ffffff;padding:32px 28px;font-family:${BODY_FONT};font-size:15px;color:${INK};">`,
    body.join(""),
    `<p style="margin:28px 0 0;line-height:1.5;">Open the Tenacity app for timetables, invoices and messages.</p>`,
    "</td></tr>",

    // Footer.
    `<tr><td style="background-color:#ffffff;padding:0 28px 28px;font-family:${BODY_FONT};font-size:12px;line-height:1.5;color:${MUTED};">`,
    `<hr style="border:none;border-top:1px solid ${RULE};margin:0 0 16px;" />`,
    `<p style="margin:0 0 8px;">Tenacity Tutoring &middot; <a href="mailto:${CONTACT_EMAIL}" style="color:${PRIMARY};">${CONTACT_EMAIL}</a> &middot; ${CONTACT_PHONE}</p>`,
    `<p style="margin:0;">You are receiving this because you have a parent account with Tenacity Tutoring. <a href="${escapeHtml(
      unsubscribeUrl
    )}" style="color:${MUTED};">Unsubscribe from weekly updates</a>.</p>`,
    "</td></tr>",

    "</table>",
    "<!--[if mso]></td></tr></table><![endif]-->",
    "</td></tr>",
    "</table>",
    "</body>",
    "</html>",
  ].join("");

  const textParts = ["TENACITY TUTORING", subject, ""];
  if (intro.trim()) textParts.push(intro.trim(), "");
  if (announcements.length) {
    textParts.push("This week's announcements", "");
    announcements.forEach((announcement) => {
      textParts.push(announcement.title, announcement.body, "");
    });
  }
  sections.forEach((section) => {
    textParts.push(section.title, section.body, "");
  });
  textParts.push(
    "Open the Tenacity app for timetables, invoices and messages.",
    "",
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
