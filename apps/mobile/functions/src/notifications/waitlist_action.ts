export const waitlistStatuses = new Set([
  "active",
  "offered",
  "accepted",
  "declined",
  "expired",
  "cancelled",
  "promoted",
]);

export const activeWaitlistStatuses = new Set(["active", "offered", "accepted"]);

const parentMutableWaitlistStatuses = new Set(["accepted", "declined", "cancelled"]);

export function waitlistEntryId(classId: string, studentId: string): string {
  return `${classId}_${studentId}`;
}

export function countsTowardWaitlist(status: unknown): boolean {
  return typeof status === "string" && activeWaitlistStatuses.has(status);
}

export function countsTowardOpenOffers(status: unknown): boolean {
  return status === "offered" || status === "accepted";
}

export function normalizeWaitlistStatus(status: unknown): string {
  if (typeof status === "string" && waitlistStatuses.has(status)) return status;
  throw new Error("Invalid waitlist status");
}

export function waitlistStatusCounterDeltas(
  previousStatus: unknown,
  nextStatus: unknown,
): {
  waitlistCount: number;
  openOfferCount: number;
} {
  return {
    waitlistCount: countDelta(
      countsTowardWaitlist(previousStatus),
      countsTowardWaitlist(nextStatus),
    ),
    openOfferCount: countDelta(
      countsTowardOpenOffers(previousStatus),
      countsTowardOpenOffers(nextStatus),
    ),
  };
}

export function shouldNotifyWaitlistReactivated(
  previousStatus: unknown,
  nextStatus: unknown,
): boolean {
  return previousStatus !== "active" && nextStatus === "active";
}

export function canPerformWaitlistStatusUpdate(params: {
  actorId: string;
  actorRole: unknown;
  entryParentId: unknown;
  nextStatus: unknown;
}): boolean {
  const { actorId, actorRole, entryParentId, nextStatus } = params;
  if (actorRole === "admin") return true;
  return entryParentId === actorId && parentMutableWaitlistStatuses.has(nextStatus as string);
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

function countDelta(wasCounting: boolean, isCounting: boolean): number {
  if (wasCounting === isCounting) return 0;
  return isCounting ? 1 : -1;
}
