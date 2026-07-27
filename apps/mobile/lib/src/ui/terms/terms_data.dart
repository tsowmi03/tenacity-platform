import 'package:intl/intl.dart';
import 'package:tenacity/src/models/terms_and_conditions_model.dart';

List<TermsChangeLog> termsChangesSince(
  List<TermsChangeLog> changelog,
  String? previousVersion,
) {
  if (previousVersion == null || previousVersion.trim().isEmpty) {
    return const [];
  }

  return changelog
      .where(
        (entry) => compareTermsVersions(entry.version, previousVersion) > 0,
      )
      .toList(growable: false);
}

int compareTermsVersions(String left, String right) {
  final leftParts = _numericVersionParts(left);
  final rightParts = _numericVersionParts(right);
  final length = leftParts.length > rightParts.length
      ? leftParts.length
      : rightParts.length;

  for (var index = 0; index < length; index++) {
    final leftValue = index < leftParts.length ? leftParts[index] : 0;
    final rightValue = index < rightParts.length ? rightParts[index] : 0;
    if (leftValue != rightValue) return leftValue.compareTo(rightValue);
  }
  return 0;
}

List<int> _numericVersionParts(String value) {
  final matches = RegExp(r'\d+').allMatches(value);
  final parts =
      matches.map((match) => int.tryParse(match.group(0) ?? '') ?? 0).toList();
  return parts.isEmpty ? const [0] : parts;
}

String termsChangeDateLabel(DateTime? value) {
  if (value == null) return '';
  return DateFormat('d MMM yyyy').format(value);
}
