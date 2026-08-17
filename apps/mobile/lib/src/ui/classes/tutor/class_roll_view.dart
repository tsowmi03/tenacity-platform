import 'package:flutter/material.dart';
import 'package:tenacity/src/models/feedback_model.dart';
import 'package:tenacity/src/ui/classes/tutor/class_roll_data.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

/// Marking a class: who turned up, how they went, and a note home.
///
/// Presentation only. Every edit is a callback and the save is the container's
/// job, so the roll's ordering guarantees stay in one place.
class ClassRollView extends StatelessWidget {
  final ClassRollViewData data;
  final bool isLoading;
  final bool isSaving;

  /// Something has been changed since the last save.
  final bool isDirty;

  /// False after an ambiguous partial submission until storage is reloaded.
  final bool canSave;

  final void Function(RollStudent student, RollAttendance attendance)
      onAttendanceChanged;
  final void Function(RollStudent student, StudentProgress? progress)
      onProgressChanged;
  final void Function(RollStudent student, String feedback) onFeedbackChanged;
  final VoidCallback onSave;
  final VoidCallback onBack;
  final VoidCallback onRetry;

  const ClassRollView({
    super.key,
    required this.data,
    required this.isLoading,
    required this.isSaving,
    required this.isDirty,
    this.canSave = true,
    required this.onAttendanceChanged,
    required this.onProgressChanged,
    required this.onFeedbackChanged,
    required this.onSave,
    required this.onBack,
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
            DetailHeader(
              title: data.classTitle,
              subtitle: data.whenLabel,
              onBack: onBack,
              trailing: _SessionBadge(label: data.statusLabel),
            ),
            Expanded(
              child: ContentSheet.fixed(
                padding: EdgeInsets.zero,
                child: Column(
                  children: [
                    Expanded(child: _body()),
                    if (!isLoading && data.errorMessage == null)
                      _SaveBar(
                        data: data,
                        isSaving: isSaving,
                        isDirty: isDirty,
                        canSave: canSave,
                        onSave: onSave,
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

  Widget _body() {
    if (isLoading) {
      return const Padding(
        padding: EdgeInsets.fromLTRB(
          AppSpacing.screenH,
          AppSpacing.xxl,
          AppSpacing.screenH,
          0,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SkeletonBlock(height: 11, width: 120, radius: AppRadii.pill),
            SizedBox(height: AppSpacing.lg),
            SkeletonBlock(height: 120, radius: AppRadii.md),
            SizedBox(height: AppSpacing.labelGap),
            SkeletonBlock(height: 120, radius: AppRadii.md),
          ],
        ),
      );
    }

    if (data.errorMessage != null) {
      return ErrorStateView(
        key: const Key('class-roll-error'),
        title: "We couldn't load this class",
        message: data.errorMessage,
        onRetry: onRetry,
      );
    }

    if (data.students.isEmpty) {
      return const EmptyStateView(
        icon: Icons.groups_outlined,
        title: 'Nobody on this roll',
        message: 'No students are enrolled in this session.',
      );
    }

    return ListView(
      key: const Key('class-roll-list'),
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        AppSpacing.xxl,
        AppSpacing.screenH,
        AppSpacing.xl,
      ),
      children: [
        SectionLabel(
          title: 'ROLL & FEEDBACK',
          trailing: data.progressLabel,
        ),
        const SizedBox(height: AppSpacing.md),
        for (final student in data.students) ...[
          _StudentCard(
            student: student,
            onAttendanceChanged: (value) => onAttendanceChanged(student, value),
            onProgressChanged: (value) => onProgressChanged(student, value),
            onFeedbackChanged: (value) => onFeedbackChanged(student, value),
          ),
          const SizedBox(height: AppSpacing.labelGap),
        ],
      ],
    );
  }
}

class _SessionBadge extends StatelessWidget {
  final String label;

  const _SessionBadge({required this.label});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.labelGap),
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: 5,
        ),
        decoration: BoxDecoration(
          color: AppColors.onInkSurface,
          border: Border.all(color: AppColors.onInkBorder),
          borderRadius: BorderRadius.circular(AppRadii.pill),
        ),
        child: Text(
          label,
          style: AppText.body(
            fontSize: 10.5,
            fontWeight: FontWeight.w700,
            color: Colors.white,
          ).copyWith(letterSpacing: 0.32),
        ),
      ),
    );
  }
}

class _StudentCard extends StatelessWidget {
  final RollStudent student;
  final ValueChanged<RollAttendance> onAttendanceChanged;
  final ValueChanged<StudentProgress?> onProgressChanged;
  final ValueChanged<String> onFeedbackChanged;

  const _StudentCard({
    required this.student,
    required this.onAttendanceChanged,
    required this.onProgressChanged,
    required this.onFeedbackChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      key: Key('roll-student-${student.studentId}'),
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.sectionGap,
        AppSpacing.md,
        AppSpacing.sectionGap,
        AppSpacing.sectionGap,
      ),
      decoration: BoxDecoration(
        // An absent student recedes, so a scan down the roll lands on the
        // people who still need something written about them.
        color: student.isAway ? AppColors.cream : AppColors.paper,
        border: Border.all(color: AppColors.line),
        borderRadius: BorderRadius.circular(AppRadii.md),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _Avatar(student: student),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      student.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.body(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: AppColors.ink,
                      ),
                    ),
                    if (student.yearLabel.isNotEmpty) ...[
                      const SizedBox(height: AppSpacing.xxs),
                      Text(
                        student.yearLabel,
                        style: AppText.body(
                          fontSize: 11.5,
                          color: AppColors.muted,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              _AttendanceToggle(
                studentId: student.studentId,
                attendance: student.attendance,
                onChanged: onAttendanceChanged,
              ),
            ],
          ),
          if (student.isUnmarked) ...[
            const SizedBox(height: AppSpacing.md),
            const _Hint(
              icon: null,
              message: 'Mark attendance to add feedback',
              showDot: true,
            ),
          ] else if (student.isAway) ...[
            const SizedBox(height: AppSpacing.md),
            const _Hint(
              icon: Icons.remove_circle_outline,
              message: 'Marked away — feedback not required.',
              italic: true,
            ),
          ] else ...[
            const SizedBox(height: AppSpacing.md),
            _ProgressPills(
              selected: student.progress,
              onChanged: onProgressChanged,
            ),
            const SizedBox(height: AppSpacing.md),
            if (student.feedbackAlreadySent) ...[
              const _SentNotice(),
              const SizedBox(height: AppSpacing.sm),
            ],
            _FeedbackField(
              studentId: student.studentId,
              firstName: student.name.split(' ').first,
              value: student.feedback,
              onChanged: onFeedbackChanged,
            ),
          ],
        ],
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  final RollStudent student;

  const _Avatar({required this.student});

  @override
  Widget build(BuildContext context) {
    // The avatar carries progress through the roll at a glance: solid once
    // there is something written, lighter while there is not.
    final (background, foreground) = student.isUnmarked || student.isAway
        ? (AppColors.blue100, AppColors.navy)
        : student.isComplete
            ? (AppColors.blue, Colors.white)
            : (AppColors.blue300, AppColors.ink);

    return Container(
      width: 38,
      height: 38,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(13),
      ),
      child: Text(
        student.initials,
        style: AppText.display(fontSize: 14, color: foreground),
      ),
    );
  }
}

class _AttendanceToggle extends StatelessWidget {
  final String studentId;
  final RollAttendance attendance;
  final ValueChanged<RollAttendance> onChanged;

  const _AttendanceToggle({
    required this.studentId,
    required this.attendance,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: AppColors.blue50,
        borderRadius: BorderRadius.circular(AppRadii.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _ToggleOption(
            key: Key('roll-here-$studentId'),
            label: 'Here',
            selected: attendance == RollAttendance.here,
            selectedColour: AppColors.success,
            onTap: () => onChanged(RollAttendance.here),
          ),
          _ToggleOption(
            key: Key('roll-away-$studentId'),
            label: 'Away',
            selected: attendance == RollAttendance.away,
            selectedColour: AppColors.danger,
            onTap: () => onChanged(RollAttendance.away),
          ),
        ],
      ),
    );
  }
}

class _ToggleOption extends StatelessWidget {
  final String label;
  final bool selected;
  final Color selectedColour;
  final VoidCallback onTap;

  const _ToggleOption({
    super.key,
    required this.label,
    required this.selected,
    required this.selectedColour,
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
          padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 5),
          decoration: BoxDecoration(
            color: selected ? selectedColour : Colors.transparent,
            borderRadius: BorderRadius.circular(AppRadii.pill),
          ),
          child: Text(
            label,
            style: AppText.body(
              fontSize: 11,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
              color: selected ? Colors.white : AppColors.muted,
            ),
          ),
        ),
      ),
    );
  }
}

class _ProgressPills extends StatelessWidget {
  final StudentProgress? selected;
  final ValueChanged<StudentProgress?> onChanged;

  const _ProgressPills({
    required this.selected,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        for (final progress in StudentProgress.values)
          Semantics(
            button: true,
            selected: progress == selected,
            child: GestureDetector(
              // Tapping the selected pill clears it, so a status set by
              // mistake does not have to stay.
              onTap: () => onChanged(progress == selected ? null : progress),
              behavior: HitTestBehavior.opaque,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.md,
                  vertical: 5,
                ),
                decoration: BoxDecoration(
                  color:
                      progress == selected ? AppColors.blue : AppColors.paper,
                  border: Border.all(
                    color:
                        progress == selected ? AppColors.blue : AppColors.line,
                  ),
                  borderRadius: BorderRadius.circular(AppRadii.pill),
                ),
                child: Text(
                  progress.label,
                  style: AppText.body(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w600,
                    color:
                        progress == selected ? Colors.white : AppColors.muted,
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _FeedbackField extends StatefulWidget {
  final String studentId;
  final String firstName;
  final String value;
  final ValueChanged<String> onChanged;

  const _FeedbackField({
    required this.studentId,
    required this.firstName,
    required this.value,
    required this.onChanged,
  });

  @override
  State<_FeedbackField> createState() => _FeedbackFieldState();
}

class _FeedbackFieldState extends State<_FeedbackField> {
  late final TextEditingController _controller =
      TextEditingController(text: widget.value);

  @override
  void didUpdateWidget(_FeedbackField oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Only when the value changed somewhere other than this field — marking a
    // student away discards their draft, and a save reloads from storage.
    // Typing does not land here, since every keystroke is pushed up first and
    // comes back matching.
    if (widget.value != _controller.text) {
      _controller.text = widget.value;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isEmpty = _controller.text.trim().isEmpty;

    return TextField(
      key: Key('roll-feedback-${widget.studentId}'),
      controller: _controller,
      onChanged: (value) {
        widget.onChanged(value);
        // Only the empty/filled border depends on this, so the rebuild is
        // cheap and does not fight the controller.
        setState(() {});
      },
      minLines: 2,
      maxLines: 6,
      textCapitalization: TextCapitalization.sentences,
      // Italic, matching how feedback reads everywhere else it is shown. This
      // styles typed text only — an empty field shows `hintText` instead — so
      // there was nothing for the upright variant to render, and asking for it
      // only reached for a font the app does not carry: `Newsreader-Italic` is
      // the sole family bundled, and `main.dart` turns runtime fetching off.
      style: AppText.serif(fontSize: 13.5).copyWith(height: 1.5),
      decoration: InputDecoration(
        filled: true,
        fillColor: AppColors.paper,
        hintText: 'Add feedback for ${widget.firstName}…',
        hintStyle: AppText.body(fontSize: 13, color: AppColors.muted),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: AppSpacing.labelGap,
        ),
        // Dashed is not expressible in an InputBorder, so an empty field is
        // marked by the softer line instead.
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadii.sm),
          borderSide: BorderSide(
            color: isEmpty ? AppColors.line : AppColors.lineSoft,
          ),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadii.sm),
          borderSide: const BorderSide(color: AppColors.blue, width: 1.5),
        ),
      ),
    );
  }
}

/// Marks feedback the family already has, above the field that edits it.
///
/// The field below stays editable; this only says the note has gone out, so a
/// tutor knows they are correcting something rather than writing it fresh.
class _SentNotice extends StatelessWidget {
  const _SentNotice();

  @override
  Widget build(BuildContext context) {
    return Row(
      key: const Key('roll-feedback-sent-notice'),
      children: [
        const Icon(
          Icons.check_circle_outline_rounded,
          size: 13,
          color: AppColors.success,
        ),
        const SizedBox(width: 6),
        Text(
          'Sent to the family',
          style: AppText.body(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: AppColors.success,
          ),
        ),
      ],
    );
  }
}

class _Hint extends StatelessWidget {
  final IconData? icon;
  final String message;
  final bool showDot;
  final bool italic;

  const _Hint({
    required this.icon,
    required this.message,
    this.showDot = false,
    this.italic = false,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        if (showDot)
          Container(
            width: 6,
            height: 6,
            decoration: const BoxDecoration(
              color: AppColors.danger,
              shape: BoxShape.circle,
            ),
          ),
        if (icon != null)
          Icon(icon, size: AppSpacing.sectionGap, color: AppColors.muted),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Text(
            message,
            style: italic
                ? AppText.serif(fontSize: 12.5, color: AppColors.muted)
                : AppText.body(fontSize: 12.5, color: AppColors.muted),
          ),
        ),
      ],
    );
  }
}

/// The pinned footer. A roster longer than the screen must not push the save
/// out of reach.
class _SaveBar extends StatelessWidget {
  final ClassRollViewData data;
  final bool isSaving;
  final bool isDirty;
  final bool canSave;
  final VoidCallback onSave;

  const _SaveBar({
    required this.data,
    required this.isSaving,
    required this.isDirty,
    required this.canSave,
    required this.onSave,
  });

  @override
  Widget build(BuildContext context) {
    final outstanding = data.outstandingLabel;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        AppSpacing.md,
        AppSpacing.screenH,
        AppSpacing.xl,
      ),
      decoration: const BoxDecoration(
        color: AppColors.paper,
        border: Border(top: BorderSide(color: AppColors.lineSoft)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (outstanding != null) ...[
            Text(
              outstanding,
              key: const Key('class-roll-outstanding'),
              textAlign: TextAlign.center,
              style: AppText.body(fontSize: 12, color: AppColors.muted),
            ),
            const SizedBox(height: AppSpacing.sm),
          ],
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              key: const Key('class-roll-save'),
              // Saving nothing is not an action; a roll with no edits is
              // already what is stored.
              onPressed: isSaving || !isDirty || !canSave ? null : onSave,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.blue,
                disabledBackgroundColor: AppColors.skeleton,
                disabledForegroundColor: AppColors.disabled,
              ),
              child: isSaving
                  ? const SizedBox(
                      width: AppSpacing.xl,
                      height: AppSpacing.xl,
                      child: CircularProgressIndicator(
                        color: Colors.white,
                        strokeWidth: 2,
                      ),
                    )
                  : Text(
                      data.isAttendanceComplete
                          ? 'Save roll & send feedback'
                          : 'Save progress',
                    ),
            ),
          ),
        ],
      ),
    );
  }
}
