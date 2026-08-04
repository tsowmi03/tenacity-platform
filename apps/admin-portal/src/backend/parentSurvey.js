/**
 * Labels and question text for the public parent feedback survey.
 *
 * This mirrors `apps/website/src/lib/parentFeedback.ts`. The two apps share no
 * package, so the option codes must be kept in step by hand - if a question or
 * option changes on the website, change it here too, and bump SURVEY_VERSION on
 * both sides so old responses stay readable.
 *
 * The wording is deliberately shortened from what parents see, so a statement
 * fits one line in a table column. The codes are what must match, not the text.
 */

export const SURVEY_VERSION = 2;

export const STUDENT_YEAR_OPTIONS = [
  { code: "years_5_6", label: "Years 5-6" },
  { code: "years_7_8", label: "Years 7-8" },
  { code: "years_9_10", label: "Years 9-10" },
  { code: "years_11_12", label: "Years 11-12" },
  { code: "multiple", label: "Different year groups" },
];

export const SUBJECT_OPTIONS = [
  { code: "maths", label: "Maths" },
  { code: "english", label: "English" },
];

export const SATISFACTION_OPTIONS = [
  { code: 1, label: "Very dissatisfied" },
  { code: 2, label: "Dissatisfied" },
  { code: 3, label: "Neither" },
  { code: 4, label: "Satisfied" },
  { code: 5, label: "Very satisfied" },
];

export const RATING_OPTIONS = [
  { code: 1, label: "Strongly disagree" },
  { code: 2, label: "Disagree" },
  { code: 3, label: "Neither" },
  { code: 4, label: "Agree" },
  { code: 5, label: "Strongly agree" },
  { code: "not_sure", label: "Not sure / NA" },
];

export const LESSON_QUESTIONS = [
  { id: "comfortable_asking", text: "Comfortable asking questions or saying when stuck" },
  { id: "clear_explanations", text: "Tutors explain difficult work understandably" },
  { id: "school_relevance", text: "Lessons connect with schoolwork and assessments" },
  { id: "individual_attention", text: "Enough individual attention during lessons" },
];

export const COMMUNICATION_QUESTIONS = [
  { id: "progress_feedback", text: "I understand how my child is progressing" },
  { id: "easy_contact", text: "Easy to contact Tenacity when I need help" },
  { id: "admin_clarity", text: "Timetables, cancellations, tokens and invoices are clear" },
];

export const ALL_STATEMENTS = [
  ...LESSON_QUESTIONS.map((question) => ({ ...question, section: "Lessons" })),
  ...COMMUNICATION_QUESTIONS.map((question) => ({
    ...question,
    section: "Communication",
  })),
];

export const APP_USAGE_OPTIONS = [
  { code: "regularly", label: "Regularly" },
  { code: "occasionally", label: "Occasionally" },
  { code: "rarely", label: "Rarely" },
  { code: "never", label: "Never used it" },
];

export const APP_USEFULNESS_OPTIONS = [
  { code: 1, label: "Not useful at all" },
  { code: 2, label: "Slightly useful" },
  { code: 3, label: "Moderately useful" },
  { code: 4, label: "Very useful" },
  { code: 5, label: "Extremely useful" },
];

export const APP_BARRIER_OPTIONS = [
  { code: "unaware", label: "Did not know it existed" },
  { code: "no_need", label: "Have not needed it" },
  { code: "sign_in", label: "Could not sign in" },
  { code: "prefer_direct", label: "Prefers contacting us directly" },
  { code: "other", label: "Another reason" },
];

function labelLookup(options) {
  return (value) => {
    const match = options.find((option) => String(option.code) === String(value ?? ""));
    return match?.label || (value == null || value === "" ? "-" : String(value));
  };
}

export const studentYearLabel = labelLookup(STUDENT_YEAR_OPTIONS);
export const subjectLabel = labelLookup(SUBJECT_OPTIONS);
export const satisfactionLabel = labelLookup(SATISFACTION_OPTIONS);
export const ratingLabel = labelLookup(RATING_OPTIONS);
export const appUsageLabel = labelLookup(APP_USAGE_OPTIONS);
export const appUsefulnessLabel = labelLookup(APP_USEFULNESS_OPTIONS);
export const appBarrierLabel = labelLookup(APP_BARRIER_OPTIONS);

export function statementText(id) {
  return ALL_STATEMENTS.find((statement) => statement.id === id)?.text || id;
}

/**
 * Tone for a 1-5 average, used to colour score bars.
 *
 * The thresholds are deliberately harsh: on an agreement scale a 3.5 average
 * means a large share of parents did not agree, which is worth flagging rather
 * than colouring green.
 */
export function scoreTone(average) {
  if (!Number.isFinite(average)) return "neutral";
  if (average >= 4.2) return "success";
  if (average >= 3.5) return "warn";
  return "danger";
}
