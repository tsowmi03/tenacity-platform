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

describe("ResourceQueuePanel cancellation", () => {
  it("cancels a queued job immediately without a confirmation", async () => {
    api.cancelResourceJob.mockResolvedValue({ status: "cancelled" });
    renderWithToast(
      <ResourceQueuePanel
        jobs={[{ id: "job-1", jobId: "job-1", status: "pending", studentName: "Ann", resourceType: "worksheet" }]}
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
        jobs={[{ id: "job-2", jobId: "job-2", status: "processing", studentName: "Bob", resourceType: "worksheet" }]}
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
