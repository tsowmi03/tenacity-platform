export const activeWaitlistStatuses = new Set(["active", "offered", "accepted"]);

export function waitlistEntryId(classId: string, studentId: string): string {
  return `${classId}_${studentId}`;
}

export function countsTowardWaitlist(status: unknown): boolean {
  return typeof status === "string" && activeWaitlistStatuses.has(status);
}

export function normalizeWaitlistReason(reason: unknown): "class_full" | "class_not_open" {
  if (reason === "classFull" || reason === "class_full") return "class_full";
  if (reason === "classNotOpen" || reason === "class_not_open") return "class_not_open";

  throw new Error("Invalid waitlist reason");
}
