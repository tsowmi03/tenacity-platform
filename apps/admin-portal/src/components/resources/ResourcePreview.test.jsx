import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  cancelResourceJob: vi.fn(),
  deleteResourceJob: vi.fn(),
  downloadResourceJob: vi.fn(),
  downloadResourceUpload: vi.fn(),
  fetchResourceJobPreview: vi.fn(),
  findSimilarResources: vi.fn(),
  listStudentResourceJobs: vi.fn(),
  retryResourceJob: vi.fn(),
  uploadResourceReference: vi.fn(),
}));

vi.mock("../../AuthProvider", () => ({
  useAuth: () => ({ user: { uid: "tutor-1" }, isAdmin: false }),
}));

vi.mock("../../backend/resourcesApi", () => api);

import { ToastProvider } from "../ToastProvider";
import ResourceJobBuilder from "./ResourceJobBuilder";
import ResourceQueuePanel from "./ResourceQueuePanel";
import { exemplarForType } from "./exemplars";

function renderWithToast(ui) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

const completeJob = {
  id: "job-1",
  jobId: "job-1",
  createdBy: "tutor-1",
  status: "complete",
  studentName: "Ann",
  resourceType: "practice-paper",
  subject: "maths",
  year: 9,
  answerMode: "answers",
  customPrompt: "",
  uploadedFiles: [],
  outputPath: "resources/output/job-1/attempt-1_Paper.docx",
  outputFileName: "Paper.docx",
  previewPath: "resources/output/job-1/attempt-1_Paper.pdf",
};

beforeEach(() => {
  Object.values(api).forEach((mock) => mock.mockReset());
  // jsdom has no object URL support — the hook depends on both.
  URL.createObjectURL = vi.fn(() => "blob:preview-url");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
});

describe("exemplarForType", () => {
  it("prefers the exemplar matching the selected subject", () => {
    const exemplar = exemplarForType("english", "practice-paper");
    expect(exemplar.url).toBe("/resource-exemplars/english-practice-paper.pdf");
    expect(exemplar.exactSubject).toBe(true);
  });

  it("falls back to the other subject's exemplar of the same type", () => {
    const exemplar = exemplarForType("english", "worksheet");
    expect(exemplar.url).toBe("/resource-exemplars/maths-worksheet.pdf");
    expect(exemplar.subject).toBe("maths");
    expect(exemplar.exactSubject).toBe(false);
  });

  it("returns null for unknown types", () => {
    expect(exemplarForType("maths", "not-a-type")).toBeNull();
  });
});

describe("template preview in the job builder", () => {
  it("shows an example preview for the selected type", () => {
    renderWithToast(
      <ResourceJobBuilder onSubmitJobs={vi.fn()} students={[]} studentsLoading={false} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Practice Paper" }));
    fireEvent.click(screen.getByRole("button", { name: /Preview example/ }));

    const frame = screen.getByTitle("Practice Paper — example");
    expect(frame.getAttribute("src")).toBe("/resource-exemplars/maths-practice-paper.pdf");
  });
});

describe("generated output preview", () => {
  it("fetches the stored PDF and shows it when Preview is clicked", async () => {
    api.fetchResourceJobPreview.mockResolvedValue(
      new Blob(["%PDF"], { type: "application/pdf" })
    );

    renderWithToast(
      <ResourceQueuePanel historyJobs={[completeJob]} jobs={[]} loading={false} />
    );

    fireEvent.click(screen.getByRole("button", { name: /History/ }));
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(api.fetchResourceJobPreview).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "job-1" })
    );
    await waitFor(() => {
      expect(screen.getByTitle("Practice Paper — preview").getAttribute("src")).toBe(
        "blob:preview-url"
      );
    });

    // Closing revokes the object URL so previews don't leak memory. (Both the
    // header icon and footer button are named "Close" — either works.)
    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-url");
  });

  it("shows an error state when the preview fetch fails", async () => {
    api.fetchResourceJobPreview.mockRejectedValue(new Error("storage offline"));

    renderWithToast(
      <ResourceQueuePanel historyJobs={[completeJob]} jobs={[]} loading={false} />
    );

    fireEvent.click(screen.getByRole("button", { name: /History/ }));
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    await waitFor(() => {
      expect(screen.getByText("Preview unavailable")).toBeInTheDocument();
      expect(screen.getByText("storage offline")).toBeInTheDocument();
    });
  });

  it("hides the Preview action for jobs generated without a preview", () => {
    renderWithToast(
      <ResourceQueuePanel
        historyJobs={[{ ...completeJob, previewPath: null }]}
        jobs={[]}
        loading={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /History/ }));
    expect(screen.queryByRole("button", { name: "Preview" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: ".docx" })).toBeInTheDocument();
  });
});
