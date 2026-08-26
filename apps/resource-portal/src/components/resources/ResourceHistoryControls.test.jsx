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
  retryResourceJob: api.retryResourceJob,
  submitResourceRevision: api.submitResourceRevision,
}));

import { ToastProvider } from "../ToastProvider";
import ResourceQueuePanel from "./ResourceQueuePanel";

function renderWithToast(ui) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

function historyJob(i, overrides = {}) {
  return {
    id: `job-${i}`,
    jobId: `job-${i}`,
    createdBy: "tutor-1",
    status: "complete",
    studentName: `Student ${i}`,
    resourceType: "worksheet",
    subject: "maths",
    year: 8,
    ...overrides,
  };
}

beforeEach(() => {
  authState.user = { uid: "tutor-1" };
  authState.isAdmin = false;
  Object.values(api).forEach((mock) => mock.mockReset());
});

afterEach(() => {
  cleanup();
});

describe("ResourceQueuePanel history controls", () => {
  it("limits history to a page and reveals more on Show more", () => {
    const jobs = Array.from({ length: 12 }, (_, i) => historyJob(i));
    renderWithToast(<ResourceQueuePanel historyJobs={jobs} jobs={[]} loading={false} />);

    fireEvent.click(screen.getByRole("button", { name: /History/ }));

    expect(screen.getByText("Student 0")).toBeInTheDocument();
    expect(screen.getByText("Student 9")).toBeInTheDocument();
    expect(screen.queryByText("Student 10")).not.toBeInTheDocument();
    expect(screen.getByText("Showing 10 of 12")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show more" }));

    expect(screen.getByText("Student 10")).toBeInTheDocument();
    expect(screen.getByText("Student 11")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
  });

  it("filters history by status", () => {
    const jobs = [
      historyJob(0, { studentName: "Ann", status: "complete" }),
      historyJob(1, { studentName: "Cara", status: "failed", error: "It failed." }),
      historyJob(2, { studentName: "Dan", status: "cancelled" }),
    ];
    renderWithToast(<ResourceQueuePanel historyJobs={jobs} jobs={[]} loading={false} />);

    fireEvent.click(screen.getByRole("button", { name: /History/ }));
    expect(screen.getByText("Ann")).toBeInTheDocument();
    expect(screen.getByText("Cara")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Failed" }));

    expect(screen.getByText("Cara")).toBeInTheDocument();
    expect(screen.queryByText("Ann")).not.toBeInTheDocument();
    expect(screen.queryByText("Dan")).not.toBeInTheDocument();
  });
});
