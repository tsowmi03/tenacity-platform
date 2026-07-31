/**
 * Labels for the codes stored by the public Year 11 interest form.
 *
 * This mirrors `apps/website/src/lib/year11Courses.ts`. The two apps share no
 * package, so the option codes must be kept in step by hand - if a course, day
 * or year option changes on the website, change it here too.
 */

export const MATHS_COURSE_OPTIONS = [
  { code: "maths_standard", label: "Mathematics Standard" },
  { code: "maths_advanced", label: "Mathematics Advanced" },
  { code: "maths_extension_1", label: "Mathematics Extension 1" },
];

export const ENGLISH_COURSE_OPTIONS = [
  { code: "english_standard", label: "English Standard" },
  { code: "english_advanced", label: "English Advanced" },
  { code: "english_extension_1", label: "English Extension 1" },
];

export const COURSE_OPTIONS = [
  ...MATHS_COURSE_OPTIONS,
  ...ENGLISH_COURSE_OPTIONS,
];

export const PREFERRED_DAY_OPTIONS = [
  { code: "monday", label: "Monday" },
  { code: "tuesday", label: "Tuesday" },
  { code: "wednesday", label: "Wednesday" },
  { code: "thursday", label: "Thursday" },
  { code: "friday", label: "Friday" },
  { code: "no_preference", label: "No preference" },
];

export const CURRENT_YEAR_OPTIONS = [
  { code: "year_10", label: "Year 10" },
  { code: "year_11", label: "Year 11" },
];

export const STUDENT_STATUS_OPTIONS = [
  { code: "continuing", label: "Current student" },
  { code: "new", label: "New family" },
];

function labelLookup(options) {
  return (value) => {
    const code = String(value || "");
    return options.find((option) => option.code === code)?.label || code;
  };
}

export const mathsCourseLabel = labelLookup(MATHS_COURSE_OPTIONS);
export const englishCourseLabel = labelLookup(ENGLISH_COURSE_OPTIONS);
export const courseLabel = labelLookup(COURSE_OPTIONS);
export const preferredDayLabel = labelLookup(PREFERRED_DAY_OPTIONS);
export const currentYearLabel = labelLookup(CURRENT_YEAR_OPTIONS);
export const studentStatusLabel = labelLookup(STUDENT_STATUS_OPTIONS);

/** Triage states. Rows without a stored status are treated as "new". */
export const INTEREST_STATUS_OPTIONS = [
  { code: "new", label: "New", tone: "info" },
  { code: "contacted", label: "Contacted", tone: "success" },
];

export const interestStatusLabel = labelLookup(INTEREST_STATUS_OPTIONS);

export function interestStatusTone(value) {
  const code = String(value || "");
  return INTEREST_STATUS_OPTIONS.find((o) => o.code === code)?.tone || "neutral";
}
