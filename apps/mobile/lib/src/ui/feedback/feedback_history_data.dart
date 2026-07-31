import 'package:flutter/foundation.dart';
import 'package:intl/intl.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/models/feedback_model.dart';

/// One note in a student's feedback history, ready to render.
@immutable
class FeedbackNote {
  final String id;

  /// The class it came out of, or the free-text subject on older records.
  final String subject;

  final String body;

  /// Who wrote it, or a fallback when the tutor account has since gone.
  final String tutorName;

  /// `Today`, `Yesterday`, `Wed 15 Jul`, or `15 Jul 2025` for another year.
  final String dateLabel;

  final StudentProgress? progress;
  final bool isUnread;

  const FeedbackNote({
    required this.id,
    required this.subject,
    required this.body,
    required this.tutorName,
    required this.dateLabel,
    required this.isUnread,
    this.progress,
  });

  /// `Jordan Lee · Year 9 Maths`, matching how the parent dashboard attributes
  /// its feedback quote.
  String get attribution =>
      [tutorName, subject].where((part) => part.isNotEmpty).join(' · ');
}

@immutable
class FeedbackHistoryData {
  final List<FeedbackNote> notes;

  /// Ids that should be marked read once the view has been shown.
  final List<String> unreadIds;

  const FeedbackHistoryData({required this.notes, required this.unreadIds});

  bool get isEmpty => notes.isEmpty;
}

/// Builds the history, newest first.
///
/// Pure, so ordering, attribution and date rules are testable without
/// Firestore. [tutorNamesById] is resolved by the caller, since it needs a
/// separate lookup.
FeedbackHistoryData buildFeedbackHistory({
  required List<StudentFeedback> feedback,
  required Map<String, String> tutorNamesById,
  required DateTime now,
}) {
  final sorted = [...feedback]
    ..sort((a, b) => b.createdAt.compareTo(a.createdAt));

  return FeedbackHistoryData(
    notes: [
      for (final entry in sorted)
        FeedbackNote(
          id: entry.id,
          subject: entry.subject.trim(),
          body: entry.feedback.trim(),
          // `AuthController` already resolves a departed tutor to
          // `formerTutorDisplayName`; this only covers the window before the
          // lookup returns, so an unresolved id never reaches a family as a
          // raw uid.
          tutorName: tutorNamesById[entry.tutorId]?.trim().isNotEmpty ?? false
              ? tutorNamesById[entry.tutorId]!.trim()
              : formerTutorDisplayName,
          dateLabel: feedbackDateLabel(entry.createdAt, now),
          progress: entry.progress,
          isUnread: entry.isUnread,
        ),
    ],
    unreadIds: [
      for (final entry in sorted)
        if (entry.isUnread) entry.id,
    ],
  );
}

/// `Today`, `Yesterday`, `Wed 15 Jul` within the year, else `15 Jul 2025`.
String feedbackDateLabel(DateTime createdAt, DateTime now) {
  final local = createdAt.toLocal();
  final today = DateTime(now.year, now.month, now.day);
  final thatDay = DateTime(local.year, local.month, local.day);
  final daysAgo = today.difference(thatDay).inDays;

  if (daysAgo == 0) return 'Today';
  if (daysAgo == 1) return 'Yesterday';
  if (local.year == now.year) return DateFormat('EEE d MMM').format(local);
  return DateFormat('d MMM yyyy').format(local);
}
