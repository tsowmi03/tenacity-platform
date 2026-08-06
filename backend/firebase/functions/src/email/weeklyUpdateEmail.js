"use strict";

/**
 * Renders the weekly parent update.
 *
 * The other parent emails in this codebase split between SendGrid dynamic
 * templates (welcome, enrolment accepted) and HTML built in code (invoice paid,
 * password reset). This one builds its HTML here so the layout is versioned
 * with the sender and can be unit tested — the content varies per send, which
 * is exactly what a fixed template is bad at.
 */

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
    `<h2 style="margin:24px 0 8px;font-size:16px;line-height:1.3;">${escapeHtml(
      title
    )}</h2>`,
    toParagraphs(body),
  ].join("");
}

/**
 * @param {object} input
 * @param {string} input.subject
 * @param {string} [input.intro]
 * @param {Array<{title: string, body: string}>} [input.announcements]
 * @param {Array<{title: string, body: string}>} [input.sections]
 * @param {string} input.unsubscribeUrl
 * @returns {{ html: string, text: string }}
 */
function renderWeeklyUpdateEmail({
  subject,
  intro = "",
  announcements = [],
  sections = [],
  unsubscribeUrl,
}) {
  const parts = [
    '<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2933;max-width:600px;margin:0 auto;padding:24px;">',
    '<p style="margin:0 0 4px;font-size:12px;letter-spacing:1px;color:#6b7280;">TENACITY TUTORING</p>',
    `<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">${escapeHtml(
      subject
    )}</h1>`,
  ];

  if (intro.trim()) parts.push(toParagraphs(intro));

  if (announcements.length) {
    parts.push(
      '<h2 style="margin:24px 0 8px;font-size:16px;">This week\'s announcements</h2>'
    );
    announcements.forEach((announcement) => {
      parts.push(
        `<h3 style="margin:16px 0 4px;font-size:14px;">${escapeHtml(
          announcement.title
        )}</h3>`,
        toParagraphs(announcement.body)
      );
    });
  }

  sections.forEach((section) => {
    parts.push(renderBlock(section.title, section.body));
  });

  parts.push(
    '<p style="margin:24px 0 0;line-height:1.5;">Open the Tenacity app for timetables, invoices and messages.</p>',
    '<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px;" />',
    `<p style="margin:0;font-size:12px;color:#6b7280;">You are receiving this because you have a parent account with Tenacity Tutoring. <a href="${escapeHtml(
      unsubscribeUrl
    )}" style="color:#6b7280;">Unsubscribe from weekly updates</a>.</p>`,
    "</div>"
  );

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
    `Unsubscribe from weekly updates: ${unsubscribeUrl}`
  );

  return { html: parts.join(""), text: textParts.join("\n") };
}

module.exports = { escapeHtml, renderWeeklyUpdateEmail };
