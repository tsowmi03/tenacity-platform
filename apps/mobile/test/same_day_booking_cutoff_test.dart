import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/helpers/same_day_booking_cutoff.dart';

void main() {
  group('sameDayBookingClosed', () {
    test('is open before 9am for a class later the same day', () {
      expect(
        sameDayBookingClosed(
          now: DateTime(2026, 9, 9, 8, 59),
          sessionStartsAt: DateTime(2026, 9, 9, 16, 30),
        ),
        isFalse,
      );
    });

    test('is closed from exactly 9am', () {
      // The boundary belongs to the closed side: "bookings close at 9am" means
      // 9am is too late, not the last minute that works.
      expect(
        sameDayBookingClosed(
          now: DateTime(2026, 9, 9, 9),
          sessionStartsAt: DateTime(2026, 9, 9, 16, 30),
        ),
        isTrue,
      );
    });

    test('is closed after 9am for a class later the same day', () {
      expect(
        sameDayBookingClosed(
          now: DateTime(2026, 9, 9, 9, 1),
          sessionStartsAt: DateTime(2026, 9, 9, 16, 30),
        ),
        isTrue,
      );
    });

    test('leaves tomorrow open however late it is today', () {
      expect(
        sameDayBookingClosed(
          now: DateTime(2026, 9, 9, 22),
          sessionStartsAt: DateTime(2026, 9, 10, 16, 30),
        ),
        isFalse,
      );
    });

    test('does not claim a session on an earlier day', () {
      // Yesterday's session is the already-started check's business. Answering
      // true here would show a parent the wrong reason.
      expect(
        sameDayBookingClosed(
          now: DateTime(2026, 9, 9, 9, 1),
          sessionStartsAt: DateTime(2026, 9, 8, 16, 30),
        ),
        isFalse,
      );
    });

    test('does not confuse the same day of an adjacent month', () {
      expect(
        sameDayBookingClosed(
          now: DateTime(2026, 9, 9, 10),
          sessionStartsAt: DateTime(2026, 10, 9, 16, 30),
        ),
        isFalse,
      );
    });
  });
}
