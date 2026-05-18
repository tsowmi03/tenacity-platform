import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  createClass: vi.fn(),
  listClasses: vi.fn(),
  listStudents: vi.fn(),
  listTerms: vi.fn(),
  listUsers: vi.fn(),
}));

vi.mock("../backend/classesApi", () => ({
  createClass: api.createClass,
  listClasses: api.listClasses,
}));

vi.mock("../backend/settingsApi", () => ({
  listTerms: api.listTerms,
}));

vi.mock("../backend/studentsApi", () => ({
  listStudents: api.listStudents,
}));

vi.mock("../backend/usersApi", () => ({
  listUsers: api.listUsers,
}));

import ClassesPage from "./ClassesPage";
import { ToastProvider } from "../components/ToastProvider";

function renderClasses() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <ClassesPage />
      </ToastProvider>
    </MemoryRouter>
  );
}

describe("ClassesPage", () => {
  it("shows capacity-focused list content without backend class ids", async () => {
    api.listUsers.mockResolvedValue([
      { uid: "tutor_1", id: "tutor_1", firstName: "Tara", lastName: "Tutor", role: "tutor" },
    ]);
    api.listClasses.mockResolvedValue([
      {
        id: "backend_full_class_id",
        type: "5-10",
        day: "Tuesday",
        startTime: "17:00",
        endTime: "18:00",
        capacity: 2,
        enrolledStudents: ["s1", "s2"],
        tutors: ["tutor_1"],
      },
      {
        id: "backend_open_class_id",
        name: "Algebra",
        day: "Monday",
        startTime: "16:00",
        endTime: "17:00",
        capacity: 8,
        enrolledStudents: ["s1", "s2", "s3"],
        tutors: [],
      },
    ]);

    renderClasses();

    expect(await screen.findByText("Algebra")).toBeInTheDocument();
    expect(screen.getByText("5-10")).toBeInTheDocument();
    expect(screen.queryByText("backend_full_class_id")).not.toBeInTheDocument();
    expect(screen.queryByText("backend_open_class_id")).not.toBeInTheDocument();

    const headers = screen.getAllByRole("columnheader").map((node) => node.textContent);
    expect(headers).toEqual(["Schedule", "Enrolled", "Tutors", "Capacity", "Class"]);

    expect(screen.getByText("5 spots open")).toBeInTheDocument();
    expect(screen.getAllByText("Full").length).toBeGreaterThan(0);
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Open spots" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Missing tutor" })).toBeInTheDocument();

    expect(screen.queryByText("Active")).not.toBeInTheDocument();
    expect(screen.queryByText("Setup needed")).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "State" })).not.toBeInTheDocument();
  });
});
