import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  uploadResourceReference: vi.fn(),
}));

vi.mock("../../AuthProvider", () => ({
  useAuth: () => ({ user: { uid: "tutor-1" } }),
}));

vi.mock("../../backend/resourcesApi", () => ({
  downloadResourceJob: vi.fn(),
  findSimilarResources: vi.fn(),
  uploadResourceReference: api.uploadResourceReference,
}));

import { ToastProvider } from "../ToastProvider";
import ResourceJobBuilder from "./ResourceJobBuilder";

function renderBuilder(props = {}) {
  return render(
    <ToastProvider>
      <ResourceJobBuilder
        onSubmitJobs={vi.fn()}
        students={[]}
        studentsLoading={false}
        {...props}
      />
    </ToastProvider>
  );
}

describe("resource answer options", () => {
  beforeEach(() => {
    api.uploadResourceReference.mockReset();
  });

  it("defaults question resources to no answers and offers three modes", () => {
    renderBuilder();

    fireEvent.click(screen.getByRole("button", { name: "Worksheet" }));

    const noAnswers = screen.getByRole("button", { name: "No answers" });
    expect(noAnswers).toHaveClass("active");
    expect(screen.getByRole("button", { name: "Answers only" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Answers with working out" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Answers with working out" }));
    expect(screen.getByRole("button", { name: "Answers with working out" })).toHaveClass("active");
    expect(screen.getByText("Includes final answers with step-by-step working.")).toBeInTheDocument();
  });

  it("uses English-specific labels for answer guidance", () => {
    renderBuilder();

    fireEvent.click(screen.getByRole("button", { name: "English" }));
    fireEvent.click(screen.getByRole("button", { name: "Annotation Task" }));

    expect(screen.getByRole("button", { name: "No answers" })).toHaveClass("active");
    expect(screen.getByRole("button", { name: "Marking guide" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Model answers" })).toBeInTheDocument();
  });

  it("defaults marks on for practice papers and off for other question resources", () => {
    renderBuilder();

    fireEvent.click(screen.getByRole("button", { name: "Worksheet" }));
    expect(screen.getByRole("switch", { name: "Show marks beside questions" }))
      .toHaveAttribute("aria-checked", "false");

    fireEvent.click(screen.getByRole("button", { name: "Practice Paper" }));
    expect(screen.getByRole("switch", { name: "Show marks beside questions" }))
      .toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByRole("button", { name: "Study Guide" }));
    expect(screen.queryByRole("switch", { name: "Show marks beside questions" }))
      .not.toBeInTheDocument();
  });

  it("submits the tutor's marks visibility choice with the job", async () => {
    const onSubmitJobs = vi.fn().mockResolvedValue({ ok: true });
    renderBuilder({
      onSubmitJobs,
      students: [{ id: "student-1", displayName: "Mei Tanaka", grade: 8 }],
    });

    fireEvent.click(screen.getByRole("button", { name: "Search by name or year..." }));
    fireEvent.click(screen.getByText("Mei Tanaka"));
    fireEvent.click(screen.getByRole("button", { name: "Worksheet" }));
    fireEvent.click(screen.getByRole("switch", { name: "Show marks beside questions" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(onSubmitJobs).toHaveBeenCalledTimes(1));
    expect(onSubmitJobs.mock.calls[0][0][0].showMarks).toBe(true);
  });
});

describe("resource reference documents", () => {
  beforeEach(() => {
    api.uploadResourceReference.mockReset();
    api.uploadResourceReference.mockImplementation(({ file }) => ({
      task: { cancel: vi.fn() },
      promise: Promise.resolve({
        uploadedFilePath: `resources/uploads/tutor-1/${file.name}`,
        uploadedFileName: file.name,
      }),
    }));
  });

  it("uploads and lists multiple reference documents", async () => {
    const { container } = renderBuilder();
    const input = container.querySelector('input[type="file"]');
    const files = [
      new File(["paper"], "paper.pdf", { type: "application/pdf" }),
      new File(["scope"], "scope.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    ];

    expect(input).toHaveAttribute("multiple");
    fireEvent.change(input, { target: { files } });

    await waitFor(() => {
      expect(screen.getByText("2 reference documents")).toBeInTheDocument();
    });
    expect(screen.getByText("paper.pdf")).toBeInTheDocument();
    expect(screen.getByText("scope.docx")).toBeInTheDocument();
    expect(api.uploadResourceReference).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "Remove paper.pdf" }));
    expect(screen.queryByText("paper.pdf")).not.toBeInTheDocument();
    expect(screen.getByText("1 reference document")).toBeInTheDocument();
  });

  it("accepts Markdown and plain-text reference documents", async () => {
    const { container } = renderBuilder();
    const input = container.querySelector('input[type="file"]');
    const files = [
      new File(["# Outcomes"], "outcomes.md", { type: "text/markdown" }),
      new File(["Tutor notes"], "notes.txt", { type: "text/plain" }),
    ];

    expect(input).toHaveAttribute("accept", expect.stringContaining(".md"));
    expect(input).toHaveAttribute("accept", expect.stringContaining(".txt"));
    fireEvent.change(input, { target: { files } });

    await waitFor(() => {
      expect(screen.getByText("2 reference documents")).toBeInTheDocument();
    });
    expect(screen.getByText("outcomes.md")).toBeInTheDocument();
    expect(screen.getByText("notes.txt")).toBeInTheDocument();
    expect(api.uploadResourceReference).toHaveBeenCalledTimes(2);
  });

  it("rejects unsupported reference document types", async () => {
    const { container } = renderBuilder();
    const file = new File(["binary"], "archive.zip", { type: "application/zip" });

    fireEvent.change(container.querySelector('input[type="file"]'), {
      target: { files: [file] },
    });

    expect(
      await screen.findByText("Upload PDF, DOCX, Markdown, or text files only.")
    ).toBeInTheDocument();
    expect(api.uploadResourceReference).not.toHaveBeenCalled();
  });

  it("submits all uploaded references with the staged job", async () => {
    const onSubmitJobs = vi.fn().mockResolvedValue({ ok: true });
    const { container } = renderBuilder({
      onSubmitJobs,
      students: [{ id: "student-1", displayName: "Mei Tanaka", grade: 8 }],
    });

    fireEvent.click(screen.getByRole("button", { name: "Search by name or year..." }));
    fireEvent.click(screen.getByText("Mei Tanaka"));
    fireEvent.click(screen.getByRole("button", { name: "Worksheet" }));

    const files = [
      new File(["paper"], "paper.pdf", { type: "application/pdf" }),
      new File(["scope"], "scope.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    ];
    fireEvent.change(container.querySelector('input[type="file"]'), {
      target: { files },
    });

    await waitFor(() => {
      expect(screen.getByText("2 reference documents")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(onSubmitJobs).toHaveBeenCalledTimes(1);
    });
    expect(onSubmitJobs.mock.calls[0][0][0].uploadedFiles).toEqual([
      {
        path: "resources/uploads/tutor-1/paper.pdf",
        name: "paper.pdf",
      },
      {
        path: "resources/uploads/tutor-1/scope.docx",
        name: "scope.docx",
      },
    ]);
  });

  it("rejects selections above the five-file limit", async () => {
    const { container } = renderBuilder();
    const files = Array.from({ length: 6 }, (_, index) =>
      new File([`file-${index}`], `file-${index}.pdf`, { type: "application/pdf" })
    );

    fireEvent.change(container.querySelector('input[type="file"]'), {
      target: { files },
    });

    expect(await screen.findByText("Add up to 5 reference documents.")).toBeInTheDocument();
    expect(api.uploadResourceReference).not.toHaveBeenCalled();
  });
});
