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

/** Brand palette, mirroring `apps/website/src/styles/claude-design.css`. */
const DEEP_NAVY = "#112D4F";
const NAVY = "#1B3F71";
const PRIMARY = "#1C71AF";
const SKY = "#5AA5E3";
const BLUE_100 = "#D6EBF7";
const BLUE_50 = "#EEF5FB";
const INK = "#243A57";
const PAGE_BG = "#FBF8F3";
const PAPER = "#FFFFFF";
const RULE = "#DDE6EF";

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
  const blocks = String(value ?? "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks
    .map((block, index) => {
      const margin = index === blocks.length - 1 ? "0" : "0 0 12px";
      return `<p style="margin:${margin};line-height:1.65;">${escapeHtml(
        block
      ).replace(/\n/g, "<br />")}</p>`;
    })
    .join("");
}

function renderIntro(intro) {
  return [
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;">',
    "<tr>",
    `<td style="background-color:${BLUE_50};border:1px solid ${BLUE_100};border-left:4px solid ${PRIMARY};border-radius:12px;padding:20px 20px 19px;color:${INK};">`,
    `<p style="margin:0 0 8px;font-size:11px;line-height:1.3;font-weight:bold;letter-spacing:1.4px;text-transform:uppercase;color:${PRIMARY};">A note from Tenacity</p>`,
    toParagraphs(intro),
    "</td>",
    "</tr>",
    '<tr><td height="28" style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>',
    "</table>",
  ].join("");
}

function renderAnnouncement(announcement) {
  const title = String(announcement?.title ?? "").trim();
  return [
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;">',
    "<tr>",
    `<td style="background-color:${BLUE_50};border:1px solid ${BLUE_100};border-radius:12px;padding:19px 20px 18px;color:${INK};">`,
    `<p style="margin:0 0 7px;font-size:10px;line-height:1.3;font-weight:bold;letter-spacing:1.3px;text-transform:uppercase;color:${PRIMARY};">Announcement</p>`,
    title
      ? `<h3 style="margin:0 0 8px;font-size:16px;line-height:1.35;color:${NAVY};">${escapeHtml(
          title
        )}</h3>`
      : "",
    toParagraphs(announcement?.body),
    "</td>",
    "</tr>",
    '<tr><td height="14" style="height:14px;font-size:0;line-height:0;">&nbsp;</td></tr>',
    "</table>",
  ].join("");
}

function renderSection(section) {
  const title = String(section?.title ?? "").trim();
  return [
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;">',
    "<tr>",
    `<td style="background-color:${PAPER};border:1px solid ${RULE};border-top:4px solid ${SKY};border-radius:12px;padding:18px 20px 19px;color:${INK};">`,
    title
      ? `<h3 style="margin:0 0 9px;font-size:18px;line-height:1.35;color:${NAVY};">${escapeHtml(
          title
        )}</h3>`
      : "",
    toParagraphs(section?.body),
    "</td>",
    "</tr>",
    '<tr><td height="14" style="height:14px;font-size:0;line-height:0;">&nbsp;</td></tr>',
    "</table>",
  ].join("");
}

function renderSectionHeading(eyebrow, title) {
  return [
    `<p style="margin:0 0 6px;font-size:11px;line-height:1.3;font-weight:bold;letter-spacing:1.4px;text-transform:uppercase;color:${PRIMARY};">${escapeHtml(
      eyebrow
    )}</p>`,
    `<h2 style="margin:0 0 15px;font-size:21px;line-height:1.35;color:${DEEP_NAVY};">${escapeHtml(
      title
    )}</h2>`,
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

  if (intro.trim()) body.push(renderIntro(intro));

  if (announcements.length) {
    body.push(
      renderSectionHeading("Important information", "This week's announcements")
    );
    announcements.forEach((announcement) => {
      body.push(renderAnnouncement(announcement));
    });
    body.push(
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="14" style="height:14px;font-size:0;line-height:0;">&nbsp;</td></tr></table>'
    );
  }

  if (sections.length) {
    body.push(renderSectionHeading("At a glance", "In this week's update"));
    sections.forEach((section) => body.push(renderSection(section)));
  }

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
      preheaderText({ intro, announcements, sections, subject })
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
    `<p style="margin:0 0 8px;font-size:11px;line-height:1.3;font-weight:bold;letter-spacing:1.7px;text-transform:uppercase;color:${BLUE_100};">Weekly family update</p>`,
    `<h1 style="margin:0;max-width:500px;font-size:28px;line-height:1.25;font-weight:bold;color:#FFFFFF;">${escapeHtml(
      subject
    )}</h1>`,
    "</td></tr>",

    // Editorial content. Individual panels are tables so their structure is
    // retained by Outlook's Word-based renderer.
    `<tr><td style="background-color:${PAPER};padding:30px 26px 18px;font-family:${BODY_FONT};font-size:15px;line-height:1.65;color:${INK};">`,
    body.join(""),
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;">',
    '<tr><td height="14" style="height:14px;font-size:0;line-height:0;">&nbsp;</td></tr>',
    "<tr>",
    `<td style="background-color:${NAVY};border-radius:12px;padding:21px 22px;color:#FFFFFF;">`,
    `<p style="margin:0 0 6px;font-size:10px;line-height:1.3;font-weight:bold;letter-spacing:1.4px;text-transform:uppercase;color:${BLUE_100};">Stay connected</p>`,
    '<h2 style="margin:0 0 7px;font-size:18px;line-height:1.35;color:#FFFFFF;">Everything else, all in one place</h2>',
    `<p style="margin:0;font-size:14px;line-height:1.55;color:${BLUE_100};">Open the Tenacity app for timetables, invoices and messages.</p>`,
    "</td>",
    "</tr>",
    "</table>",
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
