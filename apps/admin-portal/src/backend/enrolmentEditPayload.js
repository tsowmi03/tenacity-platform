import { referralSourceOption } from "./referralSources.js";

const EDITABLE_STRING_FIELDS = [
  "studentFirstName",
  "studentLastName",
  "studentYear",
  "carerFirstName",
  "carerLastName",
  "carerEmail",
  "carerPhone",
  "emergencyContactFirstName",
  "emergencyContactLastName",
  "emergencyContactPhone",
  "emergencyContactRelation",
  "allergies",
  "additionalInfo",
  "referralSource",
  "referralSourceDetail",
];

function textValue(value) {
  return String(value ?? "");
}

export function editFormFromEnrolment(enrolment = {}) {
  const form = EDITABLE_STRING_FIELDS.reduce((acc, field) => {
    acc[field] = textValue(enrolment[field]);
    return acc;
  }, {});

  const sourceOption = referralSourceOption(form.referralSource);
  form.referralSource = sourceOption?.code || "";
  if (!sourceOption?.detailLabel) form.referralSourceDetail = "";

  form.studentSubjects = Array.isArray(enrolment.studentSubjects)
    ? enrolment.studentSubjects.map((subject) => textValue(subject)).join(", ")
    : "";
  form.permissionToLeave = enrolment.permissionToLeave === true;
  form.classes = Array.isArray(enrolment.classes)
    ? enrolment.classes.map((classRef) => ({
        id: textValue(classRef?.id),
        day: textValue(classRef?.day),
        startTime: textValue(classRef?.startTime),
      }))
    : [];

  return form;
}

function uniqueTrimmedList(value) {
  return Array.from(
    new Set(
      textValue(value)
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
    )
  );
}

export function buildEnrolmentUpdatePayload(form) {
  const classes = (form.classes || [])
    .map((classRef) => ({
      id: textValue(classRef.id).trim(),
      day: textValue(classRef.day).trim(),
      startTime: textValue(classRef.startTime).trim(),
    }))
    .filter((classRef) => classRef.id || classRef.day || classRef.startTime);

  const missingClassId = classes.some((classRef) => !classRef.id);
  if (missingClassId) {
    throw new Error("Every class row with day or time must include a class ID.");
  }

  return {
    studentFirstName: form.studentFirstName.trim(),
    studentLastName: form.studentLastName.trim(),
    studentYear: form.studentYear.trim(),
    studentSubjects: uniqueTrimmedList(form.studentSubjects),
    classes,
    carerFirstName: form.carerFirstName.trim(),
    carerLastName: form.carerLastName.trim(),
    carerEmail: form.carerEmail.trim(),
    carerPhone: form.carerPhone.trim(),
    emergencyContactFirstName: form.emergencyContactFirstName.trim(),
    emergencyContactLastName: form.emergencyContactLastName.trim(),
    emergencyContactPhone: form.emergencyContactPhone.trim(),
    emergencyContactRelation: form.emergencyContactRelation.trim(),
    allergies: form.allergies.trim(),
    permissionToLeave: form.permissionToLeave === true,
    additionalInfo: form.additionalInfo.trim(),
    referralSource: textValue(form.referralSource).trim(),
    referralSourceDetail: textValue(form.referralSourceDetail).trim(),
  };
}
