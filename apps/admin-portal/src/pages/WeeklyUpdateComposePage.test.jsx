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
 * Long enough to cover the composer's autosave pause plus the render that
 * follows it. The composer has no save button, so almost everything here has to
 * wait for a write it did not ask for.
 */
const SAVE_WAIT = { timeout: 4000 };

/** Past the autosave pause, for asserting that nothing was written. */
function afterAutosaveWindow() {
  return act(() => new Promise((resolve) => setTimeout(resolve, 1600)));
}

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

/** Opens block `position`'s fields, which start folded away. */
async function openBlock(user, position = 1) {
  const toggles = document.querySelectorAll(".block-card-toggle");
  await user.click(toggles[position - 1]);
}

describe("WeeklyUpdateComposePage preview", () => {
  it("renders a saved draft on open without writing to it", async () => {
    renderPage();

    await waitFor(() => expect(previewFrame()).not.toBeNull());
    expect(previewFrame().getAttribute("srcdoc")).toBe(PREVIEW_HTML);
    expect(api.previewWeeklyUpdate).toHaveBeenCalledWith("blast-1");

    // Autosave must be driven by edits, not by the page existing: opening a
    // draft to look at it should leave it exactly as it was.
    await afterAutosaveWindow();
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

    await user.click(screen.getByRole("button", { name: /^Refresh$/i }));

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
    await user.click(screen.getByRole("button", { name: /^Refresh$/i }));

    expect(await screen.findByText("Preview unavailable")).toBeInTheDocument();
    expect(screen.getByText("callable exploded")).toBeInTheDocument();
    expect(previewFrame()).toBeNull();
  });

  it("does not preview a new draft until there is something saved to render", async () => {
    renderPage("/weekly-update/new");

    await screen.findByText(/start writing and the email appears here/i);
    expect(api.previewWeeklyUpdate).not.toHaveBeenCalled();
  });

  it("keeps the most recently issued preview even if an older request resolves last", async () => {
    // Previewing a brand-new draft for the first time issues two requests for
    // the same id: the explicit one behind Refresh, and one from the effect that
    // fires because saving navigates to the new draft's URL. Network timing does
    // not guarantee the explicit one resolves first, so whichever was issued
    // *later* has to win even if its response lands first.
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
    await screen.findByText(/start writing and the email appears here/i);

    await user.click(screen.getByRole("button", { name: /^Refresh$/i }));
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
    expect(screen.queryByRole("button", { name: /^Refresh$/i })).not.toBeInTheDocument();
    expect(
      screen.getByText(/a sent update is not re-rendered here/i),
    ).toBeInTheDocument();
  });
});

/**
 * The composer has no save button: it writes a pause after the last edit,
 * because the preview beside it is rendered by the backend from the stored
 * draft and can only be live if the draft is. That makes the save path the one
 * an admin never triggers deliberately and therefore the one most worth pinning.
 */
describe("WeeklyUpdateComposePage autosave", () => {
  it("saves a pause after an edit and re-renders the preview", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(previewFrame()).not.toBeNull());
    const previewCalls = api.previewWeeklyUpdate.mock.calls.length;

    await user.click(screen.getByRole("button", { name: /subject, header and footer/i }));
    await user.type(screen.getByPlaceholderText(/week of 4 august/i), "!");

    await waitFor(
      () => expect(api.saveWeeklyUpdate).toHaveBeenCalledWith("blast-1", expect.any(Object)),
      SAVE_WAIT,
    );
    await waitFor(
      () => expect(api.previewWeeklyUpdate.mock.calls.length).toBeGreaterThan(previewCalls),
      SAVE_WAIT,
    );
    expect(await screen.findByText(/^Saved /)).toBeInTheDocument();
  });

  it("says so when a save fails, rather than leaving 'saved' on screen", async () => {
    const user = userEvent.setup();
    api.saveWeeklyUpdate.mockRejectedValue(new Error("network down"));
    renderPage();
    await waitFor(() => expect(previewFrame()).not.toBeNull());

    await user.click(screen.getByRole("button", { name: /subject, header and footer/i }));
    await user.type(screen.getByPlaceholderText(/week of 4 august/i), "!");

    expect(await screen.findByText("network down", {}, SAVE_WAIT)).toBeInTheDocument();
    expect(screen.queryByText(/^Saved /)).not.toBeInTheDocument();
  });

  it("creates the draft on the first edit, not on opening an empty composer", async () => {
    const user = userEvent.setup();
    api.createWeeklyUpdate.mockResolvedValue({ id: "new-id" });
    renderPage("/weekly-update/new");
    await screen.findByText(/start writing and the email appears here/i);

    await afterAutosaveWindow();
    expect(api.createWeeklyUpdate).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /subject, header and footer/i }));
    await user.type(screen.getByPlaceholderText(/week of 4 august/i), "Hi");

    await waitFor(() => expect(api.createWeeklyUpdate).toHaveBeenCalledTimes(1), SAVE_WAIT);
  });

  it("keeps typing that happened while the first save was in flight", async () => {
    // Saving a new draft navigates to its URL. Re-reading the draft at that
    // point would replace what is being typed with the copy just written, and
    // silently lose every keystroke made in between.
    const user = userEvent.setup();
    api.createWeeklyUpdate.mockResolvedValue({ id: "new-id" });
    api.getWeeklyUpdate.mockResolvedValue({ ...draft, id: "new-id", subject: "Hi" });

    renderPage("/weekly-update/new");
    await screen.findByText(/start writing and the email appears here/i);

    await user.click(screen.getByRole("button", { name: /subject, header and footer/i }));
    const subject = screen.getByPlaceholderText(/week of 4 august/i);
    await user.type(subject, "Hi");
    await waitFor(() => expect(api.createWeeklyUpdate).toHaveBeenCalled(), SAVE_WAIT);

    await user.type(subject, " there");

    await waitFor(() => expect(subject).toHaveValue("Hi there"));
    await waitFor(
      () => expect(api.saveWeeklyUpdate).toHaveBeenCalledWith("new-id", expect.any(Object)),
      SAVE_WAIT,
    );
    expect(api.saveWeeklyUpdate.mock.calls.at(-1)[1].subject).toBe("Hi there");
  });

  it("never writes a sent update, which the rules would reject anyway", async () => {
    api.getWeeklyUpdate.mockResolvedValue({ ...draft, status: "sent" });
    renderPage();

    await screen.findByText(/this update has been sent/i);
    await afterAutosaveWindow();
    expect(api.saveWeeklyUpdate).not.toHaveBeenCalled();
  });
});

describe("WeeklyUpdateComposePage toasts", () => {
  it("confirms a test send with a real toast", async () => {
    const user = userEvent.setup();
    api.sendWeeklyUpdateTest.mockResolvedValue({ successCount: 1, failureCount: 0 });
    renderPage();
    await waitFor(() => expect(previewFrame()).not.toBeNull());

    await user.type(
      screen.getByPlaceholderText("you@tenacitytutoring.com"),
      "you@tenacitytutoring.com",
    );
    await user.click(screen.getByRole("button", { name: /^Send test$/i }));

    expect(await screen.findByText("Test sent")).toBeInTheDocument();
  });

  it("confirms a delete with a real toast", async () => {
    const user = userEvent.setup();
    api.deleteWeeklyUpdate.mockResolvedValue(undefined);
    renderPage();
    await waitFor(() => expect(previewFrame()).not.toBeNull());

    await user.click(screen.getByRole("button", { name: /^Delete this draft$/i }));

    expect(await screen.findByText("Draft deleted")).toBeInTheDocument();
  });

  it("reports a send that reached nobody as a failure, not a success", async () => {
    const user = userEvent.setup();
    api.sendWeeklyUpdate.mockResolvedValue({
      recipientCount: 2,
      successCount: 0,
      failureCount: 2,
    });
    renderPage();
    await waitFor(() => expect(previewFrame()).not.toBeNull());

    await user.click(screen.getByRole("button", { name: /send to parents/i }));
    await user.click(screen.getByRole("button", { name: /^Send now$/i }));

    expect(
      await screen.findByText("Weekly update could not be delivered"),
    ).toBeInTheDocument();
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
    renderPage();
    const doc = await editablePreview();

    typeInto(
      doc,
      '[data-tw-field="body"]',
      '<p>Hi parents, see the <a href="https://tenacity.test/t">timetable</a></p>',
    );

    await waitFor(() => expect(api.saveWeeklyUpdate).toHaveBeenCalled(), SAVE_WAIT);
    const [, saved] = api.saveWeeklyUpdate.mock.calls.at(-1);
    expect(saved.blocks[0].body).toBe(
      "Hi parents, see the [timetable](https://tenacity.test/t)",
    );
  });

  it("carries an edited masthead headline through to the saved draft", async () => {
    renderPage();
    const doc = await editablePreview();

    typeInto(doc, '[data-tw-field="masthead.title"]', "Week of 17 August");

    await waitFor(() => expect(api.saveWeeklyUpdate).toHaveBeenCalled(), SAVE_WAIT);
    const [, saved] = api.saveWeeklyUpdate.mock.calls.at(-1);
    expect(saved.masthead.title).toBe("Week of 17 August");
  });

  it("shows the edit in the field beside it, so the two are one draft", async () => {
    const user = userEvent.setup();
    renderPage();
    const doc = await editablePreview();
    await openBlock(user);

    typeInto(doc, '[data-tw-field="body"]', "<p>Rewritten in the preview</p>");

    expect(await screen.findByDisplayValue("Rewritten in the preview")).toBeInTheDocument();
  });

  it("saves an edit typed in the preview without re-rendering it", async () => {
    // A re-render would replace the document the caret is sitting in. The
    // browser is already showing the new text, so there is nothing to gain and
    // a half-typed sentence to lose.
    renderPage();
    const doc = await editablePreview();
    const previewCalls = api.previewWeeklyUpdate.mock.calls.length;

    typeInto(doc, '[data-tw-field="body"]', "<p>Still typing</p>");

    await waitFor(() => expect(api.saveWeeklyUpdate).toHaveBeenCalled(), SAVE_WAIT);
    expect(api.previewWeeklyUpdate.mock.calls.length).toBe(previewCalls);
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

    await waitFor(() => expect(api.saveWeeklyUpdate).toHaveBeenCalled(), SAVE_WAIT);
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

function blockSummaries() {
  return Array.from(document.querySelectorAll(".block-card-summary")).map((node) =>
    node.textContent.trim(),
  );
}

describe("WeeklyUpdateComposePage block editor", () => {
  it("names a text block by its style, so the list reads as the email's shape", async () => {
    api.getWeeklyUpdate.mockResolvedValue({
      ...draft,
      blocks: [
        ...draft.blocks,
        { id: "b2", type: "heading", eyebrow: "At a glance", title: "This week" },
      ],
    });

    renderPage();

    await waitFor(() => expect(blockHeadings()).toEqual(["Note", "Heading"]));
  });

  it("summarises each block so a folded list is still worth reading", async () => {
    api.getWeeklyUpdate.mockResolvedValue({
      ...draft,
      blocks: [
        ...draft.blocks,
        { id: "b2", type: "button", label: "Book a catch-up", url: "https://t.test" },
      ],
    });

    renderPage();

    await waitFor(() =>
      expect(blockSummaries()).toEqual(["Hi parents", "Book a catch-up"]),
    );
  });

  it("keeps blocks folded until asked, and shows the fields once opened", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(blockHeadings()).toEqual(["Note"]));

    expect(screen.queryByDisplayValue("Hi parents")).not.toBeInTheDocument();
    await openBlock(user);
    expect(screen.getByDisplayValue("Hi parents")).toBeInTheDocument();
  });

  it("adds the block the picker was asked for, already open", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(blockHeadings()).toEqual(["Note"]));

    await user.click(screen.getByRole("button", { name: /^Add a block$/i }));
    await user.click(screen.getByRole("button", { name: /^Heading/ }));

    await waitFor(() => expect(blockHeadings()).toEqual(["Note", "Heading"]));
    // Added because you are about to fill it in.
    expect(screen.getByPlaceholderText("In this week's update")).toBeInTheDocument();
  });

  it("starts a callout on a style that shows it is one", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(blockHeadings()).toEqual(["Note"]));

    await user.click(screen.getByRole("button", { name: /^Add a block$/i }));
    await user.click(screen.getByRole("button", { name: /^Callout/ }));

    await waitFor(() => expect(blockHeadings()).toEqual(["Note", "Information"]));
  });

  it("reorders blocks with the arrows and disables them at the ends", async () => {
    const user = userEvent.setup();
    api.getWeeklyUpdate.mockResolvedValue({
      ...draft,
      blocks: [...draft.blocks, { id: "b2", type: "divider" }],
    });

    renderPage();
    await waitFor(() => expect(blockHeadings()).toEqual(["Note", "Divider"]));

    expect(screen.getByRole("button", { name: /move block 1 up/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /move block 1 down/i }));

    await waitFor(() => expect(blockHeadings()).toEqual(["Divider", "Note"]));
  });

  it("removes and duplicates a block", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(blockHeadings()).toEqual(["Note"]));

    await user.click(screen.getByRole("button", { name: /duplicate block 1/i }));
    await waitFor(() => expect(blockHeadings()).toEqual(["Note", "Note"]));

    await user.click(screen.getByRole("button", { name: /remove block 2/i }));
    await waitFor(() => expect(blockHeadings()).toEqual(["Note"]));
  });

  it("reads a stored callout as the text style that replaced it", async () => {
    api.getWeeklyUpdate.mockResolvedValue({
      ...draft,
      blocks: [{ id: "c1", type: "callout", tone: "warn", title: "Fees due", body: "x" }],
    });

    renderPage();

    await waitFor(() => expect(blockHeadings()).toEqual(["Warning"]));
    expect(blockSummaries()).toEqual(["Fees due"]);
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
    expect(screen.getByRole("button", { name: /send to parents/i })).toBeDisabled();
  });

  it("shows the mistake on the block itself, not only at the top of the page", async () => {
    const user = userEvent.setup();
    api.getWeeklyUpdate.mockResolvedValue({
      ...draft,
      blocks: [{ id: "b2", type: "button", label: "Book", url: "tenacity.test" }],
    });

    renderPage();
    await waitFor(() => expect(blockHeadings()).toEqual(["Button"]));
    expect(document.querySelector(".block-card.has-problem")).not.toBeNull();

    await openBlock(user);
    expect(
      screen.getByText(/links must start with https:\/\/, http:\/\/ or mailto:/i),
    ).toBeInTheDocument();
  });

  it("blocks the send when the closing panel's button has no usable link", async () => {
    // A button with no link renders as a dead `href="#"` — the one thing in the
    // email a parent would actually try to click.
    api.getWeeklyUpdate.mockResolvedValue({
      ...draft,
      cta: { ...draft.cta, label: "Open the app", url: "" },
    });

    renderPage();

    expect(
      await screen.findByText(
        "The closing panel's button needs a link starting with https://.",
      ),
    ).toBeInTheDocument();
  });

  it("leaves a sent update's blocks visible but not editable", async () => {
    api.getWeeklyUpdate.mockResolvedValue({ ...draft, status: "sent" });

    renderPage();

    await waitFor(() => expect(blockHeadings()).toEqual(["Note"]));
    expect(
      screen.queryByRole("button", { name: /^Add a block$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /remove block 1/i }),
    ).not.toBeInTheDocument();
  });
});
