import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  chatAboutResource: vi.fn(),
}));

vi.mock("../../AuthProvider", () => ({
  useAuth: () => ({ user: { uid: "tutor-1" } }),
}));

vi.mock("../../backend/resourcesApi", () => ({
  chatAboutResource: api.chatAboutResource,
  downloadResourceJob: vi.fn(),
  findSimilarResources: vi.fn().mockResolvedValue({ sameType: [], otherType: [] }),
  resourceJobUploadedFiles: (job) => job.uploadedFiles || [],
  uploadResourceReference: vi.fn(),
}));

import { ToastProvider } from "../ToastProvider";
import ResourceJobBuilder from "./ResourceJobBuilder";

const FILE = { path: "resources/uploads/tutor-1/notice.pdf", name: "Assessment notice.pdf" };

const PREFILL = {
  id: "job-1",
  resourceType: "worksheet",
  subject: "maths",
  year: 8,
  studentId: "student-1",
  studentName: "Mia Thompson",
  uploadedFiles: [FILE],
};

function reply(overrides = {}) {
  return {
    reply: "What should it focus on?",
    proposedPrompt: "",
    suggestions: ["Propose an outline"],
    fileSummaries: [],
    pastResources: [],
    ...overrides,
  };
}

function renderBuilder(props = {}) {
  return render(
    <ToastProvider>
      <ResourceJobBuilder
        onSubmitJobs={vi.fn()}
        students={[{ id: "student-1", displayName: "Mia Thompson", grade: 8 }]}
        studentsLoading={false}
        {...props}
      />
    </ToastProvider>
  );
}

function promptField() {
  return screen.getByRole("textbox", { name: /Custom prompt/ });
}

describe("Discuss with AI", () => {
  beforeEach(() => {
    api.chatAboutResource.mockReset();
  });

  it("stays disabled until a student, year and resource type are chosen", () => {
    renderBuilder();
    expect(screen.getByRole("button", { name: "Discuss with AI" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Search by name or year..." }));
    fireEvent.click(screen.getByText("Mia Thompson"));
    expect(screen.getByRole("button", { name: "Discuss with AI" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Worksheet" }));
    expect(screen.getByRole("button", { name: "Discuss with AI" })).toBeEnabled();
  });

  it("opens with the AI's questions, then writes its draft into the custom prompt", async () => {
    api.chatAboutResource
      .mockResolvedValueOnce(reply({
        fileSummaries: [{ path: FILE.path, summary: "Week 6 algebra test." }],
        pastResources: [{ resourceType: "worksheet", topics: ["linear-equations"], createdAt: "2026-09-12T00:00:00.000Z" }],
      }))
      .mockResolvedValueOnce(reply({
        reply: "Here's an outline.",
        proposedPrompt: "Worksheet on linear inequalities.",
        suggestions: [],
      }));
    renderBuilder({ prefill: PREFILL });

    fireEvent.click(screen.getByRole("button", { name: "Discuss with AI" }));
    expect(screen.getByRole("dialog", { name: "Discuss with AI" })).toBeInTheDocument();
    expect(await screen.findByText("What should it focus on?")).toBeInTheDocument();

    const opening = api.chatAboutResource.mock.calls[0][0];
    expect(opening.messages).toEqual([]);
    expect(opening.draft.resourceType).toBe("worksheet");
    expect(opening.fileSummaries).toEqual({});

    fireEvent.click(screen.getByRole("button", { name: "Propose an outline" }));
    expect(await screen.findByText("Here's an outline.")).toBeInTheDocument();

    const second = api.chatAboutResource.mock.calls[1][0];
    expect(second.messages.map((m) => [m.role, m.content])).toEqual([
      ["assistant", "What should it focus on?"],
      ["user", "Propose an outline"],
    ]);
    expect(second.fileSummaries).toEqual({ [FILE.path]: "Week 6 algebra test." });

    fireEvent.click(screen.getByRole("button", { name: "Use this prompt" }));
    expect(screen.queryByRole("dialog", { name: "Discuss with AI" })).not.toBeInTheDocument();
    expect(promptField()).toHaveValue("Worksheet on linear inequalities.");
    expect(screen.getByRole("button", { name: "Refine with AI" })).toBeEnabled();
  });

  it("shows what the AI can see, including file summaries and past resources", async () => {
    api.chatAboutResource.mockResolvedValueOnce(reply({
      fileSummaries: [{ path: FILE.path, summary: "Week 6 algebra test." }],
      pastResources: [{ resourceType: "topic-booklet", topics: ["expanding-brackets"], createdAt: "2026-08-29T00:00:00.000Z" }],
    }));
    renderBuilder({ prefill: PREFILL });

    fireEvent.click(screen.getByRole("button", { name: "Discuss with AI" }));
    await screen.findByText("What should it focus on?");
    fireEvent.click(screen.getByRole("button", { name: /What the AI can see/ }));

    expect(screen.getByText("Week 6 algebra test.")).toBeInTheDocument();
    expect(screen.getByText("Summarised")).toBeInTheDocument();
    expect(screen.getByText(/Topic Booklet · expanding-brackets/)).toBeInTheDocument();
  });

  it("starts from the current prompt on reopen and reuses file summaries", async () => {
    api.chatAboutResource
      .mockResolvedValueOnce(reply({ fileSummaries: [{ path: FILE.path, summary: "Week 6 algebra test." }] }))
      .mockResolvedValueOnce(reply({ reply: "What would you like to change?" }));
    renderBuilder({ prefill: PREFILL });

    fireEvent.click(screen.getByRole("button", { name: "Discuss with AI" }));
    await screen.findByText("What should it focus on?");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.change(promptField(), { target: { value: "Focus on index laws." } });
    fireEvent.click(screen.getByRole("button", { name: "Refine with AI" }));

    expect(await screen.findByText("What would you like to change?")).toBeInTheDocument();
    expect(screen.getByText("Current prompt")).toBeInTheDocument();
    const reopened = api.chatAboutResource.mock.calls[1][0];
    expect(reopened.messages).toEqual([]);
    expect(reopened.draft.customPrompt).toBe("Focus on index laws.");
    expect(reopened.fileSummaries).toEqual({ [FILE.path]: "Week 6 algebra test." });
  });

  it("keeps the conversation after a failed reply and retries the same turn", async () => {
    api.chatAboutResource
      .mockResolvedValueOnce(reply())
      .mockRejectedValueOnce(Object.assign(new Error("unavailable"), { code: "unavailable" }))
      .mockResolvedValueOnce(reply({ reply: "Inequalities it is." }));
    renderBuilder({ prefill: PREFILL });

    fireEvent.click(screen.getByRole("button", { name: "Discuss with AI" }));
    await screen.findByText("What should it focus on?");

    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), { target: { value: "Inequalities" } });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Message" }), { key: "Enter" });

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't get a reply. Your messages are still here.");
    expect(screen.getByText("Inequalities")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Inequalities it is.")).toBeInTheDocument();
    expect(api.chatAboutResource.mock.calls[2][0].messages).toEqual(api.chatAboutResource.mock.calls[1][0].messages);
  });

  it("shows an unreadable-file message from the server as is", async () => {
    api.chatAboutResource.mockRejectedValueOnce(Object.assign(new Error("x"), {
      code: "failed-precondition",
      serverMessage: "A reference file couldn't be read. Remove it and try again.",
    }));
    renderBuilder({ prefill: PREFILL });

    fireEvent.click(screen.getByRole("button", { name: "Discuss with AI" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A reference file couldn't be read.");
  });

  it("only offers the latest draft", async () => {
    api.chatAboutResource
      .mockResolvedValueOnce(reply({ proposedPrompt: "First draft." }))
      .mockResolvedValueOnce(reply({ reply: "Shorter now.", proposedPrompt: "Second draft." }));
    renderBuilder({ prefill: PREFILL });

    fireEvent.click(screen.getByRole("button", { name: "Discuss with AI" }));
    await screen.findByText("First draft.");
    fireEvent.click(screen.getByRole("button", { name: "Propose an outline" }));
    await screen.findByText("Second draft.");

    expect(screen.getByText("Earlier draft")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Use this prompt" })).toHaveLength(1);
  });

  it("sends the opening turn once under StrictMode", async () => {
    api.chatAboutResource.mockResolvedValue(reply());
    render(
      <React.StrictMode>
        <ToastProvider>
          <ResourceJobBuilder
            onSubmitJobs={vi.fn()}
            prefill={PREFILL}
            students={[{ id: "student-1", displayName: "Mia Thompson", grade: 8 }]}
            studentsLoading={false}
          />
        </ToastProvider>
      </React.StrictMode>
    );

    fireEvent.click(screen.getByRole("button", { name: "Discuss with AI" }));
    expect(await screen.findByText("What should it focus on?")).toBeInTheDocument();
    expect(api.chatAboutResource).toHaveBeenCalledTimes(1);
  });

  it("closes when the resource type changes, so a stale reply can't be applied", async () => {
    let resolveReply;
    api.chatAboutResource.mockReturnValueOnce(new Promise((resolve) => { resolveReply = resolve; }));
    renderBuilder({ prefill: PREFILL });

    fireEvent.click(screen.getByRole("button", { name: "Discuss with AI" }));
    expect(screen.getByRole("dialog", { name: "Discuss with AI" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Topic Booklet" }));

    expect(screen.queryByRole("dialog", { name: "Discuss with AI" })).not.toBeInTheDocument();
    resolveReply(reply({ proposedPrompt: "Worksheet brief." }));
    await waitFor(() => expect(screen.queryByText("Worksheet brief.")).not.toBeInTheDocument());
    expect(promptField()).toHaveValue("");
  });

  it("closes when the draft no longer has a student", async () => {
    api.chatAboutResource.mockResolvedValueOnce(reply());
    renderBuilder({ prefill: PREFILL });

    fireEvent.click(screen.getByRole("button", { name: "Discuss with AI" }));
    await screen.findByText("What should it focus on?");
    fireEvent.click(screen.getByRole("button", { name: "Clear selected student" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Discuss with AI" })).not.toBeInTheDocument()
    );
  });
});
