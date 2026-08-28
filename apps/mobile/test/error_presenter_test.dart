import 'dart:async';
import 'dart:io';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/utils/error_presenter.dart';

/// A stack trace with frames that look like the ones MOB-32 put on screen.
final _pluginStackTrace = StackTrace.fromString('''
#0      StandardMethodCodec.decodeEnvelope (package:flutter/src/services/message_codecs.dart:653:7)
#1      MethodChannel._invokeMethod (package:flutter/src/services/platform_channel.dart:334:18)
#2      MethodChannelFirebaseFunctions.call (package:cloud_functions_platform_interface/src/method_channel/method_channel_firebase_functions.dart:70:5)
''');

void main() {
  group('presentError keeps internals out of the message', () {
    test(
        'a FirebaseException carrying a stack trace leaks neither the trace '
        'nor the plugin/code prefix', () {
      final error = FirebaseException(
        plugin: 'firebase_functions',
        code: 'unknown',
        message: 'cancelled',
        stackTrace: _pluginStackTrace,
      );

      // Guard the premise: this is the toString() the old code interpolated.
      expect(error.toString(), contains('StandardMethodCodec'));

      final presented = presentError(error, action: 'send your message');

      expect(presented.message, isNot(contains('StandardMethodCodec')));
      expect(presented.message, isNot(contains('MethodChannel')));
      expect(presented.message, isNot(contains('package:')));
      expect(presented.message, isNot(contains('#0')));
      expect(presented.message, isNot(contains('[firebase_functions/')));
      expect(
        presented.message,
        "We couldn't send your message right now. Please try again.",
      );
    });

    test(
        'a FirebaseFunctionsException is classified by code like any other '
        'FirebaseException', () {
      final presented = presentError(
        FirebaseFunctionsException(
          message: 'cancelled',
          code: 'cancelled',
          stackTrace: _pluginStackTrace,
        ),
        action: 'send your message',
      );

      expect(presented.kind, ErrorKind.ambiguous);
      expect(presented.message, isNot(contains('package:')));
    });
  });

  group('classification', () {
    test('cancelled and deadline-exceeded are ambiguous, not failures', () {
      for (final code in ['cancelled', 'deadline-exceeded']) {
        final presented = presentError(
          FirebaseException(plugin: 'cloud_functions', code: code),
          action: 'send your message',
        );

        expect(presented.kind, ErrorKind.ambiguous, reason: code);
        expect(presented.isAmbiguous, isTrue, reason: code);
        // The message must not claim the send failed.
        expect(presented.message, isNot(contains("couldn't")), reason: code);
      }
    });

    test('unavailable and a socket failure read as offline', () {
      expect(
        presentError(
          FirebaseException(plugin: 'cloud_firestore', code: 'unavailable'),
          action: 'load your classes',
        ).message,
        "You're offline. Reconnect to load your classes.",
      );

      expect(
        presentError(
          const SocketException('failed host lookup'),
          action: 'load your classes',
        ).kind,
        ErrorKind.offline,
      );
    });

    test('permission-denied says so rather than suggesting a retry', () {
      final presented = presentError(
        FirebaseException(plugin: 'cloud_firestore', code: 'permission-denied'),
        action: 'load your classes',
      );

      expect(presented.kind, ErrorKind.permission);
      expect(
        presented.message,
        "You don't have permission to load your classes.",
      );
      expect(presented.message, isNot(contains('try again')));
    });

    test('our own timeout is ambiguous, since the server may have committed',
        () {
      expect(
        presentError(TimeoutException('gave up'), action: 'send your message')
            .kind,
        ErrorKind.ambiguous,
      );
    });

    test('an unrecognised error falls back to a generic, actionable line', () {
      final presented = presentError(
        Exception('Chat ID is null'),
        action: 'send your message',
      );

      expect(presented.kind, ErrorKind.unknown);
      expect(presented.isAmbiguous, isFalse);
      // The bare Exception's own text must not survive into the message.
      expect(presented.message, isNot(contains('Chat ID is null')));
    });
  });
}
