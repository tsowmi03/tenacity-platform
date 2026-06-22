import type { NextApiRequest, NextApiResponse } from "next";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@lib/firebaseAdmin";
import { isReferralSourceCode } from "@lib/referralSources";

type ClassPayload = {
  id?: unknown;
  type?: unknown;
  day?: unknown;
  startTime?: unknown;
  endTime?: unknown;
};

type FamilyPayload = {
  carerFirstName?: unknown;
  carerLastName?: unknown;
  carerEmail?: unknown;
  carerPhone?: unknown;
  emergencyContactFirstName?: unknown;
  emergencyContactLastName?: unknown;
  emergencyContactPhone?: unknown;
  emergencyContactRelation?: unknown;
  referralSource?: unknown;
  referralSourceDetail?: unknown;
  termsAccepted?: unknown;
};

type StudentPayload = {
  studentFirstName?: unknown;
  studentLastName?: unknown;
  studentYear?: unknown;
  studentSubjects?: unknown;
  classes?: unknown;
  permissionToLeave?: unknown;
  allergies?: unknown;
  additionalInfo?: unknown;
};

type RegisterRequest = {
  enrolment?: FamilyPayload & StudentPayload;
  family?: FamilyPayload;
  students?: unknown;
  turnstileToken?: unknown;
};

type TurnstileResponse = {
  success?: boolean;
  "error-codes"?: string[];
};

const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const MAX_STUDENTS_PER_REGISTRATION = 5;

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const cleanString = (value: unknown, maxLength = 500) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const isEmail = (value: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);

const cleanStringList = (value: unknown, maxItems = 6) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanString(item, 80))
    .filter(Boolean)
    .slice(0, maxItems);
};

const cleanClasses = (value: unknown) => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!isObject(item)) return null;
      const cls = item as ClassPayload;
      const id = cleanString(cls.id, 120);
      if (!id) return null;

      return {
        id,
        type: cleanString(cls.type, 80),
        day: cleanString(cls.day, 40),
        startTime: cleanString(cls.startTime, 40),
        endTime: cleanString(cls.endTime, 40),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 6);
};

const buildFamily = (payload: unknown) => {
  if (!isObject(payload)) {
    throw new Error("Invalid family payload.");
  }

  const family = payload as FamilyPayload;
  const referralSource = cleanString(family.referralSource, 60);

  if (referralSource && !isReferralSourceCode(referralSource)) {
    throw new Error("Invalid referral source.");
  }

  const cleaned = {
    carerFirstName: cleanString(family.carerFirstName, 120),
    carerLastName: cleanString(family.carerLastName, 120),
    carerEmail: cleanString(family.carerEmail, 180),
    carerPhone: cleanString(family.carerPhone, 60),
    emergencyContactFirstName: cleanString(
      family.emergencyContactFirstName,
      120
    ),
    emergencyContactLastName: cleanString(family.emergencyContactLastName, 120),
    emergencyContactPhone: cleanString(family.emergencyContactPhone, 60),
    emergencyContactRelation: cleanString(family.emergencyContactRelation, 120),
    referralSource,
    referralSourceDetail: referralSource
      ? cleanString(family.referralSourceDetail, 250)
      : "",
    termsAccepted: family.termsAccepted === true,
  };

  if (
    !cleaned.carerFirstName ||
    !cleaned.carerLastName ||
    !isEmail(cleaned.carerEmail) ||
    !cleaned.carerPhone ||
    !cleaned.emergencyContactFirstName ||
    !cleaned.emergencyContactPhone ||
    !cleaned.emergencyContactRelation ||
    !cleaned.termsAccepted
  ) {
    throw new Error("Invalid family payload.");
  }

  return cleaned;
};

const buildStudent = (payload: unknown) => {
  if (!isObject(payload)) {
    throw new Error("Invalid student payload.");
  }

  const student = payload as StudentPayload;
  const studentSubjects = cleanStringList(student.studentSubjects);
  const classes = cleanClasses(student.classes);

  const cleaned = {
    studentFirstName: cleanString(student.studentFirstName, 120),
    studentLastName: cleanString(student.studentLastName, 120),
    studentYear: cleanString(student.studentYear, 40),
    studentSubjects,
    classes,
    permissionToLeave: student.permissionToLeave === true,
    allergies: cleanString(student.allergies, 500),
    additionalInfo: cleanString(student.additionalInfo, 1500),
  };

  if (
    !cleaned.studentFirstName ||
    !cleaned.studentLastName ||
    !cleaned.studentYear ||
    cleaned.studentSubjects.length === 0 ||
    cleaned.classes.length !== cleaned.studentSubjects.length
  ) {
    throw new Error("Invalid student payload.");
  }

  return cleaned;
};

const buildEnrolmentDocs = (body: RegisterRequest) => {
  // New grouped payload: shared family details plus one entry per student.
  if (body.family !== undefined || body.students !== undefined) {
    if (
      !Array.isArray(body.students) ||
      body.students.length === 0 ||
      body.students.length > MAX_STUDENTS_PER_REGISTRATION
    ) {
      throw new Error("Invalid students payload.");
    }

    const family = buildFamily(body.family);
    return body.students.map((student) => ({
      ...family,
      ...buildStudent(student),
      archived: false,
    }));
  }

  // Legacy single-student payload.
  return [
    {
      ...buildFamily(body.enrolment),
      ...buildStudent(body.enrolment),
      archived: false,
    },
  ];
};

const requestIp = (req: NextApiRequest) => {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim();
  if (Array.isArray(forwarded)) return forwarded[0];
  return req.socket.remoteAddress;
};

const verifyTurnstile = async (token: string, ip?: string) => {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    throw new Error("Turnstile is not configured.");
  }

  const formData = new URLSearchParams();
  formData.append("secret", secret);
  formData.append("response", token);
  if (ip) formData.append("remoteip", ip);

  const response = await fetch(TURNSTILE_VERIFY_URL, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) return false;

  const result = (await response.json()) as TurnstileResponse;
  return result.success === true;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body as RegisterRequest;
  const { turnstileToken } = body;
  if (typeof turnstileToken !== "string" || !turnstileToken.trim()) {
    return res.status(403).json({ error: "Human verification required" });
  }

  let enrolmentDocs: ReturnType<typeof buildEnrolmentDocs>;
  try {
    enrolmentDocs = buildEnrolmentDocs(body);
  } catch {
    return res.status(400).json({ error: "Invalid enrolment payload" });
  }

  try {
    const verified = await verifyTurnstile(turnstileToken, requestIp(req));
    if (!verified) {
      return res.status(403).json({ error: "Human verification failed" });
    }

    const db = getAdminDb();
    const enrolments = db.collection("enrolments");
    const isGroup = enrolmentDocs.length > 1;
    const registrationGroupId = isGroup ? enrolments.doc().id : null;

    const batch = db.batch();
    const refs = enrolmentDocs.map((doc, index) => {
      const ref = enrolments.doc();
      batch.set(ref, {
        ...doc,
        createdAt: FieldValue.serverTimestamp(),
        ...(isGroup
          ? {
              registrationGroupId,
              registrationGroupIndex: index,
              registrationGroupSize: enrolmentDocs.length,
            }
          : {}),
      });
      return ref;
    });
    await batch.commit();

    return res.status(200).json({
      ok: true,
      enrolmentId: refs[0].id,
      enrolmentIds: refs.map((ref) => ref.id),
      registrationGroupId,
    });
  } catch (error) {
    console.error("Registration submission failed:", error);
    return res.status(500).json({ error: "Failed to submit registration" });
  }
}
