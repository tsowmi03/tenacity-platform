import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  chatAboutResource: vi.fn(),
}));
const analytics = vi.hoisted(() => ({ track: vi.fn() }));

vi.mock("../../AuthProvider", () => ({
  useAuth: () => ({ user: { uid: "tutor-1" } }),
}));

vi.mock("../../analytics", async (importOriginal) => ({
  ...(await importOriginal()),
  track: analytics.track,
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

const BOOKLET = {
  subject: "maths",
  resourceType: "topic-booklet",
  answerMode: "worked",
  showMarks: false,
  sections: ["Worked examples", "Practice", "Quiz"],
  brief: "Focus on elimination and substitution.",
};

function reply(overrides = {}) {
  return {
    reply: "What should it focus on?",
    proposal: null,
    proposedPrompt: "",
    suggestions: ["Propose an outline"],
    activity: [],
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

function pane() {
  return within(screen.getByRole("region", { name: "Resource assistant" }));
}

function promptField() {
  return screen.getByRole("textbox", { name: /Custom prompt/ });
}

function sendMessage(text) {
  fireEvent.change(pane().getByRole("textbox", { name: "Message" }), { target: { value: text } });
  fireEvent.keyDown(pane().getByRole("textbox", { name: "Message" }), { key: "Enter" });
}

describe("Resource assistant", () => {
  beforeEach(() => {
    api.chatAboutResource.mockReset();
    analytics.track.mockReset();
  });

  it("waits for a student, then starts without a model call until the tutor asks", () => {
    renderBuilder();
    expect(pane().getByText("Choose a student to start")).toBeInTheDocument();
    expect(pane().getByRole("textbox", { name: "Message" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Search by name or year..." }));
    fireEvent.click(screen.getByText("Mia Thompson"));

    expect(pane().getByRole("textbox", { name: "Message" })).toBeEnabled();
    expect(pane().getByRole("button", { name: "What should I make for this student?" })).toBeInTheDocument();
    expect(api.chatAboutResource).not.toHaveBeenCalled();
  });

  it("works before a resource type is chosen", async () => {
    api.chatAboutResource.mockResolvedValueOnce(reply());
    renderBuilder();
    fireEvent.click(screen.getByRole("button", { name: "Search by name or year..." }));
    fireEvent.click(screen.getByText("Mia Thompson"));

    fireEvent.click(pane().getByRole("button", { name: "What should I make for this student?" }));
    expect(await pane().findByText("What should it focus on?")).toBeInTheDocument();
    const call = api.chatAboutResource.mock.calls[0][0];
    expect(call.draft.resourceType).toBe("");
    expect(call.messages.map((m) => [m.role, m.content])).toEqual([["user", "What should I make for this student?"]]);
  });

  it("shows a proposal as changes to the form, applies it, and undoes it", async () => {
    api.chatAboutResource.mockResolvedValueOnce(reply({
      reply: "A topic booklet fits better.",
      proposal: BOOKLET,
      proposedPrompt: BOOKLET.brief,
      activity: ["Checked maths resource types", "Checked the maths bank for Year 8"],
    }));
    renderBuilder({ prefill: PREFILL });
    sendMessage("Simultaneous equations, test in two weeks");

    expect(await pane().findByText("A topic booklet fits better.")).toBeInTheDocument();
    expect(pane().getByRole("list", { name: "What the assistant checked" })).toHaveTextContent("Checked the maths bank for Year 8");
    expect(pane().getByText("3 changes to the form")).toBeInTheDocument();
    expect(pane().getByText("Worked examples · Practice · Quiz")).toBeInTheDocument();
    expect(pane().getByText("Worksheet").tagName).toBe("S");

    fireEvent.click(pane().getByRole("button", { name: "Apply to form" }));

    expect(screen.getByRole("button", { name: "Topic Booklet" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Answers with working out" })).toHaveClass("active");
    expect(promptField()).toHaveValue(BOOKLET.brief);
    expect(screen.getByText(/Applied the assistant's proposal: 3 fields changed/)).toBeInTheDocument();
    expect(screen.getAllByText("from assistant")).toHaveLength(3);
    expect(pane().getByRole("button", { name: "Applied" })).toBeDisabled();
    expect(analytics.track).toHaveBeenCalledWith("resource_assistant_proposal_applied", expect.objectContaining({
      resource_type: "topic-booklet",
      type_changed: true,
    }));

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByRole("button", { name: "Worksheet" })).toHaveAttribute("aria-pressed", "true");
    expect(promptField()).toHaveValue("");
    expect(screen.queryByText("from assistant")).not.toBeInTheDocument();
    expect(pane().getByRole("button", { name: "Apply to form" })).toBeEnabled();
  });

  it("hands a field back to the tutor once they edit it", async () => {
    api.chatAboutResource.mockResolvedValueOnce(reply({ reply: "Here.", proposal: BOOKLET }));
    renderBuilder({ prefill: PREFILL });
    sendMessage("Plan it");
    await pane().findByText("Here.");
    fireEvent.click(pane().getByRole("button", { name: "Apply to form" }));

    fireEvent.change(promptField(), { target: { value: "My own brief." } });
    expect(screen.getAllByText("from assistant")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });

  it("keeps the conversation when the form changes, and sends the new form next turn", async () => {
    api.chatAboutResource
      .mockResolvedValueOnce(reply())
      .mockResolvedValueOnce(reply({ reply: "Booklet it is." }));
    renderBuilder({ prefill: PREFILL });
    sendMessage("Ideas?");
    await pane().findByText("What should it focus on?");

    fireEvent.click(screen.getByRole("button", { name: "Topic Booklet" }));
    expect(pane().getByText("What should it focus on?")).toBeInTheDocument();

    fireEvent.click(pane().getByRole("button", { name: "Propose an outline" }));
    await pane().findByText("Booklet it is.");
    const second = api.chatAboutResource.mock.calls[1][0];
    expect(second.draft.resourceType).toBe("topic-booklet");
    expect(second.messages.map((m) => [m.role, m.content])).toEqual([
      ["user", "Ideas?"],
      ["assistant", "What should it focus on?"],
      ["user", "Propose an outline"],
    ]);
  });

  it("clears the custom prompt when a whole-job proposal has an empty brief", async () => {
    api.chatAboutResource
      .mockResolvedValueOnce(reply({ reply: "Here.", proposal: BOOKLET }))
      .mockResolvedValueOnce(reply({ reply: "Dropped the instructions.", proposal: { ...BOOKLET, brief: "" } }));
    renderBuilder({ prefill: PREFILL });
    sendMessage("Plan it");
    await pane().findByText("Here.");
    fireEvent.click(pane().getByRole("button", { name: "Apply to form" }));
    expect(promptField()).toHaveValue(BOOKLET.brief);

    sendMessage("Remove the custom instructions");
    await pane().findByText("Dropped the instructions.");
    expect(pane().getByText("(none: clears the custom prompt)")).toBeInTheDocument();
    expect(pane().getByText("1 change to the form")).toBeInTheDocument();
    fireEvent.click(pane().getByRole("button", { name: "Apply to form" }));
    expect(promptField()).toHaveValue("");
  });

  it("only lets the latest proposal be applied", async () => {
    api.chatAboutResource
      .mockResolvedValueOnce(reply({ proposal: { ...BOOKLET, brief: "First." } }))
      .mockResolvedValueOnce(reply({ reply: "Shorter now.", proposal: { ...BOOKLET, brief: "Second." } }));
    renderBuilder({ prefill: PREFILL });
    sendMessage("Plan it");
    await pane().findByText("First.");
    fireEvent.click(pane().getByRole("button", { name: "Propose an outline" }));
    await pane().findByText("Second.");

    expect(pane().getByText("Earlier proposal")).toBeInTheDocument();
    expect(pane().getAllByRole("button", { name: "Apply to form" })).toHaveLength(1);
  });

  it("still applies a brief from a server that only returns a draft prompt", async () => {
    api.chatAboutResource.mockResolvedValueOnce(reply({ proposal: undefined, proposedPrompt: "Worksheet on inequalities." }));
    renderBuilder({ prefill: PREFILL });
    sendMessage("Inequalities");
    await pane().findByText("Worksheet on inequalities.");

    fireEvent.click(pane().getByRole("button", { name: "Apply to form" }));
    expect(promptField()).toHaveValue("Worksheet on inequalities.");
    expect(screen.getByRole("button", { name: "Worksheet" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows what the AI can see, including file summaries and past resources", async () => {
    api.chatAboutResource.mockResolvedValueOnce(reply({
      fileSummaries: [{ path: FILE.path, summary: "Week 6 algebra test." }],
      pastResources: [{ resourceType: "topic-booklet", topics: ["expanding-brackets"], createdAt: "2026-08-29T00:00:00.000Z" }],
    }));
    renderBuilder({ prefill: PREFILL });
    sendMessage("Hi");
    await pane().findByText("What should it focus on?");
    fireEvent.click(pane().getByRole("button", { name: /What the AI can see/ }));

    expect(pane().getByText("Week 6 algebra test.")).toBeInTheDocument();
    expect(pane().getByText("Summarised")).toBeInTheDocument();
    expect(pane().getByText(/Topic Booklet · expanding-brackets/)).toBeInTheDocument();
    expect(pane().getByText(/question bank's coverage/)).toBeInTheDocument();
  });

  it("reuses file summaries on later turns", async () => {
    api.chatAboutResource
      .mockResolvedValueOnce(reply({ fileSummaries: [{ path: FILE.path, summary: "Week 6 algebra test." }] }))
      .mockResolvedValueOnce(reply({ reply: "Noted." }));
    renderBuilder({ prefill: PREFILL });
    sendMessage("Hi");
    await pane().findByText("What should it focus on?");
    sendMessage("Harder");
    await pane().findByText("Noted.");
    expect(api.chatAboutResource.mock.calls[0][0].fileSummaries).toEqual({});
    expect(api.chatAboutResource.mock.calls[1][0].fileSummaries).toEqual({ [FILE.path]: "Week 6 algebra test." });
  });

  it("keeps the conversation after a failed reply and retries the same turn", async () => {
    api.chatAboutResource
      .mockRejectedValueOnce(Object.assign(new Error("unavailable"), { code: "unavailable" }))
      .mockResolvedValueOnce(reply({ reply: "Inequalities it is." }));
    renderBuilder({ prefill: PREFILL });
    sendMessage("Inequalities");

    expect(await pane().findByRole("alert")).toHaveTextContent("Couldn't get a reply. Your messages are still here.");
    expect(pane().getByText("Inequalities")).toBeInTheDocument();

    fireEvent.click(pane().getByRole("button", { name: "Try again" }));
    expect(await pane().findByText("Inequalities it is.")).toBeInTheDocument();
    expect(api.chatAboutResource.mock.calls[1][0].messages).toEqual(api.chatAboutResource.mock.calls[0][0].messages);
  });

  it("shows an unreadable-file message from the server as is", async () => {
    api.chatAboutResource.mockRejectedValueOnce(Object.assign(new Error("x"), {
      code: "failed-precondition",
      serverMessage: "A reference file couldn't be read. Remove it and try again.",
    }));
    renderBuilder({ prefill: PREFILL });
    sendMessage("Hi");
    expect(await pane().findByRole("alert")).toHaveTextContent("A reference file couldn't be read.");
  });

  it("starts a new conversation for New chat and when the student is cleared", async () => {
    api.chatAboutResource.mockResolvedValue(reply());
    renderBuilder({ prefill: PREFILL });
    sendMessage("Hi");
    await pane().findByText("What should it focus on?");

    fireEvent.click(pane().getByRole("button", { name: "New chat" }));
    expect(pane().queryByText("What should it focus on?")).not.toBeInTheDocument();

    sendMessage("Again");
    await pane().findByText("What should it focus on?");
    fireEvent.click(screen.getByRole("button", { name: "Clear selected student" }));
    await waitFor(() => expect(pane().queryByText("What should it focus on?")).not.toBeInTheDocument());
    expect(pane().getByText("Choose a student to start")).toBeInTheDocument();
  });

  it("ignores a reply that lands after the conversation was reset", async () => {
    let resolveReply;
    api.chatAboutResource.mockReturnValueOnce(new Promise((resolve) => { resolveReply = resolve; }));
    renderBuilder({ prefill: PREFILL });
    sendMessage("Hi");
    fireEvent.click(screen.getByRole("button", { name: "Clear selected student" }));
    resolveReply(reply({ reply: "Late.", proposal: BOOKLET }));
    await waitFor(() => expect(screen.queryByText("Late.")).not.toBeInTheDocument());
    expect(promptField()).toHaveValue("");
  });

  it("renders into the page's side column when given one", () => {
    const host = document.createElement("div");
    host.setAttribute("data-testid", "host");
    document.body.appendChild(host);
    renderBuilder({ assistantHost: host });
    expect(within(host).getByRole("region", { name: "Resource assistant" })).toBeInTheDocument();
    host.remove();
  });
});
