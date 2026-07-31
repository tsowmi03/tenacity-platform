import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

/// One child on the parent's record.
@immutable
class ParentChildRow {
  final String studentId;
  final String name;
  final String initials;

  /// `Year 9 · Maths · Wed`.
  final String subtitle;

  const ParentChildRow({
    required this.studentId,
    required this.name,
    required this.initials,
    required this.subtitle,
  });
}

/// A parent, as a tutor needs them: who they are, how to reach them, and which
/// of their children the tutor teaches.
///
/// **Deliberately narrower than the admin screen.** No lesson tokens, no
/// invoice, and no account removal. Tutors cannot read invoices at all — the
/// rules restrict them to admins and the parent themselves — so the legacy
/// screen's billing section could only ever render empty for a tutor while
/// still issuing the denied read.
class ParentDetailView extends StatelessWidget {
  final String name;
  final String initials;
  final String email;
  final String phone;
  final List<ParentChildRow> children;
  final bool isLoading;

  final VoidCallback onBack;
  final VoidCallback onMessage;
  final ValueChanged<ParentChildRow> onOpenChild;
  final ValueChanged<String> onCopy;

  const ParentDetailView({
    super.key,
    required this.name,
    required this.initials,
    required this.email,
    required this.phone,
    required this.children,
    required this.isLoading,
    required this.onBack,
    required this.onMessage,
    required this.onOpenChild,
    required this.onCopy,
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
              title: name,
              subtitle: 'Parent',
              onBack: onBack,
              trailing: IconButton(
                key: const Key('parent-detail-message'),
                tooltip: 'Message',
                onPressed: onMessage,
                color: Colors.white,
                icon: const Icon(Icons.chat_bubble_outline_rounded),
              ),
            ),
            Expanded(
              child: ContentSheet(
                scrollKey: const Key('parent-detail-scroll'),
                children: [
                  const SectionLabel(title: 'CONTACT'),
                  const SizedBox(height: AppSpacing.labelGap),
                  if (email.isNotEmpty)
                    _ContactRow(
                      icon: Icons.mail_outline_rounded,
                      value: email,
                      onCopy: () => onCopy(email),
                    ),
                  if (phone.isNotEmpty) ...[
                    if (email.isNotEmpty) const SizedBox(height: AppSpacing.sm),
                    _ContactRow(
                      icon: Icons.phone_outlined,
                      value: phone,
                      onCopy: () => onCopy(phone),
                    ),
                  ],
                  if (email.isEmpty && phone.isEmpty)
                    Text(
                      'No contact details on file.',
                      style: AppText.body(
                        fontSize: 13,
                        color: AppColors.muted,
                      ),
                    ),
                  const SizedBox(height: AppSpacing.xl),
                  SectionLabel(
                    title: 'CHILDREN',
                    trailing: children.isEmpty ? null : '${children.length}',
                  ),
                  const SizedBox(height: AppSpacing.labelGap),
                  if (isLoading)
                    const SkeletonBlock(height: 64, radius: AppRadii.sm)
                  else if (children.isEmpty)
                    Text(
                      'No students on this account.',
                      style: AppText.body(
                        fontSize: 13,
                        color: AppColors.muted,
                      ),
                    )
                  else
                    for (var i = 0; i < children.length; i++)
                      _ChildRow(
                        row: children[i],
                        showDivider: i < children.length - 1,
                        onTap: () => onOpenChild(children[i]),
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

class _ContactRow extends StatelessWidget {
  final IconData icon;
  final String value;
  final VoidCallback onCopy;

  const _ContactRow({
    required this.icon,
    required this.value,
    required this.onCopy,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.lg,
        vertical: AppSpacing.md,
      ),
      decoration: BoxDecoration(
        color: AppColors.blue50,
        borderRadius: BorderRadius.circular(AppRadii.sm),
      ),
      child: Row(
        children: [
          Icon(icon, size: 18, color: AppColors.blue600),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Text(
              value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppText.body(fontSize: 13.5, color: AppColors.ink),
            ),
          ),
          Semantics(
            button: true,
            label: 'Copy',
            child: InkWell(
              onTap: onCopy,
              customBorder: const CircleBorder(),
              child: const Padding(
                padding: EdgeInsets.all(AppSpacing.xs),
                child: Icon(
                  Icons.copy_rounded,
                  size: 16,
                  color: AppColors.blue600,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ChildRow extends StatelessWidget {
  final ParentChildRow row;
  final bool showDivider;
  final VoidCallback onTap;

  const _ChildRow({
    required this.row,
    required this.showDivider,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.paper,
      child: InkWell(
        key: Key('parent-detail-child-${row.studentId}'),
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
