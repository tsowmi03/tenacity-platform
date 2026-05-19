import { DateTime } from "luxon";

export const SYDNEY_TZ = "Australia/Sydney";

const WEEKDAY_BY_CLASS_DAY: Record<string, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

function weekdayForClassDay(classDay?: string): number {
  if (!classDay) {
    return 1;
  }
  return WEEKDAY_BY_CLASS_DAY[classDay.trim().toLowerCase()] ?? 1;
}

function parseStartTime(startTime?: string): { hour: number; minute: number } {
  if (!startTime || !startTime.includes(":")) {
    return { hour: 0, minute: 0 };
  }

  const [hour, minute] = startTime.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return { hour: 0, minute: 0 };
  }

  return { hour, minute };
}

export function classSessionDateForWeek(params: {
  termStart: Date;
  classDay?: string;
  startTime?: string;
  weekNumber: number;
}): Date {
  const termStartSydney = DateTime
    .fromJSDate(params.termStart, { zone: SYDNEY_TZ })
    .startOf("day");
  const firstTermWeekStartSydney = termStartSydney.minus({
    days: termStartSydney.weekday - 1,
  });
  const classWeekday = weekdayForClassDay(params.classDay);
  const weekOffset = Math.max(params.weekNumber, 1) - 1;
  const { hour, minute } = parseStartTime(params.startTime);

  return firstTermWeekStartSydney
    .plus({ days: weekOffset * 7 + classWeekday - 1 })
    .set({ hour, minute, second: 0, millisecond: 0 })
    .toJSDate();
}

export function attendanceDateMatchesClassDay(
  attendanceDate: Date,
  classDay: string,
  timeZone = SYDNEY_TZ
): boolean {
  return DateTime.fromJSDate(attendanceDate, { zone: timeZone }).weekday ===
    weekdayForClassDay(classDay);
}

export function classDayNameForDate(
  date: Date,
  timeZone = SYDNEY_TZ
): string {
  return DateTime.fromJSDate(date, { zone: timeZone }).toFormat("cccc");
}

export function shouldProcessReminderAttendance(params: {
  cancelled?: unknown;
  attendanceDate: Date;
  classDay?: string;
  timeZone?: string;
}): boolean {
  if (params.cancelled === true) {
    return false;
  }

  if (!params.classDay) {
    return true;
  }

  return attendanceDateMatchesClassDay(
    params.attendanceDate,
    params.classDay,
    params.timeZone
  );
}
