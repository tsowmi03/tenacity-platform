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
  final bool hasError;

  /// Admins can record feedback outside a session; nobody else can.
  final VoidCallback? onAdd;

  final VoidCallback onBack;

  const FeedbackHistoryView({
    super.key,
    required this.data,
    required this.title,
    required this.isLoading,
    required this.hasError,
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

    if (hasError) {
      return const ErrorStateView(
        key: Key('feedback-error'),
        title: 'Feedback could not be loaded',
        message: 'Please check your connection and try again.',
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
                child: Text(
                  note.attribution,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.body(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    color: AppColors.muted,
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Text(
                note.dateLabel,
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
