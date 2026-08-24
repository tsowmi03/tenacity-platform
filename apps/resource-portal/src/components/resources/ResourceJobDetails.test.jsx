import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  user: { uid: "tutor-1" },
  isAdmin: false,
}));

const api = vi.hoisted(() => ({
  cancelResourceJob: vi.fn(),
  deleteResourceJob: vi.fn(),
  downloadResourceJob: vi.fn(),
  downloadResourceUpload: vi.fn(),
  listStudentResourceJobs: vi.fn(),
  retryResourceJob: vi.fn(),
}));

vi.mock("../../AuthProvider", () => ({
  useAuth: () => authState,
}));

vi.mock("../../backend/resourcesApi", () => ({
  cancelResourceJob: api.cancelResourceJob,
  deleteResourceJob: api.deleteResourceJob,
  downloadResourceJob: api.downloadResourceJob,
  downloadResourceUpload: api.downloadResourceUpload,
  listStudentResourceJobs: api.listStudentResourceJobs,
  retryResourceJob: api.retryResourceJob,
}));

import { ToastProvider } from "../ToastProvider";
import ResourceQueuePanel from "./ResourceQueuePanel";

function renderWithToast(ui) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

beforeEach(() => {
  authState.user = { uid: "tutor-1" };
  authState.isAdmin = false;
  Object.values(api).forEach((mock) => mock.mockReset());
});

afterEach(() => {
  cleanup();
});

describe("ResourceQueuePanel generation details", () => {
  it("shows the prompt, type, and attached files for an active job", () => {
    renderWithToast(
      <ResourceQueuePanel
        jobs={[
          {
            id: "job-1",
            jobId: "job-1",
            createdBy: "tutor-1",
            status: "processing",
            studentName: "Ann",
            resourceType: "worksheet",
            subject: "maths",
            year: 8,
            answerMode: "answers",
            customPrompt: "Focus on index laws, 10 questions.",
            uploadedFiles: [{ name: "term1-scope.pdf", path: "resources/uploads/tutor-1/x.pdf" }],
            createdByName: "Tutor One",
          },
        ]}
        loading={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "View generation details" }));

    expect(screen.getByText("Focus on index laws, 10 questions.")).toBeInTheDocument();
    expect(screen.getByText("Tutor One")).toBeInTheDocument();
    // Worksheet appears in both the row title and the modal Type row.
    expect(screen.getAllByText("Worksheet").length).toBeGreaterThan(1);

    // The attached file is a link that downloads it from storage.
    fireEvent.click(screen.getByText("term1-scope.pdf"));
    expect(api.downloadResourceUpload).toHaveBeenCalledWith({
      name: "term1-scope.pdf",
      path: "resources/uploads/tutor-1/x.pdf",
    });
  });

  it("opens details from history and notes when there is no prompt or files", () => {
    renderWithToast(
      <ResourceQueuePanel
        historyJobs={[
          {
            id: "job-2",
            jobId: "job-2",
            createdBy: "tutor-1",
            status: "complete",
            studentName: "Bob",
            resourceType: "annotation-task",
            subject: "english",
            year: 9,
            answerMode: "answers",
            customPrompt: "",
            uploadedFiles: [],
          },
        ]}
        jobs={[]}
        loading={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /History/ }));
    fireEvent.click(screen.getByRole("button", { name: "View generation details" }));

    expect(screen.getByText("No custom prompt provided")).toBeInTheDocument();
    expect(screen.getByText("No files attached")).toBeInTheDocument();
    expect(screen.getByText("Marking guide")).toBeInTheDocument(); // english answerMode label (none)
  });

  it("shows another tutor's reference name without offering a forbidden download", () => {
    renderWithToast(
      <ResourceQueuePanel
        historyJobs={[
          {
            id: "job-3",
            createdBy: "tutor-2",
            status: "complete",
            studentName: "Cara",
            resourceType: "worksheet",
            uploadedFiles: [
              { name: "private-reference.pdf", path: "resources/uploads/tutor-2/private.pdf" },
            ],
          },
        ]}
        jobs={[]}
        loading={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /History/ }));
    fireEvent.click(screen.getByRole("button", { name: "View generation details" }));

    const fileName = screen.getByText("private-reference.pdf");
    expect(fileName.closest("button")).toBeNull();
    expect(api.downloadResourceUpload).not.toHaveBeenCalled();
  });

  it("shows requested and effective models, the fallback reason, and source curator", () => {
    renderWithToast(
      <ResourceQueuePanel
        historyJobs={[{
          id: "job-fallback",
          jobId: "job-fallback",
          createdBy: "tutor-1",
          status: "complete",
          studentName: "Dana",
          resourceType: "practice-paper",
          subject: "english",
          year: 10,
          modelChoice: "claude-opus-5",
          requestedModel: "claude-opus-5",
          effectiveModel: "gpt-5.6-sol",
          effectiveProvider: "openai",
          fallbackUsed: true,
          failover: {
            reasonCode: "provider_overloaded",
            safeReason: "The selected AI provider was temporarily unavailable.",
          },
          failoverQueuedAtIso: "2026-08-24T08:00:00.000Z",
          sourcePlanner: {
            effectiveModel: "gpt-5.6-terra",
            fallbackUsed: true,
            alternateWorkRequired: true,
          },
        }]}
        jobs={[]}
        loading={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /History/ }));
    expect(screen.getByText("Backup model used")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View generation details" }));

    expect(screen.getAllByText("Claude Opus 5").length).toBeGreaterThan(1);
    expect(screen.getByText("GPT-5.6 Sol (backup model used)")).toBeInTheDocument();
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("The selected AI provider was temporarily unavailable.")).toBeInTheDocument();
    expect(screen.getByText("GPT-5.6 Terra (backup curator used) · alternate work selected"))
      .toBeInTheDocument();
  });
});
