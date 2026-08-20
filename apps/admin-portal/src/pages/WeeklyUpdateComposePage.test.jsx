import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  createWeeklyUpdate: vi.fn(),
  deleteWeeklyUpdate: vi.fn(),
  getWeeklyUpdate: vi.fn(),
  previewWeeklyUpdate: vi.fn(),
  saveWeeklyUpdate: vi.fn(),
  sendWeeklyUpdate: vi.fn(),
  sendWeeklyUpdateTest: vi.fn(),
  loadAnnouncementReportingOverview: vi.fn(),
}));

vi.mock("../backend/weeklyUpdateApi", () => ({
  createWeeklyUpdate: api.createWeeklyUpdate,
  deleteWeeklyUpdate: api.deleteWeeklyUpdate,
  getWeeklyUpdate: api.getWeeklyUpdate,
  previewWeeklyUpdate: api.previewWeeklyUpdate,
  saveWeeklyUpdate: api.saveWeeklyUpdate,
  sendWeeklyUpdate: api.sendWeeklyUpdate,
  sendWeeklyUpdateTest: api.sendWeeklyUpdateTest,
}));

vi.mock("../backend/announcementReportingCache", () => ({
  loadAnnouncementReportingOverview: api.loadAnnouncementReportingOverview,
}));

import WeeklyUpdateComposePage, { applyInlineEdit } from "./WeeklyUpdateComposePage";
import { ToastProvider } from "../components/ToastProvider";

const PREVIEW_HTML =
  "<!DOCTYPE html><html><body><h1>Week of 10 August</h1></body></html>";

/**
 * The shape the renderer emits when asked to annotate, trimmed to the parts this
 * page reads. The attribute names are pinned on the other side by
 * `backend/firebase/functions/test/unit/weeklyUpdateBlocks.test.js`.
 */
const ANNOTATED_PREVIEW_HTML = [
  "<!DOCTYPE html><html><head></head><body>",
  '<h1 data-tw-block="__chrome" data-tw-field="masthead.title" data-tw-kind="plain">Week of 10 August</h1>',
  '<h3 data-tw-block="b1" data-tw-field="title" data-tw-kind="plain">A note</h3>',
  '<div data-tw-block="b1" data-tw-field="body" data-tw-kind="rich">',
  '<p style="margin:0;line-height:1.65;">Hi parents</p>',
  "</div>",
  '<p data-tw-block="b2" data-tw-borrowed="announcement">Timetable change</p>',
  "</body></html>",
].join("");

const draft = {
  id: "blast-1",
  subject: "Week of 10 August",
  preheader: "",
  masthead: { eyebrow: "Weekly family update" },
  cta: {
    eyebrow: "Stay connected",
    title: "Everything else, all in one place",
    body: "Open the Tenacity app for timetables, invoices and messages.",
    label: "",
    url: "",
  },
  blocks: [
    { id: "b1", type: "text", tone: "note", eyebrow: "", title: "", body: "Hi parents" },
  ],
  announcementIds: [],
  status: "draft",
};

const users = [
  { id: "parent-1", role: "parent", email: "a@example.com" },
  { id: "parent-2", role: "parent", email: "b@example.com" },
];

beforeEach(() => {
  vi.clearAllMocks();
  api.loadAnnouncementReportingOverview.mockResolvedValue([[], users]);
  api.getWeeklyUpdate.mockResolvedValue(draft);
  api.previewWeeklyUpdate.mockResolvedValue({
    blastId: "blast-1",
    subject: draft.subject,
    html: PREVIEW_HTML,
  });
  api.saveWeeklyUpdate.mockResolvedValue(undefined);
});

function renderPage(path = "/weekly-update/blast-1") {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/weekly-update/:blastId" element={<WeeklyUpdateComposePage />} />
          <Route path="/weekly-update" element={<div>Weekly update list</div>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

function previewFrame() {
  return document.querySelector("iframe.email-preview");
}

describe("WeeklyUpdateComposePage preview", () => {
  it("renders a saved draft on open without writing to it", async () => {
    renderPage();

    await waitFor(() => expect(previewFrame()).not.toBeNull());
    expect(previewFrame().getAttribute("srcdoc")).toBe(PREVIEW_HTML);
    expect(api.previewWeeklyUpdate).toHaveBeenCalledWith("blast-1");
    // Opening the composer must not save; only an explicit action does that.
    expect(api.saveWeeklyUpdate).not.toHaveBeenCalled();
    expect(api.createWeeklyUpdate).not.toHaveBeenCalled();
  });

  it("sandboxes the frame so the rendered email cannot script or navigate", async () => {
    renderPage();

    await waitFor(() => expect(previewFrame()).not.toBeNull());
    // `allow-same-origin` is what lets this document reach in and make the copy
    // editable. Every other token stays off — in particular `allow-scripts`,
    // without which nothing inside the frame can act on the relaxed origin.
    const sandbox = previewFrame().getAttribute("sandbox");
    expect(sandbox).toBe("allow-same-origin");
    expect(sandbox).not.toContain("allow-scripts");
    expect(sandbox).not.toContain("allow-forms");
    expect(sandbox).not.toContain("allow-popups");
    expect(sandbox).not.toContain("allow-top-navigation");
  });

  it("saves before re-rendering, so the preview reflects unsaved edits", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(previewFrame()).not.toBeNull());

    api.previewWeeklyUpdate.mockResolvedValue({
      blastId: "blast-1",
      subject: "Changed",
      html: "<!DOCTYPE html><html><body><h1>Changed</h1></body></html>",
    });

    await user.click(screen.getByRole("button", { name: /refresh preview/i }));

    await waitFor(() =>
      expect(previewFrame().getAttribute("srcdoc")).toContain("Changed"),
    );
    expect(api.saveWeeklyUpdate).toHaveBeenCalledWith("blast-1", expect.any(Object));
  });

  it("reports a failed render instead of leaving a stale email on screen", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(previewFrame()).not.toBeNull());

    api.previewWeeklyUpdate.mockRejectedValue(new Error("callable exploded"));
    await user.click(screen.getByRole("button", { name: /refresh preview/i }));

    expect(await screen.findByText("Preview unavailable")).toBeInTheDocument();
    expect(screen.getByText("callable exploded")).toBeInTheDocument();
    expect(previewFrame()).toBeNull();
  });

  it("does not preview a new draft until there is something saved to render", async () => {
    renderPage("/weekly-update/new");

    await screen.findByText(/refresh to render this draft as an email/i);
    expect(api.previewWeeklyUpdate).not.toHaveBeenCalled();
  });

  it("keeps the most recently issued preview even if an older request resolves last", async () => {
    // Previewing a brand-new draft for the first time issues two requests for
    // the same id: the explicit one in handlePreview, and one from the effect
    // that fires because persist()'s navigate() changes the URL. Network
    // timing does not guarantee the explicit one resolves first, so whichever
    // was issued *later* has to win even if its response lands first.
    const user = userEvent.setup();
    api.createWeeklyUpdate.mockResolvedValue({ id: "new-id" });

    const resolvers = [];
    api.previewWeeklyUpdate.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );

    renderPage("/weekly-update/new");
    await screen.findByText(/refresh to render this draft as an email/i);

    await user.click(screen.getByRole("button", { name: /refresh preview/i }));
    await waitFor(() => expect(api.previewWeeklyUpdate).toHaveBeenCalledTimes(2));

    // Resolve the second-issued request first: it must win.
    resolvers[1]({ blastId: "new-id", subject: "Later", html: "<html><body>Later</body></html>" });
    await waitFor(() => expect(previewFrame()).not.toBeNull());
    expect(previewFrame().getAttribute("srcdoc")).toContain("Later");

    // The first-issued request resolving after must not clobber it.
    resolvers[0]({ blastId: "new-id", subject: "Earlier", html: "<html><body>Earlier</body></html>" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(previewFrame().getAttribute("srcdoc")).toContain("Later");
  });

  it("offers no preview for a sent update, whose announcements may have moved on", async () => {
    api.getWeeklyUpdate.mockResolvedValue({
      ...draft,
      status: "sent",
      recipientCount: 12,
      successCount: 12,
    });

    renderPage();

    await screen.findByText(/sent to 12 parents/i);
    expect(
      screen.queryByRole("button", { name: /refresh preview/i }),
    ).not.toBeInTheDocument();
  });
});

/**
 * The preview frame's document, wired for editing.
 *
 * jsdom does not parse `srcdoc` — it gives the frame an empty document and
 * leaves it there — so the markup a browser would have parsed is written in
 * directly and the load event a browser would have fired is dispatched. What is
 * being tested either side of that is real: the page passes the frame to the
 * hook, and the hook wires whatever document it finds.
 */
async function editablePreview(html = ANNOTATED_PREVIEW_HTML) {
  await waitFor(() => expect(previewFrame()).not.toBeNull());
  const frame = previewFrame();
  const doc = frame.contentDocument;
  doc.open();
  doc.write(html);
  doc.close();
  fireEvent.load(frame);
  await waitFor(() =>
    expect(doc.querySelector('[data-tw-field][contenteditable="true"]')).toBeTruthy(),
  );
  return doc;
}

/** What the browser leaves behind after someone types into a region. */
function typeInto(doc, selector, html) {
  const node = doc.querySelector(selector);
  node.innerHTML = html;
  act(() => {
    node.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));
  });
  return node;
}

describe("WeeklyUpdateComposePage inline preview editing", () => {
  beforeEach(() => {
    api.previewWeeklyUpdate.mockResolvedValue({
      blastId: "blast-1",
      subject: draft.subject,
      html: ANNOTATED_PREVIEW_HTML,
    });
  });

  it("makes the annotated copy editable and leaves the rest of the email alone", async () => {
    renderPage();
    const doc = await editablePreview();

    expect(
      doc.querySelector('[data-tw-field="body"]').getAttribute("contenteditable"),
    ).toBe("true");
    expect(
      doc.querySelector('[data-tw-field="masthead.title"]').getAttribute("contenteditable"),
    ).toBe("true");
  });

  it("will not let you type into copy the announcement owns, and says why", async () => {
    renderPage();
    const doc = await editablePreview();

    const borrowed = doc.querySelector("[data-tw-borrowed]");
    expect(borrowed.getAttribute("contenteditable")).toBeNull();
    expect(borrowed.getAttribute("title")).toMatch(/comes from the announcement/i);
  });

  it("carries an edited body through to the saved draft as Markdown", async () => {
    const user = userEvent.setup();
    renderPage();
    const doc = await editablePreview();

    typeInto(
      doc,
      '[data-tw-field="body"]',
      '<p>Hi parents, see the <a href="https://tenacity.test/t">timetable</a></p>',
    );

    await user.click(screen.getByRole("button", { name: /^Save draft$/i }));

    await waitFor(() => expect(api.saveWeeklyUpdate).toHaveBeenCalled());
    const [, saved] = api.saveWeeklyUpdate.mock.calls.at(-1);
    expect(saved.blocks[0].body).toBe(
      "Hi parents, see the [timetable](https://tenacity.test/t)",
    );
  });

  it("carries an edited masthead headline through to the saved draft", async () => {
    const user = userEvent.setup();
    renderPage();
    const doc = await editablePreview();

    typeInto(doc, '[data-tw-field="masthead.title"]', "Week of 17 August");

    await user.click(screen.getByRole("button", { name: /^Save draft$/i }));

    await waitFor(() => expect(api.saveWeeklyUpdate).toHaveBeenCalled());
    const [, saved] = api.saveWeeklyUpdate.mock.calls.at(-1);
    expect(saved.masthead.title).toBe("Week of 17 August");
  });

  it("shows the edit in the field below, so the two are one draft", async () => {
    renderPage();
    const doc = await editablePreview();

    typeInto(doc, '[data-tw-field="body"]', "<p>Rewritten in the preview</p>");

    expect(await screen.findByDisplayValue("Rewritten in the preview")).toBeInTheDocument();
  });

  it("does not re-render the preview while typing, which would drop the caret", async () => {
    renderPage();
    const doc = await editablePreview();
    const callsBefore = api.previewWeeklyUpdate.mock.calls.length;

    typeInto(doc, '[data-tw-field="body"]', "<p>Still typing</p>");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(api.previewWeeklyUpdate.mock.calls.length).toBe(callsBefore);
    expect(previewFrame().getAttribute("srcdoc")).toBe(ANNOTATED_PREVIEW_HTML);
  });

  it("says which blocks the email leaves out, rather than looking broken", async () => {
    api.getWeeklyUpdate.mockResolvedValue({
      ...draft,
      blocks: [
        ...draft.blocks,
        { id: "b2", type: "text", tone: "plain", title: "", body: "" },
        { id: "b3", type: "divider" },
        { id: "b4", type: "callout", tone: "info", title: "", body: "" },
      ],
    });

    renderPage();
    await editablePreview();

    // Block 3 is a divider: structure has no copy to be empty of.
    expect(
      await screen.findByText(/blocks 2, 4 are empty, so the email leaves them out/i),
    ).toBeInTheDocument();
  });

  it("ignores an edit naming a block that is no longer in the draft", async () => {
    const user = userEvent.setup();
    renderPage();
    const doc = await editablePreview();

    // The preview is one render behind once a block is removed, so a stale
    // region can still emit an edit. It must not resurrect the block.
    await user.click(screen.getByRole("button", { name: /remove block 1/i }));
    typeInto(doc, '[data-tw-field="body"]', "<p>Edit after removal</p>");

    await user.click(screen.getByRole("button", { name: /^Save draft$/i }));

    await waitFor(() => expect(api.saveWeeklyUpdate).toHaveBeenCalled());
    const [, saved] = api.saveWeeklyUpdate.mock.calls.at(-1);
    expect(saved.blocks).toEqual([]);
  });
});

describe("applyInlineEdit", () => {
  const base = {
    masthead: { eyebrow: "Weekly family update" },
    cta: { title: "Stay connected" },
    blocks: [
      { id: "b1", type: "text", body: "Old body" },
      {
        id: "b2",
        type: "linkList",
        links: [
          { label: "First", url: "https://t.test/1" },
          { label: "Second", url: "https://t.test/2" },
        ],
      },
    ],
  };

  it("writes a block field without disturbing its siblings", () => {
    const next = applyInlineEdit(base, {
      blockId: "b1",
      field: "body",
      value: "New body",
    });
    expect(next.blocks[0]).toEqual({ id: "b1", type: "text", body: "New body" });
    expect(next.blocks[1]).toBe(base.blocks[1]);
  });

  it("writes the numbered link a label belongs to, leaving its URL alone", () => {
    const next = applyInlineEdit(base, {
      blockId: "b2",
      field: "links.1.label",
      value: "Renamed",
    });
    expect(next.blocks[1].links).toEqual([
      { label: "First", url: "https://t.test/1" },
      { label: "Renamed", url: "https://t.test/2" },
    ]);
  });

  it("writes a chrome field into its own group", () => {
    const next = applyInlineEdit(base, {
      blockId: "__chrome",
      field: "cta.label",
      value: "Enrol now",
    });
    expect(next.cta).toEqual({ title: "Stay connected", label: "Enrol now" });
    expect(next.masthead).toBe(base.masthead);
  });

  it("adds a masthead title, which until now had fallen back to the subject", () => {
    const next = applyInlineEdit(base, {
      blockId: "__chrome",
      field: "masthead.title",
      value: "Week of 17 August",
    });
    expect(next.masthead).toEqual({
      eyebrow: "Weekly family update",
      title: "Week of 17 August",
    });
  });

  it("ignores anything it does not recognise rather than inventing a key", () => {
    // A field name that does not match the renderer's would otherwise write a
    // key nothing reads, and the edit would appear to work until a refresh.
    for (const edit of [
      { blockId: "b1", field: "" },
      { blockId: "", field: "body" },
      { blockId: "nope", field: "body", value: "x" },
      { blockId: "__chrome", field: "footer.title", value: "x" },
      { blockId: "__chrome", field: "masthead", value: "x" },
    ]) {
      expect(applyInlineEdit(base, edit)).toBe(base);
    }
    expect(applyInlineEdit(null, { blockId: "b1", field: "body" })).toBe(null);
  });
});

function blockHeadings() {
  return Array.from(document.querySelectorAll(".block-card-type")).map((node) =>
    node.textContent.trim(),
  );
}

describe("WeeklyUpdateComposePage block editor", () => {
  it("lists the draft's blocks in the order the email renders them", async () => {
    api.getWeeklyUpdate.mockResolvedValue({
      ...draft,
      blocks: [
        ...draft.blocks,
        { id: "b2", type: "heading", eyebrow: "At a glance", title: "This week" },
      ],
    });

    renderPage();

    await waitFor(() => expect(blockHeadings()).toEqual(["1. Text", "2. Heading"]));
  });

  it("adds a block of the chosen type to the end", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(blockHeadings()).toEqual(["1. Text"]));

    await user.click(screen.getByRole("button", { name: /^Callout$/ }));

    await waitFor(() => expect(blockHeadings()).toEqual(["1. Text", "2. Callout"]));
  });

  it("reorders blocks with the arrows and disables them at the ends", async () => {
    const user = userEvent.setup();
    api.getWeeklyUpdate.mockResolvedValue({
      ...draft,
      blocks: [...draft.blocks, { id: "b2", type: "divider" }],
    });

    renderPage();
    await waitFor(() => expect(blockHeadings()).toEqual(["1. Text", "2. Divider"]));

    expect(screen.getByRole("button", { name: /move block 1 up/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /move block 1 down/i }));

    await waitFor(() => expect(blockHeadings()).toEqual(["1. Divider", "2. Text"]));
  });

  it("removes and duplicates a block", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(blockHeadings()).toEqual(["1. Text"]));

    await user.click(screen.getByRole("button", { name: /^Duplicate$/ }));
    await waitFor(() => expect(blockHeadings()).toEqual(["1. Text", "2. Text"]));

    await user.click(screen.getByRole("button", { name: /remove block 2/i }));
    await waitFor(() => expect(blockHeadings()).toEqual(["1. Text"]));
  });

  it("blocks the send and names the block when a button has no usable link", async () => {
    api.getWeeklyUpdate.mockResolvedValue({
      ...draft,
      blocks: [
        ...draft.blocks,
        { id: "b2", type: "button", label: "Book", url: "tenacity.test" },
      ],
    });

    renderPage();

    expect(
      await screen.findByText("Block 2 (Button): add a link starting with https://."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send now/i })).toBeDisabled();
  });

  it("leaves a sent update's blocks visible but not editable", async () => {
    api.getWeeklyUpdate.mockResolvedValue({ ...draft, status: "sent" });

    renderPage();

    await waitFor(() => expect(blockHeadings()).toEqual(["1. Text"]));
    expect(screen.queryByRole("button", { name: /^Callout$/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /remove block 1/i }),
    ).not.toBeInTheDocument();
  });
});
