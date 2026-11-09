import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/messaging/group_details_data.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

/// Who is in a group and, for those allowed, the controls to change it
/// (MOB-70). Takes everything it shows, so it can be tested without Firebase.
class GroupDetailsView extends StatelessWidget {
  final String title;
  final String? groupName;
  final List<GroupMemberRowData> members;
  final bool canRename;
  final bool canAddMembers;
  final bool isBusy;
  final VoidCallback onBack;
  final VoidCallback onRename;
  final VoidCallback onAddMembers;
  final ValueChanged<GroupMemberRowData> onRemove;
  final VoidCallback onLeave;

  const GroupDetailsView({
    super.key,
    required this.title,
    required this.groupName,
    required this.members,
    required this.canRename,
    required this.canAddMembers,
    required this.isBusy,
    required this.onBack,
    required this.onRename,
    required this.onAddMembers,
    required this.onRemove,
    required this.onLeave,
  });

  @override
  Widget build(BuildContext context) {
    final count = members.length;
    return Material(
      color: AppColors.ink,
      child: SafeArea(
        bottom: false,
        child: Column(
          children: [
            DetailHeader(
              title: title,
              subtitle: count == 1 ? '1 person' : '$count people',
              onBack: onBack,
            ),
            Expanded(
              child: ContentSheet.fixed(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenH,
                  AppSpacing.xl,
                  AppSpacing.screenH,
                  0,
                ),
                child: ListView(
                  key: const Key('group-details-list'),
                  padding: EdgeInsets.only(
                    bottom:
                        AppSpacing.xl + MediaQuery.of(context).padding.bottom,
                  ),
                  children: [
                    if (canRename) ...[
                      const SectionLabel(title: 'GROUP NAME'),
                      const SizedBox(height: AppSpacing.xs),
                      _ActionRow(
                        key: const Key('group-rename'),
                        icon: Icons.edit_rounded,
                        label: groupName ?? 'Add a name',
                        onTap: isBusy ? null : onRename,
                      ),
                      const SizedBox(height: AppSpacing.xxl),
                    ],
                    const SectionLabel(title: 'PEOPLE'),
                    const SizedBox(height: AppSpacing.xs),
                    if (canAddMembers)
                      _ActionRow(
                        key: const Key('group-add-members'),
                        icon: Icons.person_add_alt_1_rounded,
                        label: 'Add people',
                        onTap: isBusy ? null : onAddMembers,
                      ),
                    for (var i = 0; i < members.length; i++)
                      _MemberRow(
                        member: members[i],
                        showDivider: i < members.length - 1,
                        onRemove: isBusy ? null : () => onRemove(members[i]),
                      ),
                    const SizedBox(height: AppSpacing.xxl),
                    OutlinedButton(
                      key: const Key('group-leave'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.danger,
                      ),
                      onPressed: isBusy ? null : onLeave,
                      child: const Text('Leave group'),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ActionRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  const _ActionRow({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.paper,
      child: InkWell(
        onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: AppSizes.minTouchTarget),
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
          child: Row(
            children: [
              Container(
                width: AppSizes.avatar,
                height: AppSizes.avatar,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppColors.blue,
                  borderRadius: BorderRadius.circular(AppRadii.tile),
                ),
                child: Icon(icon, color: Colors.white, size: 22),
              ),
              const SizedBox(width: 13),
              Expanded(
                child: Text(
                  label,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.body(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: AppColors.ink,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MemberRow extends StatelessWidget {
  final GroupMemberRowData member;
  final bool showDivider;
  final VoidCallback? onRemove;

  const _MemberRow({
    required this.member,
    required this.showDivider,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      key: Key('group-member-${member.uid}'),
      constraints: const BoxConstraints(minHeight: AppSizes.minTouchTarget),
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
              borderRadius: BorderRadius.circular(AppRadii.tile),
            ),
            child: Text(
              member.initials,
              style: AppText.display(fontSize: 15, color: AppColors.navy),
            ),
          ),
          const SizedBox(width: 13),
          Expanded(
            child: Text(
              member.isYou ? '${member.name} (you)' : member.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppText.body(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: AppColors.ink,
              ),
            ),
          ),
          if (member.canRemove)
            TextButton(
              key: Key('group-remove-${member.uid}'),
              style: TextButton.styleFrom(foregroundColor: AppColors.danger),
              onPressed: onRemove,
              child: Text(
                'Remove',
                semanticsLabel: 'Remove ${member.name}',
              ),
            ),
        ],
      ),
    );
  }
}
