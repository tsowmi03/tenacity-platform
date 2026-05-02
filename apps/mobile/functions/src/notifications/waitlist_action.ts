export const activeWaitlistStatuses = new Set(["active", "offered", "accepted"]);

export function waitlistEntryId(classId: string, studentId: string): string {
  return `${classId}_${studentId}`;
}

export function countsTowardWaitlist(status: unknown): boolean {
  return typeof status === "string" && activeWaitlistStatuses.has(status);
}

export function countsTowardOpenOffers(status: unknown): boolean {
  return status === "offered" || status === "accepted";
}

export function waitlistDisplayDay(waitlistEntry: Record<string, unknown>): string {
  const day = waitlistEntry.day;
  if (typeof day === "string" && day.trim() !== "") return day;

  const dayOfWeek = waitlistEntry.dayOfWeek;
  if (typeof dayOfWeek === "string" && dayOfWeek.trim() !== "") return dayOfWeek;

  return "Unknown day";
}

export function normalizeWaitlistReason(reason: unknown): "class_full" | "class_not_open" {
  if (reason === "classFull" || reason === "class_full") return "class_full";
  if (reason === "classNotOpen" || reason === "class_not_open") return "class_not_open";

  throw new Error("Invalid waitlist reason");
}
