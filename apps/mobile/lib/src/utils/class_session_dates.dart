class _SessionTime {
  final int hour;
  final int minute;

  const _SessionTime(this.hour, this.minute);
}

const Map<String, int> _weekdayByClassDay = {
  'monday': DateTime.monday,
  'tuesday': DateTime.tuesday,
  'wednesday': DateTime.wednesday,
  'thursday': DateTime.thursday,
  'friday': DateTime.friday,
  'saturday': DateTime.saturday,
  'sunday': DateTime.sunday,
};

int _weekdayForClassDay(String classDay) {
  return _weekdayByClassDay[classDay.trim().toLowerCase()] ?? DateTime.monday;
}

_SessionTime _parseSessionTime(String startTime) {
  final parts = startTime.split(':');
  return _SessionTime(int.parse(parts[0]), int.parse(parts[1]));
}

DateTime classSessionDateForWeek({
  required DateTime termStartDate,
  required String classDay,
  required String startTime,
  required int weekNumber,
}) {
  final termStartDay = DateTime(
    termStartDate.year,
    termStartDate.month,
    termStartDate.day,
  );
  final firstTermWeekStart = termStartDay.subtract(
    Duration(days: termStartDay.weekday - DateTime.monday),
  );
  final classWeekday = _weekdayForClassDay(classDay);
  final weekOffset = (weekNumber < 1 ? 1 : weekNumber) - 1;
  final sessionDay = firstTermWeekStart.add(
    Duration(
      days: weekOffset * DateTime.daysPerWeek + classWeekday - DateTime.monday,
    ),
  );
  final sessionTime = _parseSessionTime(startTime);

  return DateTime(
    sessionDay.year,
    sessionDay.month,
    sessionDay.day,
    sessionTime.hour,
    sessionTime.minute,
  );
}
