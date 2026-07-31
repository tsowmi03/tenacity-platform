import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/models/terms_and_conditions_model.dart';
import 'package:tenacity/src/ui/terms/terms_data.dart';

void main() {
  test('compares dotted and labelled versions safely', () {
    expect(compareTermsVersions('1.2.0', '1.1.9'), greaterThan(0));
    expect(compareTermsVersions('v2.0', '1.99.99'), greaterThan(0));
    expect(compareTermsVersions('1.0', '1.0.0'), 0);
    expect(compareTermsVersions('release', 'unknown'), 0);
  });

  test('returns only changelog entries newer than the accepted version', () {
    final changes = termsChangesSince(
      [
        TermsChangeLog(version: '1.0', changes: 'Original'),
        TermsChangeLog(version: '1.1', changes: 'Privacy'),
        TermsChangeLog(version: '2.0', changes: 'Payments'),
      ],
      '1.0',
    );

    expect(changes.map((entry) => entry.version), ['1.1', '2.0']);
    expect(termsChangesSince(changes, null), isEmpty);
  });

  test('formats changelog dates for readers', () {
    expect(termsChangeDateLabel(DateTime(2026, 7, 27)), '27 Jul 2026');
    expect(termsChangeDateLabel(null), '');
  });
}
