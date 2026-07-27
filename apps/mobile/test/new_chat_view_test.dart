import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/connectivity_controller.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/messaging/new_chat_data.dart';
import 'package:tenacity/src/ui/messaging/new_chat_view.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';

const _viewports = <String, Size>{
  'reference 402x874': Size(402, 874),
  'narrow 320x640': Size(320, 640),
  'large 430x932': Size(430, 932),
};

ContactRowData _contact({
  String uid = 'u1',
  String name = 'Alice Nguyen',
  String roleLabel = 'Tutor',
  String initials = 'AN',
}) {
  return ContactRowData(
    uid: uid,
    name: name,
    roleLabel: roleLabel,
    initials: initials,
  );
}

List<ContactSection> _sections() => [
      ContactSection(
        title: 'TENACITY TEAM',
        contacts: [
          _contact(),
          _contact(
            uid: 'u2',
            name: 'Blake Ford',
            roleLabel: 'Admin',
            initials: 'BF',
          ),
        ],
      ),
      ContactSection(
        title: 'PARENTS',
        contacts: [
          _contact(
            uid: 'u3',
            name: 'Cara Smith',
            roleLabel: 'Parent',
            initials: 'CS',
          ),
        ],
      ),
    ];

class Taps {
  int back = 0;
  int retries = 0;
  final searches = <String>[];
  final selected = <String>[];
}

Future<Taps> pumpPicker(
  WidgetTester tester, {
  List<ContactSection>? sections,
  bool isLoading = false,
  String? errorMessage,
  bool hasQuery = false,
  bool isOffline = false,
  Size size = const Size(402, 874),
  double textScale = 1.0,
}) async {
  final taps = Taps();

  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final connectivity = ConnectivityController()
    ..setOfflineForTesting(isOffline);

  await tester.pumpWidget(
    ChangeNotifierProvider<ConnectivityController>.value(
      value: connectivity,
      child: MaterialApp(
        theme: AppTheme.light,
        home: MediaQuery(
          data: MediaQueryData(textScaler: TextScaler.linear(textScale)),
          child: NewChatView(
            sections: sections ?? _sections(),
            isLoading: isLoading,
            errorMessage: errorMessage,
            hasQuery: hasQuery,
            onSearchChanged: taps.searches.add,
            onSelect: (contact) => taps.selected.add(contact.uid),
            onBack: () => taps.back++,
            onRetry: () => taps.retries++,
          ),
        ),
      ),
    ),
  );
  await tester.pump();

  return taps;
}

void main() {
  group('hierarchy', () {
    testWidgets('renders the header, sections and contacts', (tester) async {
      await pumpPicker(tester);

      expect(find.text('New message'), findsOneWidget);
      expect(find.text('3 contacts'), findsOneWidget);
      expect(find.text('TENACITY TEAM'), findsOneWidget);
      expect(find.text('PARENTS'), findsOneWidget);

      expect(find.text('Alice Nguyen'), findsOneWidget);
      expect(find.text('AN'), findsOneWidget);
      expect(find.text('Tutor'), findsOneWidget);
      expect(find.text('Cara Smith'), findsOneWidget);
    });

    testWidgets('counts a single contact in the singular', (tester) async {
      await pumpPicker(
        tester,
        sections: [
          ContactSection(title: 'TENACITY TEAM', contacts: [_contact()]),
        ],
      );

      expect(find.text('1 contact'), findsOneWidget);
    });

    testWidgets('omits the role line when the role is unknown', (tester) async {
      await pumpPicker(
        tester,
        sections: [
          ContactSection(
            title: 'TENACITY TEAM',
            contacts: [_contact(roleLabel: '')],
          ),
        ],
      );

      expect(find.text('Alice Nguyen'), findsOneWidget);
      expect(find.text('Tutor'), findsNothing);
    });
  });

  group('actions', () {
    testWidgets('selecting a contact reports it', (tester) async {
      final taps = await pumpPicker(tester);

      await tester.tap(find.text('Blake Ford'));
      await tester.pump();

      expect(taps.selected, ['u2']);
    });

    testWidgets('back leaves the picker', (tester) async {
      final taps = await pumpPicker(tester);

      await tester.tap(find.byKey(const Key('detail-back')));
      await tester.pump();

      expect(taps.back, 1);
    });

    testWidgets('typing reports the query', (tester) async {
      final taps = await pumpPicker(tester);

      await tester.enterText(find.byType(TextField), 'ali');
      await tester.pump();

      expect(taps.searches, ['ali']);
    });
  });

  group('states', () {
    testWidgets('shows skeletons while loading with nothing yet',
        (tester) async {
      await pumpPicker(tester, sections: const [], isLoading: true);

      expect(find.byType(SkeletonBlock), findsWidgets);
      expect(find.text('Loading contacts…'), findsOneWidget);
      expect(find.byKey(const Key('new-chat-list')), findsNothing);
    });

    testWidgets('keeps showing contacts while a refresh is in flight',
        (tester) async {
      await pumpPicker(tester, isLoading: true);

      expect(find.text('Alice Nguyen'), findsOneWidget);
      expect(find.byType(SkeletonBlock), findsNothing);
    });

    testWidgets('offers a retry when loading failed', (tester) async {
      final taps = await pumpPicker(
        tester,
        sections: const [],
        errorMessage: 'Failed to load users',
      );

      expect(find.text('Contacts could not be loaded'), findsOneWidget);
      await tester.tap(find.text('Try again'));
      await tester.pump();

      expect(taps.retries, 1);
    });

    testWidgets('distinguishes no matches from no contacts', (tester) async {
      await pumpPicker(tester, sections: const [], hasQuery: true);
      expect(find.text('No matching contacts'), findsOneWidget);

      await pumpPicker(tester, sections: const []);
      expect(find.text('No contacts available'), findsOneWidget);
    });

    testWidgets('says why the list is empty while offline', (tester) async {
      await pumpPicker(tester, sections: const [], isOffline: true);

      expect(
        find.text('No saved contacts available offline.'),
        findsOneWidget,
      );
    });
  });

  group('responsive', () {
    for (final entry in _viewports.entries) {
      testWidgets('renders without overflow at ${entry.key}', (tester) async {
        await pumpPicker(tester, size: entry.value);
        expect(tester.takeException(), isNull);
      });

      testWidgets('renders at ${entry.key} with text scale 1.3',
          (tester) async {
        await pumpPicker(tester, size: entry.value, textScale: 1.3);
        expect(tester.takeException(), isNull);
      });
    }
  });
}
