import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/ui/announcements/announcement_editor_data.dart';

void main() {
  test('announcement audiences match the stored contract', () {
    expect(announcementAudiences.keys, ['all', 'parent', 'tutor', 'admin']);
  });

  group('title validation', () {
    test('requires non-whitespace text', () {
      expect(validateAnnouncementTitle(null), 'Enter a title.');
      expect(validateAnnouncementTitle('   '), 'Enter a title.');
    });

    test('limits the stored title length', () {
      expect(validateAnnouncementTitle(List.filled(120, 'x').join()), isNull);
      expect(
        validateAnnouncementTitle(List.filled(121, 'x').join()),
        'Keep the title to 120 characters.',
      );
    });
  });

  group('body validation', () {
    test('requires non-whitespace text', () {
      expect(validateAnnouncementBody(null), 'Enter the announcement.');
      expect(validateAnnouncementBody('  '), 'Enter the announcement.');
    });

    test('limits the stored body length', () {
      expect(validateAnnouncementBody(List.filled(5000, 'x').join()), isNull);
      expect(
        validateAnnouncementBody(List.filled(5001, 'x').join()),
        'Keep the announcement to 5,000 characters.',
      );
    });
  });
}
