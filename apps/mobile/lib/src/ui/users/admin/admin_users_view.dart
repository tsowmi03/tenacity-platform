import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';
import 'package:tenacity/src/ui/users/admin/admin_users_data.dart';

/// The admin people directory: parents, students and tutors, searchable, with
/// every admin-only action behind the tapped row.
///
/// Presentation only. Opening a person raises a callback so the existing user
/// detail screen — lesson tokens, enrolments, invoice PDF, unenrolment and
/// account removal — is reused rather than reimplemented.
///
/// **Documented omissions** (§7, §11): the reference's `ACTIVE` and `TRIAL`
/// pills, which have no source anywhere in the data — only `OVERDUE` is shown,
/// derived from the family's own invoices — and the `+` button, because
/// creating parent or student accounts from the admin app is out of scope.
class AdminUsersView extends StatelessWidget {
  final AdminUsersViewData data;
  final bool isLoading;
  final ValueChanged<String> onSearchChanged;
  final ValueChanged<AdminUsersTab> onTabChanged;
  final ValueChanged<AdminUserRow> onPersonTapped;
  final Future<void> Function() onRefresh;
  final VoidCallback onRetry;

  const AdminUsersView({
    super.key,
    required this.data,
    required this.isLoading,
    required this.onSearchChanged,
    required this.onTabChanged,
    required this.onPersonTapped,
    required this.onRefresh,
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
              child: ContentSheet(
                scrollKey: const Key('admin-users-scroll'),
                onRefresh: onRefresh,
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenH,
                  AppSpacing.md,
                  AppSpacing.screenH,
                  AppSpacing.xxl,
                ),
                children: [
                  if (data.errorMessage != null)
                    ErrorStateView(
                      key: const Key('admin-users-error'),
                      title: "We couldn't load the directory",
                      message: data.errorMessage,
                      onRetry: onRetry,
                    )
                  else if (isLoading)
                    const _LoadingRows()
                  else if (data.isEmpty)
                    EmptyStateView(
                      key: const Key('admin-users-empty'),
                      icon: Icons.person_search_outlined,
                      title: 'Nobody found',
                      message: 'Try a different name or switch tab.',
                    )
                  else
                    for (var i = 0; i < data.rows.length; i++)
                      _PersonRow(
                        key: Key('admin-users-row-${data.rows[i].id}'),
                        row: data.rows[i],
                        tone: i % 3,
                        showDivider: i < data.rows.length - 1,
                        onTap: () => onPersonTapped(data.rows[i]),
                      ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  final AdminUsersViewData data;
  final ValueChanged<String> onSearchChanged;
  final ValueChanged<AdminUsersTab> onTabChanged;

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
            style: AppText.display(
              fontSize: 27,
              fontWeight: FontWeight.w700,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            data.summary,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppText.body(fontSize: 12.5, color: Colors.white54),
          ),
          const SizedBox(height: AppSpacing.lg),
          SearchField(
            key: const Key('admin-users-search'),
            hintText: 'Search students, parents, tutors…',
            onChanged: onSearchChanged,
          ),
          const SizedBox(height: AppSpacing.lg),
          Align(
            alignment: Alignment.centerLeft,
            child: SegmentedFilter(
              key: const Key('admin-users-tabs'),
              segments: const ['Parents', 'Students', 'Tutors'],
              selectedIndex: AdminUsersTab.values.indexOf(data.tab),
              onSelected: (index) => onTabChanged(AdminUsersTab.values[index]),
            ),
          ),
        ],
      ),
    );
  }
}

class _PersonRow extends StatelessWidget {
  final AdminUserRow row;

  /// Rotates the avatar fill the way the reference does.
  final int tone;

  final bool showDivider;
  final VoidCallback onTap;

  const _PersonRow({
    super.key,
    required this.row,
    required this.tone,
    required this.showDivider,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final (background, foreground) = switch (tone) {
      0 => (AppColors.blue, Colors.white),
      1 => (AppColors.blue300, AppColors.ink),
      _ => (AppColors.blue100, AppColors.navy),
    };

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
                width: 44,
                height: 44,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: background,
                  borderRadius: BorderRadius.circular(15),
                ),
                child: Text(
                  row.initials,
                  style: AppText.display(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: foreground,
                  ),
                ),
              ),
              const SizedBox(width: 13),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      row.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.body(
                        fontSize: 14.5,
                        fontWeight: FontWeight.w700,
                        color: AppColors.ink,
                      ),
                    ),
                    if (row.subtitle.isNotEmpty) ...[
                      const SizedBox(height: 2),
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
              if (row.isOverdue) ...[
                const SizedBox(width: AppSpacing.sm),
                const StatusPill(
                  label: 'OVERDUE',
                  tone: StatusTone.danger,
                  size: StatusPillSize.compact,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _LoadingRows extends StatelessWidget {
  const _LoadingRows();

  @override
  Widget build(BuildContext context) {
    return Column(
      key: const Key('admin-users-loading'),
      children: [
        for (var i = 0; i < 6; i++) ...[
          if (i > 0) const SizedBox(height: AppSpacing.lg),
          const SkeletonBlock(height: 44),
        ],
      ],
    );
  }
}
