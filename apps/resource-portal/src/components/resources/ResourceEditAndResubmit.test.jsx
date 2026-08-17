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
  findSimilarResources: vi.fn(),
  resubmitResourceJob: vi.fn(),
  retryResourceJob: vi.fn(),
  uploadResourceReference: vi.fn(),
}));

vi.mock("../../AuthProvider", () => ({
  useAuth: () => authState,
}));

vi.mock("../../backend/resourcesApi", () => ({
  cancelResourceJob: api.cancelResourceJob,
  deleteResourceJob: api.deleteResourceJob,
  downloadResourceJob: api.downloadResourceJob,
  downloadResourceUpload: api.downloadResourceUpload,
  findSimilarResources: api.findSimilarResources,
  resubmitResourceJob: api.resubmitResourceJob,
  retryResourceJob: api.retryResourceJob,
  uploadResourceReference: api.uploadResourceReference,
  // Mirrors the real helper: the reference files a job was generated from,
  // with the legacy single-file fallback. Covered directly in resourcesApi.test.js.
  resourceJobUploadedFiles: (job = {}) =>
    Array.isArray(job.uploadedFiles) && job.uploadedFiles.length
      ? job.uploadedFiles.map((file) => ({ path: file.path, name: file.name }))
      : [],
}));

import { ToastProvider } from "../ToastProvider";
import ResourceJobBuilder from "./ResourceJobBuilder";
import ResourceQueuePanel from "./ResourceQueuePanel";

const pastJob = {
  id: "job-1",
  jobId: "job-1",
  createdBy: "tutor-1",
  status: "complete",
  studentId: "student-a",
  studentName: "Alice Able",
  subject: "maths",
  year: 8,
  resourceType: "worksheet",
  answerMode: "worked",
  showMarks: true,
  customPrompt: "Ten index-law questions.",
  uploadedFiles: [{ path: "resources/uploads/tutor-1/paper.pdf", name: "paper.pdf" }],
  outputPath: "resources/generated/job-1.docx",
};

function renderWithToast(ui) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

function renderBuilder(props = {}) {
  return renderWithToast(
    <ResourceJobBuilder
      onSubmitJobs={vi.fn().mockResolvedValue({ ok: true, errors: {} })}
      students={[]}
      studentsLoading={false}
      {...props}
    />
  );
}

beforeEach(() => {
  authState.user = { uid: "tutor-1" };
  authState.isAdmin = false;
  Object.values(api).forEach((mock) => mock.mockReset?.());
});

afterEach(() => {
  cleanup();
});

describe("editing a past resource from history", () => {
  it("offers Edit on the tutor's own history rows only", () => {
    const onEditJob = vi.fn();
    renderWithToast(
      <ResourceQueuePanel
        historyJobs={[
          pastJob,
          { ...pastJob, id: "job-2", jobId: "job-2", createdBy: "tutor-2", studentName: "Bob Baker" },
          {
            ...pastJob,
            id: "job-3",
            jobId: "job-3",
            status: "failed",
            studentName: "Cara Cole",
            error: "Model failed",
          },
        ]}
        jobs={[]}
        loading={false}
        onEditJob={onEditJob}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /History/ }));

    // Own complete job and own failed job — not the job another tutor created.
    const editButtons = screen.getAllByRole("button", { name: "Edit" });
    expect(editButtons).toHaveLength(2);

    fireEvent.click(editButtons[0]);
    expect(onEditJob).toHaveBeenCalledWith(expect.objectContaining({ id: "job-1" }));
  });

  it("hides Edit when the page does not accept an edit target", () => {
    renderWithToast(<ResourceQueuePanel historyJobs={[pastJob]} jobs={[]} loading={false} />);

    fireEvent.click(screen.getByRole("button", { name: /History/ }));

    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("keeps Edit off jobs that are still generating", () => {
    renderWithToast(
      <ResourceQueuePanel
        jobs={[{ ...pastJob, status: "processing" }]}
        loading={false}
        onEditJob={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("edits from the details modal and closes it", () => {
    const onEditJob = vi.fn();
    renderWithToast(
      <ResourceQueuePanel
        historyJobs={[pastJob]}
        jobs={[]}
        loading={false}
        onEditJob={onEditJob}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /History/ }));
    fireEvent.click(screen.getByRole("button", { name: "View generation details" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Two Edit buttons now: the history row behind, and the modal footer.
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" }).at(-1));

    expect(onEditJob).toHaveBeenCalledWith(expect.objectContaining({ id: "job-1" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("the builder loaded with a past resource", () => {
  it("fills every input from the job and says where the draft came from", () => {
    const onPrefillApplied = vi.fn();
    renderBuilder({ prefill: pastJob, onPrefillApplied });

    expect(screen.getByText("Editing a copy from history").parentElement)
      .toHaveTextContent("Worksheet for Alice Able");

    expect(screen.getByText("Alice Able")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("8");
    expect(screen.getByRole("button", { name: "Worksheet" })).toHaveClass("active");
    expect(screen.getByRole("button", { name: "Answers with working out" })).toHaveClass("active");
    expect(screen.getByRole("switch", { name: "Show marks beside questions" }))
      .toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("textbox")).toHaveValue("Ten index-law questions.");
    expect(screen.getByText("1 reference document")).toBeInTheDocument();
    expect(screen.getByText("paper.pdf")).toBeInTheDocument();

    expect(onPrefillApplied).toHaveBeenCalledTimes(1);
  });

  it("names a student who has left the roster instead of showing an empty picker", () => {
    renderBuilder({ prefill: pastJob });

    expect(screen.getByText("Not in your student list")).toBeInTheDocument();
    expect(screen.getByLabelText("Clear selected student")).toBeInTheDocument();
  });

  it("submits the edited inputs as a new job and drops the history note", async () => {
    const onSubmitJobs = vi.fn().mockResolvedValue({ ok: true, errors: {} });
    renderBuilder({ prefill: pastJob, onSubmitJobs });

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Twenty index-law questions, harder." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Answers only" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(onSubmitJobs).toHaveBeenCalled());

    const rows = onSubmitJobs.mock.calls[0][0];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      studentId: "student-a",
      studentName: "Alice Able",
      subject: "maths",
      year: 8,
      resourceType: "worksheet",
      answerMode: "answers",
      showMarks: true,
      customPrompt: "Twenty index-law questions, harder.",
      uploadedFiles: [{ path: "resources/uploads/tutor-1/paper.pdf", name: "paper.pdf" }],
    });

    await waitFor(() => {
      expect(screen.queryByText("Editing a copy from history")).not.toBeInTheDocument();
    });
  });

  it("starts fresh on request, clearing the loaded draft", () => {
    renderBuilder({ prefill: pastJob });

    fireEvent.click(screen.getByRole("button", { name: "Start fresh" }));

    expect(screen.queryByText("Editing a copy from history")).not.toBeInTheDocument();
    expect(screen.queryByText("Alice Able")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search by name or year..." })).toBeInTheDocument();
    expect(screen.queryByText("paper.pdf")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("replaces the working draft without disturbing jobs already staged", () => {
    const students = [{ id: "student-b", firstName: "Bob", lastName: "Baker", grade: "Year 9" }];
    const { rerender } = renderBuilder({ prefill: null, students });

    // Stage a job the normal way first.
    fireEvent.click(screen.getByRole("button", { name: "Search by name or year..." }));
    fireEvent.click(screen.getByText("Bob Baker"));
    fireEvent.click(screen.getByRole("button", { name: "Worksheet" }));
    fireEvent.click(screen.getByRole("button", { name: "Add another" }));
    expect(screen.getByText("Worksheet for Bob Baker")).toBeInTheDocument();

    rerender(
      <ToastProvider>
        <ResourceJobBuilder
          onSubmitJobs={vi.fn().mockResolvedValue({ ok: true, errors: {} })}
          prefill={pastJob}
          students={students}
          studentsLoading={false}
        />
      </ToastProvider>
    );

    expect(screen.getByText("Editing a copy from history")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("Ten index-law questions.");
    // The staged job survives — only the in-progress draft is replaced.
    expect(screen.getByText("Worksheet for Bob Baker")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit all (2)" })).toBeInTheDocument();
  });
});
