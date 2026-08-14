import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  deleteResourceJob: vi.fn(),
  downloadResourceJob: vi.fn(),
  listStudents: vi.fn(),
  retryResourceJob: vi.fn(),
  subscribeResourceJobHistory: vi.fn(),
  subscribeResourceJobs: vi.fn(),
  submitResourceJob: vi.fn(),
  uploadResourceReference: vi.fn(),
}));

const authMock = vi.hoisted(() => ({
  user: { uid: "admin-1", email: "admin@tenacitytutoring.com" },
  role: "admin",
  isAdmin: true,
  logout: vi.fn(),
}));

vi.mock("../AuthProvider", () => ({
  PORTAL_ALLOWED_ROLES: ["admin", "tutor"],
  useAuth: () => ({
    user: authMock.user,
    role: authMock.role,
    isAdmin: authMock.isAdmin,
    isTutor: authMock.role === "tutor",
    accessError: "",
    loading: false,
    logout: authMock.logout,
  }),
}));

vi.mock("../firebaseConfig", () => ({
  auth: {},
  firebaseInitError: null,
}));

vi.mock("../backend/resourcesApi", () => ({
  deleteResourceJob: api.deleteResourceJob,
  downloadResourceJob: api.downloadResourceJob,
  retryResourceJob: api.retryResourceJob,
  subscribeResourceJobHistory: api.subscribeResourceJobHistory,
  subscribeResourceJobs: api.subscribeResourceJobs,
  submitResourceJob: api.submitResourceJob,
  uploadResourceReference: api.uploadResourceReference,
}));

vi.mock("../backend/studentsApi", () => ({
  listStudents: api.listStudents,
}));

import App from "../App";

function renderAt(path) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

describe("resource portal route smoke checks", () => {
  beforeEach(() => {
    authMock.user = { uid: "admin-1", email: "admin@tenacitytutoring.com" };
    authMock.role = "admin";
    authMock.isAdmin = true;
    api.listStudents.mockResolvedValue([]);
    api.subscribeResourceJobs.mockImplementation((params, onNext) => {
      onNext([]);
      return vi.fn();
    });
    api.subscribeResourceJobHistory.mockImplementation((params, onNext) => {
      onNext([]);
      return vi.fn();
    });
  });

  it("serves the resource surface at the site root", async () => {
    renderAt("/");

    expect(await screen.findByRole("heading", { level: 1, name: "Teaching resources" })).toBeInTheDocument();
    expect(await screen.findByText("Nothing generating right now")).toBeInTheDocument();
    expect(screen.queryByLabelText("Open navigation")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Resource portal home" })).toHaveAttribute("href", "/");
    await waitFor(() => {
      expect(api.listStudents).toHaveBeenCalled();
      expect(api.subscribeResourceJobs).toHaveBeenCalled();
      expect(api.subscribeResourceJobHistory).toHaveBeenCalled();
    });
  });

  it("carries no link into the admin portal", async () => {
    renderAt("/");
    await screen.findByRole("heading", { level: 1, name: "Teaching resources" });

    expect(screen.queryByRole("link", { name: "Admin portal" })).not.toBeInTheDocument();
    for (const link of screen.queryAllByRole("link")) {
      expect(link.getAttribute("href") || "").not.toMatch(/admin\.tenacitytutoring/);
    }
  });

  it("redirects the legacy /resources path to the root", async () => {
    renderAt("/resources");

    expect(await screen.findByRole("heading", { level: 1, name: "Teaching resources" })).toBeInTheDocument();
  });

  it("submits every reference document with legacy first-file fields", async () => {
    api.listStudents.mockResolvedValue([
      { id: "student-a", firstName: "Alice", lastName: "Able", grade: "Year 8" },
    ]);
    api.submitResourceJob.mockResolvedValue({ jobId: "job-a" });
    api.uploadResourceReference.mockImplementation(({ file }) => ({
      task: { cancel: vi.fn() },
      promise: Promise.resolve({
        uploadedFilePath: `resources/uploads/admin-1/${file.name}`,
        uploadedFileName: file.name,
      }),
    }));

    const { container } = renderAt("/");

    fireEvent.click(await screen.findByRole("button", { name: "Search by name or year..." }));
    fireEvent.click(await screen.findByText("Alice Able"));
    fireEvent.click(screen.getByRole("button", { name: "Worksheet" }));
    fireEvent.change(container.querySelector('input[type="file"]'), {
      target: {
        files: [
          new File(["paper"], "paper.pdf", { type: "application/pdf" }),
          new File(["scope"], "scope.docx", {
            type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          }),
        ],
      },
    });

    await screen.findByText("2 reference documents");
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(api.submitResourceJob).toHaveBeenCalledWith(expect.objectContaining({
        uploadedFiles: [
          {
            path: "resources/uploads/admin-1/paper.pdf",
            name: "paper.pdf",
          },
          {
            path: "resources/uploads/admin-1/scope.docx",
            name: "scope.docx",
          },
        ],
        uploadedFilePath: "resources/uploads/admin-1/paper.pdf",
        uploadedFileName: "paper.pdf",
      }));
    });
  });

  it("filters resource history by selected student without model labels or timestamp seconds", async () => {
    const aliceJob = {
      id: "job-a",
      jobId: "job-a",
      status: "complete",
      studentId: "student-a",
      studentName: "Alice Able",
      resourceType: "worksheet",
      subject: "maths",
      year: 8,
      model: "claude-sonnet-4-6",
      completedAtIso: "2026-05-24T04:05:30.000Z",
      outputPath: "resources/generated/job-a.docx",
      warnings: [
        {
          code: "OPTIONAL_DIAGRAM_OMITTED",
          message: "Optional diagram for Q4 was omitted: Rasterisation failed",
        },
      ],
    };
    const bobJob = {
      id: "job-b",
      jobId: "job-b",
      status: "failed",
      studentId: "student-b",
      studentName: "Bob Baker",
      resourceType: "worksheet",
      subject: "maths",
      year: 9,
      model: "claude-3-5-haiku-20241022",
      completedAtIso: "2026-05-24T05:10:45.000Z",
      error: "Model failed",
    };

    api.listStudents.mockResolvedValue([
      { id: "student-a", firstName: "Alice", lastName: "Able", grade: "Year 8" },
      { id: "student-b", firstName: "Bob", lastName: "Baker", grade: "Year 9" },
    ]);
    api.subscribeResourceJobHistory.mockImplementation((params, onNext) => {
      onNext(params.studentId === "student-a" ? [aliceJob] : [aliceJob, bobJob]);
      return vi.fn();
    });

    renderAt("/");

    fireEvent.click(await screen.findByRole("button", { name: /History/i }));
    expect(await screen.findByText("Alice Able")).toBeInTheDocument();
    expect(await screen.findByText("Bob Baker")).toBeInTheDocument();
    expect(screen.getByText(/Optional diagram for Q4 was omitted/)).toBeInTheDocument();
    expect(screen.queryByText(/Sonnet 4|Haiku 3\.5/)).not.toBeInTheDocument();
    expect(screen.queryByText(/:30\b|:45\b/)).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: /Search by name or year/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Alice Able/i }));

    await waitFor(() => {
      const latestCall = api.subscribeResourceJobHistory.mock.calls.at(-1);
      expect(latestCall[0]).toMatchObject({ studentId: "student-a" });
      expect(screen.queryByText("Bob Baker")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Completed, failed, and cancelled resources for Alice Able.")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Clear selected student"));

    await waitFor(() => {
      const latestCall = api.subscribeResourceJobHistory.mock.calls.at(-1);
      expect(latestCall[0]).toMatchObject({ studentId: "" });
      expect(screen.getByText("Bob Baker")).toBeInTheDocument();
    });
  });

  it("allows admins to delete completed resource history items", async () => {
    api.deleteResourceJob.mockResolvedValue({ deleted: true, jobId: "job-a" });
    api.subscribeResourceJobHistory.mockImplementation((params, onNext) => {
      onNext([
        {
          id: "job-a",
          jobId: "job-a",
          status: "complete",
          studentName: "Alice Able",
          resourceType: "worksheet",
          subject: "maths",
          year: 8,
          completedAtIso: "2026-05-24T04:05:30.000Z",
          outputPath: "resources/generated/job-a.docx",
        },
      ]);
      return vi.fn();
    });

    renderAt("/");

    fireEvent.click(await screen.findByRole("button", { name: /History/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete resource history item" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Delete resource history item");
    fireEvent.click(screen.getByRole("button", { name: "Delete resource" }));

    await waitFor(() => {
      expect(api.deleteResourceJob).toHaveBeenCalledWith("job-a");
    });
  });

  it("offers tutors no delete control on shared history", async () => {
    authMock.user = { uid: "tutor-1", email: "tutor@tenacitytutoring.com" };
    authMock.role = "tutor";
    authMock.isAdmin = false;
    api.subscribeResourceJobHistory.mockImplementation((params, onNext) => {
      onNext([
        {
          id: "job-a",
          jobId: "job-a",
          status: "complete",
          studentName: "Alice Able",
          resourceType: "worksheet",
          subject: "maths",
          year: 8,
          completedAtIso: "2026-05-24T04:05:30.000Z",
          outputPath: "resources/generated/job-a.docx",
        },
      ]);
      return vi.fn();
    });

    renderAt("/");

    fireEvent.click(await screen.findByRole("button", { name: /History/i }));
    await screen.findByText("Alice Able");

    expect(screen.queryByRole("button", { name: "Delete resource history item" })).not.toBeInTheDocument();
  });
});
