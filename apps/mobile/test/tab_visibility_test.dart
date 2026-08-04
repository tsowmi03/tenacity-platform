import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/ui/tab_visibility.dart';
import 'package:tenacity/src/utils/refresh_throttle.dart';

/// A notifier standing in for any app-level controller the screen watches.
class _Ticker extends ChangeNotifier {
  void tick() => notifyListeners();
}

class _Probe extends StatefulWidget {
  final void Function() onVisible;

  const _Probe({required this.onVisible});

  @override
  State<_Probe> createState() => _ProbeState();
}

class _ProbeState extends State<_Probe> with TabVisibilityAware<_Probe> {
  @override
  void onTabVisible() => widget.onVisible();

  @override
  Widget build(BuildContext context) {
    // Watched so an unrelated notification rebuilds this subtree and runs
    // didChangeDependencies, which is the case the edge guard has to survive.
    context.watch<_Ticker>();
    return const SizedBox.shrink();
  }
}

Widget _host({
  required bool isVisible,
  required _Ticker ticker,
  required VoidCallback onVisible,
}) {
  return ChangeNotifierProvider<_Ticker>.value(
    value: ticker,
    child: MaterialApp(
      home: TabVisibility(
        isVisible: isVisible,
        child: _Probe(onVisible: onVisible),
      ),
    ),
  );
}

void main() {
  group('TabVisibilityAware', () {
    testWidgets('fires once on first build', (tester) async {
      final ticker = _Ticker();
      addTearDown(ticker.dispose);
      var calls = 0;

      await tester.pumpWidget(
        _host(isVisible: true, ticker: ticker, onVisible: () => calls++),
      );
      await tester.pump();

      expect(calls, 1);
    });

    testWidgets('does not fire while the tab is off screen', (tester) async {
      final ticker = _Ticker();
      addTearDown(ticker.dispose);
      var calls = 0;

      await tester.pumpWidget(
        _host(isVisible: false, ticker: ticker, onVisible: () => calls++),
      );
      await tester.pump();

      expect(calls, 0);
    });

    testWidgets('fires again each time the tab is returned to',
        (tester) async {
      final ticker = _Ticker();
      addTearDown(ticker.dispose);
      var calls = 0;
      void onVisible() => calls++;

      await tester.pumpWidget(
        _host(isVisible: true, ticker: ticker, onVisible: onVisible),
      );
      await tester.pump();
      expect(calls, 1);

      // Away…
      await tester.pumpWidget(
        _host(isVisible: false, ticker: ticker, onVisible: onVisible),
      );
      await tester.pump();
      expect(calls, 1);

      // …and back.
      await tester.pumpWidget(
        _host(isVisible: true, ticker: ticker, onVisible: onVisible),
      );
      await tester.pump();
      expect(calls, 2);
    });

    testWidgets('ignores an unrelated Provider notification', (tester) async {
      final ticker = _Ticker();
      addTearDown(ticker.dispose);
      var calls = 0;

      await tester.pumpWidget(
        _host(isVisible: true, ticker: ticker, onVisible: () => calls++),
      );
      await tester.pump();
      expect(calls, 1);

      // didChangeDependencies runs for any inherited change, so without the
      // false-to-true edge guard a routine controller update would kick off
      // another load.
      ticker.tick();
      await tester.pump();
      ticker.tick();
      await tester.pump();

      expect(calls, 1);
    });

    testWidgets('defaults to visible with no TabVisibility above it',
        (tester) async {
      final ticker = _Ticker();
      addTearDown(ticker.dispose);
      var calls = 0;

      // A screen pushed as its own route rather than shown as a tab.
      await tester.pumpWidget(
        ChangeNotifierProvider<_Ticker>.value(
          value: ticker,
          child: MaterialApp(home: _Probe(onVisible: () => calls++)),
        ),
      );
      await tester.pump();

      expect(calls, 1);
    });
  });

  group('RefreshThrottle', () {
    test('allows the first refresh and blocks one straight after', () {
      var now = DateTime(2026, 8, 4, 12);
      final throttle = RefreshThrottle(
        minInterval: const Duration(seconds: 30),
        now: () => now,
      );

      expect(throttle.shouldRefresh, isTrue);
      throttle.markRefreshed();
      expect(throttle.shouldRefresh, isFalse);

      now = now.add(const Duration(seconds: 29));
      expect(throttle.shouldRefresh, isFalse);

      now = now.add(const Duration(seconds: 1));
      expect(throttle.shouldRefresh, isTrue);
    });

    test('reset reopens it immediately, for an explicit retry', () {
      var now = DateTime(2026, 8, 4, 12);
      final throttle = RefreshThrottle(now: () => now);

      throttle.markRefreshed();
      expect(throttle.shouldRefresh, isFalse);

      throttle.reset();
      expect(throttle.shouldRefresh, isTrue);
    });
  });
}
