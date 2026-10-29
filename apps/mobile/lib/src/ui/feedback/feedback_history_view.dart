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

  /// A parent chose a response to a note. Only notes with
  /// [FeedbackNote.canRespond] offer it.
  final void Function(String noteId, FeedbackResponseType type)? onRespond;

  /// Notes whose response is being sent, so their buttons are disabled.
  final Set<String> respondingNoteIds;

  const FeedbackHistoryView({
    super.key,
    required this.data,
    required this.title,
    required this.isLoading,
    this.errorReason,
    required this.onBack,
    this.subtitle,
    this.onAdd,
    this.onRespond,
    this.respondingNoteIds = const {},
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
        child: _NoteCard(
          note: data.notes[index],
          onRespond: onRespond,
          isResponding: respondingNoteIds.contains(data.notes[index].id),
        ),
      ),
    );
  }
}

class _NoteCard extends StatelessWidget {
  final FeedbackNote note;
  final void Function(String noteId, FeedbackResponseType type)? onRespond;
  final bool isResponding;

  const _NoteCard({
    required this.note,
    this.onRespond,
    this.isResponding = false,
  });

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
          if (note.responses.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.md),
            for (final response in note.responses)
              _ResponseLine(response: response),
          ],
          if (note.canRespond && onRespond != null) ...[
            const SizedBox(height: AppSpacing.md),
            Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.sm,
              children: [
                for (final type in FeedbackResponseType.values)
                  _ResponseButton(
                    key: Key('feedback-respond-${note.id}-${type.value}'),
                    type: type,
                    onPressed:
                        isResponding ? null : () => onRespond!(note.id, type),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// `👍 Pat Lee · Thanks · Today`, with the message underneath when there is
/// one. Set off from the note by a rule so it reads as a reply, not part of
/// the tutor's text.
class _ResponseLine extends StatelessWidget {
  final FeedbackNoteResponse response;

  const _ResponseLine({required this.response});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: AppSpacing.sm),
      padding: const EdgeInsets.only(left: AppSpacing.md),
      decoration: const BoxDecoration(
        border: Border(
          left: BorderSide(color: AppColors.blue100, width: 3),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text.rich(
            TextSpan(
              children: [
                TextSpan(
                  text: '${response.type.emoji} ${response.parentName}',
                  style: AppText.body(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: AppColors.text,
                  ),
                ),
                TextSpan(
                  text: ' · ${response.type.label} · ${response.dateLabel}',
                  style: AppText.body(fontSize: 11.5, color: AppColors.muted),
                ),
              ],
            ),
          ),
          if (response.text.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              response.text,
              style: AppText.body(fontSize: 13.5, color: AppColors.text)
                  .copyWith(height: 1.45),
            ),
          ],
        ],
      ),
    );
  }
}

class _ResponseButton extends StatelessWidget {
  final FeedbackResponseType type;
  final VoidCallback? onPressed;

  const _ResponseButton({super.key, required this.type, this.onPressed});

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.blue600,
        side: const BorderSide(color: AppColors.blue100),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.pill),
        ),
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
        minimumSize: const Size(0, 36),
        textStyle: AppText.body(fontSize: 12.5, fontWeight: FontWeight.w600),
      ),
      child: Text('${type.emoji} ${type.label}'),
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
