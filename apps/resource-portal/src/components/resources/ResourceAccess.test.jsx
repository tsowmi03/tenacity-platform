import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  user: { uid: "tutor-1" },
  isAdmin: false,
}));

const api = vi.hoisted(() => ({
  deleteResourceJob: vi.fn(),
  downloadResourceJob: vi.fn(),
  retryResourceJob: vi.fn(),
  submitResourceRevision: vi.fn(),
}));

vi.mock("../../AuthProvider", () => ({
  useAuth: () => authState,
}));

vi.mock("../../backend/resourcesApi", () => ({
  deleteResourceJob: api.deleteResourceJob,
  downloadResourceJob: api.downloadResourceJob,
  retryResourceJob: api.retryResourceJob,
  submitResourceRevision: api.submitResourceRevision,
}));

import { ToastProvider } from "../ToastProvider";
import ResourceQueuePanel from "./ResourceQueuePanel";

const historyJobs = [
  { id: "own-failed", createdBy: "tutor-1", resourceType: "worksheet", status: "failed", studentName: "Own Failed" },
  { id: "other-failed", createdBy: "tutor-2", resourceType: "worksheet", status: "failed", studentName: "Other Failed" },
  { id: "own-complete", createdBy: "tutor-1", outputPath: "own.docx", resourceType: "worksheet", status: "complete", studentName: "Own Complete" },
  { id: "other-complete", createdBy: "tutor-2", outputPath: "other.docx", resourceType: "worksheet", status: "complete", studentName: "Other Complete" },
];

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

describe("resource job staff access", () => {
  it("lets tutors view shared queue history without deleting jobs", () => {
    renderWithToast(
      <ResourceQueuePanel
        historyJobs={historyJobs}
        jobs={[]}
        loading={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /History/ }));

    expect(screen.getAllByRole("button", { name: "Retry" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Delete resource history item" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: ".docx" })).toHaveLength(2);
    expect(screen.getByText("Other Failed")).toBeInTheDocument();
  });

  it("lets admins manage every shared queue job", () => {
    authState.user = { uid: "admin-1" };
    authState.isAdmin = true;

    renderWithToast(
      <ResourceQueuePanel
        historyJobs={historyJobs}
        jobs={[]}
        loading={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /History/ }));

    expect(screen.getAllByRole("button", { name: "Retry" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Delete resource history item" })).toHaveLength(4);
  });

  it("keeps completed jobs downloadable by the tutor who did not create them", () => {
    renderWithToast(
      <ResourceQueuePanel
        historyJobs={historyJobs}
        jobs={[]}
        loading={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /History/ }));

    // Both completed jobs are downloadable even though only one is this
    // tutor's own: resource history is shared across staff by design.
    expect(screen.getAllByRole("button", { name: ".docx" })).toHaveLength(2);
    expect(screen.getByText("Other Complete")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete resource history item" })).not.toBeInTheDocument();
  });
});
