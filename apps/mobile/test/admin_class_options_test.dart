import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/ui/timetable/admin/admin_class_options_data.dart';

void main() {
  group('options', _options);
  group('confirmation', _confirmation);
  group('the two cancels', _theTwoCancels);
}

void _options() {
  test('every option says what it commits to', () {
    final options =
        buildAdminClassOptions(classModel: _class(), attendance: null);

    expect(options, hasLength(5));
    for (final option in options) {
      expect(option.description, isNotEmpty, reason: '${option.action}');
    }
  });

  test('the weekly toggle flips its wording when already cancelled', () {
    final live = buildAdminClassOptions(classModel: _class(), attendance: null)
        .firstWhere((o) => o.action == AdminClassAction.toggleSession);
    expect(live.label, 'Cancel this week');
    expect(live.description, contains('Every other week runs as normal'));

    final cancelled = buildAdminClassOptions(
      classModel: _class(),
      attendance: _attendance(cancelled: true),
    ).firstWhere((o) => o.action == AdminClassAction.toggleSession);
    expect(cancelled.label, 'Restore this week');
  });

  test('deleting names how many students it unenrols', () {
    final option = buildAdminClassOptions(
      classModel: _class(enrolled: 6),
      attendance: null,
    ).firstWhere((o) => o.action == AdminClassAction.deleteClass);

    expect(option.description, contains('all 6 students'));
    expect(option.description, contains('cannot be undone'));
  });

  test('an empty class does not claim to unenrol anybody', () {
    final option = buildAdminClassOptions(
      classModel: _class(enrolled: 0),
      attendance: null,
    ).firstWhere((o) => o.action == AdminClassAction.deleteClass);

    expect(option.description, isNot(contains('unenrol')));
    expect(option.description, contains('cannot be undone'));
  });

  test('a single student reads in the singular', () {
    final option = buildAdminClassOptions(
      classModel: _class(enrolled: 1),
      attendance: null,
    ).firstWhere((o) => o.action == AdminClassAction.deleteClass);

    expect(option.description, contains('its 1 student'));
  });
}

void _confirmation() {
  test('the read-only options write nothing and so ask nothing', () {
    for (final action in [
      AdminClassAction.editStudents,
      AdminClassAction.editTutors,
      AdminClassAction.waitlist,
    ]) {
      expect(
        confirmationFor(
          action: action,
          classModel: _class(),
          attendance: null,
        ),
        isNull,
        reason: '$action',
      );
    }
  });

  test('cancelling a week confirms first', () {
    // The legacy sheet fired this straight from the tap: one mistap dropped
    // the session for every family booked into it.
    final confirmation = confirmationFor(
      action: AdminClassAction.toggleSession,
      classModel: _class(),
      attendance: null,
    )!;

    expect(confirmation.title, 'Cancel this week?');
    expect(confirmation.message, contains('Families booked into it'));
    expect(confirmation.message, contains('Every other week is unchanged'));
    expect(confirmation.isDestructive, isTrue);
  });

  test('restoring a week is not framed as destructive', () {
    final confirmation = confirmationFor(
      action: AdminClassAction.toggleSession,
      classModel: _class(),
      attendance: _attendance(cancelled: true),
    )!;

    expect(confirmation.confirmLabel, 'Restore');
    expect(confirmation.isDestructive, isFalse);
  });

  test('deleting spells out the cost and cannot be mistaken for a week', () {
    final confirmation = confirmationFor(
      action: AdminClassAction.deleteClass,
      classModel: _class(enrolled: 4),
      attendance: null,
    )!;

    expect(confirmation.title, 'Delete this class?');
    expect(confirmation.message, contains('every week'));
    expect(confirmation.message, contains('all 4 students'));
    expect(confirmation.message, contains('cannot be undone'));
    expect(confirmation.confirmLabel, 'Delete class');
  });
}

void _theTwoCancels() {
  test('the destructive action no longer shares a verb with the weekly one',
      () {
    // The legacy labels were "Cancel This Session" and "Cancel Class", adjacent
    // and both red. One drops a week; the other deletes the class outright.
    final options =
        buildAdminClassOptions(classModel: _class(), attendance: null);

    final weekly = options
        .firstWhere((o) => o.action == AdminClassAction.toggleSession)
        .label;
    final delete = options
        .firstWhere((o) => o.action == AdminClassAction.deleteClass)
        .label;

    expect(weekly.toLowerCase(), startsWith('cancel'));
    expect(delete.toLowerCase(), startsWith('delete'));
    expect(delete.toLowerCase(), isNot(contains('cancel')));
  });

  test('only the delete is toned destructive; the weekly one is caution', () {
    final options =
        buildAdminClassOptions(classModel: _class(), attendance: null);

    expect(
      options
          .firstWhere((o) => o.action == AdminClassAction.toggleSession)
          .tone,
      AdminActionTone.caution,
    );
    expect(
      options.firstWhere((o) => o.action == AdminClassAction.deleteClass).tone,
      AdminActionTone.destructive,
    );
    expect(
      options.firstWhere((o) => o.action == AdminClassAction.editStudents).tone,
      AdminActionTone.normal,
    );
  });

  test('every action that writes requires confirmation', () {
    final options =
        buildAdminClassOptions(classModel: _class(), attendance: null);

    for (final option in options) {
      final writes = option.action == AdminClassAction.toggleSession ||
          option.action == AdminClassAction.deleteClass;
      expect(option.requiresConfirmation, writes, reason: '${option.action}');
    }
  });
}

ClassModel _class({int enrolled = 4}) => ClassModel(
      id: 'c1',
      type: '5-10',
      dayOfWeek: 'Wednesday',
      startTime: '16:00',
      endTime: '17:00',
      capacity: 8,
      enrolledStudents: List.generate(enrolled, (i) => 's$i'),
      tutors: const ['t1'],
    );

Attendance _attendance({bool cancelled = false}) => Attendance(
      id: 'c1_W1',
      date: DateTime(2026, 7, 15, 16),
      termId: '2026_T3',
      cancelled: cancelled,
      updatedAt: DateTime(2026, 7, 15, 16),
      updatedBy: 'admin',
      weekNumber: 1,
      attendance: const ['s0'],
      tutors: const ['t1'],
    );
