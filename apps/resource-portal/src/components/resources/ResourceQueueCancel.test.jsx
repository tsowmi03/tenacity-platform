import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  resubmitResourceJob: vi.fn(),
  retryResourceJob: vi.fn(),
  submitResourceRevision: vi.fn(),
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
  resubmitResourceJob: api.resubmitResourceJob,
  retryResourceJob: api.retryResourceJob,
  submitResourceRevision: api.submitResourceRevision,
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

describe("ResourceQueuePanel cancellation", () => {
  it("cancels a queued job immediately without a confirmation", async () => {
    api.cancelResourceJob.mockResolvedValue({ status: "cancelled" });
    renderWithToast(
      <ResourceQueuePanel
        jobs={[{ id: "job-1", jobId: "job-1", createdBy: "tutor-1", status: "pending", studentName: "Ann", resourceType: "worksheet" }]}
        loading={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(api.cancelResourceJob).toHaveBeenCalledWith("job-1"));
    expect(screen.queryByRole("button", { name: "Stop generation" })).not.toBeInTheDocument();
  });

  it("confirms before stopping an in-progress job", async () => {
    api.cancelResourceJob.mockResolvedValue({ status: "cancelling" });
    renderWithToast(
      <ResourceQueuePanel
        jobs={[{ id: "job-2", jobId: "job-2", createdBy: "tutor-1", status: "processing", studentName: "Bob", resourceType: "worksheet" }]}
        loading={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    // Dialog appears; nothing cancelled yet.
    expect(screen.getByText("Stop this generation?")).toBeInTheDocument();
    expect(api.cancelResourceJob).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Stop generation" }));
    await waitFor(() => expect(api.cancelResourceJob).toHaveBeenCalledWith("job-2"));
  });

  it("shows the backup handoff target and allows cancellation during handoff", async () => {
    api.cancelResourceJob.mockResolvedValue({ status: "cancelled" });
    renderWithToast(
      <ResourceQueuePanel
        jobs={[{
          id: "job-handoff",
          jobId: "job-handoff",
          createdBy: "tutor-1",
          status: "fallback_pending",
          studentName: "Bob",
          resourceType: "worksheet",
          modelChoice: "claude-opus-5",
          activeModel: "gpt-5.6-sol",
        }]}
        loading={false}
      />
    );

    expect(screen.getByText("Switching to GPT-5.6 Sol…")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop generation" }));
    await waitFor(() => expect(api.cancelResourceJob).toHaveBeenCalledWith("job-handoff"));
  });

  it("regenerates a completed job as a new generation after confirmation", async () => {
    api.resubmitResourceJob.mockResolvedValue({ jobId: "job-new" });
    const job = {
      id: "job-4",
      jobId: "job-4",
      createdBy: "tutor-1",
      status: "complete",
      studentName: "Dana",
      resourceType: "annotation-task",
      subject: "english",
      year: 10,
      answerMode: "answers",
      customPrompt: "Growing up",
    };
    renderWithToast(<ResourceQueuePanel historyJobs={[job]} jobs={[]} loading={false} />);

    fireEvent.click(screen.getByRole("button", { name: /History/ }));
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));

    // Confirm dialog appears; nothing submitted yet.
    expect(screen.getByText("Regenerate this resource?")).toBeInTheDocument();
    expect(api.resubmitResourceJob).not.toHaveBeenCalled();

    // Two "Regenerate" buttons now exist — the row action and the dialog's
    // confirm (rendered last). Click the confirm button.
    fireEvent.click(screen.getAllByRole("button", { name: "Regenerate" }).at(-1));

    await waitFor(() => expect(api.resubmitResourceJob).toHaveBeenCalledWith(job));
  });

  it("hides regenerate from other tutors' completed jobs for non-admins", () => {
    renderWithToast(
      <ResourceQueuePanel
        historyJobs={[
          {
            id: "job-5",
            jobId: "job-5",
            createdBy: "someone-else",
            status: "complete",
            studentName: "Eve",
            resourceType: "worksheet",
          },
        ]}
        jobs={[]}
        loading={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /History/ }));
    expect(screen.queryByRole("button", { name: "Regenerate" })).not.toBeInTheDocument();
  });

  it("hides cancellation controls for another tutor's active job", () => {
    renderWithToast(
      <ResourceQueuePanel
        jobs={[
          {
            id: "job-other",
            createdBy: "tutor-2",
            status: "processing",
            studentName: "Eve",
            resourceType: "worksheet",
          },
        ]}
        loading={false}
      />
    );

    expect(screen.queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
  });

  it("shows a friendly failure message and reveals technical detail on expand", () => {
    renderWithToast(
      <ResourceQueuePanel
        historyJobs={[
          {
            id: "job-3",
            jobId: "job-3",
            createdBy: "tutor-1",
            status: "failed",
            studentName: "Cara",
            resourceType: "worksheet",
            error: "The resource was too large and the AI response was cut off.",
            errorDetail: "AI response was truncated at the 24000 token output limit.",
          },
        ]}
        jobs={[]}
        loading={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /History/ }));
    expect(screen.getByText(/the resource was too large/i)).toBeInTheDocument();
    // Detail hidden until expanded.
    expect(screen.queryByText(/24000 token output limit/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText(/the resource was too large/i));
    expect(screen.getByText(/24000 token output limit/i)).toBeInTheDocument();
  });
});
