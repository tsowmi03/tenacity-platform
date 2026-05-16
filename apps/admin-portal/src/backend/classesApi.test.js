import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./callable", () => ({
  callFunction: vi.fn(async () => ({})),
}));

import { callFunction } from "./callable";
import { createClass, deleteClass, updateClass } from "./classesApi";

beforeEach(() => {
  callFunction.mockClear();
});

describe("classesApi.createClass", () => {
  it("forwards the create payload verbatim", async () => {
    const payload = {
      type: "VCE Maths Methods",
      day: "Monday",
      startTime: "16:30",
      endTime: "18:00",
      capacity: 8,
      tutors: ["tutor_1"],
      enrolledStudents: ["s_1", "s_2"],
      generateAttendance: true,
      termIds: ["2026_T2"],
    };
    await createClass(payload);
    expect(callFunction).toHaveBeenCalledWith("adminCreateClass", payload);
  });
});

describe("classesApi.updateClass", () => {
  it("merges classId, updates, and propagationOptions in a single payload", async () => {
    await updateClass(
      "class_42",
      { capacity: 10, tutors: ["tutor_2"] },
      { propagateAttendance: true, attendanceFromDate: "2026-06-01" }
    );
    expect(callFunction).toHaveBeenCalledWith("adminUpdateClass", {
      classId: "class_42",
      capacity: 10,
      tutors: ["tutor_2"],
      propagateAttendance: true,
      attendanceFromDate: "2026-06-01",
    });
  });

  it("defaults propagationOptions to an empty object", async () => {
    await updateClass("class_42", { capacity: 6 });
    expect(callFunction.mock.calls[0][1]).toEqual({ classId: "class_42", capacity: 6 });
  });
});

describe("classesApi.deleteClass", () => {
  it("forwards confirmClassId and deleteAttendance", async () => {
    await deleteClass("class_42", "class_42", true);
    expect(callFunction).toHaveBeenCalledWith("adminDeleteClass", {
      classId: "class_42",
      confirmClassId: "class_42",
      deleteAttendance: true,
    });
  });
});
