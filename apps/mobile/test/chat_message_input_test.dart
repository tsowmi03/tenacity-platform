import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/chat_controller.dart';
import 'package:tenacity/src/ui/chat_screen.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  GoogleFonts.config.allowRuntimeFetching = false;

  testWidgets(
      'compose box clips a multi-line message to its rounded background',
      (tester) async {
    tester.view.physicalSize = const Size(402, 874);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      ChangeNotifierProvider<ChatController>.value(
        value: _FakeChatController(),
        child: MaterialApp(
          theme: AppTheme.light,
          home: const ChatScreen(
            chatId: null,
            otherUserName: 'Taylor Tutor',
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.widgetWithText(TextField, 'Type a message…'),
      'This is a deliberately long test message meant to wrap across '
      'several lines so the compose box grows well past a single line '
      'of text and exercises the pill-shaped background.',
    );
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);

    final container = tester.widget<Container>(
      find.ancestor(
        of: find.widgetWithText(TextField, 'Type a message…'),
        matching: find.byType(Container),
      ).first,
    );
    expect(container.clipBehavior, Clip.antiAlias);

    // A fixed, modest radius (not AppRadii.pill) so the corners hold their
    // curve instead of scaling into a deep stadium as the box grows tall.
    final decoration = container.decoration as BoxDecoration;
    expect(decoration.borderRadius, BorderRadius.circular(AppRadii.md));
  });
}

class _FakeChatController extends ChangeNotifier implements ChatController {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
