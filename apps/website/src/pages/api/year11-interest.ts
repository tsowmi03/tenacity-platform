import type { NextApiRequest, NextApiResponse } from "next";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@lib/firebaseAdmin";
import { sendAdminNotification } from "@lib/adminNotification";
import {
  MAX_PREFERRED_DAYS,
  MAX_STUDENTS_PER_INTEREST,
  currentYearLabel,
  englishCourseLabel,
  hasConflictingCourseSelection,
  isCurrentYearCode,
  isEnglishCourseCode,
  isMathsCourseCode,
  isPreferredDayCode,
  isStudentStatusCode,
  mathsCourseLabel,
  preferredDayLabel,
  studentStatusLabel,
} from "@lib/year11Courses";

type ParentPayload = {
  parentFirstName?: unknown;
  parentLastName?: unknown;
  parentEmail?: unknown;
  parentPhone?: unknown;
};

type StudentPayload = {
  studentFirstName?: unknown;
  studentLastName?: unknown;
  school?: unknown;
  currentYear?: unknown;
  studentStatus?: unknown;
  mathsCourses?: unknown;
  englishCourses?: unknown;
  preferredDays?: unknown;
  notes?: unknown;
};

type InterestRequest = {
  parent?: ParentPayload;
  students?: unknown;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const cleanString = (value: unknown, maxLength = 500) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const isEmail = (value: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);

const cleanCodeList = (
  value: unknown,
  isValid: (code: string) => boolean,
  maxItems: number
) => {
  if (!Array.isArray(value)) return [];

  const codes = value
    .map((item) => cleanString(item, 60))
    .filter((item) => isValid(item));

  return Array.from(new Set(codes)).slice(0, maxItems);
};

const buildParent = (payload: unknown) => {
  if (!isObject(payload)) {
    throw new Error("Invalid parent payload.");
  }

  const parent = payload as ParentPayload;
  const cleaned = {
    parentFirstName: cleanString(parent.parentFirstName, 120),
    parentLastName: cleanString(parent.parentLastName, 120),
    parentEmail: cleanString(parent.parentEmail, 180),
    parentPhone: cleanString(parent.parentPhone, 60),
  };

  if (
    !cleaned.parentFirstName ||
    !cleaned.parentLastName ||
    !isEmail(cleaned.parentEmail) ||
    !cleaned.parentPhone
  ) {
    throw new Error("Invalid parent payload.");
  }

  return cleaned;
};

const buildStudent = (payload: unknown) => {
  if (!isObject(payload)) {
    throw new Error("Invalid student payload.");
  }

  const student = payload as StudentPayload;
  const currentYear = cleanString(student.currentYear, 60);
  const studentStatus = cleanString(student.studentStatus, 60);

  const cleaned = {
    studentFirstName: cleanString(student.studentFirstName, 120),
    studentLastName: cleanString(student.studentLastName, 120),
    school: cleanString(student.school, 160),
    currentYear,
    studentStatus,
    // Standard can never combine with Advanced/Extension 1 within a subject,
    // but Advanced and Extension 1 can be selected together - Extension 1 is
    // a separate one-unit course layered on top of Advanced.
    mathsCourses: cleanCodeList(student.mathsCourses, isMathsCourseCode, 3),
    englishCourses: cleanCodeList(
      student.englishCourses,
      isEnglishCourseCode,
      3
    ),
    preferredDays: cleanCodeList(
      student.preferredDays,
      isPreferredDayCode,
      MAX_PREFERRED_DAYS
    ),
    notes: cleanString(student.notes, 1500),
  };

  const hasSubject =
    cleaned.mathsCourses.length > 0 || cleaned.englishCourses.length > 0;

  if (
    !cleaned.studentFirstName ||
    !cleaned.studentLastName ||
    !cleaned.school ||
    !isCurrentYearCode(cleaned.currentYear) ||
    !isStudentStatusCode(cleaned.studentStatus) ||
    !hasSubject ||
    hasConflictingCourseSelection(cleaned.mathsCourses) ||
    hasConflictingCourseSelection(cleaned.englishCourses)
  ) {
    throw new Error("Invalid student payload.");
  }

  return cleaned;
};

const buildInterestDocs = (body: InterestRequest) => {
  if (
    !Array.isArray(body.students) ||
    body.students.length === 0 ||
    body.students.length > MAX_STUDENTS_PER_INTEREST
  ) {
    throw new Error("Invalid students payload.");
  }

  const parent = buildParent(body.parent);
  return body.students.map((student) => ({
    ...parent,
    ...buildStudent(student),
    archived: false,
  }));
};

const notificationDetails = (
  docs: ReturnType<typeof buildInterestDocs>
): string[] => {
  const [first] = docs;
  const lines = [
    `Parent: ${first.parentFirstName} ${first.parentLastName}`,
    `Email: ${first.parentEmail}`,
    `Phone: ${first.parentPhone}`,
  ];

  docs.forEach((doc) => {
    const subjects = [
      ...doc.mathsCourses.map(mathsCourseLabel),
      ...doc.englishCourses.map(englishCourseLabel),
    ].join(", ");
    const days = doc.preferredDays.map(preferredDayLabel).join(", ");

    lines.push(
      `Student: ${doc.studentFirstName} ${doc.studentLastName} - ${doc.school}`,
      `  Status: ${currentYearLabel(doc.currentYear)}, ${studentStatusLabel(
        doc.studentStatus
      )}`,
      `  Subjects: ${subjects}`,
      `  Preferred days: ${days || "Not specified"}`
    );

    if (doc.notes) lines.push(`  Notes: ${doc.notes}`);
  });

  return lines;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body as InterestRequest;

  let interestDocs: ReturnType<typeof buildInterestDocs>;
  try {
    interestDocs = buildInterestDocs(body);
  } catch {
    return res.status(400).json({ error: "Invalid interest payload" });
  }

  try {
    const db = getAdminDb();
    const interest = db.collection("year11Interest");
    const isGroup = interestDocs.length > 1;
    const registrationGroupId = isGroup ? interest.doc().id : null;

    const batch = db.batch();
    const refs = interestDocs.map((doc, index) => {
      const ref = interest.doc();
      batch.set(ref, {
        ...doc,
        createdAt: FieldValue.serverTimestamp(),
        ...(isGroup
          ? {
              registrationGroupId,
              registrationGroupIndex: index,
              registrationGroupSize: interestDocs.length,
            }
          : {}),
      });
      return ref;
    });
    await batch.commit();

    // The interest record is already saved; a failed notification must not turn
    // a successful submission into an error for the family.
    try {
      await sendAdminNotification({
        subject: "New Year 11 class interest registration",
        heading: "New Year 11 interest registration",
        intro: "A family has registered interest in the Year 11 classes.",
        details: notificationDetails(interestDocs),
      });
    } catch (error) {
      console.error("Year 11 interest notification failed:", error);
    }

    return res.status(200).json({
      ok: true,
      interestIds: refs.map((ref) => ref.id),
      registrationGroupId,
    });
  } catch (error) {
    console.error("Year 11 interest submission failed:", error);
    return res.status(500).json({ error: "Failed to submit interest" });
  }
}
