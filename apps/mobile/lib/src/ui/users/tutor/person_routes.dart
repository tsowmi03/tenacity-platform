import 'package:flutter/material.dart';

/// Route names for the people screens, so an already-open record can be
/// recognised.
String studentRouteName(String studentId) => 'person/student/$studentId';
String parentRouteName(String parentUid) => 'person/parent/$parentUid';

/// Opens a person's record, returning to it if it is already open.
///
/// Student and parent records link to each other: a student lists their
/// family, and a parent lists their children. Pushing unconditionally let a
/// tutor walk student → parent → student → parent indefinitely, stacking the
/// same two people until escaping meant pressing back a dozen times.
///
/// [openRoutes] is the chain of person routes already on the stack, including
/// the caller's own. It is threaded through the screens rather than read back
/// off the navigator because there is no public API for enumerating the stack
/// — `popUntil` stops at the first route its predicate accepts, so using it to
/// look only ever sees the top one.
///
/// The result behaves like navigation rather than recursion: opening a
/// student's parent, then that parent's child, returns to the student you
/// started on, and one back press from anywhere in the chain lands on the
/// screen that opened it.
void pushPersonRoute(
  BuildContext context, {
  required List<String> openRoutes,
  required String routeName,
  required Widget Function(List<String> openRoutes) builder,
}) {
  final navigator = Navigator.of(context);

  if (openRoutes.contains(routeName)) {
    // Safe: the name is known to be on the stack, so this cannot pop past it.
    navigator.popUntil(ModalRoute.withName(routeName));
    return;
  }

  navigator.push(
    MaterialPageRoute(
      builder: (_) => builder([...openRoutes, routeName]),
      settings: RouteSettings(name: routeName),
    ),
  );
}
