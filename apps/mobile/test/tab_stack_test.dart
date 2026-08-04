import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/ui/tab_visibility.dart';

/// Counts how many times it is built from scratch, and records the loads its
/// own visibility triggers — standing in for a real tab screen.
class _CountingTab extends StatefulWidget {
  final String label;
  final List<String> mounted;
  final List<String> loads;

  const _CountingTab({
    required this.label,
    required this.mounted,
    required this.loads,
  });

  @override
  State<_CountingTab> createState() => _CountingTabState();
}

class _CountingTabState extends State<_CountingTab>
    with TabVisibilityAware<_CountingTab> {
  @override
  void initState() {
    super.initState();
    widget.mounted.add(widget.label);
  }

  @override
  void onTabVisible() => widget.loads.add(widget.label);

  @override
  Widget build(BuildContext context) => Text(widget.label);
}

class _Shell extends StatefulWidget {
  final List<String> labels;
  final List<String> mounted;
  final List<String> loads;

  const _Shell({
    required this.labels,
    required this.mounted,
    required this.loads,
  });

  @override
  State<_Shell> createState() => _ShellState();
}

class _ShellState extends State<_Shell> {
  int _index = 0;
  final Set<int> _visited = {0};

  void select(int i) => setState(() {
        _index = i;
        _visited.add(i);
      });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: TabStack(
        index: _index,
        length: widget.labels.length,
        visited: _visited,
        keyFor: (i) => ValueKey(widget.labels[i]),
        builder: (context, i) => _CountingTab(
          label: widget.labels[i],
          mounted: widget.mounted,
          loads: widget.loads,
        ),
      ),
      bottomNavigationBar: Row(
        children: [
          for (var i = 0; i < widget.labels.length; i++)
            TextButton(
              key: ValueKey('tab-${widget.labels[i]}'),
              onPressed: () => select(i),
              child: Text('go ${widget.labels[i]}'),
            ),
        ],
      ),
    );
  }
}

void main() {
  late List<String> mounted;
  late List<String> loads;

  Future<void> pumpShell(WidgetTester tester) async {
    mounted = [];
    loads = [];
    await tester.pumpWidget(
      MaterialApp(
        home: _Shell(
          labels: const ['home', 'classes', 'messages'],
          mounted: mounted,
          loads: loads,
        ),
      ),
    );
    await tester.pump();
  }

  Future<void> tapTab(WidgetTester tester, String label) async {
    await tester.tap(find.byKey(ValueKey('tab-$label')));
    await tester.pump();
  }

  testWidgets('builds only the tabs that have been opened', (tester) async {
    await pumpShell(tester);

    expect(mounted, ['home']);

    await tapTab(tester, 'classes');
    expect(mounted, ['home', 'classes']);

    // Messages was never selected, so it was never built.
    expect(mounted, isNot(contains('messages')));
  });

  testWidgets('keeps a tab alive across a switch away and back',
      (tester) async {
    await pumpShell(tester);

    final firstState = tester.state(find.byType(_CountingTab));

    await tapTab(tester, 'classes');
    await tapTab(tester, 'home');

    // Same State object: the screen was never torn down, so its scroll
    // position, filters and loaded data all survive.
    final returnedState = tester.state(
      find.byWidgetPredicate(
        (widget) => widget is _CountingTab && widget.label == 'home',
      ),
    );
    expect(identical(firstState, returnedState), isTrue);

    // And it was built exactly once.
    expect(mounted.where((label) => label == 'home').length, 1);
  });

  testWidgets('tells a tab when it becomes visible, and only then',
      (tester) async {
    await pumpShell(tester);

    expect(loads, ['home']);

    await tapTab(tester, 'classes');
    expect(loads, ['home', 'classes']);

    // Going back re-triggers the visible tab and nothing else — the tab left
    // behind stays quiet.
    await tapTab(tester, 'home');
    expect(loads, ['home', 'classes', 'home']);

    // Re-selecting the tab already on screen is not a new edge.
    await tapTab(tester, 'home');
    expect(loads, ['home', 'classes', 'home']);
  });

  testWidgets('renders the selected tab and keeps the others off screen',
      (tester) async {
    await pumpShell(tester);
    await tapTab(tester, 'classes');

    // Only the selected tab is on screen…
    expect(find.text('classes'), findsOneWidget);
    expect(find.text('home'), findsNothing);

    // …but the one behind it is still in the tree, merely offstage. That is
    // what keeps its state alive.
    expect(find.text('home', skipOffstage: false), findsOneWidget);

    final stack = tester.widget<IndexedStack>(find.byType(IndexedStack));
    expect(stack.index, 1);
  });
}
