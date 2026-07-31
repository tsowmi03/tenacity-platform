import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/ui/users/tutor/person_routes.dart';

/// A stand-in for a person's record: it can open the other one, the way a
/// student lists their family and a parent lists their children.
class _PersonPage extends StatelessWidget {
  final String label;
  final String linkRouteName;
  final String linkLabel;
  final List<String> openRoutes;

  const _PersonPage({
    required this.label,
    required this.linkRouteName,
    required this.linkLabel,
    required this.openRoutes,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(label),
            TextButton(
              onPressed: () => pushPersonRoute(
                context,
                openRoutes: openRoutes,
                routeName: linkRouteName,
                builder: (routes) => _PersonPage(
                  label: linkLabel,
                  linkRouteName: label,
                  linkLabel: label,
                  openRoutes: routes,
                ),
              ),
              child: Text('Open $linkLabel'),
            ),
          ],
        ),
      ),
    );
  }
}

/// How many routes are currently on the stack.
///
/// Counted by observer rather than by asking the navigator: `popUntil` stops
/// at the first route its predicate accepts, so using it to inspect the stack
/// only ever sees the top one — the bug this suite caught in the first place.
class _DepthObserver extends NavigatorObserver {
  int depth = 0;

  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) => depth++;

  @override
  void didPop(Route<dynamic> route, Route<dynamic>? previousRoute) => depth--;

  @override
  void didRemove(Route<dynamic> route, Route<dynamic>? previousRoute) =>
      depth--;
}

void main() {
  late _DepthObserver observer;

  Future<void> pumpDirectory(WidgetTester tester) async {
    observer = _DepthObserver();
    await tester.pumpWidget(
      MaterialApp(
        navigatorObservers: [observer],
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: TextButton(
                onPressed: () => pushPersonRoute(
                  context,
                  openRoutes: const [],
                  routeName: studentRouteName('s1'),
                  builder: (routes) => _PersonPage(
                    label: studentRouteName('s1'),
                    linkRouteName: parentRouteName('p1'),
                    linkLabel: parentRouteName('p1'),
                    openRoutes: routes,
                  ),
                ),
                child: const Text('Open student'),
              ),
            ),
          ),
        ),
      ),
    );
  }

  testWidgets('opens a person that is not already on the stack',
      (tester) async {
    await pumpDirectory(tester);
    final baseline = observer.depth;

    await tester.tap(find.text('Open student'));
    await tester.pumpAndSettle();

    expect(find.text(studentRouteName('s1')), findsOneWidget);
    expect(observer.depth, baseline + 1);
  });

  testWidgets('bouncing between two people does not grow the stack',
      (tester) async {
    await pumpDirectory(tester);
    final baseline = observer.depth;

    await tester.tap(find.text('Open student'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Open ${parentRouteName('p1')}'));
    await tester.pumpAndSettle();

    // Student and parent are both open — two routes above the directory.
    expect(observer.depth, baseline + 2);

    // Now walk back and forth several times. Without the dedupe this is where
    // a tutor ended up ten screens deep.
    for (var i = 0; i < 5; i++) {
      await tester.tap(find.text('Open ${studentRouteName('s1')}'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Open ${parentRouteName('p1')}'));
      await tester.pumpAndSettle();
    }

    expect(observer.depth, baseline + 2);
  });

  testWidgets('returning to a person shows the existing screen',
      (tester) async {
    await pumpDirectory(tester);

    await tester.tap(find.text('Open student'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Open ${parentRouteName('p1')}'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Open ${studentRouteName('s1')}'));
    await tester.pumpAndSettle();

    // Back on the student, and only one of them exists.
    expect(find.text(studentRouteName('s1')), findsOneWidget);
    expect(find.text(parentRouteName('p1')), findsNothing);
  });

  testWidgets('one back press from a person returns to the directory',
      (tester) async {
    await pumpDirectory(tester);

    await tester.tap(find.text('Open student'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Open ${parentRouteName('p1')}'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Open ${studentRouteName('s1')}'));
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pop();
    await tester.pumpAndSettle();

    expect(find.text('Open student'), findsOneWidget);
  });

  group('route names', () {
    test('are distinct per person and per kind', () {
      expect(studentRouteName('a'), isNot(studentRouteName('b')));
      expect(studentRouteName('a'), isNot(parentRouteName('a')));
    });
  });
}
