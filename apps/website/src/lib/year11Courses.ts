/**
 * Year 11 senior-class options shared by the interest form and its API route.
 *
 * Maths and English use the same multi-select model: Standard cannot be
 * combined with Advanced or Extension 1 (a student is either doing the
 * Standard course or stepping up to Advanced/Extension), but Advanced and
 * Extension 1 can be selected together since Extension 1 is a separate
 * one-unit course layered on top.
 */

export const MATHS_COURSE_OPTIONS = [
  {
    code: "maths_standard",
    label: "Mathematics Standard",
    detail: "2 hours | $130 per session",
  },
  {
    code: "maths_advanced",
    label: "Mathematics Advanced",
    detail: "2 hours | $130 per session",
  },
  {
    code: "maths_extension_1",
    label: "Mathematics Extension 1",
    detail: "1.5 hours | $100 per session",
  },
] as const;

export const ENGLISH_COURSE_OPTIONS = [
  {
    code: "english_standard",
    label: "English Standard",
    detail: "2 hours | $130 per session",
  },
  {
    code: "english_advanced",
    label: "English Advanced",
    detail: "2 hours | $130 per session",
  },
  {
    code: "english_extension_1",
    label: "English Extension 1",
    detail: "1.5 hours | $100 per session",
  },
] as const;

export const PREFERRED_DAY_OPTIONS = [
  { code: "monday", label: "Monday" },
  { code: "tuesday", label: "Tuesday" },
  { code: "wednesday", label: "Wednesday" },
  { code: "thursday", label: "Thursday" },
  { code: "friday", label: "Friday" },
  { code: "no_preference", label: "No preference" },
] as const;

export const CURRENT_YEAR_OPTIONS = [
  { code: "year_10", label: "Year 10 (starting Year 11 next year)" },
  { code: "year_11", label: "Already in Year 11" },
] as const;

export const STUDENT_STATUS_OPTIONS = [
  { code: "continuing", label: "Currently attends Tenacity" },
  { code: "new", label: "New to Tenacity" },
] as const;

export type MathsCourseCode = (typeof MATHS_COURSE_OPTIONS)[number]["code"];
export type EnglishCourseCode = (typeof ENGLISH_COURSE_OPTIONS)[number]["code"];
export type PreferredDayCode = (typeof PREFERRED_DAY_OPTIONS)[number]["code"];
export type CurrentYearCode = (typeof CURRENT_YEAR_OPTIONS)[number]["code"];
export type StudentStatusCode = (typeof STUDENT_STATUS_OPTIONS)[number]["code"];

const codeMatcher =
  <T extends { code: string }>(options: readonly T[]) =>
  (value: string): value is T["code"] =>
    options.some((option) => option.code === value);

export const isMathsCourseCode = codeMatcher(MATHS_COURSE_OPTIONS);
export const isEnglishCourseCode = codeMatcher(ENGLISH_COURSE_OPTIONS);
export const isPreferredDayCode = codeMatcher(PREFERRED_DAY_OPTIONS);
export const isCurrentYearCode = codeMatcher(CURRENT_YEAR_OPTIONS);
export const isStudentStatusCode = codeMatcher(STUDENT_STATUS_OPTIONS);

const labelLookup =
  <T extends { code: string; label: string }>(options: readonly T[]) =>
  (value: string) =>
    options.find((option) => option.code === value)?.label ?? value;

export const mathsCourseLabel = labelLookup(MATHS_COURSE_OPTIONS);
export const englishCourseLabel = labelLookup(ENGLISH_COURSE_OPTIONS);
export const preferredDayLabel = labelLookup(PREFERRED_DAY_OPTIONS);
export const currentYearLabel = labelLookup(CURRENT_YEAR_OPTIONS);
export const studentStatusLabel = labelLookup(STUDENT_STATUS_OPTIONS);

export const MAX_STUDENTS_PER_INTEREST = 3;
export const MAX_PREFERRED_DAYS = PREFERRED_DAY_OPTIONS.length;

const isStandardCode = (code: string) => code.endsWith("_standard");

/**
 * Toggles a Maths or English course code in/out of a selection list, enforcing
 * that Standard can never sit alongside Advanced or Extension 1. Selecting
 * Standard clears any Advanced/Extension selections (and vice versa);
 * Advanced and Extension 1 can coexist.
 */
export const toggleCourseSelection = (list: string[], code: string) => {
  if (list.includes(code)) {
    return list.filter((item) => item !== code);
  }

  if (isStandardCode(code)) {
    return [code];
  }

  return [...list.filter((item) => !isStandardCode(item)), code];
};

/** True when a course selection mixes Standard with Advanced/Extension 1. */
export const hasConflictingCourseSelection = (codes: string[]) =>
  codes.some(isStandardCode) && codes.some((code) => !isStandardCode(code));

const NAMED_DAY_CODES = PREFERRED_DAY_OPTIONS.filter(
  (option) => option.code !== "no_preference"
).map((option) => option.code);

/**
 * Toggles a preferred-day code, keeping "No preference" mutually exclusive
 * with the named days: selecting it clears every named day, selecting a
 * named day clears it, and selecting every named day collapses the
 * selection to "No preference" instead.
 */
export const togglePreferredDay = (list: string[], code: string) => {
  if (code === "no_preference") {
    return list.includes("no_preference") ? [] : ["no_preference"];
  }

  const namedDays = list.filter((day) => day !== "no_preference");
  const next = namedDays.includes(code)
    ? namedDays.filter((day) => day !== code)
    : [...namedDays, code];

  return NAMED_DAY_CODES.every((day) => next.includes(day))
    ? ["no_preference"]
    : next;
};
