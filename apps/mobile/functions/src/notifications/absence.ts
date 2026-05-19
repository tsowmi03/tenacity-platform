import { DateTime } from "luxon";

type TimestampLike = {
  toDate: () => Date;
};

export function timestampToDate(value: unknown): Date | null {
  if (value && typeof (value as TimestampLike).toDate === "function") {
    return (value as TimestampLike).toDate();
  }
  if (value instanceof Date) {
    return value;
  }
  if (
    value &&
    typeof value === "object" &&
    typeof (value as { _seconds?: unknown })._seconds === "number"
  ) {
    return new Date((value as { _seconds: number })._seconds * 1000);
  }
  return null;
}

export function formatSydneyAttendanceDate(
  attendanceDate: Date | null,
  fallbackDay: string,
): string {
  return attendanceDate
    ? DateTime.fromJSDate(attendanceDate).setZone("Australia/Sydney").toFormat("cccc d LLLL")
    : fallbackDay;
}

export function shouldAwardAbsenceLessonToken(
  attendanceDate: Date,
  now: Date = new Date(),
): boolean {
  const attendanceSydney = DateTime.fromJSDate(attendanceDate, {
    zone: "Australia/Sydney",
  });
  const cutoff = attendanceSydney.set({
    hour: 10,
    minute: 0,
    second: 0,
    millisecond: 0,
  });

  return DateTime.fromJSDate(now, { zone: "Australia/Sydney" }) < cutoff;
}
