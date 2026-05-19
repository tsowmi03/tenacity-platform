import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  listEnrolments: vi.fn(),
  getEnrolment: vi.fn(),
  acceptEnrolment: vi.fn(),
  archiveEnrolment: vi.fn(),
  unarchiveEnrolment: vi.fn(),
  updateEnrolment: vi.fn(),
}));

const authUser = vi.hoisted(() => ({ uid: "admin-1", email: "admin@tenacitytutoring.com" }));

vi.mock("../AuthProvider", () => ({
  useAuth: () => ({
    user: authUser,
    isAdmin: true,
  }),
}));

vi.mock("../backend/enrolmentsApi", () => api);

import { ToastProvider } from "../components/ToastProvider";
import EnrolmentDetailsPage from "./EnrolmentDetailsPage";
import EnrolmentPortalPage from "./EnrolmentPortalPage";

function enrolmentFixture(overrides = {}) {
  return {
    id: "enrolment_backend_id",
    status: "pending",
    archived: false,
    studentFirstName: "Ava",
    studentLastName: "Nguyen",
    studentYear: "7",
    studentSubjects: ["Maths"],
    carerFirstName: "Sam",
    carerLastName: "Nguyen",
    carerEmail: "sam@example.com",
    carerPhone: "0400000000",
    classes: [{ id: "class_backend_id", day: "Monday", startTime: "16:00" }],
    emergencyContactFirstName: "Taylor",
    emergencyContactLastName: "Nguyen",
    emergencyContactPhone: "0400000001",
    emergencyContactRelation: "Parent",
    allergies: "",
    permissionToLeave: false,
    additionalInfo: "",
    ...overrides,
  };
}

describe("EnrolmentPortalPage", () => {
  it("shows operational enrolment states without backend ids or deleted tabs", async () => {
    api.listEnrolments.mockImplementation(() => Promise.resolve([
      enrolmentFixture(),
      enrolmentFixture({ id: "accepted_backend_id", status: "accepted", studentFirstName: "Ben" }),
      enrolmentFixture({ id: "archived_backend_id", status: "archived", archived: true, studentFirstName: "Cora" }),
      enrolmentFixture({ id: "deleted_backend_id", status: "deleted", studentFirstName: "Deleted" }),
    ]));

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={["/enrolments"]}>
          <EnrolmentPortalPage />
        </MemoryRouter>
      </ToastProvider>
    );

    await waitFor(() => expect(api.listEnrolments).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText("Loading enrolments...")).not.toBeInTheDocument());
    expect(screen.getByText("Ava Nguyen")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Active queue/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Accepted/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Archived/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Deleted/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^All/i })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search by student, carer, or email")).toBeInTheDocument();
    expect(screen.queryByText(/Loaded directly from/i)).not.toBeInTheDocument();
    expect(screen.queryByText("enrolment_backend_id")).not.toBeInTheDocument();
    expect(screen.queryByText("Deleted")).not.toBeInTheDocument();
  });
});

describe("EnrolmentDetailsPage", () => {
  it("keeps destructive record actions and backend ids out of the normal detail view", async () => {
    api.getEnrolment.mockImplementation(() => Promise.resolve(enrolmentFixture()));

    render(
      <MemoryRouter initialEntries={["/enrolments/enrolment_backend_id"]}>
        <Routes>
          <Route path="/enrolments/:enrolmentId" element={<EnrolmentDetailsPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(api.getEnrolment).toHaveBeenCalledWith("enrolment_backend_id"));
    await waitFor(() => expect(screen.queryByText("Loading enrolment details...")).not.toBeInTheDocument());
    expect(screen.getAllByText("Ava Nguyen")).not.toHaveLength(0);
    await waitFor(() => expect(screen.queryByText(/Enrolment ID/i)).not.toBeInTheDocument());
    expect(screen.queryByText("enrolment_backend_id")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Soft delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Purge permanently/i })).not.toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Accept enrolment/i })).toBeInTheDocument();
  });
});
