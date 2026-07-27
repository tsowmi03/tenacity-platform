import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/models/announcement_model.dart';
import 'package:tenacity/src/ui/announcements/announcement_data.dart';
import 'package:tenacity/src/ui/announcements/announcement_list_view.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';

const _viewports = <String, Size>{
  'reference 402x874': Size(402, 874),
  'narrow 320x640': Size(320, 640),
  'large 430x932': Size(430, 932),
};

Announcement _announcement({
  String id = 'a1',
  String title = 'Holiday timetable published',
  String body =
      'Winter-break intensives open for booking from Monday. Limited seats per class.',
  String audience = 'all',
  bool archived = false,
}) {
  return Announcement(
    id: id,
    title: title,
    body: body,
    createdAt: DateTime(2026, 7, 26, 10),
    archived: archived,
    audience: audience,
  );
}

AnnouncementListViewData _data({
  String role = 'parent',
  Set<String> readIds = const {},
  AnnouncementAudienceFilter filter = AnnouncementAudienceFilter.all,
  List<Announcement>? announcements,
}) {
  return buildAnnouncementListViewData(
    announcements: announcements ??
        [
          _announcement(),
          _announcement(
            id: 'a2',
            title: 'Term 3 starts Monday',
            audience: role == 'admin' ? 'parent' : role,
          ),
        ],
    role: role,
    readAnnouncementIds: readIds,
    audienceFilter: filter,
    now: DateTime(2026, 7, 27, 14),
  );
}

class _Taps {
  int refreshes = 0;
  int retries = 0;
  int adds = 0;
  final filters = <int>[];
  final opened = <String>[];
  final deleted = <String>[];
  final edited = <String>[];
  final archived = <String>[];
}

Future<_Taps> _pump(
  WidgetTester tester, {
  AnnouncementListViewData? data,
  bool isLoading = false,
  String? errorMessage,
  Size size = const Size(402, 874),
  double textScale = 1,
  bool adminActions = false,
}) async {
  final taps = _Taps();
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light,
      home: MediaQuery(
        data: MediaQueryData(textScaler: TextScaler.linear(textScale)),
        child: AnnouncementListView(
          data: data ?? _data(),
          isLoading: isLoading,
          errorMessage: errorMessage,
          onRefresh: () async => taps.refreshes++,
          onRetry: () => taps.retries++,
          onFilterSelected: taps.filters.add,
          onOpen: (announcement) => taps.opened.add(announcement.id),
          onAdd: adminActions ? () => taps.adds++ : null,
          onConfirmDelete: adminActions
              ? (announcement) async {
                  taps.deleted.add(announcement.id);
                  return false;
                }
              : null,
          onEdit: adminActions
              ? (announcement) => taps.edited.add(announcement.id)
              : null,
          onArchiveToggle: adminActions
              ? (announcement) => taps.archived.add(announcement.id)
              : null,
        ),
      ),
    ),
  );
  await tester.pump();
  return taps;
}

void main() {
  group('reader hierarchy', () {
    testWidgets('renders unread and earlier sections', (tester) async {
      await _pump(
        tester,
        data: _data(readIds: const {'a2'}),
      );

      expect(find.text('Announcements'), findsOneWidget);
      expect(
          find.text('Updates for your family · read to clear'), findsOneWidget);
      expect(find.text('UNREAD'), findsOneWidget);
      expect(find.text('EARLIER'), findsOneWidget);
      expect(find.text('Holiday timetable published'), findsOneWidget);
      expect(find.text('Term 3 starts Monday'), findsOneWidget);
    });

    for (final viewport in _viewports.entries) {
      testWidgets('fits ${viewport.key} at text scale 1.3', (tester) async {
        await _pump(
          tester,
          data: _data(readIds: const {'a2'}),
          size: viewport.value,
          textScale: 1.3,
        );

        expect(tester.takeException(), isNull);
      });
    }

    testWidgets('opens the selected announcement', (tester) async {
      final taps = await _pump(tester);

      await tester.tap(find.byKey(const Key('announcement-a1')));
      await tester.pump();

      expect(taps.opened, ['a1']);
    });
  });

  group('admin hierarchy', () {
    testWidgets('renders filters, add action and archived section',
        (tester) async {
      await _pump(
        tester,
        data: _data(
          role: 'admin',
          announcements: [
            _announcement(),
            _announcement(id: 'old', archived: true),
          ],
        ),
        adminActions: true,
      );

      expect(find.text('Posted to families & staff'), findsOneWidget);
      expect(find.text('All'), findsOneWidget);
      expect(find.text('Parents'), findsOneWidget);
      expect(find.text('Tutors'), findsOneWidget);
      expect(find.text('PUBLISHED'), findsOneWidget);
      expect(find.text('ARCHIVED'), findsOneWidget);
      expect(find.bySemanticsLabel('Create announcement'), findsOneWidget);
    });

    testWidgets('reports filter and add actions', (tester) async {
      final taps = await _pump(
        tester,
        data: _data(role: 'admin'),
        adminActions: true,
      );

      await tester.tap(find.text('Parents'));
      await tester.tap(find.bySemanticsLabel('Create announcement'));
      await tester.pump();

      expect(taps.filters, [1]);
      expect(taps.adds, 1);
    });

    testWidgets('reports edit and archive actions', (tester) async {
      final taps = await _pump(
        tester,
        data: _data(role: 'admin'),
        adminActions: true,
      );

      await tester.tap(
        find.byKey(const Key('announcement-edit-a1')),
      );
      await tester.tap(
        find.byKey(const Key('announcement-archive-a1')),
      );
      await tester.pump();

      expect(taps.edited, ['a1']);
      expect(taps.archived, ['a1']);
    });

    testWidgets('asks the container before deleting', (tester) async {
      final taps = await _pump(
        tester,
        data: _data(role: 'admin'),
        adminActions: true,
      );

      await tester.drag(
        find.byKey(const Key('dismiss-announcement-a1')),
        const Offset(-500, 0),
      );
      await tester.pumpAndSettle();

      expect(taps.deleted, ['a1']);
      expect(find.text('Holiday timetable published'), findsOneWidget);
    });
  });

  group('states', () {
    testWidgets('shows a skeleton only when there is no cached data',
        (tester) async {
      await _pump(
        tester,
        data: _data(announcements: const []),
        isLoading: true,
      );

      expect(find.text('No announcements'), findsNothing);
      expect(find.byType(AnnouncementRow), findsNothing);
    });

    testWidgets('distinguishes load errors from an empty feed', (tester) async {
      final taps = await _pump(
        tester,
        data: _data(announcements: const []),
        errorMessage: 'Check your connection and try again.',
      );

      expect(find.text('Announcements could not be loaded'), findsOneWidget);
      expect(find.text('No announcements'), findsNothing);

      await tester.tap(find.text('Try again'));
      await tester.pump();
      expect(taps.retries, 1);
    });

    testWidgets('shows the empty state when loading succeeded', (tester) async {
      await _pump(tester, data: _data(announcements: const []));

      expect(find.text('No announcements'), findsOneWidget);
    });
  });
}
