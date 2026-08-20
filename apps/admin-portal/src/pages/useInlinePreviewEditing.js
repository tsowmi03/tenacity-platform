import { useEffect, useRef } from "react";

import { plainTextFromDom, richTextFromDom } from "./richTextFromDom";

/**
 * Makes the server-rendered preview editable in place.
 *
 * The alternative was rendering the email a second time in the browser so it
 * could be edited as React state. That would mean two renderers for one email —
 * the Functions runtime is CommonJS and this app is an ESM Vite build with no
 * workspace linking them — and the first time they disagreed, the preview would
 * stop being evidence of what parents receive.
 *
 * So the preview stays the server's render and this reaches into it. The
 * renderer tags each editable region with `data-tw-block`, `data-tw-field` and
 * `data-tw-kind` (see `previewParentEmailBlast.js`); everything here keys off
 * those. Reading an edit back out is `richTextFromDom`.
 *
 * Typing deliberately does not re-render: the browser is already showing the
 * new text, so a round-trip would only throw away the caret. The preview is
 * refreshed for structural changes — adding, reordering or removing a block —
 * which is what the block list beside it is for.
 */

/** Fields that hold one line, where Enter would otherwise insert a break. */
const SINGLE_LINE_KINDS = new Set(["plain"]);

const EDITING_STYLES = `
  [data-tw-field] {
    outline: 2px dashed transparent;
    outline-offset: 3px;
    border-radius: 3px;
    transition: outline-color 120ms ease, background-color 120ms ease;
  }
  [data-tw-field]:hover {
    outline-color: rgba(28, 113, 175, 0.55);
    cursor: text;
  }
  [data-tw-field]:focus {
    outline: 2px solid #1C71AF;
    outline-offset: 3px;
    background-color: rgba(28, 113, 175, 0.06);
  }
  /*
    A block with nothing in it yet renders an empty region. Without a height it
    would be a few pixels tall and effectively impossible to click into. Only
    rich regions can be empty and still rendered — the renderer leaves an empty
    title out altogether.
  */
  [data-tw-kind="rich"] { min-height: 1.65em; }
  [data-tw-field]:empty::before {
    content: "Write something...";
    opacity: 0.45;
    font-style: italic;
  }
  [data-tw-borrowed] {
    outline: 2px dashed transparent;
    outline-offset: 3px;
    border-radius: 3px;
  }
  [data-tw-borrowed]:hover {
    outline-color: rgba(148, 163, 184, 0.8);
    cursor: not-allowed;
  }
`;

const BORROWED_HINT =
  "This copy comes from the announcement itself. Edit the announcement to change it.";

/**
 * The value of one region, read the way its field is stored.
 *
 * A `plain` field is a single-line string; a `rich` one is the Markdown subset,
 * so the two cannot share a reader.
 */
function readField(node) {
  return node.dataset.twKind === "rich"
    ? richTextFromDom(node)
    : plainTextFromDom(node);
}

/**
 * Replaces the selection with unstyled text.
 *
 * Pasting from a document otherwise brings its markup, and most of it has no
 * representation in the stored model — it would be silently dropped on the next
 * read, so the paste would appear to work and then undo itself.
 */
function insertPlainText(doc, text) {
  const selection = doc.getSelection();
  if (!selection || !selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = doc.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * @param {object} options
 * @param {{current: HTMLIFrameElement|null}} options.frameRef
 * @param {string} options.html the preview markup currently in the frame
 * @param {boolean} options.enabled off for a sent update, which cannot change
 * @param {(edit: {blockId: string, field: string, value: string}) => void}
 *   options.onEdit called on every keystroke, with the field's stored value
 */
export default function useInlinePreviewEditing({
  frameRef,
  html,
  enabled,
  onEdit,
}) {
  // Held in a ref so a new callback identity on each render does not tear down
  // and re-attach the listeners mid-keystroke.
  const onEditRef = useRef(onEdit);
  onEditRef.current = onEdit;

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !html || !enabled) return undefined;

    let detach = () => {};

    const wire = () => {
      // A frame can load more than once for one `srcdoc`, and the document is
      // already wired when it does. Without this, every field would report each
      // keystroke twice.
      detach();

      const doc = frame.contentDocument;
      // Same-origin access is what the `allow-same-origin` sandbox token buys.
      // Scripts stay blocked, so nothing in the frame can use it; these
      // listeners run in this document and reach in.
      if (!doc || !doc.body) return;

      const style = doc.createElement("style");
      style.textContent = EDITING_STYLES;
      doc.head?.appendChild(style);

      const fields = Array.from(doc.querySelectorAll("[data-tw-field]"));
      fields.forEach((node) => {
        node.setAttribute("contenteditable", "true");
        node.setAttribute("spellcheck", "true");
      });
      doc.querySelectorAll("[data-tw-borrowed]").forEach((node) => {
        node.setAttribute("title", BORROWED_HINT);
      });

      const fieldOf = (target) =>
        target?.nodeType === 1
          ? target.closest("[data-tw-field]")
          : target?.parentElement?.closest("[data-tw-field]");

      const handleInput = (event) => {
        const node = fieldOf(event.target);
        if (!node) return;
        onEditRef.current?.({
          blockId: node.dataset.twBlock,
          field: node.dataset.twField,
          value: readField(node),
        });
      };

      const handleKeyDown = (event) => {
        const node = fieldOf(event.target);
        if (!node) return;
        if (event.key === "Enter" && SINGLE_LINE_KINDS.has(node.dataset.twKind)) {
          event.preventDefault();
        }
      };

      const handlePaste = (event) => {
        const node = fieldOf(event.target);
        if (!node) return;
        event.preventDefault();
        const text = event.clipboardData?.getData("text/plain") ?? "";
        if (!text) return;
        insertPlainText(doc, node.dataset.twKind === "rich" ? text : text.replace(/\s+/g, " "));
        handleInput(event);
      };

      // A button's label is an anchor. Following it would replace the preview
      // with the linked page; the sandbox already refuses, but not silently.
      const handleClick = (event) => {
        if (event.target?.closest?.("a")) event.preventDefault();
      };

      // Dropped content arrives as markup, the same problem as a paste, and
      // there is no equivalent of `clipboardData` to launder it.
      const handleDrop = (event) => event.preventDefault();

      doc.addEventListener("input", handleInput);
      doc.addEventListener("keydown", handleKeyDown);
      doc.addEventListener("paste", handlePaste);
      doc.addEventListener("click", handleClick);
      doc.addEventListener("drop", handleDrop);

      detach = () => {
        doc.removeEventListener("input", handleInput);
        doc.removeEventListener("keydown", handleKeyDown);
        doc.removeEventListener("paste", handlePaste);
        doc.removeEventListener("click", handleClick);
        doc.removeEventListener("drop", handleDrop);
        style.remove();
      };
    };

    // `srcDoc` may already have parsed by the time this effect runs, in which
    // case no further load event is coming.
    if (frame.contentDocument?.readyState === "complete") wire();
    frame.addEventListener("load", wire);

    return () => {
      frame.removeEventListener("load", wire);
      detach();
    };
  }, [frameRef, html, enabled]);
}
