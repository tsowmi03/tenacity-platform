import { classSessionDateForWeek } from "./class_schedule_dates";

export type AttendanceDateBackfillPlan =
  | { action: "skip"; reason: string }
  | {
      action: "update";
      existingDate: Date;
      correctedDate: Date;
      deltaMs: number;
    };

const VALID_CLASS_DAYS = new Set([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return parsed > 0 ? parsed : undefined;
  }
  return undefined;
}

function isValidClassDay(value: string): boolean {
  return VALID_CLASS_DAYS.has(value.trim().toLowerCase());
}

function isValidStartTime(value: string): boolean {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return false;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

export function attendanceTermIdForDoc(
  attendanceDocId: string,
  data: Record<string, unknown>
): string | null {
  const termId = optionalString(data.termId);
  if (termId) return termId;

  const rawId = optionalString(data.id) ?? attendanceDocId;
  const match = rawId.match(/^([A-Za-z0-9]+_T\d+)/);
  return match ? match[1] : null;
}

export function attendanceWeekNumberForDoc(
  attendanceDocId: string,
  data: Record<string, unknown>
): number | null {
  const explicitWeek = positiveInteger(data.weekNum) ??
    positiveInteger(data.weekNumber);
  if (explicitWeek) return explicitWeek;

  const rawId = optionalString(data.id) ?? attendanceDocId;
  const match = rawId.match(/_W(\d+)$/);
  if (!match) return null;

  const parsed = Number(match[1]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function buildAttendanceDateBackfillPlan(params: {
  existingDate: Date | null;
  termStart: Date;
  classDay: unknown;
  startTime: unknown;
  weekNumber: number | null;
  fromDate: Date;
  toleranceMs?: number;
}): AttendanceDateBackfillPlan {
  const toleranceMs = params.toleranceMs ?? 1000;

  if (!params.existingDate) {
    return { action: "skip", reason: "missing-date" };
  }
  if (!params.weekNumber) {
    return { action: "skip", reason: "missing-week" };
  }
  if (typeof params.classDay !== "string" || !params.classDay.trim()) {
    return { action: "skip", reason: "missing-class-day" };
  }
  if (!isValidClassDay(params.classDay)) {
    return { action: "skip", reason: "invalid-class-day" };
  }
  if (typeof params.startTime !== "string" || !params.startTime.trim()) {
    return { action: "skip", reason: "missing-start-time" };
  }
  if (!isValidStartTime(params.startTime)) {
    return { action: "skip", reason: "invalid-start-time" };
  }

  const correctedDate = classSessionDateForWeek({
    termStart: params.termStart,
    classDay: params.classDay,
    startTime: params.startTime,
    weekNumber: params.weekNumber,
  });

  if (
    params.existingDate < params.fromDate &&
    correctedDate < params.fromDate
  ) {
    return { action: "skip", reason: "past" };
  }

  const deltaMs = correctedDate.getTime() - params.existingDate.getTime();
  if (Math.abs(deltaMs) <= toleranceMs) {
    return { action: "skip", reason: "already-correct" };
  }

  return {
    action: "update",
    existingDate: params.existingDate,
    correctedDate,
    deltaMs,
  };
}
