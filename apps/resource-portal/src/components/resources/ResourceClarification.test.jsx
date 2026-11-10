import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({ user: { uid: "tutor-1" }, isAdmin: false }));
const api = vi.hoisted(() => ({
  answerResourceClarification: vi.fn(),
  cancelResourceJob: vi.fn(),
  deleteResourceJob: vi.fn(),
  downloadResourceJob: vi.fn(),
  downloadResourceUpload: vi.fn(),
  resubmitResourceJob: vi.fn(),
  retryResourceJob: vi.fn(),
  submitResourceRevision: vi.fn(),
}));

vi.mock("../../AuthProvider", () => ({ useAuth: () => authState }));
vi.mock("../../backend/resourcesApi", () => api);

import { ToastProvider } from "../ToastProvider";
import ResourceQueuePanel from "./ResourceQueuePanel";

const job = {
  id: "job-1",
  jobId: "job-1",
  createdBy: "tutor-1",
  status: "failed",
  errorCode: "RESOURCE_SCOPE_CLARIFICATION",
  error: "Which non-linear topics should this cover?",
  clarificationOptions: ["Parabolas", "Exponentials"],
  studentName: "Ann",
  resourceType: "worksheet",
  subject: "maths",
  year: 10,
  customPrompt: "non linear questions",
};

function show(historyJobs, jobs = []) {
  render(
    <ToastProvider>
      <ResourceQueuePanel historyJobs={historyJobs} jobs={jobs} loading={false} />
    </ToastProvider>
  );
  fireEvent.click(screen.getByRole("button", { name: /History/ }));
}

beforeEach(() => {
  authState.user = { uid: "tutor-1" };
  authState.isAdmin = false;
  Object.values(api).forEach((mock) => mock.mockReset());
});

afterEach(cleanup);

describe("Needs your input", () => {
  it("asks instead of failing, and sends the ticked topics and note", async () => {
    api.answerResourceClarification.mockResolvedValue({ jobId: "job-2" });
    show([job]);

    expect(screen.getByText("Needs your input")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    const go = screen.getByRole("button", { name: "Continue" });
    expect(go).toBeDisabled();

    fireEvent.click(screen.getByLabelText("Parabolas"));
    fireEvent.change(screen.getByLabelText("Anything else?"), { target: { value: " Keep it hard " } });
    fireEvent.click(go);

    await waitFor(() =>
      expect(api.answerResourceClarification).toHaveBeenCalledWith(job, { topics: ["Parabolas"], note: "Keep it hard" })
    );
  });

  it("takes a typed answer when there are no suggestions", () => {
    show([{ ...job, clarificationOptions: undefined }]);
    fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: "Quadratics" } });
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("stops asking once a new version exists", () => {
    show([job], [{ ...job, id: "job-2", jobId: "job-2", status: "pending", errorCode: null, derivedFromJobId: "job-1" }]);
    expect(screen.getByText("Answered")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
  });

  it("does not offer the form to another tutor", () => {
    show([{ ...job, createdBy: "tutor-2" }]);
    expect(screen.getByText(job.error)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
  });

  it("keeps ordinary failures as Failed", () => {
    show([{ ...job, errorCode: "RESOURCE_RECOVERY_EXHAUSTED" }]);
    expect(screen.getAllByText("Failed").length).toBeGreaterThan(0);
    expect(screen.queryByText("Needs your input")).not.toBeInTheDocument();
  });
});
