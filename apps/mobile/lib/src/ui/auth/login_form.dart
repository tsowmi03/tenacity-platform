import 'package:flutter/foundation.dart';

/// Validation for the sign-in form.
///
/// The rules live here rather than inline so the field validators and the
/// submit button cannot drift apart — before this the email pattern was written
/// out twice, once for each, and either copy could have been changed alone.
///
/// These match what Firebase Auth will accept. They are a courtesy to save a
/// round trip, not a security control.

/// Firebase rejects anything shorter, so a shorter password can only ever fail.
const int minimumPasswordLength = 6;

final RegExp _emailPattern = RegExp(r'^[^@]+@[^@]+\.[^@]+');

/// Why an email cannot be used, or null when it can.
String? emailErrorFor(String? value) {
  final email = value?.trim() ?? '';
  if (email.isEmpty) return 'Please enter your email.';
  if (!_emailPattern.hasMatch(email)) return 'Invalid email format.';
  return null;
}

/// Why a password cannot be used, or null when it can.
String? passwordErrorFor(String? value) {
  final password = value?.trim() ?? '';
  if (password.isEmpty) return 'Please enter your password.';
  if (password.length < minimumPasswordLength) {
    return 'Password must be at least $minimumPasswordLength characters.';
  }
  return null;
}

/// Whether the Log in button should be tappable.
bool canSubmitLogin({required String email, required String password}) {
  return emailErrorFor(email) == null && passwordErrorFor(password) == null;
}

/// Whether a password reset can be requested for what has been typed.
///
/// Only the email matters — a family who has forgotten their password will not
/// have filled the password field in.
bool canRequestPasswordReset(String email) => emailErrorFor(email) == null;

/// Whether a message reports a failure or a completed action.
enum LoginFeedbackKind { error, success }

/// A single line of feedback under the form.
///
/// One channel rather than two, because a failed sign-in and a sent reset email
/// are answers to the same question — "did that work?" — and showing them in
/// different places made the screen harder to read, not easier.
@immutable
class LoginFeedback {
  final LoginFeedbackKind kind;
  final String message;

  const LoginFeedback({required this.kind, required this.message});

  const LoginFeedback.error(this.message) : kind = LoginFeedbackKind.error;

  const LoginFeedback.success(this.message) : kind = LoginFeedbackKind.success;

  bool get isError => kind == LoginFeedbackKind.error;

  /// Picks the message to show from the controller's two channels.
  ///
  /// An error wins when both are set: it is the more recent outcome the user
  /// needs to act on, and a stale success line beside a failure reads as though
  /// the failure did not happen.
  static LoginFeedback? from({String? errorMessage, String? statusMessage}) {
    if (errorMessage != null && errorMessage.isNotEmpty) {
      return LoginFeedback.error(errorMessage);
    }
    if (statusMessage != null && statusMessage.isNotEmpty) {
      return LoginFeedback.success(statusMessage);
    }
    return null;
  }
}
