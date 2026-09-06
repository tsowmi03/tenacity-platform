import 'package:flutter/material.dart';
import 'package:tenacity/src/models/feedback_model.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/feedback/feedback_history_data.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';
import 'package:tenacity/src/widgets/offline_cached_data_notice.dart';

/// A student's feedback, newest first.
///
/// Shared by every role: families read it, tutors look back over what they
/// have written, and admins can add to it.
class FeedbackHistoryView extends StatelessWidget {
  final FeedbackHistoryData data;

  /// `Ella's feedback`, or just `Feedback` before the name is known.
  final String title;

  final String? subtitle;
  final bool isLoading;

  /// Why the load failed, already made safe to show, or null if it did not.
  /// The heading above it names what failed, so this is the reason alone.
  final String? errorReason;

  /// Admins can record feedback outside a session; nobody else can.
  final VoidCallback? onAdd;

  final VoidCallback onBack;

  const FeedbackHistoryView({
    super.key,
    required this.data,
    required this.title,
    required this.isLoading,
    this.errorReason,
    required this.onBack,
    this.subtitle,
    this.onAdd,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.ink,
      child: SafeArea(
        bottom: false,
        child: Column(
          children: [
            DetailHeader(
              title: title,
              subtitle: subtitle,
              onBack: onBack,
              trailing: onAdd == null
                  ? null
                  : IconButton(
                      key: const Key('feedback-add'),
                      tooltip: 'Add feedback',
                      onPressed: onAdd,
                      color: Colors.white,
                      icon: const Icon(Icons.add_rounded),
                    ),
            ),
            Expanded(
              child: ContentSheet.fixed(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenH,
                  AppSpacing.xl,
                  AppSpacing.screenH,
                  0,
                ),
                child: _body(),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _body() {
    if (isLoading) {
      return const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SkeletonBlock(height: 96, radius: AppRadii.md),
          SizedBox(height: AppSpacing.md),
          SkeletonBlock(height: 96, radius: AppRadii.md),
        ],
      );
    }

    if (errorReason != null) {
      return ErrorStateView(
        key: const Key('feedback-error'),
        title: 'Feedback could not be loaded',
        message: errorReason,
      );
    }

    if (data.isEmpty) {
      return const OfflineAwareEmptyState(
        emptyMessage: 'No feedback yet',
        offlineEmptyMessage: 'No saved feedback available offline.',
      );
    }

    return ListView.builder(
      key: const Key('feedback-list'),
      padding: const EdgeInsets.only(bottom: AppSpacing.xxl),
      itemCount: data.notes.length,
      itemBuilder: (context, index) => Padding(
        padding: EdgeInsets.only(
          bottom: index == data.notes.length - 1 ? 0 : AppSpacing.md,
        ),
        child: _NoteCard(note: data.notes[index]),
      ),
    );
  }
}

class _NoteCard extends StatelessWidget {
  final FeedbackNote note;

  const _NoteCard({required this.note});

  @override
  Widget build(BuildContext context) {
    return Container(
      key: Key('feedback-note-${note.id}'),
      padding: const EdgeInsets.all(AppSpacing.sectionGap),
      decoration: BoxDecoration(
        color: AppColors.paper,
        border: Border.all(
          // An unread note is pulled forward until the family has seen it.
          color: note.isUnread ? AppColors.blue300 : AppColors.line,
          width: note.isUnread ? 1.5 : 1,
        ),
        borderRadius: BorderRadius.circular(AppRadii.md),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (note.isUnread) ...[
                Container(
                  width: AppSizes.unreadDot,
                  height: AppSizes.unreadDot,
                  decoration: const BoxDecoration(
                    color: AppColors.blue,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
              ],
              Expanded(
                child: FeedbackAttribution(
                  tutorName: note.tutorName,
                  subject: note.subject,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Text(
                // The tutor changed this note after sending it, and no second
                // notification went out — this is the family's only sign.
                note.isEdited ? 'Edited · ${note.dateLabel}' : note.dateLabel,
                style: AppText.body(fontSize: 11.5, color: AppColors.muted),
              ),
            ],
          ),
          if (note.progress != null) ...[
            const SizedBox(height: AppSpacing.labelGap),
            _ProgressPill(progress: note.progress!),
          ],
          const SizedBox(height: AppSpacing.labelGap),
          Text(
            note.body,
            style: AppText.serif(fontSize: 14).copyWith(height: 1.55),
          ),
        ],
      ),
    );
  }
}

/// `Jordan Lee · Year 9 Maths`, with the author in brand blue.
///
/// The whole line was muted grey, which left a wall of feedback cards with no
/// entry point for the eye. Colouring the author gives each note an anchor
/// while keeping the class as secondary detail.
class FeedbackAttribution extends StatelessWidget {
  final String tutorName;
  final String subject;
  final double fontSize;

  const FeedbackAttribution({
    super.key,
    required this.tutorName,
    required this.subject,
    this.fontSize = 12.5,
  });

  @override
  Widget build(BuildContext context) {
    return Text.rich(
      TextSpan(
        children: [
          TextSpan(
            text: tutorName,
            style: AppText.body(
              fontSize: fontSize,
              fontWeight: FontWeight.w700,
              color: AppColors.blue600,
            ),
          ),
          if (subject.isNotEmpty)
            TextSpan(
              text: ' · $subject',
              style: AppText.body(
                fontSize: fontSize,
                fontWeight: FontWeight.w500,
                color: AppColors.muted,
              ),
            ),
        ],
      ),
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
    );
  }
}

/// How the student went, when the note carries it. Older records have none.
class _ProgressPill extends StatelessWidget {
  final StudentProgress progress;

  const _ProgressPill({required this.progress});

  @override
  Widget build(BuildContext context) {
    final tone = switch (progress) {
      StudentProgress.ahead => StatusTone.success,
      StudentProgress.onTrack => StatusTone.info,
      StudentProgress.needsSupport => StatusTone.action,
    };

    return StatusPill(
      label: progress.label.toUpperCase(),
      tone: tone,
      size: StatusPillSize.compact,
    );
  }
}
