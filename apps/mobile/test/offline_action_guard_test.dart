import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/connectivity_controller.dart';
import 'package:tenacity/src/helpers/offline_action_guard.dart';

void main() {
  testWidgets('OfflineActionGuard blocks actions while offline',
      (tester) async {
    final connectivityController = ConnectivityController()
      ..setOfflineForTesting(true);

    await tester.pumpWidget(
      ChangeNotifierProvider<ConnectivityController>.value(
        value: connectivityController,
        child: MaterialApp(
          home: Builder(
            builder: (context) {
              return Scaffold(
                body: ElevatedButton(
                  onPressed: () async {
                    await OfflineActionGuard.ensureOnline(
                      context,
                      action: 'book this class',
                      refresh: false,
                    );
                  },
                  child: const Text('Book'),
                ),
              );
            },
          ),
        ),
      ),
    );

    await tester.tap(find.text('Book'));
    await tester.pump();

    expect(
      find.text("You're offline. Reconnect to book this class."),
      findsOneWidget,
    );
    expect(
      tester
          .getTopLeft(
              find.text("You're offline. Reconnect to book this class."))
          .dy,
      greaterThan(64),
    );
    await tester.pump(const Duration(seconds: 3));
  });

  testWidgets('OfflineActionGuard message appears above an action sheet',
      (tester) async {
    final connectivityController = ConnectivityController()
      ..setOfflineForTesting(true);

    await tester.pumpWidget(
      ChangeNotifierProvider<ConnectivityController>.value(
        value: connectivityController,
        child: MaterialApp(
          home: Builder(
            builder: (context) {
              return Scaffold(
                body: ElevatedButton(
                  onPressed: () {
                    showModalBottomSheet<void>(
                      context: context,
                      builder: (sheetContext) {
                        return SafeArea(
                          child: ElevatedButton(
                            onPressed: () async {
                              await OfflineActionGuard.ensureOnline(
                                sheetContext,
                                action: 'book this class',
                                refresh: false,
                              );
                            },
                            child: const Text('Book from sheet'),
                          ),
                        );
                      },
                    );
                  },
                  child: const Text('Open sheet'),
                ),
              );
            },
          ),
        ),
      ),
    );

    await tester.tap(find.text('Open sheet'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Book from sheet'));
    await tester.pump();

    expect(find.text('Book from sheet'), findsOneWidget);
    expect(
      find.text("You're offline. Reconnect to book this class."),
      findsOneWidget,
    );
    await tester.pump(const Duration(seconds: 3));
  });
}
