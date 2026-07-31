import 'package:flutter/foundation.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/ui/dashboard/dashboard_formatting.dart';

/// What an admin can do to a class from the timetable.
enum AdminClassAction {
  /// Mark attendance and write feedback, on the V3 roll screen shared with
  /// tutors. This is the `Tutor Class Roll` reference screen.
  markRoll,

  /// Add or remove students from the class. Admin-only, and has no reference
  /// screen of its own — the roll screen deliberately cannot change a roster.
  editStudents,
  editTutors,
  waitlist,

  /// Drop (or restore) this one week's session. Reversible.
  toggleSession,

  /// Delete the empty class outright. Irreversible.
  deleteClass,
}

/// How much damage an action can do, which decides how it is presented.
enum AdminActionTone {
  /// Ordinary edit.
  normal,

  /// Reversible, but families are affected — cancelling a week.
  caution,

  /// Irreversible.
  destructive,
}

/// One row on the class options sheet.
@immutable
class AdminClassOption {
  final AdminClassAction action;
  final String label;

  /// What choosing this actually commits to. The legacy sheet showed bare
  /// labels, which is how `Cancel Class` — a permanent delete — came to sit
  /// directly beneath `Cancel This Session`, a reversible weekly toggle.
  final String description;

  final AdminActionTone tone;

  /// False when the action cannot be taken yet. The reason belongs on the
  /// option itself, as it does on the parent booking sheets — not in a snackbar
  /// after tapping something that looked available.
  final bool enabled;

  /// Why it is unavailable, shown in place of [description].
  final String? disabledHint;

  const AdminClassOption({
    required this.action,
    required this.label,
    required this.description,
    this.tone = AdminActionTone.normal,
    this.enabled = true,
    this.disabledHint,
  });

  /// Destructive actions must confirm before anything is written.
  bool get requiresConfirmation => tone != AdminActionTone.normal;
}

/// The confirmation wording for an action, or null when none is needed.
@immutable
class AdminClassConfirmation {
  final String title;
  final String message;
  final String confirmLabel;
  final bool isDestructive;

  const AdminClassConfirmation({
    required this.title,
    required this.message,
    required this.confirmLabel,
    required this.isDestructive,
  });
}

/// The options an admin gets for [classModel] in the displayed week.
///
/// Pure, so the wording and the tone of each action are testable.
List<AdminClassOption> buildAdminClassOptions({
  required ClassModel classModel,
  required Attendance? attendance,
  bool hasWaitlistEntries = false,
  bool waitlistStateKnown = true,
}) {
  final cancelled = attendance?.cancelled ?? false;
  final enrolled = classModel.enrolledStudents.length;

  // A roll can only be marked once the week's attendance document exists.
  final hasSession = attendance != null;

  return [
    AdminClassOption(
      action: AdminClassAction.markRoll,
      label: 'Mark the roll',
      description: 'Record who came and write their feedback',
      enabled: hasSession && !cancelled,
      disabledHint: cancelled
          ? 'This week is cancelled, so there is no roll to mark.'
          : 'This week has not been generated yet.',
    ),
    const AdminClassOption(
      action: AdminClassAction.editStudents,
      label: 'Enrolments',
      description: 'Add a student to the class, or take one off it',
    ),
    const AdminClassOption(
      action: AdminClassAction.editTutors,
      label: 'Tutors',
      description: 'Change who is teaching, this week or from now on',
    ),
    const AdminClassOption(
      action: AdminClassAction.waitlist,
      label: 'Waitlist',
      description: 'See who is waiting and offer them a place',
    ),
    AdminClassOption(
      action: AdminClassAction.toggleSession,
      label: cancelled ? 'Restore this week' : 'Cancel this week',
      description: cancelled
          ? 'Puts this one session back on. Other weeks are unaffected.'
          : 'Drops this one session. Every other week runs as normal.',
      tone: AdminActionTone.caution,
    ),
    AdminClassOption(
      action: AdminClassAction.deleteClass,
      // Deliberately not "Cancel class". It deletes the class outright, and
      // sharing a verb with the weekly toggle above made the two look like
      // variations of the same thing.
      label: 'Delete this class',
      description: 'Removes this empty class from every week. '
          'This cannot be undone.',
      tone: AdminActionTone.destructive,
      enabled: enrolled == 0 && waitlistStateKnown && !hasWaitlistEntries,
      disabledHint: enrolled > 0
          ? 'Unenrol ${enrolled == 1 ? 'the student' : 'all $enrolled students'} '
              'before deleting this class.'
          : !waitlistStateKnown
              ? 'The waitlist could not be checked. Reconnect before deleting '
                  'this class.'
              : hasWaitlistEntries
                  ? 'Resolve every waitlist entry before deleting this class.'
                  : null,
    ),
  ];
}

/// What to ask before removing [studentName] from a class.
///
/// [isPermanent] distinguishes an enrolled student from a one-off visitor,
/// which is the whole difference between dropping them from every week and
/// dropping them from this one.
///
/// The legacy flow put this behind a menu that only ever offered a single real
/// option — a permanent student could only "Remove permanently", a visitor only
/// "Remove one-off" — and then asked again, so it was a confirmation wearing two
/// hats. Its `Cancel` was also the only red item, making the way out look more
/// dangerous than the removal.
AdminClassConfirmation studentRemovalConfirmation({
  required String studentName,
  required String classTitle,
  required bool isPermanent,
}) {
  return AdminClassConfirmation(
    title: isPermanent ? 'Unenrol $studentName?' : 'Remove from this week?',
    message: isPermanent
        ? '$studentName will be taken off $classTitle from now on, not just '
            'this week.'
        : '$studentName will be removed from $classTitle this week only. Their '
            'other bookings are unchanged.',
    confirmLabel: isPermanent ? 'Unenrol' : 'Remove',
    isDestructive: true,
  );
}

/// What to ask before [action] is carried out.
///
/// Returns null for actions that write nothing on their own.
AdminClassConfirmation? confirmationFor({
  required AdminClassAction action,
  required ClassModel classModel,
  required Attendance? attendance,
}) {
  final title = formatDashboardClassType(classModel.type);
  final cancelled = attendance?.cancelled ?? false;

  return switch (action) {
    AdminClassAction.markRoll ||
    AdminClassAction.editStudents ||
    AdminClassAction.editTutors ||
    AdminClassAction.waitlist =>
      null,

    // Reversible, but families are told, so it still asks. The legacy sheet
    // fired this straight from the tap with no confirmation at all.
    AdminClassAction.toggleSession => AdminClassConfirmation(
        title: cancelled ? 'Restore this week?' : 'Cancel this week?',
        message: cancelled
            ? '$title will run again this week.'
            : '$title will not run this week. Families booked into it are '
                'affected. Every other week is unchanged.',
        confirmLabel: cancelled ? 'Restore' : 'Cancel this week',
        isDestructive: !cancelled,
      ),
    AdminClassAction.deleteClass => AdminClassConfirmation(
        title: 'Delete this class?',
        message: '$title will be removed from every week. '
            'This cannot be undone.',
        confirmLabel: 'Delete class',
        isDestructive: true,
      ),
  };
}
