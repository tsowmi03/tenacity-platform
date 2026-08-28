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

  /// The error arrived knowing what to tell the user. See [UserFacingFailure].
  explained,
}

/// What the failed call was trying to do.
///
/// Only matters for the codes meaning we stopped waiting. Giving up on a write
/// leaves a real question — the server may have committed anyway — but giving
/// up on a read leaves none: we do not have the data, and we know it. Telling
/// someone a load "may still be going through" describes nothing.
enum Operation {
  /// Fetches something and changes nothing.
  read,

  /// Changes something, so a lost answer leaves the outcome unknown.
  write,
}

/// Implemented by our own exceptions that already know what to tell the user.
///
/// [presentError] shows [userMessage] as it stands instead of sorting the
/// error into a category. Some domain failures carry advice no category can:
/// an edit conflict has to say *reload before saving*, because the generic
/// "please try again" would have someone overwrite the change they collided
/// with.
abstract interface class UserFacingFailure {
  /// A whole sentence, safe to show. Must not name ids, classes or internals.
  String get userMessage;
}

/// A caught error turned into something showable.
///
/// Carries [kind] as well as [message] because the ambiguous case is not a
/// message at all: a caller with a pending-state indicator should show
/// nothing and let that indicator settle, rather than claim an outcome we do
/// not know.
class PresentedError {
  final ErrorKind kind;

  /// A whole sentence, naming the action. For somewhere the failure appears on
  /// its own and has to explain itself — a snackbar, an inline notice.
  final String message;

  /// The cause alone, with the action left out. For somewhere that already
  /// names what failed in its own heading — `ErrorStateView` above its
  /// message, say — where [message] would say the heading a second time.
  final String reason;

  const PresentedError._(this.kind, this.message, this.reason);

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
///
/// [operation] defaults to [Operation.write], the cautious side: mistaking a
/// read for a write only costs some wording, while mistaking a write for a
/// read would have us assert a failure we cannot actually see.
PresentedError presentError(
  Object error, {
  required String action,
  Operation operation = Operation.write,
  StackTrace? stackTrace,
}) {
  logHandledError(error, whileTryingTo: action, stackTrace: stackTrace);

  // Its own sentence beats anything a category could assemble, and it is the
  // same either way: it already leaves the action out.
  if (error is UserFacingFailure) {
    return PresentedError._(
      ErrorKind.explained,
      error.userMessage,
      error.userMessage,
    );
  }

  final kind = _classify(error, operation);
  return PresentedError._(kind, _messageFor(kind, action), _reasonFor(kind));
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

ErrorKind _classify(Object error, Operation operation) {
  // FirebaseFunctionsException extends FirebaseException, as do the Firestore
  // and Auth exceptions, so one branch covers every backend we call.
  if (error is FirebaseException) return _classifyCode(error.code, operation);
  if (error is SocketException) return ErrorKind.offline;
  // Our own timeout, rather than the backend's: same reasoning as 'cancelled'
  // below — we gave up, the server did not necessarily.
  if (error is TimeoutException) return _gaveUpWaiting(operation);
  return ErrorKind.unknown;
}

/// What it means to have stopped waiting, given what was being attempted.
///
/// A write becomes genuinely unknown. A read becomes an ordinary failure:
/// there is no second possibility to hold open, because a read that had
/// succeeded would have handed us the data.
ErrorKind _gaveUpWaiting(Operation operation) =>
    operation == Operation.write ? ErrorKind.ambiguous : ErrorKind.unknown;

ErrorKind _classifyCode(String code, Operation operation) {
  switch (code) {
    // Both mean the client stopped waiting, which is only an open question
    // when there was something to commit.
    case 'cancelled':
    case 'deadline-exceeded':
      return _gaveUpWaiting(operation);
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
    case ErrorKind.explained:
      // Unreachable: presentError returns the failure's own message before it
      // gets here. Named rather than defaulted so a new kind still breaks the
      // build until it has been given words.
      throw StateError('an explained failure supplies its own message');
  }
}

String _reasonFor(ErrorKind kind) {
  switch (kind) {
    case ErrorKind.offline:
      return 'You appear to be offline. Reconnect and try again.';
    case ErrorKind.permission:
      return "Your account doesn't have access to this.";
    case ErrorKind.ambiguous:
      return 'This may still be going through. '
          'Give it a moment before trying again.';
    case ErrorKind.unknown:
      return 'Please try again in a moment.';
    case ErrorKind.explained:
      throw StateError('an explained failure supplies its own message');
  }
}
