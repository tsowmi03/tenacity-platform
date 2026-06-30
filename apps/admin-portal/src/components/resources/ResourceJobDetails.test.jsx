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
            status: "processing",
            studentName: "Ann",
            resourceType: "worksheet",
            subject: "maths",
            year: 8,
            answerMode: "answers",
            customPrompt: "Focus on index laws, 10 questions.",
            uploadedFiles: [{ name: "term1-scope.pdf", path: "resources/uploads/x.pdf" }],
            createdByName: "Tutor One",
          },
        ]}
        loading={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "View generation details" }));

    expect(screen.getByText("Focus on index laws, 10 questions.")).toBeInTheDocument();
    expect(screen.getByText("term1-scope.pdf")).toBeInTheDocument();
    expect(screen.getByText("Tutor One")).toBeInTheDocument();
    // Worksheet appears in both the row title and the modal Type row.
    expect(screen.getAllByText("Worksheet").length).toBeGreaterThan(1);
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
});
