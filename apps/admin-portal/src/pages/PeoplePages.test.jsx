import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  listClasses: vi.fn(),
  listInvoices: vi.fn(),
  listInvoiceDrafts: vi.fn(),
  getStudent: vi.fn(),
  listStudents: vi.fn(),
  getUser: vi.fn(),
  listUsers: vi.fn(),
}));

const authUser = vi.hoisted(() => ({ uid: "admin-1", email: "admin@tenacitytutoring.com" }));

vi.mock("../AuthProvider", () => ({
  useAuth: () => ({
    user: authUser,
    isAdmin: true,
  }),
}));

vi.mock("../backend/classesApi", () => ({
  listClasses: api.listClasses,
}));

vi.mock("../backend/invoicesApi", () => ({
  listInvoices: api.listInvoices,
  listInvoiceDrafts: api.listInvoiceDrafts,
}));

vi.mock("../backend/studentsApi", () => ({
  deleteStudent: vi.fn(),
  getStudent: api.getStudent,
  listStudents: api.listStudents,
  unlinkStudentFromParent: vi.fn(),
}));

vi.mock("../backend/usersApi", () => ({
  deleteUser: vi.fn(),
  getUser: api.getUser,
  listUsers: api.listUsers,
}));

import PeopleDetailPage from "./PeopleDetailPage";
import PeoplePage from "./PeoplePage";
import { ToastProvider } from "../components/ToastProvider";

beforeEach(() => {
  vi.clearAllMocks();
});

function parent(overrides = {}) {
  return {
    uid: "parent_backend_id",
    id: "parent_backend_id",
    firstName: "Zoe",
    lastName: "Parent",
    displayName: "Zoe Parent",
    email: "zoe@example.com",
    role: "parent",
    students: ["student_backend_id"],
    lessonTokens: 2,
    ...overrides,
  };
}

function student(overrides = {}) {
  return {
    id: "student_backend_id",
    firstName: "Ava",
    lastName: "Student",
    displayName: "Ava Student",
    grade: "7",
    subjects: ["Maths"],
    parents: ["parent_backend_id"],
    primaryParentId: "parent_backend_id",
    createdAtIso: "2026-05-10T00:00:00.000Z",
    updatedAtIso: "2026-05-11T00:00:00.000Z",
    ...overrides,
  };
}

describe("PeoplePage", () => {
  it("sorts people by last name and does not show backend ids in the list", async () => {
    api.listUsers.mockResolvedValue([
      parent(),
      parent({
        uid: "aaron_backend_id",
        id: "aaron_backend_id",
        firstName: "Aaron",
        lastName: "Alpha",
        displayName: "Aaron Alpha",
        email: "aaron@example.com",
      }),
    ]);
    api.listStudents.mockResolvedValue([student()]);
    api.listClasses.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={["/people"]}>
        <ToastProvider>
          <PeoplePage />
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.queryByText("Loading people...")).not.toBeInTheDocument());
    const names = screen.getAllByText(/Aaron Alpha|Zoe Parent/).map((node) => node.textContent);
    expect(names).toEqual(["Aaron Alpha", "Zoe Parent"]);
    expect(screen.queryByText("parent_backend_id")).not.toBeInTheDocument();
    expect(screen.queryByText("aaron_backend_id")).not.toBeInTheDocument();
  });
});

describe("PeopleDetailPage", () => {
  it("shows student relationships without backend ids or invoice cards", async () => {
    api.getStudent.mockResolvedValue(student());
    api.listUsers.mockResolvedValue([parent({ displayName: "Pat Parent", firstName: "Pat", lastName: "Parent" })]);
    api.listStudents.mockResolvedValue([student()]);
    api.listClasses.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={["/people/students/student_backend_id"]}>
        <ToastProvider>
          <Routes>
            <Route path="/people/:kind/:id" element={<PeopleDetailPage />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.queryByText("Loading people detail...")).not.toBeInTheDocument());
    expect(screen.getAllByText("Pat Parent")).not.toHaveLength(0);
    expect(screen.queryByText("student_backend_id")).not.toBeInTheDocument();
    expect(screen.queryByText("parent_backend_id")).not.toBeInTheDocument();
    expect(screen.queryByText("invoice_backend_id")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Invoices" })).not.toBeInTheDocument();
    expect(api.listInvoices).not.toHaveBeenCalled();
    expect(api.listInvoiceDrafts).not.toHaveBeenCalled();
  });

  it("shows parent invoice paid and outstanding totals without status counters", async () => {
    api.getUser.mockResolvedValue(parent({ displayName: "Pat Parent", firstName: "Pat", lastName: "Parent" }));
    api.listUsers.mockResolvedValue([parent({ displayName: "Pat Parent", firstName: "Pat", lastName: "Parent" })]);
    api.listStudents.mockResolvedValue([student()]);
    api.listClasses.mockResolvedValue([]);
    api.listInvoices.mockResolvedValue([
      { id: "paid_invoice_backend_id", status: "paid", amountDue: 0, amountDueComputed: 200, parentId: "parent_backend_id" },
      { id: "open_invoice_backend_id", status: "unpaid", amountDue: 150, amountDueComputed: 150, parentId: "parent_backend_id" },
    ]);
    api.listInvoiceDrafts.mockResolvedValue([
      { id: "draft_invoice_backend_id", status: "draft", amountDue: 999, amountDueComputed: 999, parentId: "parent_backend_id" },
    ]);

    render(
      <MemoryRouter initialEntries={["/people/parents/parent_backend_id"]}>
        <ToastProvider>
          <Routes>
            <Route path="/people/:kind/:id" element={<PeopleDetailPage />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.queryByText("Loading people detail...")).not.toBeInTheDocument());
    expect(screen.queryByText("parent account")).not.toBeInTheDocument();
    expect(screen.getByText("Paid")).toBeInTheDocument();
    expect(screen.getByText("$200.00")).toBeInTheDocument();
    expect(screen.getByText("Outstanding")).toBeInTheDocument();
    expect(screen.getByText("$150.00")).toBeInTheDocument();
    expect(screen.queryByText("$999.00")).not.toBeInTheDocument();
    expect(screen.queryByText("Open")).not.toBeInTheDocument();
    expect(screen.queryByText("Drafts")).not.toBeInTheDocument();
    expect(screen.queryByText("paid_invoice_backend_id")).not.toBeInTheDocument();

    const invoicesHeading = screen.getByRole("heading", { name: "Invoices" });
    const actionsHeading = screen.getByRole("heading", { name: "Actions" });
    expect(
      invoicesHeading.compareDocumentPosition(actionsHeading) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("does not show tutor role subtitles or Firestore implementation copy", async () => {
    api.getUser.mockResolvedValue({
      uid: "tutor_backend_id",
      id: "tutor_backend_id",
      firstName: "Tara",
      lastName: "Tutor",
      displayName: "Tara Tutor",
      email: "tara@example.com",
      role: "tutor",
    });
    api.listUsers.mockResolvedValue([]);
    api.listStudents.mockResolvedValue([]);
    api.listClasses.mockResolvedValue([{ id: "class_backend_id", name: "Maths", tutors: ["tutor_backend_id"] }]);

    render(
      <MemoryRouter initialEntries={["/people/tutors/tutor_backend_id"]}>
        <ToastProvider>
          <Routes>
            <Route path="/people/:kind/:id" element={<PeopleDetailPage />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.queryByText("Loading people detail...")).not.toBeInTheDocument());
    expect(screen.queryByText("tutor account")).not.toBeInTheDocument();
    expect(screen.queryByText("Read-only class assignment data from Firestore.")).not.toBeInTheDocument();
  });

  it("shows assigned classes for admins listed in class tutors", async () => {
    api.getUser.mockResolvedValue({
      uid: "admin_backend_id",
      id: "admin_backend_id",
      firstName: "Ari",
      lastName: "Admin",
      displayName: "Ari Admin",
      email: "ari@example.com",
      role: "admin",
    });
    api.listUsers.mockResolvedValue([]);
    api.listStudents.mockResolvedValue([]);
    api.listClasses.mockResolvedValue([{ id: "class_backend_id", name: "Maths", tutors: ["admin_backend_id"] }]);

    render(
      <MemoryRouter initialEntries={["/people/admins/admin_backend_id"]}>
        <ToastProvider>
          <Routes>
            <Route path="/people/:kind/:id" element={<PeopleDetailPage />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.queryByText("Loading people detail...")).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Classes" })).toBeInTheDocument();
    expect(screen.getByText("Maths")).toBeInTheDocument();
    expect(screen.queryByText("No matching class assignments were found.")).not.toBeInTheDocument();
  });
});
