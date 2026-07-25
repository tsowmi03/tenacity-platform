import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

/// Wraps [child] the way a real V3 screen does: navy scaffold, app theme, and
/// a phone-sized viewport matching the reference designs (402 x 874).
Future<void> pumpOnNavy(
  WidgetTester tester,
  Widget child, {
  Size size = const Size(402, 874),
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light,
      home: Scaffold(
        backgroundColor: AppColors.ink,
        body: SafeArea(child: child),
      ),
    ),
  );
}

void main() {
  group('AppHeader', () {
    testWidgets('renders title, subtitle, avatar and metrics', (tester) async {
      await pumpOnNavy(
        tester,
        const AppHeader(
          title: 'Welcome back, Sarah',
          subtitle: 'Term 3 is underway.',
          avatarInitial: 'S',
          metrics: [
            MetricTile(value: '3', label: 'classes this week'),
            MetricTile(value: '2', label: 'unread messages', showDot: true),
          ],
        ),
      );

      expect(find.text('Welcome back, Sarah'), findsOneWidget);
      expect(find.text('Term 3 is underway.'), findsOneWidget);
      expect(find.text('S'), findsOneWidget);
      expect(find.text('3'), findsOneWidget);
      expect(find.text('classes this week'), findsOneWidget);
    });

    testWidgets('avatar is only tappable when a handler is given',
        (tester) async {
      var taps = 0;
      await pumpOnNavy(
        tester,
        AppHeader(
          title: 'Good afternoon, Jordan',
          avatarInitial: 'J',
          avatarKey: const Key('avatar'),
          onAvatarTap: () => taps++,
        ),
      );

      await tester.tap(find.byKey(const Key('avatar')));
      expect(taps, 1);

      await pumpOnNavy(
        tester,
        const AppHeader(title: 'No handler', avatarInitial: 'N'),
      );
      expect(find.byType(InkWell), findsNothing);
    });

    testWidgets('omits the subtitle when none is given', (tester) async {
      await pumpOnNavy(
        tester,
        const AppHeader(title: 'Just a title', avatarInitial: 'J'),
      );

      expect(find.text('Just a title'), findsOneWidget);
      expect(find.byType(Text), findsNWidgets(2)); // title + avatar initial
    });

    testWidgets('metric tiles are equal height when one label wraps',
        (tester) async {
      // At phone widths "classes this week" wraps to two lines while
      // "nothing due" does not. Each tile taking its own intrinsic height left
      // the short one floating, centred against the taller two.
      await pumpOnNavy(
        tester,
        const AppHeader(
          title: 'Good evening, Test',
          avatarInitial: 'T',
          metrics: [
            MetricTile(
              key: Key('m1'),
              value: '0',
              label: 'classes this week',
            ),
            MetricTile(
              key: Key('m2'),
              value: '0',
              label: 'unread messages',
            ),
            MetricTile(key: Key('m3'), value: r'$0', label: 'nothing due'),
          ],
        ),
      );

      final heights = [
        for (final k in ['m1', 'm2', 'm3'])
          tester.getSize(find.byKey(Key(k))).height,
      ];

      expect(heights[0], heights[1]);
      expect(heights[1], heights[2]);
    });

    testWidgets('long names truncate instead of overflowing', (tester) async {
      await pumpOnNavy(
        tester,
        const AppHeader(
          title: 'Good afternoon, Bartholomew Fitzgerald-Montgomery III',
          subtitle: 'A subtitle that also runs on well past the fold here',
          avatarInitial: 'B',
        ),
      );

      expect(tester.takeException(), isNull);
    });
  });

  group('avatarInitialFor', () {
    test('takes the first letter and uppercases it', () {
      expect(avatarInitialFor('jordan'), 'J');
      expect(avatarInitialFor('  sarah  '), 'S');
    });

    test('falls back when there is no usable name', () {
      expect(avatarInitialFor('', fallback: 'T'), 'T');
      expect(avatarInitialFor('   ', fallback: 'T'), 'T');
    });

    test('handles non-Latin names without crashing', () {
      expect(avatarInitialFor('Ædith'), 'Æ');
      expect(avatarInitialFor('陈'), '陈');
    });
  });

  group('AttentionList', () {
    testWidgets('renders a row per item with its action', (tester) async {
      var paid = 0;
      await pumpOnNavy(
        tester,
        ContentSheet(
          children: [
            AttentionList(
              items: [
                AttentionItem(
                  title: 'Invoice INV-0231 due Friday',
                  subtitle: r'$180.00 · Ella & Max',
                  action: PillButton(label: 'Pay', onPressed: () => paid++),
                ),
                const AttentionItem(
                  title: 'Holiday timetable published',
                  subtitle: 'Announcement · yesterday',
                  tone: AppColors.blue,
                ),
              ],
            ),
          ],
        ),
      );

      expect(find.text('Invoice INV-0231 due Friday'), findsOneWidget);
      expect(find.text('Holiday timetable published'), findsOneWidget);

      // The row without an action falls back to a chevron.
      expect(find.byIcon(Icons.chevron_right_rounded), findsOneWidget);

      await tester.tap(find.text('Pay'));
      expect(paid, 1);
    });

    testWidgets('renders nothing extra for a single item', (tester) async {
      await pumpOnNavy(
        tester,
        const ContentSheet(
          children: [
            AttentionList(
              items: [
                AttentionItem(title: 'Only one', subtitle: 'No divider'),
              ],
            ),
          ],
        ),
      );

      expect(find.text('Only one'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('LedgerRow', () {
    testWidgets('shows time, duration, title, subtitle and trailing',
        (tester) async {
      await pumpOnNavy(
        tester,
        const ContentSheet(
          children: [
            LedgerRow(
              time: '4:30',
              duration: '1 hr',
              title: 'Year 9 Maths',
              subtitle: 'Jordan Lee',
              trailing: StatusPill(label: 'CONFIRMED'),
            ),
          ],
        ),
      );

      expect(find.text('4:30'), findsOneWidget);
      expect(find.text('1 hr'), findsOneWidget);
      expect(find.text('Year 9 Maths'), findsOneWidget);
      expect(find.text('Jordan Lee'), findsOneWidget);
      expect(find.text('CONFIRMED'), findsOneWidget);
    });

    testWidgets('is tappable only when given a handler', (tester) async {
      var taps = 0;
      await pumpOnNavy(
        tester,
        ContentSheet(
          children: [
            LedgerRow(
              time: '4:30',
              title: 'Year 9 Maths',
              onTap: () => taps++,
            ),
          ],
        ),
      );

      await tester.tap(find.text('Year 9 Maths'));
      expect(taps, 1);
    });

    testWidgets('empty variant explains the gap', (tester) async {
      await pumpOnNavy(
        tester,
        const ContentSheet(
          children: [LedgerRowEmpty(message: 'No upcoming classes')],
        ),
      );

      expect(find.text('No upcoming classes'), findsOneWidget);
    });
  });

  group('SectionLabel', () {
    testWidgets('shows trailing metadata', (tester) async {
      await pumpOnNavy(
        tester,
        const ContentSheet(
          children: [SectionLabel(title: 'TODAY', trailing: 'Wed 15 Jul')],
        ),
      );

      expect(find.text('TODAY'), findsOneWidget);
      expect(find.text('Wed 15 Jul'), findsOneWidget);
    });

    testWidgets('action label is tappable', (tester) async {
      var taps = 0;
      await pumpOnNavy(
        tester,
        ContentSheet(
          children: [
            SectionLabel(
              title: 'LATEST ANNOUNCEMENT',
              actionLabel: 'All',
              onAction: () => taps++,
            ),
          ],
        ),
      );

      await tester.tap(find.text('All'));
      expect(taps, 1);
    });

    test('rejects having both trailing metadata and an action', () {
      expect(
        () => SectionLabel(
          title: 'BOTH',
          trailing: 'Wed',
          actionLabel: 'All',
          onAction: () {},
        ),
        throwsAssertionError,
      );
    });
  });

  group('QuickActionGrid', () {
    testWidgets('lays tiles out two per row', (tester) async {
      await pumpOnNavy(
        tester,
        ContentSheet(
          children: [
            QuickActionGrid(
              tiles: [
                QuickActionTile(
                  icon: Icons.calendar_today,
                  label: 'Book one-off class',
                  onTap: () {},
                ),
                QuickActionTile(
                  icon: Icons.chat_bubble_outline,
                  label: 'Message a tutor',
                  onTap: () {},
                ),
              ],
            ),
          ],
        ),
      );

      expect(find.text('Book one-off class'), findsOneWidget);
      expect(find.text('Message a tutor'), findsOneWidget);
    });

    testWidgets('an odd tile count does not overflow', (tester) async {
      await pumpOnNavy(
        tester,
        ContentSheet(
          children: [
            QuickActionGrid(
              tiles: [
                QuickActionTile(icon: Icons.add, label: 'One', onTap: () {}),
                QuickActionTile(icon: Icons.add, label: 'Two', onTap: () {}),
                QuickActionTile(icon: Icons.add, label: 'Three', onTap: () {}),
              ],
            ),
          ],
        ),
      );

      expect(find.text('Three'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('AppBottomNavigation', () {
    testWidgets('reports the tapped index and shows badges', (tester) async {
      final selected = <int>[];
      await pumpOnNavy(
        tester,
        Align(
          alignment: Alignment.bottomCenter,
          child: AppBottomNavigation(
            currentIndex: 0,
            onSelected: selected.add,
            items: const [
              AppNavItem(
                label: 'Home',
                icon: Icons.home_outlined,
                activeIcon: Icons.home_rounded,
              ),
              AppNavItem(
                label: 'Messages',
                icon: Icons.chat_bubble_outline_rounded,
                activeIcon: Icons.chat_bubble_rounded,
                showBadge: true,
              ),
            ],
          ),
        ),
      );

      await tester.tap(find.text('Messages'));
      expect(selected, [1]);
    });

    testWidgets('keeps all six admin labels visible', (tester) async {
      // Material switches to shifting mode past three items unless the bar is
      // fixed, which hides unselected labels.
      await pumpOnNavy(
        tester,
        Align(
          alignment: Alignment.bottomCenter,
          child: AppBottomNavigation(
            currentIndex: 0,
            onSelected: (_) {},
            items: const [
              AppNavItem(
                  label: 'Home',
                  icon: Icons.home_outlined,
                  activeIcon: Icons.home_rounded),
              AppNavItem(
                  label: 'Classes',
                  icon: Icons.school_outlined,
                  activeIcon: Icons.school_rounded),
              AppNavItem(
                  label: 'Notices',
                  icon: Icons.campaign_outlined,
                  activeIcon: Icons.campaign_rounded),
              AppNavItem(
                  label: 'Users',
                  icon: Icons.people_outline_rounded,
                  activeIcon: Icons.people_rounded),
              AppNavItem(
                  label: 'Messages',
                  icon: Icons.chat_bubble_outline_rounded,
                  activeIcon: Icons.chat_bubble_rounded),
              AppNavItem(
                  label: 'Invoices',
                  icon: Icons.receipt_long_outlined,
                  activeIcon: Icons.receipt_long_rounded),
            ],
          ),
        ),
      );

      for (final label in const [
        'Home',
        'Classes',
        'Notices',
        'Users',
        'Messages',
        'Invoices',
      ]) {
        expect(find.text(label), findsWidgets, reason: '$label should render');
      }
      expect(tester.takeException(), isNull);
    });
  });

  group('ConversationRow', () {
    testWidgets('an unread thread shows its count and a blue time',
        (tester) async {
      await pumpOnNavy(
        tester,
        const ContentSheet.fixed(
          child: ConversationRow(
            name: 'Jordan Lee',
            preview: 'Ella did really well today',
            timeLabel: '4:42 PM',
            initials: 'JL',
            unreadCount: 2,
          ),
        ),
      );

      expect(find.text('Jordan Lee'), findsOneWidget);
      expect(find.text('Ella did really well today'), findsOneWidget);
      expect(find.text('4:42 PM'), findsOneWidget);
      expect(find.text('2'), findsOneWidget);
    });

    testWidgets('a read thread shows no badge', (tester) async {
      await pumpOnNavy(
        tester,
        const ContentSheet.fixed(
          child: ConversationRow(
            name: 'Priya Shah',
            preview: 'See you Thursday!',
            timeLabel: 'Mon',
            initials: 'PS',
          ),
        ),
      );

      expect(find.text('Mon'), findsOneWidget);
      expect(find.text('0'), findsNothing);
    });

    testWidgets('a large unread count stays inside the badge', (tester) async {
      await pumpOnNavy(
        tester,
        const ContentSheet.fixed(
          child: ConversationRow(
            name: 'Busy Thread',
            preview: 'Lots happening',
            timeLabel: 'Tue',
            initials: 'BT',
            unreadCount: 250,
          ),
        ),
      );

      expect(find.text('99+'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a long name and preview truncate rather than overflow',
        (tester) async {
      await pumpOnNavy(
        tester,
        const ContentSheet.fixed(
          child: ConversationRow(
            name: 'Bartholomew Fitzgerald-Montgomery III',
            preview:
                'A very long message that keeps going well past the width of '
                'any phone screen and then some more for good measure',
            timeLabel: '4:42 PM',
            initials: 'BF',
            unreadCount: 1,
          ),
        ),
        size: const Size(320, 640),
      );

      expect(tester.takeException(), isNull);
    });
  });

  group('SearchField', () {
    testWidgets('reports what is typed', (tester) async {
      final typed = <String>[];
      await pumpOnNavy(
        tester,
        SearchField(hintText: 'Search by name…', onChanged: typed.add),
      );

      expect(find.text('Search by name…'), findsOneWidget);
      await tester.enterText(find.byType(TextField), 'jord');
      expect(typed, ['jord']);
    });

    testWidgets('a clear button appears once there is text and empties it',
        (tester) async {
      final typed = <String>[];
      await pumpOnNavy(
        tester,
        SearchField(hintText: 'Search…', onChanged: typed.add),
      );

      expect(find.bySemanticsLabel('Clear search'), findsNothing);

      await tester.enterText(find.byType(TextField), 'jord');
      await tester.pump();
      expect(find.bySemanticsLabel('Clear search'), findsOneWidget);

      await tester.tap(find.bySemanticsLabel('Clear search'));
      await tester.pump();
      expect(typed.last, '');
      expect(find.bySemanticsLabel('Clear search'), findsNothing);
    });
  });

  group('state surfaces', () {
    testWidgets('empty state can offer an action', (tester) async {
      var taps = 0;
      await pumpOnNavy(
        tester,
        ContentSheet(
          children: [
            EmptyStateView(
              title: 'No invoices yet',
              message: 'Invoices appear here once issued.',
              actionLabel: 'Refresh',
              onAction: () => taps++,
            ),
          ],
        ),
      );

      expect(find.text('No invoices yet'), findsOneWidget);
      await tester.tap(find.text('Refresh'));
      expect(taps, 1);
    });

    testWidgets('error state offers a retry', (tester) async {
      var retries = 0;
      await pumpOnNavy(
        tester,
        ContentSheet(
          children: [
            ErrorStateView(
              message: 'Check your connection.',
              onRetry: () => retries++,
            ),
          ],
        ),
      );

      expect(find.text('Something went wrong'), findsOneWidget);
      await tester.tap(find.text('Try again'));
      expect(retries, 1);
    });

    testWidgets('error state hides retry when none is possible',
        (tester) async {
      await pumpOnNavy(
        tester,
        const ContentSheet(children: [ErrorStateView()]),
      );

      expect(find.text('Try again'), findsNothing);
    });
  });

  group('ContentSheet', () {
    testWidgets('scrolls content taller than the viewport', (tester) async {
      await pumpOnNavy(
        tester,
        ContentSheet(
          children: [
            for (var i = 0; i < 30; i++)
              SizedBox(height: 60, child: Text('Row $i')),
          ],
        ),
      );

      expect(find.text('Row 0'), findsOneWidget);
      await tester.drag(find.byType(CustomScrollView), const Offset(0, -400));
      await tester.pump();
      expect(find.text('Row 0'), findsNothing);
    });

    testWidgets('pulling down from the top triggers a refresh', (tester) async {
      var refreshes = 0;
      await pumpOnNavy(
        tester,
        ContentSheet(
          onRefresh: () async => refreshes++,
          children: [
            for (var i = 0; i < 30; i++)
              SizedBox(height: 60, child: Text('Row $i')),
          ],
        ),
      );

      // Must start at offset zero — RefreshIndicator only arms on overscroll
      // at the top of the list.
      await tester.fling(
        find.byType(CustomScrollView),
        const Offset(0, 300),
        1000,
      );
      await tester.pumpAndSettle();

      expect(refreshes, 1);
    });

    testWidgets('has no refresh indicator without a handler', (tester) async {
      await pumpOnNavy(
        tester,
        const ContentSheet(children: [Text('No refresh')]),
      );

      expect(find.byType(RefreshIndicator), findsNothing);
    });

    testWidgets('fills its space even when the content does not expand',
        (tester) async {
      // An empty state sizes itself to its text. Without an explicit expand
      // the sheet shrank to match, leaving the navy background showing down
      // both sides of a half-width sheet.
      await pumpOnNavy(
        tester,
        const Column(
          children: [
            Expanded(
              child: ContentSheet.fixed(
                child: EmptyStateView(title: 'Nothing here'),
              ),
            ),
          ],
        ),
      );

      final size = tester.getSize(find.byType(ContentSheet));
      expect(size.width, 402);
    });

    testWidgets('fixed variant does not scroll', (tester) async {
      await pumpOnNavy(
        tester,
        const ContentSheet.fixed(child: Text('Static content')),
      );

      expect(find.text('Static content'), findsOneWidget);
      expect(find.byType(CustomScrollView), findsNothing);
    });
  });
}
