import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';
import 'package:tenacity/src/ui/timetable/parent/booking_data.dart';

/// The sheets a parent moves through to change a booking: choose an action,
/// choose which children it applies to, choose a class to swap into, and
/// confirm what it costs.
///
/// No reference design exists for these — the design files show only the
/// screens behind them — so they extend the established V3 sheet language.
/// None of them performs a booking; each reports a choice and the timetable
/// screen runs the existing controller calls unchanged.

/// Choose what to do with a class.
class BookingOptionsSheet extends StatelessWidget {
  final String classTitle;
  final String whenLabel;
  final List<BookingOption> options;
  final ValueChanged<BookingOption> onSelected;

  const BookingOptionsSheet({
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
  final BookingOption option;
  final VoidCallback onTap;

  const _OptionTile({required this.option, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final enabled = option.enabled;

    // The reason an option is unavailable belongs with the option. It used to
    // arrive as a snackbar after tapping a row that looked tappable.
    final detail = enabled ? option.description : option.disabledHint;

    return Semantics(
      button: enabled,
      enabled: enabled,
      child: Material(
        color: enabled ? AppColors.blue50 : AppColors.skeleton,
        borderRadius: BorderRadius.circular(AppRadii.md),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: enabled ? onTap : null,
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
                          color: enabled ? AppColors.ink : AppColors.disabled,
                        ),
                      ),
                      if (detail != null && detail.isNotEmpty) ...[
                        const SizedBox(height: AppSpacing.xxs),
                        Text(
                          detail,
                          style: AppText.body(
                            fontSize: 12.5,
                            color:
                                enabled ? AppColors.muted : AppColors.disabled,
                          ).copyWith(height: 1.35),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
                Icon(
                  enabled ? Icons.chevron_right_rounded : Icons.lock_outline,
                  size: enabled ? AppSpacing.xl : AppSpacing.lg,
                  color: enabled ? AppColors.blue : AppColors.disabled,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Choose which children an action applies to.
class BookingChildSelectionSheet extends StatefulWidget {
  final String action;
  final Future<List<BookingChild>> children;
  final ValueChanged<List<BookingChild>> onConfirm;
  final VoidCallback onCancel;

  const BookingChildSelectionSheet({
    super.key,
    required this.action,
    required this.children,
    required this.onConfirm,
    required this.onCancel,
  });

  @override
  State<BookingChildSelectionSheet> createState() =>
      _BookingChildSelectionSheetState();
}

class _BookingChildSelectionSheetState
    extends State<BookingChildSelectionSheet> {
  final _selected = <String>{};

  @override
  Widget build(BuildContext context) {
    return BookingChildrenGate(
      children: widget.children,
      title: bookingActionLabel(widget.action),
      subtitle: 'Who is this for?',
      onClose: widget.onCancel,
      builder: (children) {
        final chosen =
            children.where((child) => _selected.contains(child.id)).toList();

        return AppBottomSheet(
          title: bookingActionLabel(widget.action),
          subtitle: 'Who is this for?',
          footer: SheetActions(
            confirmLabel: 'Continue',
            onConfirm: chosen.isEmpty ? null : () => widget.onConfirm(chosen),
            onCancel: widget.onCancel,
          ),
          child: Column(
            children: [
              for (var i = 0; i < children.length; i++) ...[
                if (i > 0) const SizedBox(height: AppSpacing.sm),
                _ChildTile(
                  child: children[i],
                  selected: _selected.contains(children[i].id),
                  onChanged: (isSelected) {
                    setState(() {
                      if (isSelected) {
                        _selected.add(children[i].id);
                      } else {
                        _selected.remove(children[i].id);
                      }
                    });
                  },
                ),
              ],
            ],
          ),
        );
      },
    );
  }
}

class _ChildTile extends StatelessWidget {
  final BookingChild child;
  final bool selected;
  final ValueChanged<bool> onChanged;

  const _ChildTile({
    required this.child,
    required this.selected,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Semantics(
      checked: selected,
      child: Material(
        color: selected ? AppColors.blue50 : AppColors.paper,
        borderRadius: BorderRadius.circular(AppRadii.md),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => onChanged(!selected),
          child: Container(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.md,
              vertical: AppSpacing.md,
            ),
            decoration: BoxDecoration(
              border: Border.all(
                color: selected ? AppColors.blue : AppColors.line,
                width: selected ? 1.5 : 1,
              ),
              borderRadius: BorderRadius.circular(AppRadii.md),
            ),
            child: Row(
              children: [
                _Checkbox(selected: selected),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Text(
                    child.name,
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
      ),
    );
  }
}

class _Checkbox extends StatelessWidget {
  final bool selected;

  const _Checkbox({required this.selected});

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: AppDurations.fast,
      width: AppSpacing.xxl,
      height: AppSpacing.xxl,
      decoration: BoxDecoration(
        color: selected ? AppColors.blue : Colors.transparent,
        border: Border.all(
          color: selected ? AppColors.blue : AppColors.disabled,
          width: 1.5,
        ),
        borderRadius: BorderRadius.circular(AppSpacing.sm),
      ),
      child: selected
          ? const Icon(Icons.check_rounded,
              size: AppSpacing.lg, color: Colors.white)
          : null,
    );
  }
}

/// Choose the class to move into.
class BookingClassSelectionSheet extends StatelessWidget {
  final String action;
  final List<BookingClassChoice> choices;
  final ValueChanged<BookingClassChoice> onSelected;

  const BookingClassSelectionSheet({
    super.key,
    required this.action,
    required this.choices,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    return AppBottomSheet(
      title: 'Move to',
      subtitle: action == BookingActions.swapPermanent
          ? 'The new class applies for the rest of the term.'
          : 'The new class applies to this week only.',
      child: choices.isEmpty
          ? const EmptyStateView(
              icon: Icons.event_busy_outlined,
              title: 'No classes to swap into',
              message:
                  'Every other class of this type is full or has already run '
                  'this week.',
            )
          : Column(
              children: [
                for (var i = 0; i < choices.length; i++) ...[
                  if (i > 0) const SizedBox(height: AppSpacing.sm),
                  _ClassChoiceTile(
                    choice: choices[i],
                    onTap: () => onSelected(choices[i]),
                  ),
                ],
              ],
            ),
    );
  }
}

class _ClassChoiceTile extends StatelessWidget {
  final BookingClassChoice choice;
  final VoidCallback onTap;

  const _ClassChoiceTile({required this.choice, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.blue50,
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
                      choice.whenLabel,
                      style: AppText.body(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: AppColors.ink,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xxs),
                    Text(
                      choice.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.body(
                        fontSize: 12.5,
                        color: AppColors.muted,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              StatusPill(
                label: choice.spotsRemaining == 1
                    ? '1 SPOT'
                    : '${choice.spotsRemaining} SPOTS',
                tone: StatusTone.info,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Choose the week a permanent swap starts from.
///
/// The step that did not exist. A permanent swap always began at the next
/// session, and nothing said so, so a family who wanted to move from next week
/// had no way to ask for it and no reason to think they had not (MOB-39).
class BookingStartWeekSheet extends StatelessWidget {
  final String toLabel;
  final List<SwapStartWeek> choices;
  final ValueChanged<SwapStartWeek> onSelected;

  const BookingStartWeekSheet({
    super.key,
    required this.toLabel,
    required this.choices,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    return AppBottomSheet(
      title: 'Starting when?',
      subtitle: 'The first week in $toLabel.',
      child: choices.isEmpty
          ? const EmptyStateView(
              icon: Icons.event_busy_outlined,
              title: 'No sessions left this term',
              message:
                  'This class has no more sessions to move into. Message us '
                  'and we will sort out next term.',
            )
          : Column(
              children: [
                for (var i = 0; i < choices.length; i++) ...[
                  if (i > 0) const SizedBox(height: AppSpacing.sm),
                  _StartWeekTile(
                    choice: choices[i],
                    isNext: i == 0,
                    onTap: () => onSelected(choices[i]),
                  ),
                ],
              ],
            ),
    );
  }
}

class _StartWeekTile extends StatelessWidget {
  final SwapStartWeek choice;

  /// The first week available, which is where a swap has always started and
  /// still starts unless the family says otherwise.
  final bool isNext;
  final VoidCallback onTap;

  const _StartWeekTile({
    required this.choice,
    required this.isNext,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.blue50,
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
                      choice.dateLabel,
                      style: AppText.body(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: AppColors.ink,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xxs),
                    Text(
                      choice.weekLabel,
                      style: AppText.body(
                        fontSize: 12.5,
                        color: AppColors.muted,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              if (isNext)
                const StatusPill(
                  label: 'NEXT SESSION',
                  tone: StatusTone.info,
                )
              else
                const Icon(
                  Icons.chevron_right_rounded,
                  size: AppSpacing.xl,
                  color: AppColors.blue,
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Confirm what an action commits the family to.
class BookingConfirmSheet extends StatelessWidget {
  final String action;
  final String message;
  final bool isBusy;
  final VoidCallback onConfirm;
  final VoidCallback onCancel;

  const BookingConfirmSheet({
    super.key,
    required this.action,
    required this.message,
    required this.isBusy,
    required this.onConfirm,
    required this.onCancel,
  });

  @override
  Widget build(BuildContext context) {
    return AppBottomSheet(
      title: bookingActionLabel(action),
      footer: SheetActions(
        confirmLabel: bookingConfirmLabel(action),
        isBusy: isBusy,
        onConfirm: onConfirm,
        onCancel: onCancel,
      ),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Text(
          message,
          style: AppText.body(fontSize: 14, color: AppColors.text)
              .copyWith(height: 1.5),
        ),
      ),
    );
  }
}

/// Resolves child names before showing a sheet that names them, without
/// leaving the sheet blank while it happens.
///
/// Shared by every sheet that reads a child's name back to the family, so the
/// waiting and failure states are the same wherever the lookup is slow.
class BookingChildrenGate extends StatelessWidget {
  final Future<List<BookingChild>> children;
  final String title;
  final String? subtitle;
  final VoidCallback onClose;
  final Widget Function(List<BookingChild>) builder;

  const BookingChildrenGate({
    super.key,
    required this.children,
    required this.title,
    required this.onClose,
    required this.builder,
    this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<BookingChild>>(
      future: children,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return AppBottomSheet(
            title: title,
            subtitle: subtitle,
            footer: OutlinedButton(
              onPressed: onClose,
              child: const Text('Close'),
            ),
            child: const Column(
              children: [
                SkeletonBlock(height: 56, radius: AppRadii.md),
                SizedBox(height: AppSpacing.sm),
                SkeletonBlock(height: 56, radius: AppRadii.md),
              ],
            ),
          );
        }

        if (snapshot.hasError) {
          return AppBottomSheet(
            title: title,
            footer: OutlinedButton(
              onPressed: onClose,
              child: const Text('Close'),
            ),
            child: const ErrorStateView(
              title: 'We could not load your children',
              message: 'Close this and try again in a moment.',
            ),
          );
        }

        return builder(snapshot.data ?? const []);
      },
    );
  }
}
