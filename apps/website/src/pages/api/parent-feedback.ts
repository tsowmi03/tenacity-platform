import type { NextApiRequest, NextApiResponse } from "next";
import { FieldValue } from "firebase-admin/firestore";
import { sendAdminNotification } from "@lib/adminNotification";
import { getAdminDb } from "@lib/firebaseAdmin";
import {
  APP_BARRIER_OPTIONS,
  APP_QUESTIONS,
  APP_USAGE_OPTIONS,
  COMMUNICATION_QUESTIONS,
  IMPROVEMENT_OPTIONS,
  LESSON_QUESTIONS,
  MAX_IMPROVEMENT_PRIORITIES,
  RATING_OPTIONS,
  STUDENT_YEAR_OPTIONS,
  SUBJECT_OPTIONS,
  SURVEY_VERSION,
  TENURE_OPTIONS,
  type RatingValue,
} from "@lib/parentFeedback";

type UnknownRecord = Record<string, unknown>;

const isObject = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const cleanString = (value: unknown, maxLength: number) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const optionValues = <T extends readonly { value: string }[]>(options: T) =>
  new Set(options.map((option) => option.value));

const studentYears = optionValues(STUDENT_YEAR_OPTIONS);
const tenures = optionValues(TENURE_OPTIONS);
const subjects = optionValues(SUBJECT_OPTIONS);
const appUsages = optionValues(APP_USAGE_OPTIONS);
const appBarriers = optionValues(APP_BARRIER_OPTIONS);
const improvementPriorities = optionValues(IMPROVEMENT_OPTIONS);
const ratingValues = new Set<RatingValue>(
  RATING_OPTIONS.map((option) => option.value)
);

const cleanRequiredOption = (
  value: unknown,
  allowed: ReadonlySet<string>,
  name: string
) => {
  const cleaned = cleanString(value, 80);
  if (!allowed.has(cleaned)) throw new Error(`Invalid ${name}.`);
  return cleaned;
};

const cleanOptionList = (
  value: unknown,
  allowed: ReadonlySet<string>,
  maxItems: number,
  name: string
) => {
  if (!Array.isArray(value)) throw new Error(`Invalid ${name}.`);

  const cleaned = Array.from(
    new Set(value.map((item) => cleanString(item, 80)).filter(Boolean))
  );

  if (
    cleaned.length === 0 ||
    cleaned.length > maxItems ||
    cleaned.some((item) => !allowed.has(item))
  ) {
    throw new Error(`Invalid ${name}.`);
  }

  return cleaned;
};

const cleanRatings = (
  value: unknown,
  questions: readonly { id: string }[],
  name: string
) => {
  if (!isObject(value)) throw new Error(`Invalid ${name}.`);

  const expected = new Set(questions.map((question) => question.id));
  const keys = Object.keys(value);
  if (keys.length !== expected.size || keys.some((key) => !expected.has(key))) {
    throw new Error(`Invalid ${name}.`);
  }

  return Object.fromEntries(
    questions.map((question) => {
      const rating = value[question.id];
      if (!ratingValues.has(rating as RatingValue)) {
        throw new Error(`Invalid ${name}.`);
      }
      return [question.id, rating as RatingValue];
    })
  );
};

const isEmail = (value: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);

const buildResponse = (body: unknown) => {
  if (!isObject(body)) throw new Error("Invalid survey payload.");

  const context = isObject(body.context) ? body.context : {};
  const app = isObject(body.app) ? body.app : {};
  const comments = isObject(body.comments) ? body.comments : {};
  const followUp = isObject(body.followUp) ? body.followUp : {};

  const appUsage = cleanRequiredOption(app.usage, appUsages, "app usage");
  const cleanedApp =
    appUsage === "never"
      ? {
          usage: appUsage,
          barriers: cleanOptionList(
            app.barriers,
            appBarriers,
            APP_BARRIER_OPTIONS.length,
            "app barriers"
          ),
          otherBarrier: cleanString(app.otherBarrier, 500),
          ratings: null,
          improvement: "",
        }
      : {
          usage: appUsage,
          barriers: [] as string[],
          otherBarrier: "",
          ratings: cleanRatings(app.ratings, APP_QUESTIONS, "app ratings"),
          improvement: cleanString(app.improvement, 1500),
        };

  if (
    cleanedApp.barriers.includes("other") &&
    !cleanedApp.otherBarrier
  ) {
    throw new Error("Missing app barrier detail.");
  }

  const recommendation = Number(body.recommendation);
  if (!Number.isInteger(recommendation) || recommendation < 0 || recommendation > 10) {
    throw new Error("Invalid recommendation rating.");
  }

  const strengths = cleanString(comments.strengths, 2000);
  const change = cleanString(comments.change, 2000);
  const missing = cleanString(comments.missing, 1500);
  if (!strengths && !change && !missing) {
    throw new Error("At least one written response is required.");
  }

  const wantsFollowUp = followUp.requested === true;
  const name = wantsFollowUp ? cleanString(followUp.name, 160) : "";
  const email = wantsFollowUp ? cleanString(followUp.email, 180) : "";
  if (wantsFollowUp && (!name || !isEmail(email))) {
    throw new Error("Invalid follow-up details.");
  }

  return {
    surveyVersion: SURVEY_VERSION,
    context: {
      studentYear: cleanRequiredOption(
        context.studentYear,
        studentYears,
        "student year"
      ),
      tenure: cleanRequiredOption(context.tenure, tenures, "tenure"),
      subjects: cleanOptionList(
        context.subjects,
        subjects,
        SUBJECT_OPTIONS.length,
        "subjects"
      ),
    },
    lessons: cleanRatings(body.lessons, LESSON_QUESTIONS, "lesson ratings"),
    communication: cleanRatings(
      body.communication,
      COMMUNICATION_QUESTIONS,
      "communication ratings"
    ),
    app: cleanedApp,
    improvementPriorities: cleanOptionList(
      body.improvementPriorities,
      improvementPriorities,
      MAX_IMPROVEMENT_PRIORITIES,
      "improvement priorities"
    ),
    recommendation,
    comments: { strengths, change, missing },
    followUp: wantsFollowUp
      ? { requested: true, name, email }
      : { requested: false, name: "", email: "" },
  };
};

const labelFor = (
  value: string,
  options: readonly { value: string; label: string }[]
) => options.find((option) => option.value === value)?.label ?? value;

const ratingLabel = (value: RatingValue) =>
  RATING_OPTIONS.find((option) => option.value === value)?.label ?? String(value);

const ratingDetails = (
  heading: string,
  ratings: Record<string, RatingValue>,
  questions: readonly { id: string; text: string }[]
) => [
  heading,
  ...questions.map(
    (question) => `${question.text} — ${ratingLabel(ratings[question.id])}`
  ),
];

const notificationDetails = (response: ReturnType<typeof buildResponse>) => {
  const details = [
    `Student years: ${labelFor(response.context.studentYear, STUDENT_YEAR_OPTIONS)}`,
    `Time with Tenacity: ${labelFor(response.context.tenure, TENURE_OPTIONS)}`,
    `Subjects: ${response.context.subjects
      .map((subject) => labelFor(subject, SUBJECT_OPTIONS))
      .join(", ")}`,
    ...ratingDetails("LESSONS", response.lessons, LESSON_QUESTIONS),
    ...ratingDetails(
      "PROGRESS, COMMUNICATION AND ADMIN",
      response.communication,
      COMMUNICATION_QUESTIONS
    ),
    `App use: ${labelFor(response.app.usage, APP_USAGE_OPTIONS)}`,
  ];

  if (response.app.ratings) {
    details.push(...ratingDetails("MOBILE APP", response.app.ratings, APP_QUESTIONS));
    details.push(`Requested app improvement: ${response.app.improvement || "-"}`);
  } else {
    details.push(
      `Reasons for not using app: ${response.app.barriers
        .map((barrier) => labelFor(barrier, APP_BARRIER_OPTIONS))
        .join(", ")}`
    );
    if (response.app.otherBarrier) {
      details.push(`Other app reason: ${response.app.otherBarrier}`);
    }
  }

  details.push(
    `Improvement priorities: ${response.improvementPriorities
      .map((priority) => labelFor(priority, IMPROVEMENT_OPTIONS))
      .join(", ")}`,
    `Recommendation: ${response.recommendation}/10`,
    `What Tenacity does well: ${response.comments.strengths || "-"}`,
    `One change: ${response.comments.change || "-"}`,
    `What is missing: ${response.comments.missing || "-"}`,
    response.followUp.requested
      ? `Follow-up requested: ${response.followUp.name} (${response.followUp.email})`
      : "Follow-up requested: No"
  );

  return details;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (Number(req.headers["content-length"] ?? 0) > 30_000) {
    return res.status(413).json({ error: "Survey response is too large" });
  }

  const body = req.body as UnknownRecord;
  // A hidden field catches basic automated submissions. Return success so a
  // bot does not learn which part of its payload caused the rejection.
  if (cleanString(body?.website, 200)) {
    return res.status(200).json({ ok: true });
  }

  let surveyResponse: ReturnType<typeof buildResponse>;
  try {
    surveyResponse = buildResponse(body);
  } catch {
    return res.status(400).json({ error: "Invalid survey response" });
  }

  try {
    const responseRef = await getAdminDb().collection("parentSurveyResponses").add({
      ...surveyResponse,
      createdAt: FieldValue.serverTimestamp(),
      source: "public-website",
      archived: false,
    });

    // The Firestore response is the source of truth. Email is an alert only;
    // a notification failure must not make a parent resubmit the same answers.
    try {
      await sendAdminNotification({
        subject: `New parent feedback (${surveyResponse.recommendation}/10)`,
        heading: "New parent feedback",
        intro: surveyResponse.followUp.requested
          ? "A parent submitted feedback and asked to be contacted."
          : "A parent submitted an anonymous feedback response.",
        details: notificationDetails(surveyResponse),
      });
    } catch (error) {
      console.error("Parent feedback notification failed:", error);
    }

    return res.status(200).json({ ok: true, responseId: responseRef.id });
  } catch (error) {
    console.error("Parent feedback submission failed:", error);
    return res.status(500).json({ error: "Failed to submit parent feedback" });
  }
}
