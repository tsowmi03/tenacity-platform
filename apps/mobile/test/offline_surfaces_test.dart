import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/connectivity_controller.dart';
import 'package:tenacity/src/ui/components/offline_surfaces.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';
import 'package:tenacity/src/widgets/offline_mode_banner.dart';

Widget _wrap(Widget child, {Size size = const Size(402, 874)}) {
  return MediaQuery(
    data: MediaQueryData(size: size),
    child: MaterialApp(
      theme: AppTheme.light,
      home: Scaffold(body: child),
    ),
  );
}

void main() {
  group('OfflineToast', () {
    testWidgets('renders the guard message on the V3 ink surface',
        (tester) async {
      await tester.pumpWidget(
        _wrap(const OfflineToast(message: "You're offline. Reconnect to pay.")),
      );

      expect(find.text("You're offline. Reconnect to pay."), findsOneWidget);
      expect(find.byIcon(Icons.cloud_off_rounded), findsOneWidget);

      final container = tester.widget<Container>(
        find
            .descendant(
              of: find.byType(OfflineToast),
              matching: find.byType(Container),
            )
            .first,
      );
      final decoration = container.decoration as BoxDecoration;
      expect(decoration.color, AppColors.ink);
    });

    testWidgets('stays within two lines for a long message', (tester) async {
      await tester.pumpWidget(
        _wrap(
          const OfflineToast(
            message: "You're offline. Reconnect to enrol another student "
                'permanently for the remainder of this term.',
          ),
          size: const Size(320, 640),
        ),
      );

      final text = tester.widget<Text>(find.byType(Text));
      expect(text.maxLines, 2);
      expect(tester.takeException(), isNull);
    });
  });

  group('OfflineModeBanner', () {
    testWidgets('shows nothing while online', (tester) async {
      final connectivity = ConnectivityController()
        ..setOfflineForTesting(false);

      await tester.pumpWidget(
        ChangeNotifierProvider<ConnectivityController>.value(
          value: connectivity,
          child: _wrap(
            const OfflineModeBanner(child: Text('screen')),
          ),
        ),
      );

      expect(find.byType(OfflineBanner), findsNothing);
      expect(find.text('screen'), findsOneWidget);
    });

    testWidgets('layers the notice over the screen while offline',
        (tester) async {
      final connectivity = ConnectivityController()..setOfflineForTesting(true);

      await tester.pumpWidget(
        ChangeNotifierProvider<ConnectivityController>.value(
          value: connectivity,
          child: _wrap(
            const OfflineModeBanner(child: Text('screen')),
          ),
        ),
      );

      expect(find.byType(OfflineBanner), findsOneWidget);
      // Stacked, not inserted above: the screen it covers is still laid out.
      expect(find.text('screen'), findsOneWidget);
      expect(
        find.text('Offline. Showing saved data where available.'),
        findsOneWidget,
      );
    });
  });
}
