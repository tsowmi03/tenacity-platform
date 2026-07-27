import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/ui/auth/login_form.dart';

void main() {
  group('email', () {
    test('accepts an ordinary address', () {
      expect(emailErrorFor('parent@example.com'), isNull);
    });

    test('ignores surrounding whitespace', () {
      expect(emailErrorFor('  parent@example.com  '), isNull);
    });

    test('asks for an address when there is none', () {
      expect(emailErrorFor(''), 'Please enter your email.');
      expect(emailErrorFor('   '), 'Please enter your email.');
      expect(emailErrorFor(null), 'Please enter your email.');
    });

    test('rejects an address that cannot be one', () {
      expect(emailErrorFor('parent'), 'Invalid email format.');
      expect(emailErrorFor('parent@example'), 'Invalid email format.');
      expect(emailErrorFor('@example.com'), 'Invalid email format.');
    });
  });

  group('password', () {
    test('accepts one of the minimum length', () {
      expect(passwordErrorFor('abcdef'), isNull);
    });

    test('asks for a password when there is none', () {
      expect(passwordErrorFor(''), 'Please enter your password.');
      expect(passwordErrorFor(null), 'Please enter your password.');
    });

    // Firebase rejects anything shorter, so a short password can only fail.
    test('rejects one shorter than Firebase will accept', () {
      expect(
        passwordErrorFor('abcde'),
        'Password must be at least 6 characters.',
      );
    });
  });

  group('submission', () {
    test('needs both fields to be usable', () {
      expect(
        canSubmitLogin(email: 'parent@example.com', password: 'abcdef'),
        isTrue,
      );
      expect(
        canSubmitLogin(email: 'parent', password: 'abcdef'),
        isFalse,
      );
      expect(
        canSubmitLogin(email: 'parent@example.com', password: 'abc'),
        isFalse,
      );
      expect(canSubmitLogin(email: '', password: ''), isFalse);
    });

    // Someone who has forgotten their password will not have typed one.
    test('a reset needs only the email', () {
      expect(canRequestPasswordReset('parent@example.com'), isTrue);
      expect(canRequestPasswordReset(''), isFalse);
      expect(canRequestPasswordReset('parent'), isFalse);
    });
  });

  group('feedback', () {
    test('nothing to say when both channels are empty', () {
      expect(LoginFeedback.from(), isNull);
      expect(
        LoginFeedback.from(errorMessage: '', statusMessage: ''),
        isNull,
      );
    });

    test('reports a failure as an error', () {
      final feedback = LoginFeedback.from(errorMessage: 'Wrong password.');

      expect(feedback!.isError, isTrue);
      expect(feedback.message, 'Wrong password.');
    });

    // A sent reset email used to arrive on the error channel and was shown in
    // red, reading as though it had failed.
    test('reports a completed action as a success', () {
      final feedback = LoginFeedback.from(statusMessage: 'Sent!');

      expect(feedback!.kind, LoginFeedbackKind.success);
      expect(feedback.isError, isFalse);
      expect(feedback.message, 'Sent!');
    });

    test('an error wins over a stale success', () {
      final feedback = LoginFeedback.from(
        errorMessage: 'No user found for that email.',
        statusMessage: 'Sent!',
      );

      expect(feedback!.isError, isTrue);
      expect(feedback.message, 'No user found for that email.');
    });
  });
}
