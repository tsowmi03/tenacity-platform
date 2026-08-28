import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/models/waitlist_entry_model.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';
import 'package:tenacity/src/ui/timetable/admin/admin_class_management_data.dart';
import 'package:tenacity/src/ui/timetable/admin/admin_class_management_sheets.dart';

Future<void> _openSheet(
  WidgetTester tester,
  Widget Function(BuildContext context) builder, {
  bool allowUserDismissal = true,
}) async {
  tester.view.physicalSize = const Size(402, 874);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light,
      home: Scaffold(
        body: Builder(
          builder: (context) => Center(
            child: FilledButton(
              key: const Key('open-sheet'),
              onPressed: () => showAppBottomSheet<void>(
                context: context,
                allowUserDismissal: allowUserDismissal,
                builder: builder,
              ),
              child: const Text('Open'),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.byKey(const Key('open-sheet')));
  await tester.pumpAndSettle();
}

void main() {
  group('enrolment type', () {
    testWidgets('omits one-off when this week has no generated session',
        (tester) async {
      await _openSheet(
        tester,
        (context) => AdminEnrolmentTypeSheet(
          studentName: 'Ava Student',
          canBookOneOff: false,
          onSelected: (_) {},
          onCancel: () => Navigator.pop(context),
        ),
      );

      expect(find.byKey(const Key('admin-enrol-one-off')), findsNothing);
      expect(
        find.byKey(const Key('admin-enrol-one-off-unavailable')),
        findsOneWidget,
      );
      expect(find.byKey(const Key('admin-enrol-permanent')), findsOneWidget);
    });

    testWidgets('offers both choices when the session exists', (tester) async {
      await _openSheet(
        tester,
        (context) => AdminEnrolmentTypeSheet(
          studentName: 'Ava Student',
          canBookOneOff: true,
          onSelected: (_) {},
          onCancel: () => Navigator.pop(context),
        ),
      );

      expect(find.byKey(const Key('admin-enrol-one-off')), findsOneWidget);
      expect(find.byKey(const Key('admin-enrol-permanent')), findsOneWidget);
    });
  });

  group('class picker', () {
    ClassModel classOn({
      required String id,
      required String day,
      required String start,
      String type = '5-10',
      int capacity = 6,
      List<String> enrolled = const [],
    }) =>
        ClassModel(
          id: id,
          type: type,
          dayOfWeek: day,
          startTime: start,
          endTime: '17:00',
          capacity: capacity,
          enrolledStudents: enrolled,
          tutors: const ['t1'],
        );

    testWidgets('lists classes in order and selects one', (tester) async {
      AdminClassChoice? picked;
      await _openSheet(
        tester,
        (context) => AdminClassPickerSheet(
          studentName: 'Ava Student',
          choices: Future.value(
            buildAdminClassChoices(
              classes: [
                classOn(id: 'wed', day: 'Wednesday', start: '16:00'),
                classOn(id: 'mon', day: 'Monday', start: '09:00'),
              ],
            ),
          ),
          onSelected: (choice) {
            picked = choice;
            Navigator.pop(context);
          },
          onCancel: () => Navigator.pop(context),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('admin-class-choice-mon')), findsOneWidget);
      expect(find.byKey(const Key('admin-class-choice-wed')), findsOneWidget);

      await tester.tap(find.byKey(const Key('admin-class-choice-mon')));
      await tester.pumpAndSettle();

      expect(picked?.classModel.id, 'mon');
    });

    testWidgets('a class the student is already on cannot be chosen',
        (tester) async {
      var selections = 0;
      await _openSheet(
        tester,
        (context) => AdminClassPickerSheet(
          studentName: 'Ava Student',
          choices: Future.value(
            buildAdminClassChoices(
              classes: [
                classOn(
                  id: 'has-them',
                  day: 'Monday',
                  start: '09:00',
                  enrolled: const ['s1'],
                ),
              ],
              studentId: 's1',
            ),
          ),
          onSelected: (_) => selections++,
          onCancel: () => Navigator.pop(context),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Already enrolled'), findsNothing);
      await tester.tap(find.byKey(const Key('admin-class-choice-has-them')));
      await tester.pumpAndSettle();

      expect(selections, 0);
    });

    testWidgets('search narrows by class name and day', (tester) async {
      await _openSheet(
        tester,
        (context) => AdminClassPickerSheet(
          studentName: 'Ava Student',
          choices: Future.value(
            buildAdminClassChoices(
              classes: [
                classOn(id: 'mon', day: 'Monday', start: '09:00'),
                classOn(
                  id: 'wed',
                  day: 'Wednesday',
                  start: '16:00',
                  type: 'stdmath11',
                ),
              ],
            ),
          ),
          onSelected: (_) {},
          onCancel: () => Navigator.pop(context),
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const Key('admin-class-search')),
        'wednesday',
      );
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('admin-class-choice-wed')), findsOneWidget);
      expect(find.byKey(const Key('admin-class-choice-mon')), findsNothing);
    });

    testWidgets('an empty class list explains itself', (tester) async {
      await _openSheet(
        tester,
        (context) => AdminClassPickerSheet(
          studentName: 'Ava Student',
          choices: Future.value(const <AdminClassChoice>[]),
          onSelected: (_) {},
          onCancel: () => Navigator.pop(context),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.byKey(const Key('admin-class-picker-empty')),
        findsOneWidget,
      );
    });

    testWidgets('a failed load offers a retryable error, not an empty list',
        (tester) async {
      await _openSheet(
        tester,
        (context) => AdminClassPickerSheet(
          studentName: 'Ava Student',
          choices: Future<List<AdminClassChoice>>.error(
            StateError('offline'),
          ),
          onSelected: (_) {},
          onCancel: () => Navigator.pop(context),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.byKey(const Key('admin-class-picker-error')),
        findsOneWidget,
      );
      expect(
        find.byKey(const Key('admin-class-picker-empty')),
        findsNothing,
      );
    });
  });

  group('add class', () {
    testWidgets('shows a clear error for the seeded zero-length class',
        (tester) async {
      var submits = 0;
      await _openSheet(
        tester,
        (context) => AdminAddClassSheet(
          tutors: const [],
          onSubmit: (_) async {
            submits++;
            return null;
          },
          onCancel: () => Navigator.pop(context),
        ),
      );

      await tester.tap(find.byKey(const Key('sheet-confirm')));
      await tester.pump();

      expect(find.text('End time must be after start time.'), findsOneWidget);
      expect(submits, 0);
      expect(find.text('Add a class'), findsOneWidget);
    });

    testWidgets('a successful valid submission closes once', (tester) async {
      final drafts = <AdminAddClassDraft>[];
      await _openSheet(
        tester,
        (context) => AdminAddClassSheet(
          tutors: const [],
          onSubmit: (draft) async {
            drafts.add(draft);
            return null;
          },
          onCancel: () => Navigator.pop(context),
        ),
      );

      await tester.tap(find.byKey(const Key('admin-add-class-end')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('4:30 PM').last);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('sheet-confirm')));
      await tester.pumpAndSettle();

      expect(drafts, hasLength(1));
      expect(drafts.single.endTime, '16:30');
      expect(find.text('Add a class'), findsNothing);
    });
  });

  group('success and error lifecycle', () {
    testWidgets('weekly roster save closes after one success', (tester) async {
      var saves = 0;
      await _openSheet(
        tester,
        (context) => AdminRosterSheet(
          classTitle: 'Years 5-10',
          whenLabel: 'Monday, 4:00 PM',
          hasSession: true,
          loadEntries: () async => AdminRosterSnapshot(
            entries: [_rosterEntry()],
            bookedStudentIds: const ['s1'],
            attendanceDocId: 'T3_W1',
          ),
          onAddStudent: () async => false,
          onRemove: (_) async => false,
          onSaveWeekBookings: (_) async {
            saves++;
            return null;
          },
          onOpenFeedback: (_) {},
          onComposeFeedback: (_) {},
          onClose: () => Navigator.pop(context),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('sheet-confirm')));
      await tester.pumpAndSettle();

      expect(saves, 1);
      expect(find.text('Enrolments'), findsNothing);
    });

    testWidgets('weekly roster no-op preserves an unresolved booked student',
        (tester) async {
      List<String>? savedIds;
      await _openSheet(
        tester,
        (context) => AdminRosterSheet(
          classTitle: 'Years 5-10',
          whenLabel: 'Monday, 4:00 PM',
          hasSession: true,
          loadEntries: () async => AdminRosterSnapshot(
            entries: [_rosterEntry()],
            bookedStudentIds: const ['s1', 'missing-student'],
            attendanceDocId: 'T3_W1',
          ),
          onAddStudent: () async => false,
          onRemove: (_) async => false,
          onSaveWeekBookings: (update) async {
            savedIds = update.studentIds;
            return null;
          },
          onOpenFeedback: (_) {},
          onComposeFeedback: (_) {},
          onClose: () => Navigator.pop(context),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('sheet-confirm')));
      await tester.pumpAndSettle();

      expect(savedIds, containsAll(<String>['s1', 'missing-student']));
      expect(savedIds, hasLength(2));
    });

    testWidgets('conflict reloads the snapshot before a retry', (tester) async {
      var loadCount = 0;
      final updates = <AdminWeekBookingsUpdate>[];
      await _openSheet(
        tester,
        (context) => AdminRosterSheet(
          classTitle: 'Years 5-10',
          whenLabel: 'Monday, 4:00 PM',
          hasSession: true,
          loadEntries: () async {
            loadCount++;
            return AdminRosterSnapshot(
              entries: [_rosterEntry()],
              bookedStudentIds: loadCount == 1
                  ? const ['s1']
                  : const ['s1', 'other-admin-student'],
              attendanceDocId: 'T3_W1',
            );
          },
          onAddStudent: () async => false,
          onRemove: (_) async => false,
          onSaveWeekBookings: (update) async {
            updates.add(update);
            return updates.length == 1
                ? 'Weekly bookings changed while this editor was open.'
                : null;
          },
          onOpenFeedback: (_) {},
          onComposeFeedback: (_) {},
          onClose: () => Navigator.pop(context),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('admin-roster-booked-s1')));
      await tester.tap(find.byKey(const Key('sheet-confirm')));
      await tester.pumpAndSettle();

      expect(updates.first.expectedStudentIds, ['s1']);
      expect(updates.first.studentIds, isEmpty);
      expect(loadCount, 2);

      await tester.tap(find.byKey(const Key('sheet-confirm')));
      await tester.pumpAndSettle();

      expect(
        updates.last.expectedStudentIds,
        ['s1', 'other-admin-student'],
      );
      expect(
        updates.last.studentIds,
        ['s1', 'other-admin-student'],
      );
    });

    testWidgets('pending roster save disables every mutating control',
        (tester) async {
      final result = Completer<String?>();
      await _openSheet(
        tester,
        (context) => AdminRosterSheet(
          classTitle: 'Years 5-10',
          whenLabel: 'Monday, 4:00 PM',
          hasSession: true,
          loadEntries: () async => AdminRosterSnapshot(
            entries: [_rosterEntry()],
            bookedStudentIds: const ['s1'],
            attendanceDocId: 'T3_W1',
          ),
          onAddStudent: () async => false,
          onRemove: (_) async => false,
          onSaveWeekBookings: (_) => result.future,
          onOpenFeedback: (_) {},
          onComposeFeedback: (_) {},
          onClose: () => Navigator.pop(context),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('sheet-confirm')));
      await tester.pump();

      expect(
        tester
            .widget<FilledButton>(
              find.byKey(const Key('admin-roster-add')),
            )
            .onPressed,
        isNull,
      );
      expect(
        tester
            .widget<Checkbox>(
              find.byKey(const Key('admin-roster-booked-s1')),
            )
            .onChanged,
        isNull,
      );
      expect(
        tester
            .widget<PopupMenuButton<String>>(
              find.byKey(const Key('admin-roster-actions-s1')),
            )
            .enabled,
        isFalse,
      );

      result.complete(null);
      await tester.pumpAndSettle();
      expect(find.text('Enrolments'), findsNothing);
    });

    testWidgets('pending waitlist promotion blocks all sheet actions',
        (tester) async {
      final promotion = Completer<void>();
      final entries = [
        _waitlistEntryData('w1', 'Alex Student', 1),
        _waitlistEntryData('w2', 'Blair Student', 2),
      ];
      await _openSheet(
        tester,
        (context) => AdminWaitlistSheet(
          classTitle: 'Years 5-10',
          whenLabel: 'Monday, 4:00 PM',
          loadEntries: () async => entries,
          onPromote: (_) => promotion.future,
          onClose: () => Navigator.pop(context),
        ),
        allowUserDismissal: false,
      );
      await tester.pumpAndSettle();

      await tester.tap(
        find.byKey(const Key('admin-waitlist-promote-w1')),
      );
      await tester.pump();

      for (final id in const ['w1', 'w2']) {
        expect(
          tester
              .widget<FilledButton>(
                find.byKey(Key('admin-waitlist-promote-$id')),
              )
              .onPressed,
          isNull,
        );
      }
      expect(
        tester
            .widget<OutlinedButton>(
              find.byKey(const Key('admin-waitlist-refresh')),
            )
            .onPressed,
        isNull,
      );
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Close'),
            )
            .onPressed,
        isNull,
      );

      promotion.complete();
      await tester.pumpAndSettle();

      expect(
        tester
            .widget<FilledButton>(
              find.byKey(const Key('admin-waitlist-promote-w2')),
            )
            .onPressed,
        isNotNull,
      );
    });

    testWidgets('tutor assignment closes after one success', (tester) async {
      var saves = 0;
      await _openSheet(
        tester,
        (context) => AdminTutorAssignmentSheet(
          classTitle: 'Years 5-10',
          whenLabel: 'Monday, 4:00 PM',
          currentWeek: 2,
          tutors: const [AdminTutorChoice(id: 't1', name: 'Taylor Tutor')],
          initialTutorIds: const ['t1'],
          canApplyThisWeek: true,
          onSubmit: (_) async {
            saves++;
            return null;
          },
          onCancel: () => Navigator.pop(context),
        ),
      );

      await tester.tap(find.byKey(const Key('sheet-confirm')));
      await tester.pumpAndSettle();

      expect(saves, 1);
      expect(find.text('Assign tutors'), findsNothing);
    });

    testWidgets('tutor error requires close and reopen before another save',
        (tester) async {
      final result = Completer<String?>();
      await _openSheet(
        tester,
        (context) => AdminTutorAssignmentSheet(
          classTitle: 'Years 5-10',
          whenLabel: 'Monday, 4:00 PM',
          currentWeek: 2,
          tutors: const [AdminTutorChoice(id: 't1', name: 'Taylor Tutor')],
          initialTutorIds: const ['t1'],
          canApplyThisWeek: true,
          onSubmit: (_) => result.future,
          onCancel: () => Navigator.pop(context),
        ),
      );

      await tester.tap(find.byKey(const Key('sheet-confirm')));
      await tester.pump();
      var button = tester.widget<FilledButton>(
        find.byKey(const Key('sheet-confirm')),
      );
      expect(button.onPressed, isNull);

      result.complete('Assignments changed. Refresh and try again.');
      await tester.pumpAndSettle();

      expect(
        find.textContaining(
          'This editor is now out of date — close and reopen it.',
        ),
        findsOneWidget,
      );
      // The submitted message is kept alongside the sheet's own instruction.
      expect(
        find.textContaining('Assignments changed. Refresh and try again.'),
        findsOneWidget,
      );
      button = tester.widget<FilledButton>(
        find.byKey(const Key('sheet-confirm')),
      );
      expect(button.onPressed, isNull);
    });

    testWidgets('pending class creation cannot dismiss its route',
        (tester) async {
      final result = Completer<String?>();
      await _openSheet(
        tester,
        (context) => AdminAddClassSheet(
          tutors: const [],
          onSubmit: (_) => result.future,
          onCancel: () => Navigator.pop(context),
        ),
        allowUserDismissal: false,
      );

      await tester.tap(find.byKey(const Key('admin-add-class-end')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('4:30 PM').last);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('sheet-confirm')));
      await tester.pump();

      await tester.binding.handlePopRoute();
      await tester.pump();
      await tester.tapAt(const Offset(5, 5));
      await tester.pump();
      await tester.drag(find.text('Add a class'), const Offset(0, 300));
      await tester.pump();

      expect(find.text('Add a class'), findsOneWidget);

      result.complete(null);
      await tester.pumpAndSettle();
      expect(find.text('Add a class'), findsNothing);
    });
  });

  group('responsive', () {
    for (final size in const [Size(320, 640), Size(402, 874), Size(430, 932)]) {
      testWidgets('tutor sheet fits ${size.width.toInt()}px', (tester) async {
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);

        await tester.pumpWidget(
          MaterialApp(
            theme: AppTheme.light,
            home: Scaffold(
              body: Align(
                alignment: Alignment.bottomCenter,
                child: AdminTutorAssignmentSheet(
                  classTitle: 'Year 12 Mathematics Extension 1',
                  whenLabel: 'Wednesday, 4:30 PM',
                  currentWeek: 4,
                  tutors: const [
                    AdminTutorChoice(id: 't1', name: 'Taylor Tutor'),
                    AdminTutorChoice(id: 't2', name: 'Jordan Tutor'),
                    AdminTutorChoice(id: 't3', name: 'Morgan Tutor'),
                  ],
                  initialTutorIds: const ['t1'],
                  canApplyThisWeek: true,
                  onSubmit: (_) async => null,
                  onCancel: () {},
                ),
              ),
            ),
          ),
        );
        await tester.pump();

        expect(tester.takeException(), isNull);
      });
    }
  });
}

AdminWaitlistEntryData _waitlistEntryData(
  String id,
  String studentName,
  int position,
) {
  final now = DateTime(2026, 7, 29);
  return AdminWaitlistEntryData(
    entry: WaitlistEntry(
      id: id,
      classId: 'c1',
      studentId: 'student-$id',
      parentId: 'parent-$id',
      classType: '5-10',
      dayOfWeek: 'Monday',
      startTime: '16:00',
      endTime: '17:00',
      status: WaitlistStatus.active,
      reason: WaitlistReason.classFull,
      position: position,
      createdAt: now,
      updatedAt: now,
    ),
    studentName: studentName,
    parentName: 'Parent $id',
  );
}

AdminRosterEntry _rosterEntry() => AdminRosterEntry(
      student: Student(
        id: 's1',
        firstName: 'Ava',
        lastName: 'Student',
        parents: const ['p1'],
        grade: 'Year 8',
        subjects: const ['maths'],
      ),
      isPermanent: true,
      isBookedThisWeek: true,
    );
