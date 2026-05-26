import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/connectivity_controller.dart';
import 'package:tenacity/src/widgets/offline_cached_data_notice.dart';

void main() {
  testWidgets('OfflineAwareEmptyState uses offline copy', (tester) async {
    final connectivityController = ConnectivityController()
      ..setOfflineForTesting(true);

    await tester.pumpWidget(
      ChangeNotifierProvider<ConnectivityController>.value(
        value: connectivityController,
        child: const MaterialApp(
          home: Scaffold(
            body: OfflineAwareEmptyState(
              emptyMessage: 'No data.',
              offlineEmptyMessage: 'No saved data available offline.',
            ),
          ),
        ),
      ),
    );

    expect(find.text('No saved data available offline.'), findsOneWidget);
    expect(find.text('No data.'), findsNothing);
  });
}
