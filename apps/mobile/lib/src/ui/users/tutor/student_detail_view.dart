import 'package:flutter/material.dart';
import 'package:tenacity/src/models/feedback_model.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/feedback/feedback_history_data.dart';
import 'package:tenacity/src/ui/feedback/feedback_history_view.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';
import 'package:tenacity/src/ui/users/tutor/student_detail_data.dart';

/// A student, as a tutor needs them: where they are taught, who their family
/// is, and where they were left last time.
class StudentDetailView extends StatelessWidget {
  final StudentDetailData data;
  final bool isLoading;
  final VoidCallback onBack;
  final VoidCallback onOpenFeedback;
  final ValueChanged<StudentFamilyRow> onOpenParent;

  const StudentDetailView({
    super.key,
    required this.data,
    required this.isLoading,
    required this.onBack,
    required this.onOpenFeedback,
    required this.onOpenParent,
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
              title: data.name,
              subtitle: data.subtitle.isEmpty ? null : data.subtitle,
              onBack: onBack,
            ),
            Expanded(
              child: ContentSheet(
                scrollKey: const Key('student-detail-scroll'),
                children: [
                  if (data.hasDetails) ...[
                    const SectionLabel(title: 'DETAILS'),
                    const SizedBox(height: AppSpacing.labelGap),
                    _DetailsBlock(data: data),
                    const SizedBox(height: AppSpacing.xl),
                  ],
                  _FeedbackSection(
                    latest: data.latestFeedback,
                    count: data.feedbackCount,
                    isLoading: isLoading,
                    onOpenFeedback: onOpenFeedback,
                  ),
                  if (data.classes.isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.xxl),
                    const SectionLabel(title: 'CLASSES'),
                    const SizedBox(height: AppSpacing.labelGap),
                    for (final row in data.classes) ...[
                      _ClassRow(row: row),
                      const SizedBox(height: AppSpacing.sm),
                    ],
                  ],
                  if (data.family.isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.xl),
                    const SectionLabel(title: 'FAMILY'),
                    const SizedBox(height: AppSpacing.labelGap),
                    for (var i = 0; i < data.family.length; i++)
                      _FamilyRow(
                        row: data.family[i],
                        showDivider: i < data.family.length - 1,
                        onTap: () => onOpenParent(data.family[i]),
                      ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The student's own record: what the app actually stores about them, as
/// opposed to what has been written about them.
class _DetailsBlock extends StatelessWidget {
  final StudentDetailData data;

  const _DetailsBlock({required this.data});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.lg,
        vertical: AppSpacing.xs,
      ),
      decoration: BoxDecoration(
        color: AppColors.paper,
        border: Border.all(color: AppColors.line),
        borderRadius: BorderRadius.circular(AppRadii.md),
      ),
      child: Column(
        children: [
          if (data.yearLabel.isNotEmpty)
            _DetailRow(
                label: 'Year',
                value: Text(
                  data.yearLabel,
                  style: AppText.body(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                    color: AppColors.ink,
                  ),
                )),
          if (data.subjects.isNotEmpty)
            _DetailRow(
              label: 'Subjects',
              showDivider: data.yearLabel.isNotEmpty,
              value: Text(
                data.subjectsLabel,
                textAlign: TextAlign.right,
                style: AppText.body(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w600,
                  color: AppColors.ink,
                ),
              ),
            ),
          if (data.latestProgress != null)
            _DetailRow(
              label: 'Progress',
              showDivider:
                  data.yearLabel.isNotEmpty || data.subjects.isNotEmpty,
              value: StatusPill(
                label: data.latestProgress!.label.toUpperCase(),
                tone: switch (data.latestProgress!) {
                  StudentProgress.ahead => StatusTone.success,
                  StudentProgress.onTrack => StatusTone.info,
                  StudentProgress.needsSupport => StatusTone.action,
                },
                size: StatusPillSize.compact,
              ),
            ),
        ],
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  final String label;
  final Widget value;
  final bool showDivider;

  const _DetailRow({
    required this.label,
    required this.value,
    this.showDivider = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
      decoration: BoxDecoration(
        border: showDivider
            ? const Border(top: BorderSide(color: AppColors.lineSoft))
            : null,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: AppText.body(fontSize: 13, color: AppColors.muted),
          ),
          const SizedBox(width: AppSpacing.lg),
          Expanded(
              child: Align(alignment: Alignment.centerRight, child: value)),
        ],
      ),
    );
  }
}

/// The last note, in full, with the history one tap away.
///
/// Given the section rather than a bare link because the thing a tutor wants
/// before a lesson is what happened in the last one.
class _FeedbackSection extends StatelessWidget {
  final FeedbackNote? latest;
  final int count;
  final bool isLoading;
  final VoidCallback onOpenFeedback;

  const _FeedbackSection({
    required this.latest,
    required this.count,
    required this.isLoading,
    required this.onOpenFeedback,
  });

  @override
  Widget build(BuildContext context) {
    final note = latest;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionLabel(
          title: 'LATEST FEEDBACK',
          actionLabel: count > 0 ? 'All $count' : null,
          onAction: count > 0 ? onOpenFeedback : null,
        ),
        const SizedBox(height: AppSpacing.labelGap),
        if (isLoading)
          const SkeletonBlock(height: 96, radius: AppRadii.md)
        else if (note == null)
          _NoFeedbackYet(onOpenFeedback: onOpenFeedback)
        else
          Material(
            color: AppColors.blue50,
            borderRadius: BorderRadius.circular(AppRadii.md),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              key: const Key('student-detail-latest-feedback'),
              onTap: onOpenFeedback,
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.sectionGap),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: FeedbackAttribution(
                            tutorName: note.tutorName,
                            subject: note.subject,
                            fontSize: 12,
                          ),
                        ),
                        const SizedBox(width: AppSpacing.sm),
                        Text(
                          note.dateLabel,
                          style: AppText.body(
                            fontSize: 11.5,
                            color: AppColors.muted,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.labelGap),
                    Text(
                      '“${note.body}”',
                      style: AppText.serif(fontSize: 14).copyWith(height: 1.55),
                    ),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _NoFeedbackYet extends StatelessWidget {
  final VoidCallback onOpenFeedback;

  const _NoFeedbackYet({required this.onOpenFeedback});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.sectionGap),
      decoration: BoxDecoration(
        color: AppColors.blue50,
        borderRadius: BorderRadius.circular(AppRadii.md),
      ),
      child: Row(
        children: [
          const Icon(
            Icons.edit_note_rounded,
            size: AppSpacing.xl,
            color: AppColors.blue600,
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Text(
              'No feedback yet',
              style: AppText.body(fontSize: 14, color: AppColors.muted),
            ),
          ),
          TextButton(
            key: const Key('student-detail-open-feedback'),
            onPressed: onOpenFeedback,
            child: const Text('Open'),
          ),
        ],
      ),
    );
  }
}

class _ClassRow extends StatelessWidget {
  final StudentClassRow row;

  const _ClassRow({required this.row});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.lg,
        vertical: AppSpacing.md,
      ),
      decoration: BoxDecoration(
        color: AppColors.paper,
        border: Border.all(color: AppColors.line),
        borderRadius: BorderRadius.circular(AppRadii.sm),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  row.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.body(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppColors.ink,
                  ),
                ),
                const SizedBox(height: AppSpacing.xxs),
                Text(
                  row.whenLabel,
                  style: AppText.body(fontSize: 12, color: AppColors.muted),
                ),
              ],
            ),
          ),
          if (row.isMine) ...[
            const SizedBox(width: AppSpacing.sm),
            const StatusPill(
              label: 'YOURS',
              tone: StatusTone.info,
              size: StatusPillSize.compact,
            ),
          ],
        ],
      ),
    );
  }
}

class _FamilyRow extends StatelessWidget {
  final StudentFamilyRow row;
  final bool showDivider;
  final VoidCallback onTap;

  const _FamilyRow({
    required this.row,
    required this.showDivider,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.paper,
      child: InkWell(
        key: Key('student-detail-parent-${row.uid}'),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
          decoration: BoxDecoration(
            border: showDivider
                ? const Border(bottom: BorderSide(color: AppColors.lineSoft))
                : null,
          ),
          child: Row(
            children: [
              Container(
                width: AppSizes.avatar,
                height: AppSizes.avatar,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppColors.blue100,
                  borderRadius: BorderRadius.circular(15),
                ),
                child: Text(
                  row.initials,
                  style: AppText.display(fontSize: 15, color: AppColors.navy),
                ),
              ),
              const SizedBox(width: 13),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            row.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppText.body(
                              fontSize: 14.5,
                              fontWeight: FontWeight.w700,
                              color: AppColors.ink,
                            ),
                          ),
                        ),
                        if (row.isPrimary) ...[
                          const SizedBox(width: AppSpacing.sm),
                          const StatusPill(
                            label: 'PRIMARY',
                            tone: StatusTone.neutral,
                            size: StatusPillSize.compact,
                          ),
                        ],
                      ],
                    ),
                    if (row.email.isNotEmpty) ...[
                      const SizedBox(height: AppSpacing.xxs),
                      Text(
                        row.email,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppText.body(
                          fontSize: 12,
                          color: AppColors.muted,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const Icon(
                Icons.chevron_right_rounded,
                size: AppSpacing.xl,
                color: AppColors.disabled,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
