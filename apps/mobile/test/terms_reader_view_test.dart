import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/models/terms_and_conditions_model.dart';
import 'package:tenacity/src/ui/terms/terms_reader_view.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';

TermsAndConditions _terms({
  String content = '# Terms\n\nShort document.',
  List<TermsChangeLog> changelog = const [],
}) {
  return TermsAndConditions(
    version: '2.0',
    title: 'Terms & conditions',
    content: content,
    changelog: changelog,
  );
}

class _ReaderActions {
  int backs = 0;
  int declines = 0;
  int accepts = 0;
  final links = <String>[];
}

Future<_ReaderActions> _pumpReader(
  WidgetTester tester, {
  TermsAndConditions? terms,
  bool requireAcceptance = true,
  bool isAccepting = false,
  String? previousVersion,
  String? actionErrorMessage,
  Future<void> Function()? onAccept,
  Size size = const Size(402, 874),
  double textScale = 1,
}) async {
  final actions = _ReaderActions();
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light,
      home: MediaQuery(
        data: MediaQueryData(textScaler: TextScaler.linear(textScale)),
        child: TermsReaderView(
          terms: terms ?? _terms(),
          requireAcceptance: requireAcceptance,
          previousVersion: previousVersion,
          isAccepting: isAccepting,
          actionErrorMessage: actionErrorMessage,
          onBack: () => actions.backs++,
          onDecline: () => actions.declines++,
          onAccept: onAccept ??
              () async {
                actions.accepts++;
              },
          onOpenLink: actions.links.add,
        ),
      ),
    ),
  );
  await tester.pump();
  return actions;
}

void main() {
  testWidgets('a short visible document is already at its end', (tester) async {
    final actions = await _pumpReader(tester);

    expect(find.text('100%'), findsOneWidget);
    final accept = tester.widget<FilledButton>(
      find.byKey(const Key('terms-accept')),
    );
    expect(accept.onPressed, isNotNull);

    await tester.tap(find.byKey(const Key('terms-accept')));
    await tester.pump();
    expect(actions.accepts, 1);
  });

  testWidgets('a long document requires scrolling before acceptance',
      (tester) async {
    final content = [
      '# Terms',
      for (var index = 1; index <= 30; index++)
        '## Section $index\n\n'
            'This section explains an important condition in enough detail '
            'to require the reader to continue through the document.',
    ].join('\n\n');
    final actions = await _pumpReader(
      tester,
      terms: _terms(content: content),
      size: const Size(320, 640),
    );

    expect(
      tester
          .widget<FilledButton>(find.byKey(const Key('terms-accept')))
          .onPressed,
      isNull,
    );

    await tester.drag(
      find.byKey(const Key('terms-scroll')),
      const Offset(0, -10000),
    );
    await tester.pumpAndSettle();

    expect(find.text('100%'), findsOneWidget);
    await tester.tap(find.byKey(const Key('terms-accept')));
    await tester.pump();
    expect(actions.accepts, 1);
  });

  testWidgets('blocks duplicate acceptance while the write is pending',
      (tester) async {
    final gate = Completer<void>();
    var calls = 0;
    await _pumpReader(
      tester,
      onAccept: () {
        calls++;
        return gate.future;
      },
    );

    await tester.tap(find.byKey(const Key('terms-accept')));
    await tester.tap(find.byKey(const Key('terms-accept')));
    await tester.pump();

    expect(calls, 1);
    expect(
      tester
          .widget<FilledButton>(find.byKey(const Key('terms-accept')))
          .onPressed,
      isNull,
    );

    gate.complete();
    await tester.pump();
  });

  testWidgets('a replacement document resets reading progress', (tester) async {
    String longDocument(String label) => [
          '# $label',
          for (var index = 1; index <= 30; index++)
            '## Section $index\n\n'
                'This condition is long enough to keep the document scrolling.',
        ].join('\n\n');

    Widget reader(String label) => MaterialApp(
          theme: AppTheme.light,
          home: TermsReaderView(
            terms: _terms(content: longDocument(label)),
            requireAcceptance: true,
            isAccepting: false,
            onAccept: () async {},
            onOpenLink: (_) {},
          ),
        );

    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(reader('First terms'));
    await tester.pump();
    await tester.drag(
      find.byKey(const Key('terms-scroll')),
      const Offset(0, -10000),
    );
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<FilledButton>(find.byKey(const Key('terms-accept')))
          .onPressed,
      isNotNull,
    );

    await tester.pumpWidget(reader('Replacement terms'));
    await tester.pump();

    expect(find.text('0%'), findsOneWidget);
    expect(
      tester
          .widget<FilledButton>(find.byKey(const Key('terms-accept')))
          .onPressed,
      isNull,
    );
  });

  testWidgets('shows only changelog entries newer than the accepted version',
      (tester) async {
    await _pumpReader(
      tester,
      previousVersion: '1.0',
      terms: _terms(
        changelog: [
          TermsChangeLog(version: '1.0', changes: 'Original wording'),
          TermsChangeLog(
            version: '2.0',
            changes: 'Updated payment terms',
            date: DateTime(2026, 7, 27),
          ),
        ],
      ),
    );

    expect(find.byKey(const Key('terms-updated-card')), findsOneWidget);
    expect(find.text('Updated payment terms'), findsOneWidget);
    expect(find.text('Original wording'), findsNothing);
    expect(find.text('v2.0 · 27 Jul 2026'), findsOneWidget);
  });

  testWidgets('read-only terms have a back action and no acceptance footer',
      (tester) async {
    final actions = await _pumpReader(
      tester,
      requireAcceptance: false,
    );

    expect(find.byKey(const Key('terms-accept')), findsNothing);
    expect(find.byKey(const Key('terms-decline')), findsNothing);
    await tester.tap(find.byKey(const Key('terms-back')));
    expect(actions.backs, 1);
  });

  testWidgets('fits narrow and large-text layouts', (tester) async {
    await _pumpReader(
      tester,
      size: const Size(320, 640),
      textScale: 1.3,
    );

    expect(tester.takeException(), isNull);
  });

  testWidgets('renders an inline acceptance failure', (tester) async {
    await _pumpReader(
      tester,
      actionErrorMessage:
          'Your acceptance could not be saved. Please try again.',
    );

    expect(find.byKey(const Key('terms-action-error')), findsOneWidget);
  });

  testWidgets('shows loading and retryable error states', (tester) async {
    var retries = 0;
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: const TermsGateStateView(
          isLoading: true,
          errorMessage: null,
          requireAcceptance: true,
        ),
      ),
    );

    expect(find.byKey(const Key('terms-loading')), findsOneWidget);

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: TermsGateStateView(
          isLoading: false,
          errorMessage: 'Check your connection and try again.',
          requireAcceptance: true,
          onRetry: () => retries++,
        ),
      ),
    );
    await tester.tap(find.text('Try again'));

    expect(retries, 1);
    expect(find.text('Terms could not be loaded'), findsOneWidget);
  });
}
