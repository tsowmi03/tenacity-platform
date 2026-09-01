import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/services/notification_service.dart';

/// MOB-46: the two platforms behaved differently while the app was open, and
/// nobody chose that. Android raised a full banner for a chat message; iOS
/// raised nothing, because the notification details are Android-only and
/// foreground presentation was never switched on. Settled as no foreground chat
/// notifications, which is what iOS already did.
void main() {
  group('shouldPresentForegroundNotification', () {
    test('a chat message is never presented while the app is open', () {
      expect(
        shouldPresentForegroundNotification({
          'type': 'chat_message',
          'chatId': 'chat-1',
        }),
        isFalse,
      );
    });

    test('a chat message in a thread nobody is reading is still not presented',
        () {
      // The behaviour that changes for Android. Suppressing only the open
      // thread was MOB-40; this suppresses the rest, so that the platforms
      // agree rather than one of them being quietly louder.
      expect(
        shouldPresentForegroundNotification({
          'type': 'chat_message',
          'chatId': 'some-other-chat',
        }),
        isFalse,
      );
    });

    test('everything else is still presented', () {
      // This is about chat only. Announcements and reminders are the
      // notifications a user is least able to catch up on by looking at a
      // badge, so they keep their banner.
      for (final type in const [
        'announcement',
        'lesson_reminder',
        'shift_reminder',
        'waitlist_joined',
        'feedback',
      ]) {
        expect(
          shouldPresentForegroundNotification({'type': type}),
          isTrue,
          reason: '$type should still be presented in the foreground',
        );
      }
    });

    test('a push with no type at all is still presented', () {
      // Announcements arrive without a type and are given one downstream, so
      // the absence of a type must not be read as "chat".
      expect(shouldPresentForegroundNotification(const {}), isTrue);
      expect(
        shouldPresentForegroundNotification(const {'type': null}),
        isTrue,
      );
    });
  });
}
