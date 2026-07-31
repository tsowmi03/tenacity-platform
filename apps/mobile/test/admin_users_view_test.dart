import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';
import 'package:tenacity/src/ui/users/admin/admin_users_data.dart';
import 'package:tenacity/src/ui/users/admin/admin_users_view.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  GoogleFonts.config.allowRuntimeFetching = false;

  testWidgets('renders the directory, its summary and every row',
      (tester) async {
    await _setViewport(tester, const Size(402, 874));

    await tester.pumpWidget(_host(_view(data: _data())));
    await tester.pump();

    expect(find.text('Users'), findsOneWidget);
    expect(find.text('248 students · 132 parents · 18 tutors'), findsOneWidget);
    expect(find.text('Sarah Nguyen'), findsOneWidget);
    expect(find.text('Parent · Ella & Max · 8 tokens'), findsOneWidget);
    expect(find.text('OVERDUE'), findsOneWidget);
  });

  testWidgets('shows no status the data cannot support', (tester) async {
    // The reference carries ACTIVE and TRIAL pills; neither exists in the data
    // and neither is invented. Nor is the `+` account-creation button, which is
    // out of scope — see §7/§11.
    await _setViewport(tester, const Size(402, 874));

    await tester.pumpWidget(_host(_view(data: _data())));
    await tester.pump();

    expect(find.text('ACTIVE'), findsNothing);
    expect(find.text('TRIAL'), findsNothing);
    expect(find.byIcon(Icons.add), findsNothing);
    expect(find.byIcon(Icons.add_rounded), findsNothing);
  });

  testWidgets('switching tab reports the chosen tab', (tester) async {
    await _setViewport(tester, const Size(402, 874));

    final chosen = <AdminUsersTab>[];
    await tester.pumpWidget(
      _host(_view(data: _data(), onTabChanged: chosen.add)),
    );
    await tester.pump();

    await tester.tap(find.text('Tutors'));
    await tester.pump();

    expect(chosen, [AdminUsersTab.tutors]);
  });

  testWidgets('a person with an account opens; a student does not',
      (tester) async {
    await _setViewport(tester, const Size(402, 874));

    final tapped = <String>[];
    await tester.pumpWidget(
      _host(_view(data: _data(), onPersonTapped: (row) => tapped.add(row.id))),
    );
    await tester.pump();

    await tester.tap(find.byKey(const Key('admin-users-row-p1')));
    await tester.tap(find.byKey(const Key('admin-users-row-s1')));
    await tester.pump();

    // Both raise the callback; the screen decides a student has no account to
    // open, which keeps that rule in one place.
    expect(tapped, ['p1', 's1']);
  });

  testWidgets('search text is reported', (tester) async {
    await _setViewport(tester, const Size(402, 874));

    final queries = <String>[];
    await tester.pumpWidget(
      _host(_view(data: _data(), onSearchChanged: queries.add)),
    );
    await tester.pump();

    await tester.enterText(find.byKey(const Key('admin-users-search')), 'wei');
    await tester.pump();

    expect(queries.last, 'wei');
  });

  testWidgets('loading shows skeletons rather than an empty directory',
      (tester) async {
    await _setViewport(tester, const Size(402, 874));

    await tester.pumpWidget(
      _host(_view(data: _data(rows: const []), isLoading: true)),
    );
    await tester.pump();

    expect(find.byKey(const Key('admin-users-loading')), findsOneWidget);
    expect(find.byKey(const Key('admin-users-empty')), findsNothing);
  });

  testWidgets('no match shows an empty state, not an error', (tester) async {
    await _setViewport(tester, const Size(402, 874));

    await tester.pumpWidget(_host(_view(data: _data(rows: const []))));
    await tester.pump();

    expect(find.byKey(const Key('admin-users-empty')), findsOneWidget);
    expect(find.byKey(const Key('admin-users-error')), findsNothing);
  });

  testWidgets('an error offers a retry', (tester) async {
    await _setViewport(tester, const Size(402, 874));

    await tester.pumpWidget(
      _host(_view(data: _data(rows: const [], error: 'Network unavailable'))),
    );
    await tester.pump();

    expect(find.byKey(const Key('admin-users-error')), findsOneWidget);
    expect(find.byKey(const Key('admin-users-empty')), findsNothing);
  });

  for (final size in const [Size(320, 720), Size(430, 932)]) {
    testWidgets('renders at ${size.width.toInt()} wide', (tester) async {
      await _setViewport(tester, size);

      await tester.pumpWidget(_host(_view(data: _data())));
      await tester.pump();

      expect(tester.takeException(), isNull);
      expect(find.text('Users'), findsOneWidget);
    });
  }

  testWidgets('renders at text scale 1.3 on the narrowest width',
      (tester) async {
    await _setViewport(tester, const Size(320, 720));

    await tester.pumpWidget(_host(_view(data: _data()), textScale: 1.3));
    await tester.pump();

    expect(tester.takeException(), isNull);
    expect(find.text('Users'), findsOneWidget);
  });
}

Future<void> _setViewport(WidgetTester tester, Size size) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

Widget _host(Widget child, {double textScale = 1.0}) {
  return MaterialApp(
    debugShowCheckedModeBanner: false,
    theme: AppTheme.light,
    home: MediaQuery(
      data: MediaQueryData(textScaler: TextScaler.linear(textScale)),
      child: child,
    ),
  );
}

Widget _view({
  required AdminUsersViewData data,
  bool isLoading = false,
  ValueChanged<String>? onSearchChanged,
  ValueChanged<AdminUsersTab>? onTabChanged,
  ValueChanged<AdminUserRow>? onPersonTapped,
}) {
  return AdminUsersView(
    data: data,
    isLoading: isLoading,
    onSearchChanged: onSearchChanged ?? (_) {},
    onTabChanged: onTabChanged ?? (_) {},
    onPersonTapped: onPersonTapped ?? (_) {},
    onRefresh: () async {},
    onRetry: () {},
  );
}

AdminUsersViewData _data({List<AdminUserRow>? rows, String? error}) {
  return AdminUsersViewData(
    tab: AdminUsersTab.parents,
    rows: rows ??
        const [
          AdminUserRow(
            id: 'p1',
            name: 'Sarah Nguyen',
            initials: 'SN',
            subtitle: 'Parent · Ella & Max · 8 tokens',
            isOverdue: true,
            account: null,
          ),
          AdminUserRow(
            id: 'p2',
            name: 'Wei Chen',
            initials: 'WC',
            subtitle: 'Parent · Aisha · 0 tokens',
          ),
          AdminUserRow(
            id: 's1',
            name: 'Ella Nguyen',
            initials: 'EN',
            subtitle: 'Year 9 · Maths',
          ),
        ],
    summary: '248 students · 132 parents · 18 tutors',
    parentCount: 132,
    studentCount: 248,
    tutorCount: 18,
    overdueCount: 1,
    errorMessage: error,
  );
}
