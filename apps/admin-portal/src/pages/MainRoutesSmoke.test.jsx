import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  listAuditLogs: vi.fn(),
  listRecentAuditLogs: vi.fn(),
  listStudents: vi.fn(),
  listTerms: vi.fn(),
  listUsers: vi.fn(),
  listWaitlist: vi.fn(),
  promoteWaitlistEntry: vi.fn(),
  purgeEnrolment: vi.fn(),
  regenerateAttendanceForTerm: vi.fn(),
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

vi.mock("../AuthProvider", () => ({
  useAuth: () => ({
    user: { uid: "admin-1", email: "admin@tenacitytutoring.com" },
    isAdmin: true,
    loading: false,
    logout: vi.fn(),
  }),
}));

vi.mock("../backend/attendanceApi", () => ({
  generateAttendanceForClass: api.generateAttendanceForClass,
  listAttendance: api.listAttendance,
  regenerateAttendanceForTerm: api.regenerateAttendanceForTerm,
}));

vi.mock("../backend/auditApi", () => ({
  listAuditLogs: api.listAuditLogs,
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
  beforeEach(() => {
    api.incomeReport.mockResolvedValue({ summary: {}, rows: [] });
    api.listAttendance.mockResolvedValue([]);
    api.listClasses.mockResolvedValue([]);
    api.listEnrolments.mockResolvedValue([]);
    api.listInvoiceDrafts.mockResolvedValue([]);
    api.listInvoices.mockResolvedValue([]);
    api.listAuditLogs.mockResolvedValue({ rows: [], nextCursor: null, hasMore: false });
    api.listRecentAuditLogs.mockResolvedValue([]);
    api.listStudents.mockResolvedValue([]);
    api.listTerms.mockResolvedValue([]);
    api.listUsers.mockResolvedValue([]);
    api.listWaitlist.mockResolvedValue([]);
  });

  it.each([
    {
      path: "/",
      heading: "Dashboard",
      readyText: "No revenue this month",
      expectedCalls: ["listEnrolments", "listInvoices", "listClasses"],
    },
    {
      path: "/enrolments",
      heading: "Enrolments",
      expectedCalls: ["listEnrolments"],
    },
    {
      path: "/people",
      heading: "People",
      expectedCalls: ["listUsers", "listStudents", "listClasses"],
    },
    {
      path: "/classes",
      heading: "Classes",
      readyText: "No classes found",
      expectedCalls: ["listClasses", "listUsers"],
    },
    {
      path: "/invoices",
      heading: "Invoices",
      readyText: "No invoices found",
      expectedCalls: ["listInvoices", "listInvoiceDrafts", "listStudents", "listUsers"],
    },
    { path: "/reports", heading: "Reports", readyText: "Filters" },
    { path: "/terms", heading: "Terms", readyText: "No terms yet", expectedCalls: ["listTerms"] },
    { path: "/audit", heading: "Audit", readyText: "No audit entries", expectedCalls: ["listAuditLogs"] },
  ])("renders $path with the staff shell and live page surface", async ({ path, heading, readyText, expectedCalls }) => {
    renderAt(path);

    expect(await screen.findByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
    expect(screen.getByLabelText("Open navigation")).toBeInTheDocument();
    if (readyText) {
      expect(await screen.findByText(readyText)).toBeInTheDocument();
    }
    if (expectedCalls?.length) {
      await waitFor(() => {
        for (const call of expectedCalls) {
          expect(api[call]).toHaveBeenCalled();
        }
      });
    }
  });

  it("redirects the retired settings route to audit", async () => {
    renderAt("/settings");

    expect(await screen.findByRole("heading", { level: 1, name: "Audit" })).toBeInTheDocument();
    expect(await screen.findByText("No audit entries")).toBeInTheDocument();
  });

  it("exposes every main route from the mobile navigation", async () => {
    const user = userEvent.setup();
    renderAt("/");

    await user.click(screen.getByLabelText("Open navigation"));

    await waitFor(() => {
      expect(document.querySelector(".shell.mobile-open")).toBeInTheDocument();
    });

    for (const route of [
      ["Dashboard", "/"],
      ["Enrolments", "/enrolments"],
      ["People", "/people"],
      ["Classes", "/classes"],
      ["Invoices", "/invoices"],
      ["Reports", "/reports"],
      ["Terms", "/terms"],
      ["Audit", "/audit"],
    ]) {
      expect(screen.getByRole("link", { name: route[0] })).toHaveAttribute("href", route[1]);
    }
  });
});
