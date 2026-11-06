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
import ResourceQueuePanel, { isGenerating, jobTimeLabel } from "./ResourceQueuePanel";

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

// RES-84
const handOff = {
  id: "job-3", jobId: "job-3", createdBy: "tutor-1", status: "pending", stageContinuation: true,
  studentName: "Cat", resourceType: "topic-booklet", subject: "maths", year: 10,
  createdAtIso: "2026-11-06T13:15:29.000Z", startedAtIso: null,
  progress: { phase: "diagrams", fraction: 0.765, remainingMs: 273_000, updatedAt: new Date().toISOString() },
};

describe("ResourceQueuePanel live state", () => {
  it("shows a resource between workers as generating, not queued", () => {
    renderWithToast(<ResourceQueuePanel jobs={[handOff]} loading={false} />);
    expect(screen.getByText("Generating")).toBeInTheDocument();
    expect(screen.queryByText("Queued")).not.toBeInTheDocument();
    expect(screen.getByText("Drawing diagrams")).toBeInTheDocument();
  });

  it("still calls a resource that has not started queued", () => {
    renderWithToast(<ResourceQueuePanel jobs={[{ ...handOff, stageContinuation: false, progress: null }]} loading={false} />);
    expect(screen.getByText("Queued")).toBeInTheDocument();
  });

  it("confirms before stopping a resource between workers", async () => {
    api.cancelResourceJob.mockResolvedValue({ status: "cancelled" });
    renderWithToast(<ResourceQueuePanel jobs={[handOff]} loading={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(screen.getByText("Stop this generation?")).toBeInTheDocument();
    expect(api.cancelResourceJob).not.toHaveBeenCalled();
  });

  it("shows one spinner: on the current step, not on the row", () => {
    const { container } = renderWithToast(<ResourceQueuePanel jobs={[{ ...handOff, status: "processing", stageContinuation: false }]} loading={false} />);
    expect(container.querySelector(".rg-job-status .spinner")).toBeNull();
    expect(container.querySelectorAll(".rg-gen-step-active")).toHaveLength(1);
  });

  it("keeps the subtitle on the submitted time through hand-offs, then shows the finish time", () => {
    const created = jobTimeLabel(handOff);
    expect(jobTimeLabel({ ...handOff, status: "processing", startedAtIso: "2026-11-06T13:28:43.000Z" })).toBe(created);
    expect(jobTimeLabel({ ...handOff, status: "pending", startedAtIso: null })).toBe(created);
    const finished = jobTimeLabel({ ...handOff, status: "complete", completedAtIso: "2026-11-06T13:40:00.000Z" });
    expect(finished).not.toBe(created);
  });

  it("knows which states are mid-generation", () => {
    expect(isGenerating({ status: "processing" })).toBe(true);
    expect(isGenerating({ status: "fallback_pending" })).toBe(true);
    expect(isGenerating({ status: "pending", stageContinuation: true })).toBe(true);
    expect(isGenerating({ status: "pending" })).toBe(false);
    expect(isGenerating({ status: "complete", stageContinuation: true })).toBe(false);
  });
});
