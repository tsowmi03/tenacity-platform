export const SURVEY_VERSION = 2;

export const STUDENT_YEAR_OPTIONS = [
  { value: "years_5_6", label: "Years 5–6" },
  { value: "years_7_8", label: "Years 7–8" },
  { value: "years_9_10", label: "Years 9–10" },
  { value: "years_11_12", label: "Years 11–12" },
  { value: "multiple", label: "Children in different year groups" },
] as const;

export const SUBJECT_OPTIONS = [
  { value: "maths", label: "Maths" },
  { value: "english", label: "English" },
] as const;

export const SATISFACTION_OPTIONS = [
  { value: 1, label: "Very dissatisfied" },
  { value: 2, label: "Dissatisfied" },
  { value: 3, label: "Neither satisfied nor dissatisfied" },
  { value: 4, label: "Satisfied" },
  { value: 5, label: "Very satisfied" },
] as const;

export const RATING_OPTIONS = [
  { value: 1, label: "Strongly disagree", shortLabel: "Strongly disagree" },
  { value: 2, label: "Disagree", shortLabel: "Disagree" },
  { value: 3, label: "Neither agree nor disagree", shortLabel: "Neutral" },
  { value: 4, label: "Agree", shortLabel: "Agree" },
  { value: 5, label: "Strongly agree", shortLabel: "Strongly agree" },
  { value: "not_sure", label: "Not sure or not applicable", shortLabel: "Not sure" },
] as const;

export type RatingValue = 1 | 2 | 3 | 4 | 5 | "not_sure";

export const LESSON_QUESTIONS = [
  {
    id: "comfortable_asking",
    text: "My child feels comfortable asking questions or saying when they are stuck.",
  },
  {
    id: "clear_explanations",
    text: "Tutors explain difficult work in a way my child can understand.",
  },
  {
    id: "school_relevance",
    text: "Lessons connect with my child’s schoolwork and assessments.",
  },
  {
    id: "individual_attention",
    text: "My child receives enough individual attention during lessons.",
  },
] as const;

export const COMMUNICATION_QUESTIONS = [
  {
    id: "progress_feedback",
    text: "I understand how my child is progressing.",
  },
  {
    id: "easy_contact",
    text: "It is easy to contact Tenacity when I need help.",
  },
  {
    id: "admin_clarity",
    text: "Timetables, cancellations, lesson tokens and invoices are clear.",
  },
] as const;

export const APP_USAGE_OPTIONS = [
  { value: "regularly", label: "Regularly" },
  { value: "occasionally", label: "Occasionally" },
  { value: "rarely", label: "Rarely" },
  { value: "never", label: "I have not used it" },
] as const;

export const APP_USEFULNESS_OPTIONS = [
  { value: 1, label: "Not useful at all" },
  { value: 2, label: "Slightly useful" },
  { value: 3, label: "Moderately useful" },
  { value: 4, label: "Very useful" },
  { value: 5, label: "Extremely useful" },
] as const;

export const APP_BARRIER_OPTIONS = [
  { value: "unaware", label: "I did not know the app was available" },
  { value: "no_need", label: "I have not needed it" },
  { value: "sign_in", label: "I could not sign in or access my account" },
  { value: "prefer_direct", label: "I prefer contacting Tenacity directly" },
  { value: "other", label: "Another reason" },
] as const;
