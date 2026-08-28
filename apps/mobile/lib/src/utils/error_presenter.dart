import 'dart:async';
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

/// What a caught error means for the person who triggered it.
///
/// Deliberately coarse. These are the distinctions that change what we can
/// honestly tell someone — not a mirror of the Firebase code list, most of
/// which a parent can do nothing with.
enum ErrorKind {
  /// The request never left the device, or the backend was unreachable.
  offline,

  /// The backend refused. Retrying will not help.
  permission,

  /// The client stopped waiting. The server may well have done the work.
  ///
  /// The distinguishing case: a definite failure is safe to describe as one,
  /// this is not.
  ambiguous,

  /// Anything we cannot say something more useful about.
  unknown,
}

/// A caught error turned into something showable.
///
/// Carries [kind] as well as [message] because the ambiguous case is not a
/// message at all: a caller with a pending-state indicator should show
/// nothing and let that indicator settle, rather than claim an outcome we do
/// not know.
class PresentedError {
  final ErrorKind kind;
  final String message;

  const PresentedError._(this.kind, this.message);

  /// True when we do not know whether the operation actually failed.
  bool get isAmbiguous => kind == ErrorKind.ambiguous;
}

/// Turns a caught error into a sentence, and logs the original.
///
/// [action] completes the sentence and so must be an infinitive phrase —
/// 'send your message', 'load your classes'. This is the same shape
/// `OfflineActionGuard.ensureOnline` already takes, so the two read alike and
/// a phrase can move between them.
///
/// Never interpolates [error] into what it returns. `FirebaseException`
/// appends its stack trace in `toString()`, which is how frames from
/// `MethodChannel` and `cloud_functions` ended up in front of parents
/// (MOB-32).
PresentedError presentError(
  Object error, {
  required String action,
  StackTrace? stackTrace,
}) {
  logHandledError(error, whileTryingTo: action, stackTrace: stackTrace);
  final kind = _classify(error);
  return PresentedError._(kind, _messageFor(kind, action));
}

/// The one place a handled error reaches a developer.
///
/// There is no crash reporter in the app yet, so this is [debugPrint].
/// Swapping in a reporter should be a change to this function alone, which is
/// why [presentError] calls it rather than leaving each site to log for
/// itself — a site that forgets is a failure nobody ever hears about.
void logHandledError(
  Object error, {
  required String whileTryingTo,
  StackTrace? stackTrace,
}) {
  // The raw error, stack trace and all, is exactly what is wanted here. It is
  // only the user-facing string that has to stay clean.
  debugPrint('[error] while trying to $whileTryingTo: $error');
  if (stackTrace != null) {
    debugPrint('$stackTrace');
  }
}

ErrorKind _classify(Object error) {
  // FirebaseFunctionsException extends FirebaseException, as do the Firestore
  // and Auth exceptions, so one branch covers every backend we call.
  if (error is FirebaseException) return _classifyCode(error.code);
  if (error is SocketException) return ErrorKind.offline;
  // Our own timeout, rather than the backend's: same reasoning as 'cancelled'
  // below — we gave up, the server did not necessarily.
  if (error is TimeoutException) return ErrorKind.ambiguous;
  return ErrorKind.unknown;
}

ErrorKind _classifyCode(String code) {
  switch (code) {
    // Both mean the client stopped waiting. Neither means the write did not
    // land, which is why they are not reported as failures.
    case 'cancelled':
    case 'deadline-exceeded':
      return ErrorKind.ambiguous;
    case 'unavailable':
    case 'network-request-failed':
      return ErrorKind.offline;
    case 'permission-denied':
    case 'unauthenticated':
      return ErrorKind.permission;
    default:
      return ErrorKind.unknown;
  }
}

String _messageFor(ErrorKind kind, String action) {
  switch (kind) {
    case ErrorKind.offline:
      // Worded to match OfflineActionGuard's toast, so the same situation does
      // not get two different sentences depending on which check caught it.
      return "You're offline. Reconnect to $action.";
    case ErrorKind.permission:
      return "You don't have permission to $action.";
    case ErrorKind.ambiguous:
      // No action phrase: the point is that the thing they just did may have
      // worked, so naming it again as though it needs redoing misleads.
      return 'This may still be going through. '
          'Give it a moment before trying again.';
    case ErrorKind.unknown:
      return "We couldn't $action right now. Please try again.";
  }
}
