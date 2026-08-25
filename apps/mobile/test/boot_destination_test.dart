import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/ui/boot_destination.dart';

BootDestination resolve({
  bool isRestoringSession = false,
  bool isSignedIn = true,
  bool hasCheckedAcceptance = true,
  bool isTermsGateResolved = true,
  bool needsToAcceptTerms = false,
}) =>
    resolveBootDestination(
      isRestoringSession: isRestoringSession,
      isSignedIn: isSignedIn,
      hasCheckedAcceptance: hasCheckedAcceptance,
      isTermsGateResolved: isTermsGateResolved,
      needsToAcceptTerms: needsToAcceptTerms,
    );

void main() {
  group('while the session is being restored', () {
    test('waits rather than showing the login screen', () {
      expect(
        resolve(isRestoringSession: true, isSignedIn: false),
        BootDestination.waiting,
      );
    });

    test('sends a signed-out user to the login screen once it is over', () {
      expect(
        resolve(isRestoringSession: false, isSignedIn: false),
        BootDestination.login,
      );
    });
  });

  group('while the terms gate is still resolving', () {
    // MOB-29. Both of these answered `terms`, so a returning user saw the gate
    // on the way to their dashboard.
    test('waits while the acceptance read is in flight', () {
      expect(
        resolve(hasCheckedAcceptance: false, needsToAcceptTerms: true),
        BootDestination.waiting,
      );
    });

    test('waits while the terms document is still loading', () {
      expect(
        resolve(isTermsGateResolved: false, needsToAcceptTerms: true),
        BootDestination.waiting,
      );
    });

    test('waits even when the acceptance read has already come back', () {
      expect(
        resolve(
          hasCheckedAcceptance: true,
          isTermsGateResolved: false,
          needsToAcceptTerms: false,
        ),
        BootDestination.waiting,
      );
    });
  });

  group('once everything is known', () {
    test('sends an up-to-date user to the app', () {
      expect(resolve(needsToAcceptTerms: false), BootDestination.app);
    });

    test('sends a user who owes an acceptance to the terms gate', () {
      expect(resolve(needsToAcceptTerms: true), BootDestination.terms);
    });
  });

  test('never routes a signed-out user past the login screen', () {
    for (final restoring in [true, false]) {
      for (final resolved in [true, false]) {
        for (final needs in [true, false]) {
          final destination = resolve(
            isRestoringSession: restoring,
            isSignedIn: false,
            isTermsGateResolved: resolved,
            needsToAcceptTerms: needs,
          );
          expect(
            destination,
            anyOf(BootDestination.waiting, BootDestination.login),
            reason: 'restoring=$restoring resolved=$resolved needs=$needs',
          );
        }
      }
    }
  });

  test('never reaches the app while any answer is outstanding', () {
    for (final checked in [true, false]) {
      for (final resolved in [true, false]) {
        if (checked && resolved) continue;
        expect(
          resolve(hasCheckedAcceptance: checked, isTermsGateResolved: resolved),
          BootDestination.waiting,
          reason: 'checked=$checked resolved=$resolved',
        );
      }
    }
  });
}
