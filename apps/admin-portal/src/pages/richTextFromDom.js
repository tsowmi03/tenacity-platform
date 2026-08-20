/**
 * The inverse of the email renderer's rich-text layer: rendered DOM back to the
 * Markdown subset that is stored.
 *
 * This exists because the composer edits the weekly update by making the
 * server-rendered preview editable in place. The renderer turns the stored
 * source into HTML; when someone types into that HTML, something has to turn it
 * back. Keeping the two in step is pinned by a shared fixture file — see
 * `richTextFromDom.test.js`.
 *
 * The subset is deliberately small (`**bold**`, `*italic*`, `[label](url)`,
 * `- bullets`, blank-line paragraphs, single-newline soft breaks) and has no
 * nesting, so this is not a general HTML-to-Markdown converter. It only has to
 * read back what the renderer emits, plus whatever a browser inserts while
 * someone is typing into a contentEditable region.
 */

/** Elements that start a new paragraph rather than sitting inside one. */
const BLOCK_TAGS = new Set([
  "P",
  "DIV",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "BLOCKQUOTE",
  "SECTION",
  "ARTICLE",
]);

const LIST_TAGS = new Set(["UL", "OL"]);
const BOLD_TAGS = new Set(["STRONG", "B"]);
const ITALIC_TAGS = new Set(["EM", "I"]);

/** Protocols the renderer will link to; anything else loses its link. */
const ALLOWED_PROTOCOLS = ["http://", "https://", "mailto:"];

function allowedHref(value) {
  const url = String(value ?? "").trim();
  const lower = url.toLowerCase();
  return ALLOWED_PROTOCOLS.some((protocol) => lower.startsWith(protocol)) ? url : "";
}

/**
 * Text as it renders, not as it is written: HTML collapses runs of whitespace,
 * so keeping them would let the source accumulate spaces that never show up.
 * Non-breaking spaces are the ones a browser inserts while you type at the end
 * of a line, and they would otherwise survive into the email as `\u00a0`.
 */
function normaliseText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[\t\n\r ]+/g, " ");
}

function plainText(node) {
  return normaliseText(node.textContent).trim();
}

/**
 * One mark, applied to plain text.
 *
 * The stored model has no nesting — the parser takes the first mark it finds and
 * reads its contents literally — so a bold link has no representation. Rather
 * than emit `[**x**](url)` and have it read back as a link labelled `**x**`, the
 * outermost mark wins and the rest of the run becomes text. Browsers produce
 * these nests on their own when you bold a selection that already contains a
 * link, so this case is reachable by typing, not just by pasting.
 */
function marked(node) {
  const text = plainText(node);
  if (!text) return "";

  if (node.tagName === "A") {
    const href = allowedHref(node.getAttribute("href"));
    return href ? `[${text}](${href})` : text;
  }
  if (BOLD_TAGS.has(node.tagName)) return `**${text}**`;
  return `*${text}*`;
}

function isMark(node) {
  return (
    node.tagName === "A" || BOLD_TAGS.has(node.tagName) || ITALIC_TAGS.has(node.tagName)
  );
}

/** The inside of one paragraph, with `<br>` as a soft break. */
function inlineSource(node) {
  let out = "";
  node.childNodes.forEach((child) => {
    if (child.nodeType === 3) {
      out += normaliseText(child.nodeValue);
      return;
    }
    if (child.nodeType !== 1) return;
    if (child.tagName === "BR") {
      out += "\n";
      return;
    }
    out += isMark(child) ? marked(child) : inlineSource(child);
  });
  return out;
}

/** A paragraph's source, with the soft breaks kept and the edges trimmed. */
function paragraphSource(node) {
  return inlineSource(node)
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/^\n+|\n+$/g, "");
}

function listSource(node) {
  return Array.from(node.children)
    .filter((child) => child.tagName === "LI")
    .map((item) => paragraphSource(item).replace(/\n/g, " ").trim())
    .filter(Boolean)
    .map((item) => `- ${item}`)
    .join("\n");
}

/**
 * A rich-text region's DOM as stored Markdown source.
 *
 * @param {Element|null} root the element carrying `data-tw-kind="rich"`
 * @returns {string}
 */
export function richTextFromDom(root) {
  if (!root) return "";

  const paragraphs = [];
  let pending = "";

  const flushPending = () => {
    const source = pending
      .split("\n")
      .map((line) => line.trim())
      .join("\n")
      .trim();
    if (source) paragraphs.push(source);
    pending = "";
  };

  root.childNodes.forEach((child) => {
    if (child.nodeType === 3) {
      pending += normaliseText(child.nodeValue);
      return;
    }
    if (child.nodeType !== 1) return;

    if (LIST_TAGS.has(child.tagName)) {
      flushPending();
      const list = listSource(child);
      if (list) paragraphs.push(list);
      return;
    }
    if (BLOCK_TAGS.has(child.tagName)) {
      flushPending();
      const source = paragraphSource(child);
      if (source) paragraphs.push(source);
      return;
    }
    if (child.tagName === "BR") {
      pending += "\n";
      return;
    }
    pending += isMark(child) ? marked(child) : inlineSource(child);
  });
  flushPending();

  return paragraphs.join("\n\n");
}

/**
 * Every word in a region, with the line breaks as spaces.
 *
 * `textContent` would run the words either side of a `<br>` together, which is
 * how a pasted two-line heading becomes one misspelt word.
 */
function flatText(node) {
  let out = "";
  node.childNodes.forEach((child) => {
    if (child.nodeType === 3) {
      out += normaliseText(child.nodeValue);
      return;
    }
    if (child.nodeType !== 1) return;
    if (child.tagName === "BR") {
      out += " ";
      return;
    }
    out += flatText(child);
    if (BLOCK_TAGS.has(child.tagName) || LIST_TAGS.has(child.tagName)) out += " ";
    if (child.tagName === "LI") out += " ";
  });
  return out;
}

/**
 * A plain field's DOM as its stored string.
 *
 * These fields are single-line, so a pasted or typed newline collapses to a
 * space rather than being kept and later escaped into the middle of a heading.
 */
export function plainTextFromDom(root) {
  return root ? flatText(root).replace(/\s+/g, " ").trim() : "";
}
