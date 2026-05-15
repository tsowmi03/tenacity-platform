import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildEnrolmentUpdatePayload,
  editFormFromEnrolment,
} from "../src/backend/enrolmentEditPayload.js";

describe("enrolment edit payload", () => {
  it("maps an enrolment document into editable form state", () => {
    const form = editFormFromEnrolment({
      studentFirstName: "Ada",
      studentLastName: "Lovelace",
      studentSubjects: ["Maths", "English"],
      permissionToLeave: true,
      classes: [{ id: "class-1", day: "Monday", startTime: "16:00" }],
    });

    assert.equal(form.studentFirstName, "Ada");
    assert.equal(form.studentSubjects, "Maths, English");
    assert.equal(form.permissionToLeave, true);
    assert.deepEqual(form.classes, [
      { id: "class-1", day: "Monday", startTime: "16:00" },
    ]);
  });

  it("trims strings and de-duplicates comma-separated subjects", () => {
    const payload = buildEnrolmentUpdatePayload({
      studentFirstName: " Ada ",
      studentLastName: " Lovelace ",
      studentYear: " Year 9 ",
      studentSubjects: " Maths, English, Maths ",
      classes: [{ id: " class-1 ", day: " Monday ", startTime: " 16:00 " }],
      carerFirstName: " Ann ",
      carerLastName: " Example ",
      carerEmail: " Ann@example.com ",
      carerPhone: " 0411000000 ",
      emergencyContactFirstName: " Em ",
      emergencyContactLastName: " Contact ",
      emergencyContactPhone: " 0499000000 ",
      emergencyContactRelation: " Aunt ",
      allergies: " Peanuts ",
      permissionToLeave: true,
      additionalInfo: " Bring calculator ",
    });

    assert.equal(payload.studentFirstName, "Ada");
    assert.deepEqual(payload.studentSubjects, ["Maths", "English"]);
    assert.deepEqual(payload.classes, [
      { id: "class-1", day: "Monday", startTime: "16:00" },
    ]);
    assert.equal(payload.carerEmail, "Ann@example.com");
    assert.equal(payload.permissionToLeave, true);
  });

  it("drops fully empty class rows", () => {
    const payload = buildEnrolmentUpdatePayload({
      studentFirstName: "",
      studentLastName: "",
      studentYear: "",
      studentSubjects: "",
      classes: [{ id: "", day: "", startTime: "" }],
      carerFirstName: "",
      carerLastName: "",
      carerEmail: "",
      carerPhone: "",
      emergencyContactFirstName: "",
      emergencyContactLastName: "",
      emergencyContactPhone: "",
      emergencyContactRelation: "",
      allergies: "",
      permissionToLeave: false,
      additionalInfo: "",
    });

    assert.deepEqual(payload.classes, []);
  });

  it("rejects partial class rows without a class ID", () => {
    assert.throws(
      () =>
        buildEnrolmentUpdatePayload({
          studentFirstName: "",
          studentLastName: "",
          studentYear: "",
          studentSubjects: "",
          classes: [{ id: "", day: "Monday", startTime: "16:00" }],
          carerFirstName: "",
          carerLastName: "",
          carerEmail: "",
          carerPhone: "",
          emergencyContactFirstName: "",
          emergencyContactLastName: "",
          emergencyContactPhone: "",
          emergencyContactRelation: "",
          allergies: "",
          permissionToLeave: false,
          additionalInfo: "",
        }),
      /Every class row/
    );
  });
});
