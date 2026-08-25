/// Where boot should send the user.
enum BootDestination {
  /// Nowhere yet. An answer boot depends on is still on the wire.
  waiting,
  login,
  terms,
  app,
}

/// Chooses a destination from what boot currently knows.
///
/// Kept apart from the widget because the routing, not the rendering, is where
/// this went wrong: a user who had already accepted the current terms was sent
/// to the terms gate while the app was still working out that they had, and
/// then on to their dashboard a moment later (MOB-29).
///
/// The rule is that every question must be answered before it is acted on. An
/// unanswered question is [BootDestination.waiting] — never a guess at the
/// destination, in either direction. Guessing [BootDestination.terms] flashes
/// a gate at people who do not need it; guessing [BootDestination.app] would
/// let someone past a gate they do need.
BootDestination resolveBootDestination({
  required bool isRestoringSession,
  required bool isSignedIn,
  required bool hasCheckedAcceptance,
  required bool isTermsGateResolved,
  required bool needsToAcceptTerms,
}) {
  if (!isSignedIn) {
    // A null user during the restore means "not known yet", not "nobody".
    return isRestoringSession ? BootDestination.waiting : BootDestination.login;
  }

  if (!hasCheckedAcceptance || !isTermsGateResolved) {
    return BootDestination.waiting;
  }

  return needsToAcceptTerms ? BootDestination.terms : BootDestination.app;
}
