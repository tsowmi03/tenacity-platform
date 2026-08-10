import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
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

import WeeklyUpdateComposePage from "./WeeklyUpdateComposePage";
import { ToastProvider } from "../components/ToastProvider";

const PREVIEW_HTML =
  "<!DOCTYPE html><html><body><h1>Week of 10 August</h1></body></html>";

const draft = {
  id: "blast-1",
  subject: "Week of 10 August",
  intro: "Hi parents",
  announcementIds: [],
  sections: [],
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
    expect(previewFrame().getAttribute("sandbox")).toBe("");
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
