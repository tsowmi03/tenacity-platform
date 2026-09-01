import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:tenacity/src/controllers/chat_controller.dart';
import 'package:tenacity/src/services/chat_outbox.dart';
import 'package:tenacity/src/ui/chat_screen.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  GoogleFonts.config.allowRuntimeFetching = false;

  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('chat attachment choices use the shared V3 sheet',
      (tester) async {
    tester.view.physicalSize = const Size(402, 874);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<ChatController>.value(
            value: _FakeChatController(),
          ),
          ChangeNotifierProvider<ChatOutbox>.value(
            // Never answers, so anything queued stays queued for the duration
            // of the test rather than being retired mid-assertion.
            value: ChatOutbox(send: (_) => Completer<void>().future),
          ),
        ],
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

    await tester.tap(find.byIcon(Icons.add_rounded));
    await tester.pumpAndSettle();

    expect(find.text('Add attachment'), findsOneWidget);
    expect(find.byKey(const Key('chat-attachment-camera')), findsOneWidget);
    expect(find.byKey(const Key('chat-attachment-library')), findsOneWidget);
    expect(find.byKey(const Key('chat-attachment-file')), findsOneWidget);
  });
}

class _FakeChatController extends ChangeNotifier implements ChatController {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
