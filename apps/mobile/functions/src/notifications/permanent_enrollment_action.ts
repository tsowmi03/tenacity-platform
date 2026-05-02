const defaultMinimumStudentsToOpen = 2;

export type ParentPermanentEnrollmentState = "pending" | "open" | "full";

export function classEnrollmentState(classData: Record<string, unknown>): ParentPermanentEnrollmentState {
  const capacity = typeof classData.capacity === "number" ? classData.capacity : 0;
  const minimumStudentsToOpen = typeof classData.minStudentsToOpen === "number"
    ? classData.minStudentsToOpen
    : defaultMinimumStudentsToOpen;
  const enrolledStudents = Array.isArray(classData.enrolledStudents)
    ? classData.enrolledStudents
    : [];
  const permanentSpotsRemaining = Math.max(capacity - enrolledStudents.length, 0);

  if (permanentSpotsRemaining <= 0) return "full";
  if (enrolledStudents.length < minimumStudentsToOpen) return "pending";
  return "open";
}

export function canAcceptParentPermanentEnrollment(
  classData: Record<string, unknown>,
): boolean {
  return classEnrollmentState(classData) === "open";
}
