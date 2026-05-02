const defaultMinimumStudentsToOpen = 2;

export type ParentPermanentEnrollmentState = "pending" | "open" | "full";

export function permanentSpotsRemaining(classData: Record<string, unknown>): number {
  const capacity = typeof classData.capacity === "number" ? classData.capacity : 0;
  const enrolledStudents = Array.isArray(classData.enrolledStudents)
    ? classData.enrolledStudents
    : [];
  return Math.max(capacity - enrolledStudents.length, 0);
}

export function classEnrollmentState(classData: Record<string, unknown>): ParentPermanentEnrollmentState {
  const minimumStudentsToOpen = typeof classData.minStudentsToOpen === "number"
    ? classData.minStudentsToOpen
    : defaultMinimumStudentsToOpen;
  const enrolledStudents = Array.isArray(classData.enrolledStudents)
    ? classData.enrolledStudents
    : [];
  const spotsRemaining = permanentSpotsRemaining(classData);

  if (spotsRemaining <= 0) return "full";
  if (enrolledStudents.length < minimumStudentsToOpen) return "pending";
  return "open";
}

export function canAcceptParentPermanentEnrollment(
  classData: Record<string, unknown>,
): boolean {
  return classEnrollmentState(classData) === "open";
}
