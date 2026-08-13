import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

/// Corner ribbon marking a session signed in as an internal account.
///
/// Internal accounts are real production accounts kept for smoke-testing after
/// a release. They are hidden from contact lists and refused writes, so a
/// tester who does not realise which account they are on will hit confusing
/// permission errors. This says so up front.
///
/// Reads the `internal` custom claim rather than the user document: it is the
/// same source of truth the Firestore rules gate on, so the ribbon cannot
/// disagree with the behaviour the tester actually gets.
///
/// Sits at [BannerLocation.bottomStart] deliberately — `StagingBanner` occupies
/// topStart and Flutter's own debug banner occupies topEnd.
class InternalAccountBanner extends StatelessWidget {
  const InternalAccountBanner({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.idTokenChanges(),
      builder: (context, snapshot) {
        final user = snapshot.data;
        if (user == null) return child;

        return FutureBuilder<IdTokenResult>(
          // Not forced: a refresh on every rebuild would be a network call per
          // frame. The claim changes rarely, and a stale token is already the
          // rules' own view of the account.
          future: user.getIdTokenResult(),
          builder: (context, tokenSnapshot) {
            if (tokenSnapshot.data?.claims?['internal'] != true) return child;

            return Banner(
              message: 'INTERNAL',
              location: BannerLocation.bottomStart,
              color: Colors.redAccent,
              child: child,
            );
          },
        );
      },
    );
  }
}
