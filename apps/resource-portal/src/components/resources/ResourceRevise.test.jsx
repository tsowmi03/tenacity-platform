import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  fetchResourceJobPreview: vi.fn(),
  listStudentResourceJobs: vi.fn(),
  resubmitResourceJob: vi.fn(),
  retryResourceJob: vi.fn(),
  submitResourceRevision: vi.fn(),
}));

vi.mock("../../AuthProvider", () => ({
  useAuth: () => authState,
}));

vi.mock("../../backend/resourcesApi", () => api);

import { ToastProvider } from "../ToastProvider";
import ResourceQueuePanel from "./ResourceQueuePanel";

function renderWithToast(ui) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

const completedJob = {
  id: "job-1",
  jobId: "job-1",
  lineageRootId: "job-1",
  createdBy: "tutor-1",
  status: "complete",
  studentName: "Ann Chen",
  resourceType: "worksheet",
  subject: "maths",
  year: 8,
  outputPath: "resources/output/job-1/out.docx",
  createdAtIso: "2026-08-20T01:00:00.000Z",
};

function renderHistory(historyJobs, props = {}) {
  return renderWithToast(
    <ResourceQueuePanel
      historyJobs={historyJobs}
      historyLoading={false}
      jobs={[]}
      loading={false}
      {...props}
    />
  );
}

function openHistory() {
  fireEvent.click(screen.getByRole("button", { name: /History/ }));
}

function reviseDialog() {
  return within(screen.getByRole("dialog"));
}

function submitRevision(instruction) {
  fireEvent.change(screen.getByLabelText(/What should change/), {
    target: { value: instruction },
  });
  fireEvent.click(reviseDialog().getByRole("button", { name: "Revise" }));
}

beforeEach(() => {
  authState.user = { uid: "tutor-1" };
  authState.isAdmin = false;
  Object.values(api).forEach((mock) => mock.mockReset());
});

afterEach(() => {
  cleanup();
});

describe("revising a generated resource", () => {
  it("queues a revision with the tutor's instruction", async () => {
    api.submitResourceRevision.mockResolvedValue({ jobId: "job-2" });
    renderHistory([completedJob]);
    openHistory();

    fireEvent.click(screen.getByRole("button", { name: "Revise" }));
    submitRevision("Replace Q3 with a harder one");

    await waitFor(() =>
      expect(api.submitResourceRevision).toHaveBeenCalledWith({
        sourceJobId: "job-1",
        instruction: "Replace Q3 with a harder one",
      })
    );
  });

  it("will not submit an empty instruction", () => {
    renderHistory([completedJob]);
    openHistory();
    fireEvent.click(screen.getByRole("button", { name: "Revise" }));

    expect(reviseDialog().getByRole("button", { name: "Revise" })).toBeDisabled();

    // Whitespace alone is not an instruction.
    submitRevision("   ");
    expect(reviseDialog().getByRole("button", { name: "Revise" })).toBeDisabled();
    expect(api.submitResourceRevision).not.toHaveBeenCalled();
  });

  it("hides Revise on another tutor's resource for a non-admin", () => {
    renderHistory([{ ...completedJob, createdBy: "tutor-2" }]);
    openHistory();
    expect(screen.queryByRole("button", { name: "Revise" })).not.toBeInTheDocument();
  });

  it("offers Revise on another tutor's resource to an admin", () => {
    authState.isAdmin = true;
    renderHistory([{ ...completedJob, createdBy: "tutor-2" }]);
    openHistory();
    expect(screen.getByRole("button", { name: "Revise" })).toBeInTheDocument();
  });

  it("does not offer Revise on a failed resource", () => {
    renderHistory([{ ...completedJob, status: "failed", error: "Model timed out" }]);
    openHistory();
    expect(screen.queryByRole("button", { name: "Revise" })).not.toBeInTheDocument();
  });

  it("reports a failed revision without closing the box", async () => {
    api.submitResourceRevision.mockRejectedValue({ userMessage: "Model is busy" });
    renderHistory([completedJob]);
    openHistory();

    fireEvent.click(screen.getByRole("button", { name: "Revise" }));
    submitRevision("Fix Q1");

    await waitFor(() => expect(screen.getByText("Model is busy")).toBeInTheDocument());
    expect(screen.getByLabelText(/What should change/)).toBeInTheDocument();
  });
});

describe("version stacks in history", () => {
  const original = { ...completedJob, createdAtIso: "2026-08-20T01:00:00.000Z" };
  const revision = {
    ...completedJob,
    id: "job-2",
    jobId: "job-2",
    lineageRootId: "job-1",
    derivedFromJobId: "job-1",
    derivation: "revision",
    revisionInstruction: "Replace Q3 with a harder one",
    createdAtIso: "2026-08-21T01:00:00.000Z",
  };

  it("collapses a resource and its revision into one entry", () => {
    renderHistory([revision, original]);
    openHistory();

    // Only the newest version is listed up front.
    expect(screen.getAllByText("Ann Chen")).toHaveLength(1);
    expect(screen.getByText("1 earlier version")).toBeInTheDocument();
  });

  it("reveals the earlier version on request", () => {
    renderHistory([revision, original]);
    openHistory();

    fireEvent.click(screen.getByRole("button", { name: /1 earlier version/ }));
    expect(screen.getAllByText("Ann Chen")).toHaveLength(2);
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
  });

  it("labels a revision with the instruction that produced it", () => {
    renderHistory([revision, original]);
    openHistory();

    expect(screen.getByText("Revised")).toBeInTheDocument();
    expect(screen.getByText("Replace Q3 with a harder one")).toBeInTheDocument();
  });

  it("leaves an unrelated resource as its own entry", () => {
    renderHistory([
      revision,
      original,
      { ...completedJob, id: "job-9", jobId: "job-9", lineageRootId: "job-9", studentName: "Bo Li" },
    ]);
    openHistory();

    expect(screen.getByText("Bo Li")).toBeInTheDocument();
    expect(screen.getAllByText(/earlier version/)).toHaveLength(1);
  });

  it("says so when the original is outside the loaded history", () => {
    renderHistory([
      revision,
      { ...revision, id: "job-3", jobId: "job-3", createdAtIso: "2026-08-22T01:00:00.000Z" },
    ]);
    openHistory();

    fireEvent.click(screen.getByRole("button", { name: /1 earlier version/ }));
    expect(
      screen.getByText(/Older versions may be outside the loaded history/)
    ).toBeInTheDocument();
  });
});
