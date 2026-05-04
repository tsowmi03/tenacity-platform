import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/utils/class_session_dates.dart';

void main() {
  group('classSessionDateForWeek', () {
    test('uses the configured class day inside the first term week', () {
      final session = classSessionDateForWeek(
        termStartDate: DateTime(2026, 4, 28),
        classDay: 'Monday',
        startTime: '16:30',
        weekNumber: 1,
      );

      expect(session, DateTime(2026, 4, 27, 16, 30));
    });

    test('keeps a class on term start when weekdays already match', () {
      final session = classSessionDateForWeek(
        termStartDate: DateTime(2026, 4, 28),
        classDay: 'Tuesday',
        startTime: '18:00',
        weekNumber: 1,
      );

      expect(session, DateTime(2026, 4, 28, 18));
    });

    test('keeps Monday-based week numbering for later term weeks', () {
      final session = classSessionDateForWeek(
        termStartDate: DateTime(2026, 4, 28),
        classDay: 'Monday',
        startTime: '16:30',
        weekNumber: 2,
      );

      expect(session, DateTime(2026, 5, 4, 16, 30));
    });

    test('advances by full Monday-based term weeks', () {
      final session = classSessionDateForWeek(
        termStartDate: DateTime(2026, 4, 28),
        classDay: 'Thursday',
        startTime: '09:15',
        weekNumber: 3,
      );

      expect(session, DateTime(2026, 5, 14, 9, 15));
    });
  });
}
