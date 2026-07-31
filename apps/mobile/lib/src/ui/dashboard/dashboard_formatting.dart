import 'package:intl/intl.dart';

/// Formatting shared by the role dashboards.
///
/// These live together so the same class name, duration or relative date reads
/// identically whichever dashboard a user is looking at.

/// `Good morning` / `Good afternoon` / `Good evening` for a local hour.
String dashboardGreeting(int hour) {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/// The end of a session that starts at [startsAt] and finishes at the wall
/// clock time [endTime] (`HH:mm`). Falls back to one hour when [endTime] cannot
/// be parsed, which matches the standard class length.
DateTime sessionEndFor(DateTime startsAt, String endTime) {
  final parts = endTime.split(':');
  if (parts.length != 2) return startsAt.add(const Duration(hours: 1));

  final hour = int.tryParse(parts[0]);
  final minute = int.tryParse(parts[1]);
  if (hour == null || minute == null) {
    return startsAt.add(const Duration(hours: 1));
  }

  return DateTime(startsAt.year, startsAt.month, startsAt.day, hour, minute);
}

/// `1 hr`, `2 hrs`, `1.5 hrs`, `45 min`.
String durationLabelFor(Duration duration) {
  final minutes = duration.inMinutes;
  if (minutes <= 0) return '1 hr';
  if (minutes == 60) return '1 hr';
  if (minutes % 60 == 0) return '${minutes ~/ 60} hrs';
  if (minutes > 60) {
    final hours = (minutes / 60).toStringAsFixed(1);
    return '$hours hrs';
  }
  return '$minutes min';
}

/// `Today`, `Yesterday`, `Tomorrow`, else `Wed 15 Jul`.
String relativeDayLabel(DateTime date, DateTime now) {
  final day = DateTime(date.year, date.month, date.day);
  final today = DateTime(now.year, now.month, now.day);
  final difference = today.difference(day).inDays;
  if (difference == 0) return 'Today';
  if (difference == 1) return 'Yesterday';
  if (difference == -1) return 'Tomorrow';
  return DateFormat('EEE d MMM').format(date);
}

/// How long ago something was posted: `just now`, `3h ago`, `yesterday`,
/// `4d ago`, else an absolute `15 Jul`.
String relativeAgeLabel(DateTime date, DateTime now) {
  final difference = now.difference(date.toLocal());
  if (difference.isNegative || difference.inHours < 1) return 'just now';
  if (difference.inHours < 24) return '${difference.inHours}h ago';
  if (difference.inDays == 1) return 'yesterday';
  if (difference.inDays < 7) return '${difference.inDays}d ago';
  return DateFormat('d MMM').format(date.toLocal());
}

/// Turns a stored class type code into the label families and staff recognise.
/// Unknown codes are shown as-is rather than hidden, so a new code added
/// server-side degrades to something readable instead of disappearing.
String formatDashboardClassType(String rawType) {
  const labels = {
    '5-10': 'Years 5–10',
    'stdmath11': 'Year 11 Standard Maths',
    'stdmath12': 'Year 12 Standard Maths',
    'advmath11': 'Year 11 Advanced Maths',
    'advmath12': 'Year 12 Advanced Maths',
    'ex1math11': 'Year 11 Maths Extension 1',
    'ex1math12': 'Year 12 Maths Extension 1',
    'ex2math12': 'Year 12 Maths Extension 2',
    'stdeng11': 'Year 11 Standard English',
    'stdeng12': 'Year 12 Standard English',
    'adveng11': 'Year 11 Advanced English',
    'adveng12': 'Year 12 Advanced English',
    'ex1eng11': 'Year 11 English Extension 1',
    'ex1eng12': 'Year 12 English Extension 1',
    'ex2eng12': 'Year 12 English Extension 2',
  };
  final normalized = rawType.trim().toLowerCase();
  if (normalized.isEmpty) return 'Tutoring class';
  return labels[normalized] ?? rawType.trim();
}

/// Joins names the way the designs do: `Ella`, `Ella & Max`,
/// `Ella, Max & Sofia`.
String joinNames(List<String> names) {
  final cleaned = names.where((n) => n.trim().isNotEmpty).toList();
  if (cleaned.isEmpty) return '';
  if (cleaned.length == 1) return cleaned.first;
  return '${cleaned.sublist(0, cleaned.length - 1).join(', ')} & ${cleaned.last}';
}

/// Money as families expect to see it: `$180.00`.
String formatCurrency(double amount) =>
    NumberFormat.currency(symbol: r'$', decimalDigits: 2).format(amount);

/// The compact form used in the header metric strip, where space is tight:
/// `$180` when the cents are zero, `$180.50` when they are not.
String formatCurrencyShort(double amount) {
  final rounded = (amount * 100).round();
  if (rounded % 100 == 0) {
    return NumberFormat.currency(symbol: r'$', decimalDigits: 0).format(amount);
  }
  return formatCurrency(amount);
}
