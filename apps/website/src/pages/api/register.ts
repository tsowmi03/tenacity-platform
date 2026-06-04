import type { NextApiRequest, NextApiResponse } from "next";
import { getAdminDb } from "@lib/firebaseAdmin";

type ClassPayload = {
  id?: unknown;
  type?: unknown;
  day?: unknown;
  startTime?: unknown;
  endTime?: unknown;
};

type RegistrationPayload = {
  carerFirstName?: unknown;
  carerLastName?: unknown;
  carerEmail?: unknown;
  carerPhone?: unknown;
  studentFirstName?: unknown;
  studentLastName?: unknown;
  studentYear?: unknown;
  studentSubjects?: unknown;
  classes?: unknown;
  emergencyContactFirstName?: unknown;
  emergencyContactLastName?: unknown;
  emergencyContactPhone?: unknown;
  emergencyContactRelation?: unknown;
  permissionToLeave?: unknown;
  allergies?: unknown;
  additionalInfo?: unknown;
  termsAccepted?: unknown;
};

type RegisterRequest = {
  enrolment?: RegistrationPayload;
  turnstileToken?: unknown;
};

type TurnstileResponse = {
  success?: boolean;
  "error-codes"?: string[];
};

const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

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

const buildEnrolment = (payload: unknown) => {
  if (!isObject(payload)) {
    throw new Error("Invalid enrolment payload.");
  }

  const enrolment = payload as RegistrationPayload;
  const studentSubjects = cleanStringList(enrolment.studentSubjects);
  const classes = cleanClasses(enrolment.classes);

  const cleaned = {
    carerFirstName: cleanString(enrolment.carerFirstName, 120),
    carerLastName: cleanString(enrolment.carerLastName, 120),
    carerEmail: cleanString(enrolment.carerEmail, 180),
    carerPhone: cleanString(enrolment.carerPhone, 60),
    studentFirstName: cleanString(enrolment.studentFirstName, 120),
    studentLastName: cleanString(enrolment.studentLastName, 120),
    studentYear: cleanString(enrolment.studentYear, 40),
    studentSubjects,
    classes,
    emergencyContactFirstName: cleanString(
      enrolment.emergencyContactFirstName,
      120
    ),
    emergencyContactLastName: cleanString(
      enrolment.emergencyContactLastName,
      120
    ),
    emergencyContactPhone: cleanString(enrolment.emergencyContactPhone, 60),
    emergencyContactRelation: cleanString(
      enrolment.emergencyContactRelation,
      120
    ),
    permissionToLeave: enrolment.permissionToLeave === true,
    allergies: cleanString(enrolment.allergies, 500),
    additionalInfo: cleanString(enrolment.additionalInfo, 1500),
    termsAccepted: enrolment.termsAccepted === true,
    archived: false,
  };

  if (
    !cleaned.carerFirstName ||
    !cleaned.carerLastName ||
    !isEmail(cleaned.carerEmail) ||
    !cleaned.carerPhone ||
    !cleaned.studentFirstName ||
    !cleaned.studentLastName ||
    !cleaned.studentYear ||
    !cleaned.emergencyContactFirstName ||
    !cleaned.emergencyContactPhone ||
    !cleaned.emergencyContactRelation ||
    !cleaned.termsAccepted ||
    cleaned.studentSubjects.length === 0 ||
    cleaned.classes.length !== cleaned.studentSubjects.length
  ) {
    throw new Error("Invalid enrolment payload.");
  }

  return cleaned;
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

  const { enrolment, turnstileToken } = req.body as RegisterRequest;
  if (typeof turnstileToken !== "string" || !turnstileToken.trim()) {
    return res.status(403).json({ error: "Human verification required" });
  }

  let cleanedEnrolment: ReturnType<typeof buildEnrolment>;
  try {
    cleanedEnrolment = buildEnrolment(enrolment);
  } catch {
    return res.status(400).json({ error: "Invalid enrolment payload" });
  }

  try {
    const verified = await verifyTurnstile(turnstileToken, requestIp(req));
    if (!verified) {
      return res.status(403).json({ error: "Human verification failed" });
    }

    const docRef = await getAdminDb()
      .collection("enrolments")
      .add(cleanedEnrolment);

    return res.status(200).json({ ok: true, enrolmentId: docRef.id });
  } catch (error) {
    console.error("Registration submission failed:", error);
    return res.status(500).json({ error: "Failed to submit registration" });
  }
}
