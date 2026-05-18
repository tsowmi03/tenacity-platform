import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  createStudent: vi.fn(),
  updateStudent: vi.fn(),
}));

vi.mock("../backend/studentsApi", () => ({
  createStudent: api.createStudent,
  updateStudent: api.updateStudent,
}));

import CreateStudentModal from "./CreateStudentModal";
import EditStudentModal from "./EditStudentModal";

beforeEach(() => {
  api.createStudent.mockReset();
  api.updateStudent.mockReset();
});

describe("student subject modals", () => {
  it("creates students with fixed subject options only", async () => {
    const user = userEvent.setup();
    api.createStudent.mockResolvedValue({ studentId: "student-1" });

    render(<CreateStudentModal open onClose={vi.fn()} onSuccess={vi.fn()} />);

    const textboxes = screen.getAllByRole("textbox");
    await user.type(textboxes[0], "Ava");
    await user.type(textboxes[1], "Student");
    await user.type(textboxes[2], "Year 7");
    await user.click(screen.getByRole("checkbox", { name: "Maths" }));

    expect(screen.queryByPlaceholderText(/Maths, English/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create student" }));

    expect(api.createStudent).toHaveBeenCalledWith({
      firstName: "Ava",
      lastName: "Student",
      grade: "Year 7",
      subjects: ["Maths"],
    });
  });

  it("edits students with fixed subject options only", async () => {
    const user = userEvent.setup();
    api.updateStudent.mockResolvedValue({ studentId: "student-1" });

    render(
      <EditStudentModal
        open
        record={{
          id: "student-1",
          firstName: "Ava",
          lastName: "Student",
          grade: "Year 7",
          subjects: ["English"],
        }}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    expect(screen.getByRole("checkbox", { name: "English" })).toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "Maths" }));
    await user.click(screen.getByRole("checkbox", { name: "English" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(api.updateStudent).toHaveBeenCalledWith("student-1", {
      firstName: "Ava",
      lastName: "Student",
      grade: "Year 7",
      subjects: ["Maths"],
    });
  });
});
