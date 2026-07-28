import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';
import 'package:tenacity/src/ui/timetable/admin/admin_class_options_data.dart';

/// The sheet an admin gets on tapping a class in the timetable.
///
/// Each option states what it commits to, following the parent booking sheets:
/// the legacy version showed five bare labels, which put `Cancel Class` — a
/// permanent delete of the class and its enrolments — directly beneath
/// `Cancel This Session`, a reversible weekly toggle, in the same red.
class AdminClassOptionsSheet extends StatelessWidget {
  final String classTitle;
  final String whenLabel;
  final List<AdminClassOption> options;
  final ValueChanged<AdminClassOption> onSelected;

  const AdminClassOptionsSheet({
    super.key,
    required this.classTitle,
    required this.whenLabel,
    required this.options,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    return AppBottomSheet(
      title: classTitle,
      subtitle: whenLabel,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (var i = 0; i < options.length; i++) ...[
            if (i > 0) const SizedBox(height: AppSpacing.sm),
            _OptionTile(
              key: Key('admin-class-option-${options[i].action.name}'),
              option: options[i],
              onTap: () => onSelected(options[i]),
            ),
          ],
        ],
      ),
    );
  }
}

class _OptionTile extends StatelessWidget {
  final AdminClassOption option;
  final VoidCallback onTap;

  const _OptionTile({super.key, required this.option, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final (background, labelColour, iconColour) = switch (option.tone) {
      AdminActionTone.normal => (
          AppColors.blue50,
          AppColors.ink,
          AppColors.blue
        ),
      // No warning surface token exists; a low-opacity wash of the warning
      // colour keeps this distinct from both the plain and destructive rows.
      AdminActionTone.caution => (
          const Color(0x14B4741C),
          AppColors.ink,
          AppColors.warning,
        ),
      AdminActionTone.destructive => (
          const Color(0x14D64545),
          AppColors.danger,
          AppColors.danger,
        ),
    };

    return Semantics(
      button: true,
      child: Material(
        color: background,
        borderRadius: BorderRadius.circular(AppRadii.md),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.lg,
              vertical: 13,
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        option.label,
                        style: AppText.body(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: labelColour,
                        ),
                      ),
                      const SizedBox(height: AppSpacing.xxs),
                      Text(
                        option.description,
                        style: AppText.body(
                          fontSize: 12.5,
                          color: AppColors.muted,
                        ).copyWith(height: 1.35),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
                Icon(
                  option.tone == AdminActionTone.destructive
                      ? Icons.delete_outline_rounded
                      : Icons.chevron_right_rounded,
                  size: AppSpacing.xl,
                  color: iconColour,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The confirmation shown before a destructive class action is carried out.
class AdminClassConfirmSheet extends StatelessWidget {
  final AdminClassConfirmation confirmation;
  final bool isBusy;
  final VoidCallback onConfirm;
  final VoidCallback onCancel;

  const AdminClassConfirmSheet({
    super.key,
    required this.confirmation,
    required this.isBusy,
    required this.onConfirm,
    required this.onCancel,
  });

  @override
  Widget build(BuildContext context) {
    return AppBottomSheet(
      title: confirmation.title,
      footer: SheetActions(
        confirmLabel: confirmation.confirmLabel,
        onConfirm: isBusy ? null : onConfirm,
        onCancel: isBusy ? null : onCancel,
        isBusy: isBusy,
        cancelLabel: 'Keep it',
      ),
      child: Text(
        confirmation.message,
        style: AppText.body(fontSize: 14, color: AppColors.ink)
            .copyWith(height: 1.4),
      ),
    );
  }
}
