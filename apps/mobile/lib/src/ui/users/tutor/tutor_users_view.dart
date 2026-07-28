import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';
import 'package:tenacity/src/ui/users/tutor/tutor_users_data.dart';

/// The tutor's directory: the students they teach, and those students'
/// parents.
class TutorUsersView extends StatelessWidget {
  final TutorUsersViewData data;
  final bool isLoading;
  final ValueChanged<String> onSearchChanged;
  final ValueChanged<TutorUsersTab> onTabChanged;
  final ValueChanged<TutorUserRow> onRowTapped;
  final ValueChanged<TutorUserRow> onFeedbackTapped;
  final VoidCallback onRetry;

  const TutorUsersView({
    super.key,
    required this.data,
    required this.isLoading,
    required this.onSearchChanged,
    required this.onTabChanged,
    required this.onRowTapped,
    required this.onFeedbackTapped,
    required this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.ink,
      child: SafeArea(
        bottom: false,
        child: Column(
          children: [
            _Header(
              data: data,
              onSearchChanged: onSearchChanged,
              onTabChanged: onTabChanged,
            ),
            Expanded(
              child: ContentSheet.fixed(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenH,
                  AppSpacing.md,
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
    if (isLoading && data.isEmpty) {
      return const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(height: AppSpacing.sm),
          SkeletonBlock(height: 56),
          SizedBox(height: AppSpacing.md),
          SkeletonBlock(height: 56),
          SizedBox(height: AppSpacing.md),
          SkeletonBlock(height: 56),
        ],
      );
    }

    if (data.errorMessage != null && data.isEmpty) {
      return ErrorStateView(
        key: const Key('tutor-users-error'),
        title: 'People could not be loaded',
        message: data.errorMessage,
        onRetry: onRetry,
      );
    }

    if (data.isEmpty) {
      return EmptyStateView(
        icon: Icons.groups_outlined,
        title: switch (data.tab) {
          TutorUsersTab.thisWeek => 'No classes this week',
          TutorUsersTab.students => 'No students found',
          TutorUsersTab.parents => 'No parents found',
        },
        // The working set being empty is not the same as the directory being
        // empty, so it points at where everyone else is.
        message: switch (data.tab) {
          TutorUsersTab.thisWeek =>
            'Students you are teaching this week appear here. Use Students to '
                'look anyone up.',
          TutorUsersTab.students => 'Try a different name or year.',
          TutorUsersTab.parents => 'Try a different name.',
        },
      );
    }

    return ListView.builder(
      key: const Key('tutor-users-list'),
      padding: EdgeInsets.zero,
      itemCount: data.rows.length,
      itemBuilder: (context, index) {
        final row = data.rows[index];
        return _PersonRow(
          row: row,
          showDivider: index < data.rows.length - 1,
          showThisWeekMarker: data.tab != TutorUsersTab.thisWeek,
          onTap: () => onRowTapped(row),
          onFeedback: () => onFeedbackTapped(row),
        );
      },
    );
  }
}

class _Header extends StatelessWidget {
  final TutorUsersViewData data;
  final ValueChanged<String> onSearchChanged;
  final ValueChanged<TutorUsersTab> onTabChanged;

  const _Header({
    required this.data,
    required this.onSearchChanged,
    required this.onTabChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        AppSpacing.sm,
        AppSpacing.screenH,
        AppSpacing.xl,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Users',
            style: AppText.display(fontSize: 27, color: Colors.white),
          ),
          const SizedBox(height: AppSpacing.xxs),
          Text(
            data.subtitle,
            style: AppText.body(
              fontSize: 12.5,
              color: Colors.white.withValues(alpha: 0.55),
            ),
          ),
          const SizedBox(height: AppSpacing.sectionGap),
          SearchField(
            hintText: 'Search students & parents…',
            onChanged: onSearchChanged,
          ),
          const SizedBox(height: AppSpacing.md),
          // Scrolls: three tabs with counts overflow 320px, and clipping the
          // last one would hide the full directory behind an invisible edge.
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: _Tabs(
              selected: data.tab,
              thisWeekCount: data.thisWeekCount,
              studentCount: data.studentCount,
              parentCount: data.parentCount,
              onChanged: onTabChanged,
            ),
          ),
        ],
      ),
    );
  }
}

class _Tabs extends StatelessWidget {
  final TutorUsersTab selected;
  final int thisWeekCount;
  final int studentCount;
  final int parentCount;
  final ValueChanged<TutorUsersTab> onChanged;

  const _Tabs({
    required this.selected,
    required this.thisWeekCount,
    required this.studentCount,
    required this.parentCount,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: AppColors.onInkSurface,
        border: Border.all(color: AppColors.onInkBorder),
        borderRadius: BorderRadius.circular(AppRadii.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _Tab(
            key: const Key('tutor-users-tab-this-week'),
            label: 'This week',
            count: thisWeekCount,
            selected: selected == TutorUsersTab.thisWeek,
            onTap: () => onChanged(TutorUsersTab.thisWeek),
          ),
          _Tab(
            key: const Key('tutor-users-tab-students'),
            label: 'Students',
            count: studentCount,
            selected: selected == TutorUsersTab.students,
            onTap: () => onChanged(TutorUsersTab.students),
          ),
          _Tab(
            key: const Key('tutor-users-tab-parents'),
            label: 'Parents',
            count: parentCount,
            selected: selected == TutorUsersTab.parents,
            onTap: () => onChanged(TutorUsersTab.parents),
          ),
        ],
      ),
    );
  }
}

class _Tab extends StatelessWidget {
  final String label;
  final int count;
  final bool selected;
  final VoidCallback onTap;

  const _Tab({
    super.key,
    required this.label,
    required this.count,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: AnimatedContainer(
          duration: AppDurations.fast,
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.lg,
            vertical: 6,
          ),
          decoration: BoxDecoration(
            color: selected ? Colors.white : Colors.transparent,
            borderRadius: BorderRadius.circular(AppRadii.pill),
          ),
          child: Text(
            // The count belongs on the tab: it is how a tutor sees the size of
            // the other side without switching to it.
            count == 0 ? label : '$label $count',
            style: AppText.body(
              fontSize: 12,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
              color: selected
                  ? AppColors.ink
                  : Colors.white.withValues(alpha: 0.65),
            ),
          ),
        ),
      ),
    );
  }
}

class _PersonRow extends StatelessWidget {
  final TutorUserRow row;
  final bool showDivider;
  final bool showThisWeekMarker;
  final VoidCallback onTap;
  final VoidCallback onFeedback;

  const _PersonRow({
    required this.row,
    required this.showDivider,
    required this.showThisWeekMarker,
    required this.onTap,
    required this.onFeedback,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.paper,
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 13),
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
                        // Only in the full lists: inside This week every row
                        // would carry it, which says nothing.
                        if (row.isThisWeek && showThisWeekMarker) ...[
                          const SizedBox(width: AppSpacing.sm),
                          const StatusPill(
                            label: 'YOURS',
                            tone: StatusTone.info,
                            size: StatusPillSize.compact,
                          ),
                        ],
                      ],
                    ),
                    if (row.subtitle.isNotEmpty) ...[
                      const SizedBox(height: AppSpacing.xxs),
                      Text(
                        row.subtitle,
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
              const SizedBox(width: AppSpacing.labelGap),
              if (row.hasFeedbackAction)
                _FeedbackButton(
                  key: Key('tutor-users-feedback-${row.id}'),
                  onTap: onFeedback,
                )
              else
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

class _FeedbackButton extends StatelessWidget {
  final VoidCallback onTap;

  const _FeedbackButton({super.key, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'Feedback history',
      child: Material(
        color: AppColors.paper,
        borderRadius: BorderRadius.circular(AppRadii.pill),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.md,
              vertical: 6,
            ),
            decoration: BoxDecoration(
              border: Border.all(color: AppColors.line, width: 1.5),
              borderRadius: BorderRadius.circular(AppRadii.pill),
            ),
            child: Text(
              'Feedback',
              style: AppText.body(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: AppColors.blue,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
