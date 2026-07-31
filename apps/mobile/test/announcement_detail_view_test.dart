import 'package:flutter/material.dart';
import 'package:flutter_linkify/flutter_linkify.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/models/announcement_model.dart';
import 'package:tenacity/src/ui/announcements/announcement_detail_view.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';

Announcement _announcement({bool archived = false}) => Announcement(
      id: 'a1',
      title: 'Holiday timetable published',
      body: 'Bookings open at https://example.com on Monday.',
      createdAt: DateTime(2026, 7, 26, 10, 30),
      archived: archived,
      audience: 'parent',
    );

class _DetailTaps {
  int backs = 0;
  int edits = 0;
  int archives = 0;
  int deletes = 0;
  final links = <String>[];
}

Future<_DetailTaps> _pumpDetail(
  WidgetTester tester, {
  bool isAdmin = false,
  bool archived = false,
  Size size = const Size(402, 874),
  double textScale = 1,
}) async {
  final taps = _DetailTaps();
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light,
      home: MediaQuery(
        data: MediaQueryData(textScaler: TextScaler.linear(textScale)),
        child: AnnouncementDetailView(
          announcement: _announcement(archived: archived),
          isAdmin: isAdmin,
          onBack: () => taps.backs++,
          onOpenLink: taps.links.add,
          onEdit: isAdmin ? () => taps.edits++ : null,
          onArchiveToggle: isAdmin ? () => taps.archives++ : null,
          onDelete: isAdmin ? () => taps.deletes++ : null,
        ),
      ),
    ),
  );
  await tester.pump();
  return taps;
}

void main() {
  testWidgets('renders the complete announcement for readers', (tester) async {
    await _pumpDetail(tester);

    expect(find.text('Announcement'), findsOneWidget);
    expect(find.text('PARENTS'), findsOneWidget);
    expect(find.text('Holiday timetable published'), findsOneWidget);
    expect(
      tester
          .widget<Linkify>(
            find.byKey(const Key('announcement-detail-body')),
          )
          .text,
      'Bookings open at https://example.com on Monday.',
    );
    expect(find.text('26 July 2026 · 10:30 AM'), findsOneWidget);
    expect(find.text('Edit'), findsNothing);
  });

  testWidgets('admin actions are wired', (tester) async {
    final taps = await _pumpDetail(tester, isAdmin: true);

    await tester.tap(find.byKey(const Key('announcement-detail-edit')));
    await tester.tap(find.byKey(const Key('announcement-detail-archive')));
    await tester.tap(find.byKey(const Key('announcement-detail-delete')));
    await tester.tap(find.byKey(const Key('announcement-detail-back')));
    await tester.pump();

    expect(taps.edits, 1);
    expect(taps.archives, 1);
    expect(taps.deletes, 1);
    expect(taps.backs, 1);
  });

  testWidgets('an archived announcement offers restore', (tester) async {
    await _pumpDetail(tester, isAdmin: true, archived: true);

    expect(find.text('ARCHIVED'), findsOneWidget);
    expect(find.text('Restore'), findsOneWidget);
  });

  testWidgets('fits a narrow screen with larger text', (tester) async {
    await _pumpDetail(
      tester,
      size: const Size(320, 640),
      textScale: 1.3,
    );

    expect(tester.takeException(), isNull);
  });
}
