export const SURVEY_VERSION = 1;

export const STUDENT_YEAR_OPTIONS = [
  { value: "years_5_6", label: "Years 5–6" },
  { value: "years_7_8", label: "Years 7–8" },
  { value: "years_9_10", label: "Years 9–10" },
  { value: "years_11_12", label: "Years 11–12" },
  { value: "multiple", label: "Children in different year groups" },
] as const;

export const TENURE_OPTIONS = [
  { value: "under_term", label: "Less than one term" },
  { value: "one_two_terms", label: "One or two terms" },
  { value: "over_year", label: "More than one year" },
] as const;

export const SUBJECT_OPTIONS = [
  { value: "maths", label: "Maths" },
  { value: "english", label: "English" },
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
    text: "Tutors explain difficult ideas in a way my child can understand.",
  },
  {
    id: "school_relevance",
    text: "Lesson work connects with what my child is learning or being assessed on at school.",
  },
  {
    id: "individual_attention",
    text: "My child receives enough individual attention during the group lesson.",
  },
  {
    id: "pace_and_challenge",
    text: "The pace and level of challenge are right for my child.",
  },
  {
    id: "next_steps",
    text: "My child leaves lessons knowing what they understand and what to work on next.",
  },
] as const;

export const COMMUNICATION_QUESTIONS = [
  {
    id: "progress_feedback",
    text: "Tutor feedback helps me understand how my child is progressing.",
  },
  {
    id: "early_concerns",
    text: "Tenacity lets me know about learning concerns early enough for us to act on them.",
  },
  {
    id: "easy_contact",
    text: "It is easy to contact Tenacity when I have a question.",
  },
  {
    id: "useful_updates",
    text: "Messages and announcements give me the information I need.",
  },
  {
    id: "booking_clarity",
    text: "Timetables, cancellations, make-up lessons and lesson tokens are clear.",
  },
  {
    id: "billing_clarity",
    text: "Invoices and payment information are easy to understand.",
  },
] as const;

export const APP_USAGE_OPTIONS = [
  { value: "weekly", label: "At least weekly" },
  { value: "monthly", label: "A few times a month" },
  { value: "rarely", label: "Rarely" },
  { value: "never", label: "I have not used it" },
] as const;

export const APP_QUESTIONS = [
  {
    id: "dashboard",
    text: "The dashboard gives me a useful summary of classes, messages, invoices and recent feedback.",
  },
  {
    id: "timetable",
    text: "The timetable makes my child's upcoming lessons easy to understand.",
  },
  {
    id: "booking_changes",
    text: "Booking, cancelling or changing a lesson is straightforward.",
  },
  {
    id: "messages",
    text: "Messages make it easy to communicate with Tenacity.",
  },
  {
    id: "feedback",
    text: "Tutor feedback is easy to find and useful when I read it.",
  },
  {
    id: "invoices",
    text: "Invoices and payments are easy to manage in the app.",
  },
  {
    id: "notifications",
    text: "Announcements, reminders and other notifications are timely and useful.",
  },
] as const;

export const APP_BARRIER_OPTIONS = [
  { value: "unaware", label: "I did not know the app was available" },
  { value: "no_need", label: "I have not needed it" },
  { value: "sign_in", label: "I could not sign in or access my account" },
  { value: "prefer_direct", label: "I prefer contacting Tenacity directly" },
  { value: "other", label: "Another reason" },
] as const;

export const IMPROVEMENT_OPTIONS = [
  { value: "individual_attention", label: "More individual attention in lessons" },
  { value: "teaching_explanations", label: "Clearer teaching and explanations" },
  { value: "school_alignment", label: "Closer connection to schoolwork and assessments" },
  { value: "practice_resources", label: "More practice, homework or learning resources" },
  { value: "progress_feedback", label: "More regular feedback about progress" },
  { value: "parent_contact", label: "More communication with parents" },
  { value: "tutor_consistency", label: "Greater consistency between tutors" },
  { value: "booking_flexibility", label: "Easier scheduling, cancellations or make-up lessons" },
  { value: "billing_admin", label: "Clearer invoices, payments or administration" },
  { value: "mobile_app", label: "Improvements to the mobile app" },
  { value: "new_classes", label: "More subjects, year groups or class times" },
] as const;

export const MAX_IMPROVEMENT_PRIORITIES = 3;

export const lessonQuestionIds = LESSON_QUESTIONS.map((question) => question.id);
export const communicationQuestionIds = COMMUNICATION_QUESTIONS.map(
  (question) => question.id
);
export const appQuestionIds = APP_QUESTIONS.map((question) => question.id);
