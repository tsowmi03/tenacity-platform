import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/models/chat_model.dart';
import 'package:tenacity/src/ui/messaging/typing_reporter.dart';

void main() {
  group('TypingReporter', _reporter);
}

void _reporter() {
  test('announces once when typing starts', () {
    final log = <bool>[];
    final reporter = _build(log);

    reporter.onTextChanged('h');
    reporter.onTextChanged('he');
    reporter.onTextChanged('hel');

    // MOB-27 replaced an edge-triggered write with a throttled heartbeat, so
    // the guarantee is one write per burst, not one per keystroke.
    expect(log, [true]);
    reporter.dispose();
  });

  test('re-announces only once the throttle window has passed', () {
    // fake_async does not fake DateTime.now(), so the throttle's clock is
    // advanced explicitly alongside the timer wheel.
    var clock = DateTime(2026, 8, 25, 9);
    final log = <bool>[];
    final reporter = TypingReporter(
      report: (isTyping) async => log.add(isTyping),
      now: () => clock,
    );

    reporter.onTextChanged('h');
    expect(log, [true]);

    clock = clock.add(typingHeartbeatInterval - const Duration(seconds: 1));
    reporter.onTextChanged('he');
    expect(log, [true], reason: 'still inside the throttle window');

    clock = clock.add(const Duration(seconds: 2));
    reporter.onTextChanged('hel');
    expect(log, [true, true], reason: 'throttle window has passed');

    reporter.dispose();
  });

  test('stops on its own once typing goes idle', () {
    fakeAsync((async) {
      final log = <bool>[];
      final reporter = _build(log);

      reporter.onTextChanged('hello');
      expect(reporter.isTyping, isTrue);

      async.elapse(typingIdleTimeout + const Duration(milliseconds: 1));

      // The case the old code could not represent: somebody types half a
      // sentence and puts the phone down without clearing the box.
      expect(log, [true, false]);
      expect(reporter.isTyping, isFalse);
    });
  });

  test('each keystroke pushes the idle deadline out', () {
    fakeAsync((async) {
      final log = <bool>[];
      final reporter = _build(log);

      reporter.onTextChanged('h');
      async.elapse(typingIdleTimeout - const Duration(milliseconds: 1));
      reporter.onTextChanged('he');
      async.elapse(typingIdleTimeout - const Duration(milliseconds: 1));

      expect(log.where((entry) => entry == false), isEmpty);
      reporter.dispose();
      async.flushTimers();
    });
  });

  test('clearing the composer stops immediately', () {
    final log = <bool>[];
    final reporter = _build(log);

    reporter.onTextChanged('hello');
    reporter.onTextChanged('');

    expect(log, [true, false]);
    reporter.dispose();
  });

  test('whitespace alone is not typing', () {
    final log = <bool>[];
    final reporter = _build(log);

    reporter.onTextChanged('   ');

    // Trimming used to happen in some paths and not others, so a composer
    // holding only spaces meant different things depending on how it got there.
    expect(log, isEmpty);
    expect(reporter.isTyping, isFalse);
    reporter.dispose();
  });

  test('disposing while typing writes the stop', () {
    final log = <bool>[];
    final reporter = _build(log);

    reporter.onTextChanged('hello');
    reporter.dispose();

    // Leaving the screen mid-message was MOB-27's main stuck-indicator path.
    expect(log, [true, false]);
  });

  test('disposing when not typing writes nothing', () {
    final log = <bool>[];
    final reporter = _build(log);

    reporter.dispose();

    expect(log, isEmpty);
  });

  test('stopping twice only reports once', () {
    final log = <bool>[];
    final reporter = _build(log);

    reporter.onTextChanged('hello');
    reporter.stop();
    reporter.stop();
    reporter.dispose();

    expect(log, [true, false]);
  });

  test('typing again after a stop announces afresh', () {
    final log = <bool>[];
    final reporter = _build(log);

    reporter.onTextChanged('hello');
    reporter.onTextChanged('');
    reporter.onTextChanged('hello again');

    expect(log, [true, false, true]);
    reporter.dispose();
  });
}

TypingReporter _build(List<bool> log, {DateTime Function()? now}) {
  var clock = DateTime(2026, 8, 25, 9);
  return TypingReporter(
    report: (isTyping) async => log.add(isTyping),
    now: now ?? () => clock = clock.add(const Duration(milliseconds: 1)),
  );
}
