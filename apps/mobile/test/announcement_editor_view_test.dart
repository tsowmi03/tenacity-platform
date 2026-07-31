import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/ui/announcements/announcement_editor_data.dart';
import 'package:tenacity/src/ui/announcements/announcement_editor_view.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';

class _EditorTaps {
  int backs = 0;
  final drafts = <AnnouncementDraft>[];
}

Future<_EditorTaps> _pumpEditor(
  WidgetTester tester, {
  AnnouncementDraft initialValue = const AnnouncementDraft(
    title: '',
    body: '',
    audience: 'all',
    archived: false,
  ),
  bool isEditing = false,
  bool isSaving = false,
  Size size = const Size(402, 874),
  double textScale = 1,
  Future<void> Function(AnnouncementDraft draft)? onSubmit,
}) async {
  final taps = _EditorTaps();
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light,
      home: MediaQuery(
        data: MediaQueryData(textScaler: TextScaler.linear(textScale)),
        child: AnnouncementEditorView(
          initialValue: initialValue,
          isEditing: isEditing,
          isSaving: isSaving,
          onCancel: () => taps.backs++,
          onSubmit: onSubmit ?? (draft) async => taps.drafts.add(draft),
        ),
      ),
    ),
  );
  await tester.pump();
  return taps;
}

void main() {
  testWidgets('creates a trimmed published announcement', (tester) async {
    final taps = await _pumpEditor(tester);

    await tester.enterText(
      find.byKey(const Key('announcement-title-field')),
      '  Holiday timetable  ',
    );
    await tester.enterText(
      find.byKey(const Key('announcement-body-field')),
      '  Bookings open Monday.  ',
    );
    await tester.tap(
      find.byKey(const Key('announcement-audience-parent')),
    );
    await tester.ensureVisible(find.byKey(const Key('announcement-submit')));
    await tester.tap(find.byKey(const Key('announcement-submit')));
    await tester.pump();

    expect(taps.drafts, hasLength(1));
    expect(taps.drafts.single.title, 'Holiday timetable');
    expect(taps.drafts.single.body, 'Bookings open Monday.');
    expect(taps.drafts.single.audience, 'parent');
    expect(taps.drafts.single.archived, isFalse);
  });

  testWidgets('validates before submitting', (tester) async {
    final taps = await _pumpEditor(tester);

    await tester.ensureVisible(find.byKey(const Key('announcement-submit')));
    await tester.tap(find.byKey(const Key('announcement-submit')));
    await tester.pump();

    expect(taps.drafts, isEmpty);
    expect(find.text('Enter a title.'), findsOneWidget);
    await tester.drag(
      find.byKey(const Key('announcement-editor-scroll')),
      const Offset(0, -400),
    );
    await tester.pump();
    expect(find.text('Enter the announcement.'), findsOneWidget);
  });

  testWidgets('prefills edit state and can keep it archived', (tester) async {
    final taps = await _pumpEditor(
      tester,
      isEditing: true,
      initialValue: const AnnouncementDraft(
        title: 'Existing title',
        body: 'Existing body',
        audience: 'tutor',
        archived: true,
      ),
    );

    expect(find.text('Edit announcement'), findsOneWidget);
    expect(find.text('Existing title'), findsOneWidget);
    expect(find.text('Existing body'), findsOneWidget);
    expect(
      tester
          .widget<ChoiceChip>(
            find.byKey(const Key('announcement-audience-tutor')),
          )
          .selected,
      isTrue,
    );

    await tester.ensureVisible(find.byKey(const Key('announcement-submit')));
    await tester.tap(find.byKey(const Key('announcement-submit')));
    await tester.pump();

    expect(taps.drafts.single.archived, isTrue);
  });

  testWidgets('back action is wired and saving disables submission',
      (tester) async {
    final taps = await _pumpEditor(
      tester,
      isSaving: true,
      initialValue: const AnnouncementDraft(
        title: 'Title',
        body: 'Body',
        audience: 'all',
        archived: false,
      ),
    );

    await tester.tap(find.byKey(const Key('announcement-editor-back')));
    expect(taps.backs, 1);

    await tester.ensureVisible(find.byKey(const Key('announcement-submit')));
    expect(
      tester
          .widget<FilledButton>(
            find.byKey(const Key('announcement-submit')),
          )
          .onPressed,
      isNull,
    );
  });

  testWidgets('blocks duplicate submissions while save is pending',
      (tester) async {
    final gate = Completer<void>();
    late _EditorTaps taps;
    taps = await _pumpEditor(
      tester,
      initialValue: const AnnouncementDraft(
        title: 'Title',
        body: 'Body',
        audience: 'all',
        archived: false,
      ),
      onSubmit: (draft) {
        taps.drafts.add(draft);
        return gate.future;
      },
    );

    await tester.ensureVisible(find.byKey(const Key('announcement-submit')));
    await tester.tap(find.byKey(const Key('announcement-submit')));
    await tester.tap(find.byKey(const Key('announcement-submit')));
    await tester.pump();

    expect(taps.drafts, hasLength(1));
    expect(
      tester
          .widget<FilledButton>(
            find.byKey(const Key('announcement-submit')),
          )
          .onPressed,
      isNull,
    );

    gate.complete();
    await tester.pump();
  });

  testWidgets('fits a narrow screen with larger text', (tester) async {
    await _pumpEditor(
      tester,
      size: const Size(320, 640),
      textScale: 1.3,
    );

    expect(tester.takeException(), isNull);
  });
}
