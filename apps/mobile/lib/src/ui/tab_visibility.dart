import 'package:flutter/widgets.dart';

/// Tells a tab whether it is the one currently on screen.
///
/// [HomeScreen] keeps every visited tab alive in an `IndexedStack`, so a screen
/// no longer gets a fresh `initState` each time the user comes back to it —
/// which is the whole point, but it means anything that used to reload on
/// remount now needs another signal. That signal is this.
class TabVisibility extends InheritedWidget {
  final bool isVisible;

  const TabVisibility({
    super.key,
    required this.isVisible,
    required super.child,
  });

  /// Whether the nearest enclosing tab is on screen.
  ///
  /// Defaults to true when there is no [TabVisibility] above, so a screen
  /// pushed as its own route — `TimetableScreen(browseOnly: true)`, say —
  /// behaves exactly as it did before tabs were kept alive.
  static bool of(BuildContext context) {
    final visibility =
        context.dependOnInheritedWidgetOfExactType<TabVisibility>();
    return visibility?.isVisible ?? true;
  }

  @override
  bool updateShouldNotify(TabVisibility oldWidget) =>
      isVisible != oldWidget.isVisible;
}

/// The body of a tabbed shell: every tab that has been opened stays alive, and
/// the one on screen is told so.
///
/// Tabs are built lazily. Building all of them up front would start every
/// screen's initial load at once, which costs more at sign-in than the reload
/// this is here to remove.
class TabStack extends StatelessWidget {
  /// Which tab is on screen, as an index into [length].
  final int index;

  /// Indexes that have been selected at least once. Anything absent is not
  /// built at all.
  final Set<int> visited;

  final int length;

  /// Builds the tab at [i]. Called only for visited indexes, and only until
  /// that tab is first built — after that it is kept alive.
  final Widget Function(BuildContext context, int i) builder;

  /// Identifies the tab at [i], so a change to the destination list cannot
  /// hand one tab's state to another.
  final Key Function(int i) keyFor;

  const TabStack({
    super.key,
    required this.index,
    required this.visited,
    required this.length,
    required this.builder,
    required this.keyFor,
  });

  @override
  Widget build(BuildContext context) {
    return IndexedStack(
      index: index,
      sizing: StackFit.expand,
      children: [
        for (var i = 0; i < length; i++)
          if (visited.contains(i))
            TabVisibility(
              isVisible: i == index,
              child: KeyedSubtree(
                key: keyFor(i),
                child: builder(context, i),
              ),
            )
          else
            const SizedBox.shrink(),
      ],
    );
  }
}

/// Calls [onTabVisible] each time this screen's tab is returned to.
///
/// First mount counts as a return, so [onTabVisible] is the single entry point
/// for both the initial load and every later refresh — screens using this do
/// not need to start anything from `initState` as well.
mixin TabVisibilityAware<T extends StatefulWidget> on State<T> {
  bool _wasVisible = false;

  /// Runs after the frame in which this tab became visible.
  void onTabVisible();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();

    // This fires for any inherited change, Provider updates included, so the
    // edge is what matters rather than the value — without the guard a routine
    // controller notification would re-trigger a load.
    final isVisible = TabVisibility.of(context);
    if (!isVisible) {
      _wasVisible = false;
      return;
    }
    if (_wasVisible) return;
    _wasVisible = true;

    // Deferred to after the frame because callers reach straight for their
    // controllers, and notifying a ChangeNotifier while this subtree is still
    // building throws. `timetable_screen_lifecycle_test.dart` and
    // `dashboard_container_test.dart` both exist because of that.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) onTabVisible();
    });
  }
}
