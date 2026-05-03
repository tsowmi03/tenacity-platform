type NotificationAction = {
  type?: unknown;
  studentId?: unknown;
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function permanentSpotStudentIdsForNotification(
  beforeStudents: unknown,
  afterStudents: unknown,
  notificationAction?: NotificationAction,
): string[] {
  const before = stringArray(beforeStudents);
  const after = stringArray(afterStudents);

  return before
    .filter(studentId => !after.includes(studentId))
    .filter(studentId => {
      return !(
        notificationAction?.type === "direct_permanent_unenrollment" &&
        notificationAction.studentId === studentId
      );
    });
}

export function permanentSpotOpenedMessage(
  classData: Record<string, unknown>,
  formatTime: (time: string) => string,
): {
  title: string;
  body: string;
} {
  const day = typeof classData.day === "string" && classData.day.trim() !== ""
    ? classData.day
    : "a class day";
  const startTime = typeof classData.startTime === "string" && classData.startTime.trim() !== ""
    ? classData.startTime
    : "?";
  const start12 = formatTime(startTime);

  return {
    title: "Permanent Spot Opened!",
    body: `A permanent spot opened for ${day} at ${start12}.`,
  };
}
