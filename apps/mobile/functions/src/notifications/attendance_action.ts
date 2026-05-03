type NotificationAction = {
  type?: unknown;
  studentId?: unknown;
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function attendanceAddedStudentIdsForNotification(
  beforeAttendance: unknown,
  afterAttendance: unknown,
  notificationAction?: NotificationAction,
): string[] {
  const before = stringArray(beforeAttendance);
  const after = stringArray(afterAttendance);

  return after
    .filter(studentId => !before.includes(studentId))
    .filter(studentId => {
      return !(
        notificationAction?.type === "one_off_enrollment" &&
        notificationAction.studentId === studentId
      );
    });
}

export function attendanceRemovedStudentIdsForNotification(
  beforeAttendance: unknown,
  afterAttendance: unknown,
  notificationAction?: NotificationAction,
): string[] {
  const before = stringArray(beforeAttendance);
  const after = stringArray(afterAttendance);

  return before
    .filter(studentId => !after.includes(studentId))
    .filter(studentId => {
      return !(
        (
          notificationAction?.type === "notify_absence" ||
          notificationAction?.type === "cancel_student_for_week"
        ) &&
        notificationAction.studentId === studentId
      );
    });
}

export function studentAddedNotificationBody(params: {
  studentName: string;
  classDay: string;
  classTime: string;
  attendanceDateText: string;
}): string {
  const { studentName, classDay, classTime, attendanceDateText } = params;
  return `${studentName} has been added to ${classDay} at ${classTime} on ${attendanceDateText}.`;
}

export function studentAbsentNotificationBody(params: {
  studentName: string;
  classDay: string;
  classTime: string;
  attendanceDateText: string;
}): string {
  const { studentName, classDay, classTime, attendanceDateText } = params;
  return `${studentName} will be absent from ${classDay} at ${classTime} on ${attendanceDateText}.`;
}
