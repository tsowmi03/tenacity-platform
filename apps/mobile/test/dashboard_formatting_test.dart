import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/ui/dashboard/dashboard_formatting.dart';

void main() {
  group('yearLabelFor', () {
    test('prefixes a bare grade', () {
      expect(yearLabelFor('9'), 'Year 9');
    });

    test('leaves an already-prefixed grade alone', () {
      // Both forms are in the data; prefixing unconditionally produced
      // "Year Year 7" on device.
      expect(yearLabelFor('Year 7'), 'Year 7');
      expect(yearLabelFor('year 7'), 'year 7');
    });

    test('is empty for a missing grade', () {
      expect(yearLabelFor(''), '');
      expect(yearLabelFor('   '), '');
    });
  });

  group('studentSubjectLabel', () {
    test('names the generic codes juniors carry', () {
      expect(studentSubjectLabel('maths'), 'Maths');
      expect(studentSubjectLabel('english'), 'English');
    });

    test('drops the year a senior subject carries, since it is shown beside it',
        () {
      expect(studentSubjectLabel('advmath11'), 'Advanced Maths');
      expect(studentSubjectLabel('ex1eng12'), 'English Extension 1');
      expect(studentSubjectLabel('stdmath12'), 'Standard Maths');
    });

    test('shows an unrecognised code as stored rather than hiding it', () {
      // Matches formatDashboardClassType: a code added server-side degrades to
      // something readable instead of disappearing.
      expect(studentSubjectLabel('drama9'), 'drama9');
    });

    test('is empty for a missing code, not "Tutoring class"', () {
      // formatDashboardClassType names an empty class type; an empty subject
      // is simply absent.
      expect(studentSubjectLabel(''), '');
      expect(studentSubjectLabel('  '), '');
    });
  });

  group('studentYearAndSubjects', () {
    test('names the year and every subject', () {
      expect(
        studentYearAndSubjects(grade: '9', subjects: const ['maths', 'english']),
        'Year 9 · Maths, English',
      );
    });

    test('a senior subject is not repeated with its year', () {
      expect(
        studentYearAndSubjects(grade: '11', subjects: const ['advmath11']),
        'Year 11 · Advanced Maths',
      );
    });

    test('degrades to whichever half was recorded', () {
      expect(
        studentYearAndSubjects(grade: '9', subjects: const []),
        'Year 9',
      );
      expect(
        studentYearAndSubjects(grade: '', subjects: const ['maths']),
        'Maths',
      );
    });

    test('is empty when neither was recorded, so callers can drop the line',
        () {
      expect(studentYearAndSubjects(grade: '', subjects: const []), '');
      expect(studentYearAndSubjects(grade: '  ', subjects: const ['', ' ']), '');
    });
  });
}
