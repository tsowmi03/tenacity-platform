import 'package:intl/intl.dart';

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

/// The Monday of [week], counting from the Monday on or before the term start.
///
/// Weeks are whole Mondays even when a term starts mid-week, so week 1 of a
/// term beginning on a Wednesday still runs from the Monday before it.
DateTime startOfTermWeek(DateTime termStart, int week) {
  final firstMonday = DateTime(termStart.year, termStart.month, termStart.day)
      .subtract(Duration(days: termStart.weekday - DateTime.monday));
  return firstMonday.add(Duration(days: (week - 1) * 7));
}

/// `13 – 19 Jul`, or `29 Jun – 5 Jul` when the week straddles two months.
String weekRangeLabel(DateTime weekStart) {
  final weekEnd = weekStart.add(const Duration(days: 6));
  if (weekStart.month == weekEnd.month) {
    return '${weekStart.day} – ${DateFormat('d MMM').format(weekEnd)}';
  }
  return '${DateFormat('d MMM').format(weekStart)} – '
      '${DateFormat('d MMM').format(weekEnd)}';
}

/// The term week [now] falls in, clamped to the term's own bounds.
///
/// Before the term starts this is week 1, and after it ends the final week —
/// a date outside the term has no meaningful week, and clamping keeps callers
/// from indexing past either end.
int currentTermWeek({
  required DateTime termStart,
  required int totalWeeks,
  required DateTime now,
}) {
  if (totalWeeks < 1) return 1;
  if (now.isBefore(termStart)) return 1;
  return ((now.difference(termStart).inDays ~/ 7) + 1).clamp(1, totalWeeks);
}
