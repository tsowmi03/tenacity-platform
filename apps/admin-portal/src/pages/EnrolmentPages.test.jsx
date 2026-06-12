import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

beforeEach(() => {
  vi.clearAllMocks();
});

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
    expect(screen.getByPlaceholderText("Search by student, carer, email, or source")).toBeInTheDocument();
    expect(screen.queryByText(/Loaded directly from/i)).not.toBeInTheDocument();
    expect(screen.queryByText("enrolment_backend_id")).not.toBeInTheDocument();
    expect(screen.queryByText("Deleted")).not.toBeInTheDocument();
  });

  it("shows referral sources, filters by source, and labels legacy values", async () => {
    const user = userEvent.setup();
    api.listEnrolments.mockResolvedValue([
      enrolmentFixture({
        id: "friend",
        studentFirstName: "Ava",
        referralSource: "friend_family",
        referralSourceDetail: "The Nguyen family",
      }),
      enrolmentFixture({
        id: "google",
        studentFirstName: "Ben",
        referralSource: "google",
      }),
      enrolmentFixture({
        id: "legacy",
        studentFirstName: "Cora",
      }),
      enrolmentFixture({
        id: "unknown",
        studentFirstName: "Dana",
        referralSource: "newspaper",
      }),
    ]);

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={["/enrolments"]}>
          <EnrolmentPortalPage />
        </MemoryRouter>
      </ToastProvider>
    );

    await waitFor(() => expect(screen.queryByText("Loading enrolments...")).not.toBeInTheDocument());
    expect(screen.getByRole("columnheader", { name: "Source" })).toBeInTheDocument();
    const table = within(screen.getByRole("table"));
    expect(table.getByText("Friend or family")).toBeInTheDocument();
    expect(table.getByText("Google Search or Maps")).toBeInTheDocument();
    expect(table.getAllByText("Not recorded")).toHaveLength(2);

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter by referral source" }),
      "google"
    );

    expect(screen.getByText("Ben Nguyen")).toBeInTheDocument();
    expect(screen.queryByText("Ava Nguyen")).not.toBeInTheDocument();
    expect(screen.queryByText("Cora Nguyen")).not.toBeInTheDocument();
    expect(screen.queryByText("Dana Nguyen")).not.toBeInTheDocument();
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

  it("shows referral source and detail in the intake record", async () => {
    api.getEnrolment.mockResolvedValue(enrolmentFixture({
      referralSource: "community",
      referralSourceDetail: "Northside Public School",
    }));

    render(
      <MemoryRouter initialEntries={["/enrolments/enrolment_backend_id"]}>
        <Routes>
          <Route path="/enrolments/:enrolmentId" element={<EnrolmentDetailsPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.queryByText("Loading enrolment details...")).not.toBeInTheDocument());
    expect(screen.getByText("How they heard about us")).toBeInTheDocument();
    expect(screen.getByText("School, church, or community")).toBeInTheDocument();
    expect(screen.getByText("Referral detail")).toBeInTheDocument();
    expect(screen.getByText("Northside Public School")).toBeInTheDocument();
  });

  it("clears stale referral detail when an admin selects a source without detail", async () => {
    const user = userEvent.setup();
    api.getEnrolment.mockResolvedValue(enrolmentFixture({
      referralSource: "friend_family",
      referralSourceDetail: "The Nguyen family",
    }));

    render(
      <MemoryRouter initialEntries={["/enrolments/enrolment_backend_id"]}>
        <Routes>
          <Route path="/enrolments/:enrolmentId" element={<EnrolmentDetailsPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.queryByText("Loading enrolment details...")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Edit intake" }));

    expect(screen.getByRole("textbox", { name: "Who referred you?" })).toHaveValue("The Nguyen family");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "How they heard about us" }),
      "google"
    );

    expect(screen.queryByRole("textbox", { name: "Who referred you?" })).not.toBeInTheDocument();
  });
});
