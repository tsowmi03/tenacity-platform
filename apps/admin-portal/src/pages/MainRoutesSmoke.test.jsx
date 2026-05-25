import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  acceptEnrolment: vi.fn(),
  adjustLessonTokens: vi.fn(),
  archiveEnrolment: vi.fn(),
  attendanceReport: vi.fn(),
  classUtilisationReport: vi.fn(),
  createClass: vi.fn(),
  createInvoice: vi.fn(),
  createInvoiceDraft: vi.fn(),
  createStudent: vi.fn(),
  createTermsForYear: vi.fn(),
  createUser: vi.fn(),
  deleteClass: vi.fn(),
  deleteEnrolment: vi.fn(),
  deleteInvoice: vi.fn(),
  deleteStudent: vi.fn(),
  deleteUser: vi.fn(),
  exportReport: vi.fn(),
  exportResultToBlob: vi.fn(),
  generateAttendanceForClass: vi.fn(),
  getClass: vi.fn(),
  getEnrolment: vi.fn(),
  getInvoice: vi.fn(),
  getInvoicePdf: vi.fn(),
  getStudent: vi.fn(),
  getUser: vi.fn(),
  incomeReport: vi.fn(),
  invoiceAgingReport: vi.fn(),
  linkStudentToParent: vi.fn(),
  listAttendance: vi.fn(),
  listClasses: vi.fn(),
  listEnrolments: vi.fn(),
  listInvoiceDrafts: vi.fn(),
  listInvoices: vi.fn(),
  listRecentAuditLogs: vi.fn(),
  listStudents: vi.fn(),
  listTerms: vi.fn(),
  listUsers: vi.fn(),
  listWaitlist: vi.fn(),
  promoteWaitlistEntry: vi.fn(),
  purgeEnrolment: vi.fn(),
  regenerateAttendanceForTerm: vi.fn(),
  retryResourceJob: vi.fn(),
  subscribeResourceJobHistory: vi.fn(),
  subscribeResourceJobs: vi.fn(),
  submitResourceJob: vi.fn(),
  studentEnrolmentReport: vi.fn(),
  triggerBlobDownload: vi.fn(),
  unarchiveEnrolment: vi.fn(),
  unlinkStudentFromParent: vi.fn(),
  updateClass: vi.fn(),
  updateEnrolment: vi.fn(),
  updateInvoice: vi.fn(),
  updateStudent: vi.fn(),
  updateTerm: vi.fn(),
  updateUser: vi.fn(),
  updateWaitlistEntryStatus: vi.fn(),
}));

const authMock = vi.hoisted(() => ({
  user: { uid: "admin-1", email: "admin@tenacitytutoring.com" },
  logout: vi.fn(),
}));

vi.mock("../AuthProvider", () => ({
  useAuth: () => ({
    user: authMock.user,
    role: "admin",
    isAdmin: true,
    isTutor: false,
    isStaff: true,
    loading: false,
    logout: authMock.logout,
  }),
}));

vi.mock("../backend/attendanceApi", () => ({
  generateAttendanceForClass: api.generateAttendanceForClass,
  listAttendance: api.listAttendance,
  regenerateAttendanceForTerm: api.regenerateAttendanceForTerm,
}));

vi.mock("../backend/auditApi", () => ({
  listRecentAuditLogs: api.listRecentAuditLogs,
}));

vi.mock("../backend/classesApi", () => ({
  createClass: api.createClass,
  deleteClass: api.deleteClass,
  getClass: api.getClass,
  listClasses: api.listClasses,
  updateClass: api.updateClass,
}));

vi.mock("../backend/enrolmentsApi", () => ({
  acceptEnrolment: api.acceptEnrolment,
  archiveEnrolment: api.archiveEnrolment,
  deleteEnrolment: api.deleteEnrolment,
  getEnrolment: api.getEnrolment,
  listEnrolments: api.listEnrolments,
  purgeEnrolment: api.purgeEnrolment,
  unarchiveEnrolment: api.unarchiveEnrolment,
  updateEnrolment: api.updateEnrolment,
}));

vi.mock("../backend/invoicesApi", () => ({
  createInvoice: api.createInvoice,
  createInvoiceDraft: api.createInvoiceDraft,
  deleteInvoice: api.deleteInvoice,
  getInvoice: api.getInvoice,
  getInvoicePdf: api.getInvoicePdf,
  listInvoiceDrafts: api.listInvoiceDrafts,
  listInvoices: api.listInvoices,
  updateInvoice: api.updateInvoice,
}));

vi.mock("../backend/reportsApi", () => ({
  attendanceReport: api.attendanceReport,
  classUtilisationReport: api.classUtilisationReport,
  exportReport: api.exportReport,
  exportResultToBlob: api.exportResultToBlob,
  incomeReport: api.incomeReport,
  invoiceAgingReport: api.invoiceAgingReport,
  studentEnrolmentReport: api.studentEnrolmentReport,
  triggerBlobDownload: api.triggerBlobDownload,
}));

vi.mock("../backend/resourcesApi", () => ({
  downloadResourceJob: vi.fn(),
  listStudentResourceJobs: vi.fn(),
  retryResourceJob: api.retryResourceJob,
  subscribeResourceJobHistory: api.subscribeResourceJobHistory,
  subscribeResourceJobs: api.subscribeResourceJobs,
  submitResourceJob: api.submitResourceJob,
}));

vi.mock("../backend/studentsApi", () => ({
  createStudent: api.createStudent,
  deleteStudent: api.deleteStudent,
  getStudent: api.getStudent,
  linkStudentToParent: api.linkStudentToParent,
  listStudents: api.listStudents,
  unlinkStudentFromParent: api.unlinkStudentFromParent,
  updateStudent: api.updateStudent,
}));

vi.mock("../backend/termsApi", () => ({
  createTermsForYear: api.createTermsForYear,
  listTerms: api.listTerms,
  updateTerm: api.updateTerm,
}));

vi.mock("../backend/usersApi", () => ({
  adjustLessonTokens: api.adjustLessonTokens,
  createUser: api.createUser,
  deleteUser: api.deleteUser,
  getUser: api.getUser,
  linkStudentToParent: api.linkStudentToParent,
  listUsers: api.listUsers,
  unlinkStudentFromParent: api.unlinkStudentFromParent,
  updateUser: api.updateUser,
}));

vi.mock("../backend/waitlistApi", () => ({
  listWaitlist: api.listWaitlist,
  promoteWaitlistEntry: api.promoteWaitlistEntry,
  updateWaitlistEntryStatus: api.updateWaitlistEntryStatus,
}));

import App from "../App";

function renderAt(path) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

describe("main route smoke checks", () => {
  function setupApiDefaults() {
    api.incomeReport.mockResolvedValue({ summary: {}, rows: [] });
    api.listAttendance.mockResolvedValue([]);
    api.listClasses.mockResolvedValue([]);
    api.listEnrolments.mockResolvedValue([]);
    api.listInvoiceDrafts.mockResolvedValue([]);
    api.listInvoices.mockResolvedValue([]);
    api.listRecentAuditLogs.mockResolvedValue([]);
    api.subscribeResourceJobs.mockImplementation((params, onNext) => {
      onNext([]);
      return vi.fn();
    });
    api.subscribeResourceJobHistory.mockImplementation((params, onNext) => {
      onNext([]);
      return vi.fn();
    });
    api.listStudents.mockResolvedValue([]);
    api.listTerms.mockResolvedValue([]);
    api.listUsers.mockResolvedValue([]);
    api.listWaitlist.mockResolvedValue([]);
  }

  beforeEach(() => {
    setupApiDefaults();
  });

  it("renders the resources route inside the staff shell", async () => {
    renderAt("/resources");

    expect(await screen.findByRole("heading", { level: 1, name: "Resources" })).toBeInTheDocument();
    expect(await screen.findByText("Nothing generating right now")).toBeInTheDocument();
    expect(screen.getByLabelText("Open navigation")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Resources" })).toHaveAttribute("href", "/resources");
    await waitFor(() => {
      expect(api.listStudents).toHaveBeenCalled();
      expect(api.subscribeResourceJobs).toHaveBeenCalled();
      expect(api.subscribeResourceJobHistory).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByLabelText("Open navigation"));

    await waitFor(() => {
      expect(document.querySelector(".shell.mobile-open")).toBeInTheDocument();
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

    renderAt("/resources");

    fireEvent.click(await screen.findByRole("button", { name: /History/i }));
    expect(await screen.findByText("Alice Able")).toBeInTheDocument();
    expect(await screen.findByText("Bob Baker")).toBeInTheDocument();
    expect(screen.queryByText(/Sonnet 4|Haiku 3\.5/)).not.toBeInTheDocument();
    expect(screen.queryByText(/:30\b|:45\b/)).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: /Search by name or year/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Alice Able/i }));

    await waitFor(() => {
      const latestCall = api.subscribeResourceJobHistory.mock.calls.at(-1);
      expect(latestCall[0]).toMatchObject({ studentId: "student-a" });
      expect(screen.queryByText("Bob Baker")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Completed and failed resources for Alice Able.")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Clear selected student"));

    await waitFor(() => {
      const latestCall = api.subscribeResourceJobHistory.mock.calls.at(-1);
      expect(latestCall[0]).toMatchObject({ studentId: "" });
      expect(screen.getByText("Bob Baker")).toBeInTheDocument();
    });
  });
});
