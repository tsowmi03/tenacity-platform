"use strict";

/**
 * The rich-text layer for author-entered email bodies.
 *
 * Bodies are stored as a small Markdown subset rather than as HTML or as a
 * parsed node tree:
 *
 *   - HTML would have to be sanitised on the way in *and* rewritten on the way
 *     out, because email needs inline styles on every element and no client
 *     agrees on what it will keep.
 *   - A parsed tree cannot be stored as-is: a bullet list is an array of items
 *     each holding an array of spans, and Firestore rejects nested arrays.
 *
 * So the source string is the stored form, and it is parsed at render time.
 * Plain text is already valid input, which is what makes every pre-existing
 * draft and every announcement body render unchanged.
 *
 * Supported: `**bold**`, `*italic*`, `_italic_`, `[label](url)`, `- bullets`,
 * blank-line paragraphs and single-newline soft breaks. Deliberately no
 * nesting, no headings and no images — the block model owns structure, this
 * only owns the inside of a paragraph.
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

/** Protocols that are safe to put behind a link in an email. */
const ALLOWED_PROTOCOLS = ["http://", "https://", "mailto:"];

/**
 * The URL if it is one we will link to, otherwise "".
 *
 * A `javascript:` or `data:` URL is inert in virtually every mail client, but
 * the same strings are also what the preview iframe and any future webmail
 * archive would render, so they are rejected at the only point that matters.
 * Callers render the label as plain text when this returns "" — dropping the
 * text as well would hide the mistake from whoever is composing.
 */
function safeUrl(value) {
  const url = String(value ?? "").trim();
  if (!url) return "";
  const lower = url.toLowerCase();
  return ALLOWED_PROTOCOLS.some((protocol) => lower.startsWith(protocol)) ? url : "";
}

const INLINE_PATTERN = /\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_|\[(.+?)\]\(([^)\s]+)\)/g;

/**
 * One line of text as styled spans. Marks do not nest, so the first match wins
 * and its contents are taken literally.
 *
 * @param {string} line
 * @returns {Array<{text: string, bold?: boolean, italic?: boolean, href?: string}>}
 */
function parseInline(line) {
  const spans = [];
  const source = String(line ?? "");
  let cursor = 0;
  let match;

  INLINE_PATTERN.lastIndex = 0;
  while ((match = INLINE_PATTERN.exec(source)) !== null) {
    if (match.index > cursor) spans.push({ text: source.slice(cursor, match.index) });
    if (match[1] !== undefined) spans.push({ text: match[1], bold: true });
    else if (match[2] !== undefined) spans.push({ text: match[2], italic: true });
    else if (match[3] !== undefined) spans.push({ text: match[3], italic: true });
    else spans.push({ text: match[4], href: match[5] });
    cursor = match.index + match[0].length;
  }
  if (cursor < source.length) spans.push({ text: source.slice(cursor) });

  return spans.filter((span) => span.text !== "");
}

const BULLET_LINE = /^\s*[-*]\s+(.*)$/;

/**
 * Blocks of a body, in order.
 *
 * @param {string} source
 * @returns {Array<{type: "paragraph", lines: Array<Array<object>>}
 *   | {type: "bullets", items: Array<Array<object>>}>}
 */
function parseRichText(source) {
  const nodes = [];
  const paragraphs = String(source ?? "")
    .split(/\n{2,}/)
    .map((block) => block.replace(/\s+$/, ""))
    .filter((block) => block.trim());

  paragraphs.forEach((paragraph) => {
    const lines = paragraph.split("\n");
    let run = [];

    const flushRun = () => {
      if (!run.length) return;
      nodes.push({ type: "paragraph", lines: run.map(parseInline) });
      run = [];
    };

    let bullets = null;
    lines.forEach((line) => {
      const bullet = line.match(BULLET_LINE);
      if (bullet) {
        flushRun();
        if (!bullets) {
          bullets = { type: "bullets", items: [] };
          nodes.push(bullets);
        }
        bullets.items.push(parseInline(bullet[1]));
        return;
      }
      if (!line.trim()) return;
      bullets = null;
      run.push(line);
    });
    flushRun();
  });

  return nodes;
}

/**
 * Whether a body would render nothing.
 *
 * Not simply "did it parse to no nodes": a body of `- ` parses to a bullet list
 * holding one empty item, which is still an empty body. The composer applies the
 * same rule so it cannot block a send the renderer would have accepted, or the
 * other way round.
 */
function isEmptyRichText(source) {
  return !parseRichText(source).some((node) =>
    (node.type === "bullets" ? node.items : node.lines).some((spans) =>
      spans.some((span) => span.text.trim())
    )
  );
}

function renderSpans(spans, { linkColor }) {
  return spans
    .map((span) => {
      let html = escapeHtml(span.text);
      if (span.bold) html = `<strong>${html}</strong>`;
      if (span.italic) html = `<em>${html}</em>`;
      const href = safeUrl(span.href);
      if (href) {
        html = `<a href="${escapeHtml(
          href
        )}" style="color:${linkColor};text-decoration:underline;">${html}</a>`;
      }
      return html;
    })
    .join("");
}

/**
 * A body as email-safe HTML.
 *
 * The paragraph markup is byte-for-byte what this file replaced, so a draft
 * written before rich text existed renders identically: last paragraph flush,
 * earlier ones with a 12px gap, inline styles only.
 *
 * @param {string} source
 * @param {{linkColor?: string}} [options]
 */
function richTextToHtml(source, { linkColor = "#1C71AF" } = {}) {
  const nodes = parseRichText(source);

  return nodes
    .map((node, index) => {
      const last = index === nodes.length - 1;
      const margin = last ? "0" : "0 0 12px";

      if (node.type === "bullets") {
        const items = node.items
          .map(
            (item) =>
              `<li style="margin:0 0 6px;line-height:1.65;">${renderSpans(item, {
                linkColor,
              })}</li>`
          )
          .join("");
        return `<ul style="margin:${margin};padding:0 0 0 22px;">${items}</ul>`;
      }

      const body = node.lines
        .map((line) => renderSpans(line, { linkColor }))
        .join("<br />");
      return `<p style="margin:${margin};line-height:1.65;">${body}</p>`;
    })
    .join("");
}

/**
 * A body as the plain-text alternative.
 *
 * Links keep their destination in brackets after the label; a text-only reader
 * that cannot see the anchor still gets the URL.
 */
function richTextToPlain(source) {
  const flatten = (spans) =>
    spans
      .map((span) => {
        const href = safeUrl(span.href);
        return href ? `${span.text} (${href})` : span.text;
      })
      .join("");

  return parseRichText(source)
    .map((node) =>
      node.type === "bullets"
        ? node.items.map((item) => `- ${flatten(item)}`).join("\n")
        : node.lines.map(flatten).join("\n")
    )
    .join("\n\n");
}

module.exports = {
  escapeHtml,
  isEmptyRichText,
  richTextToHtml,
  richTextToPlain,
  safeUrl,
};
