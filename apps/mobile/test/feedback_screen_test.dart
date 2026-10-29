import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/connectivity_controller.dart';
import 'package:tenacity/src/controllers/feedback_controller.dart';
import 'package:tenacity/src/models/admin_model.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/models/feedback_model.dart';
import 'package:tenacity/src/models/parent_model.dart';
import 'package:tenacity/src/services/feedback_service.dart';
import 'package:tenacity/src/ui/feedback_screen.dart';

class _FakeAuthController extends ChangeNotifier implements AuthController {
  _FakeAuthController({this.tutorNamesById = const {}, AppUser? currentUser})
      : _currentUser = currentUser ?? _admin;

  final Map<String, String> tutorNamesById;

  final AppUser _currentUser;

  static final AppUser _admin = Admin(
    uid: 'admin-1',
    firstName: 'Ada',
    lastName: 'Admin',
    email: 'ada@example.com',
    fcmTokens: const [],
    phone: '',
    unreadChats: const {},
    activeChats: const [],
  );

  @override
  AppUser? get currentUser => _currentUser;

  @override
  Future<Map<String, String>> fetchTutorNamesByIds(
    List<String> tutorIds,
  ) async {
    return {
      for (final id in tutorIds) id: tutorNamesById[id] ?? id,
    };
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeFeedbackController extends ChangeNotifier
    implements FeedbackController {
  _FakeFeedbackController({this.feedback = const []});

  final List<StudentFeedback> feedback;
  Completer<void> addCompleter = Completer<void>();
  int addCalls = 0;
  StudentFeedback? addedFeedback;
  final List<String> addedIds = [];
  Object? addError;
  final List<(String, FeedbackResponseType, String, String)> responses = [];

  @override
  FeedbackService get service => throw UnimplementedError();

  @override
  Stream<List<StudentFeedback>> getFeedbackByStudentId(String studentId) {
    return Stream<List<StudentFeedback>>.value(feedback);
  }

  @override
  Future<void> addFeedback(StudentFeedback feedback) async {
    addCalls += 1;
    addedFeedback = feedback;
    addedIds.add(feedback.id);
    if (addError case final error?) throw error;
    await addCompleter.future;
  }

  @override
  Future<void> respondToFeedback({
    required String feedbackId,
    required String parentId,
    required String parentName,
    required FeedbackResponseType type,
    required String text,
  }) async {
    responses.add((feedbackId, type, text, parentName));
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _OnlineConnectivityController extends ConnectivityController {
  @override
  Future<bool> refreshAndCheckOnline() async => true;
}

void main() {
  test('resolveTutorNamesByIds falls back when a tutor cannot be loaded',
      () async {
    final names = await resolveTutorNamesByIds(
      ['active-tutor', 'missing-tutor', 'blank-tutor', 'active-tutor'],
      fetchTutorName: (id) async {
        if (id == 'missing-tutor') {
          throw StateError('permission-denied');
        }
        if (id == 'blank-tutor') return '  ';
        return 'Maria Shehata';
      },
    );

    expect(names, {
      'active-tutor': 'Maria Shehata',
      'missing-tutor': formerTutorDisplayName,
      'blank-tutor': formerTutorDisplayName,
    });
  });

  testWidgets('FeedbackScreen renders former tutor fallback', (tester) async {
    final feedbackController = _FakeFeedbackController(
      feedback: [
        StudentFeedback(
          id: 'feedback-1',
          studentId: 'student-1',
          tutorId: 'missing-tutor',
          parentIds: const [],
          feedback: 'Good work on simultaneous equations.',
          subject: 'Maths',
          createdAt: DateTime(2026, 5, 26, 9),
          isUnread: false,
        ),
      ],
    );

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<AuthController>.value(
            value: _FakeAuthController(
              tutorNamesById: const {
                'missing-tutor': formerTutorDisplayName,
              },
            ),
          ),
          ChangeNotifierProvider<FeedbackController>.value(
            value: feedbackController,
          ),
          ChangeNotifierProvider<ConnectivityController>.value(
            value: _OnlineConnectivityController(),
          ),
        ],
        child: const MaterialApp(
          home: FeedbackScreen(studentId: 'student-1'),
        ),
      ),
    );

    await tester.pump();
    await tester.pump();

    // The author now shares one attribution line with the subject, the same
    // way the parent dashboard credits its feedback quote.
    expect(find.textContaining(formerTutorDisplayName), findsOneWidget);
    expect(find.text('Error loading tutor names.'), findsNothing);
  });

  testWidgets('FeedbackScreen disables add controls while feedback is saving',
      (tester) async {
    final feedbackController = _FakeFeedbackController();

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<AuthController>.value(
            value: _FakeAuthController(),
          ),
          ChangeNotifierProvider<FeedbackController>.value(
            value: feedbackController,
          ),
          ChangeNotifierProvider<ConnectivityController>.value(
            value: _OnlineConnectivityController(),
          ),
        ],
        child: const MaterialApp(
          home: FeedbackScreen(studentId: 'student-1'),
        ),
      ),
    );
    await tester.pump();

    await tester.tap(find.byKey(const Key('feedback-add')));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.widgetWithText(TextFormField, 'Subject'),
      '  Great progress  ',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Feedback'),
      '  Strong algebra work this week.  ',
    );
    await tester.tap(find.byKey(const Key('sheet-confirm')));
    await tester.pump();

    expect(feedbackController.addCalls, 1);
    expect(find.text('Add feedback'), findsWidgets);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);

    // Cancel is blocked while the write is in flight, so leaving mid-save
    // cannot strand the sheet.
    final cancelButton = tester.widget<OutlinedButton>(
      find.widgetWithText(OutlinedButton, 'Cancel'),
    );
    expect(cancelButton.onPressed, isNull);

    feedbackController.addCompleter.complete();
    await tester.pumpAndSettle();

    expect(find.text('Add feedback'), findsNothing);
    expect(feedbackController.addedFeedback?.studentId, 'student-1');
    expect(feedbackController.addedFeedback?.id, isNotEmpty);
    expect(feedbackController.addedFeedback?.tutorId, 'admin-1');
    expect(feedbackController.addedFeedback?.parentIds, isEmpty);
    expect(feedbackController.addedFeedback?.subject, 'Great progress');
    expect(
      feedbackController.addedFeedback?.feedback,
      'Strong algebra work this week.',
    );
  });

  testWidgets('an ambiguous feedback retry keeps one document id',
      (tester) async {
    final feedbackController = _FakeFeedbackController()
      ..addError = StateError('response lost');

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<AuthController>.value(
            value: _FakeAuthController(),
          ),
          ChangeNotifierProvider<FeedbackController>.value(
            value: feedbackController,
          ),
          ChangeNotifierProvider<ConnectivityController>.value(
            value: _OnlineConnectivityController(),
          ),
        ],
        child: const MaterialApp(
          home: FeedbackScreen(studentId: 'student-1'),
        ),
      ),
    );
    await tester.pump();

    await tester.tap(find.byKey(const Key('feedback-add')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Subject'),
      'Progress',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Feedback'),
      'Solid work.',
    );
    await tester.tap(find.byKey(const Key('sheet-confirm')));
    await tester.pumpAndSettle();

    expect(feedbackController.addCalls, 1);
    expect(find.text('Add feedback'), findsWidgets);

    feedbackController.addError = null;
    feedbackController.addCompleter.complete();
    await tester.tap(find.byKey(const Key('sheet-confirm')));
    await tester.pumpAndSettle();

    expect(feedbackController.addCalls, 2);
    expect(feedbackController.addedIds.toSet(), hasLength(1));
    expect(feedbackController.addedIds.first, isNotEmpty);
    expect(find.text('Add feedback'), findsNothing);
  });

  group('parent responses (MOB-52)', () {
    final parent = Parent(
      uid: 'parent-1',
      firstName: 'Pat',
      lastName: 'Lee',
      email: 'pat@example.com',
      fcmTokens: const [],
      students: const ['student-1'],
      phone: '',
      unreadChats: const {},
      activeChats: const [],
    );

    StudentFeedback note(
            {Map<String, FeedbackResponse> responses = const {}}) =>
        StudentFeedback(
          id: 'feedback-1',
          studentId: 'student-1',
          tutorId: 'tutor-1',
          parentIds: const ['parent-1'],
          feedback: 'Good work on fractions.',
          subject: 'Maths',
          createdAt: DateTime(2026, 5, 26, 9),
          isUnread: false,
          parentResponses: responses,
        );

    Future<_FakeFeedbackController> pump(
      WidgetTester tester, {
      required AppUser user,
      List<StudentFeedback>? feedback,
    }) async {
      final controller =
          _FakeFeedbackController(feedback: feedback ?? [note()]);
      await tester.pumpWidget(
        MultiProvider(
          providers: [
            ChangeNotifierProvider<AuthController>.value(
              value: _FakeAuthController(
                currentUser: user,
                tutorNamesById: const {'tutor-1': 'Jordan Lee'},
              ),
            ),
            ChangeNotifierProvider<FeedbackController>.value(value: controller),
            ChangeNotifierProvider<ConnectivityController>.value(
              value: _OnlineConnectivityController(),
            ),
          ],
          child: const MaterialApp(
            home: FeedbackScreen(studentId: 'student-1'),
          ),
        ),
      );
      await tester.pump();
      await tester.pump();
      return controller;
    }

    const thanksKey = Key('feedback-respond-feedback-1-thanks');
    const questionKey = Key('feedback-respond-feedback-1-question');

    testWidgets('a thanks is sent in one tap', (tester) async {
      final controller = await pump(tester, user: parent);

      await tester.tap(find.byKey(thanksKey));
      await tester.pumpAndSettle();

      expect(controller.responses, [
        ('feedback-1', FeedbackResponseType.thanks, '', 'Pat Lee'),
      ]);
    });

    testWidgets('a question asks for the message first', (tester) async {
      final controller = await pump(tester, user: parent);

      await tester.tap(find.byKey(questionKey));
      await tester.pumpAndSettle();
      expect(find.text('Ask a question'), findsOneWidget);

      // An empty question is not sent.
      await tester.tap(find.byKey(const Key('sheet-confirm')));
      await tester.pumpAndSettle();
      expect(controller.responses, isEmpty);
      expect(find.text('Enter a message'), findsOneWidget);

      await tester.enterText(
        find.byKey(const Key('feedback-response-text')),
        '  Should we practise at home?  ',
      );
      await tester.tap(find.byKey(const Key('sheet-confirm')));
      await tester.pumpAndSettle();

      expect(controller.responses, [
        (
          'feedback-1',
          FeedbackResponseType.question,
          'Should we practise at home?',
          'Pat Lee',
        ),
      ]);
      expect(find.text('Ask a question'), findsNothing);
    });

    testWidgets('a sent response replaces the buttons', (tester) async {
      await pump(
        tester,
        user: parent,
        feedback: [
          note(responses: {
            'parent-1': FeedbackResponse(
              parentId: 'parent-1',
              type: FeedbackResponseType.comment,
              text: 'Thanks, she loved it.',
              parentName: 'Pat Lee',
              respondedAt: DateTime.now(),
            ),
          }),
        ],
      );

      expect(find.byKey(thanksKey), findsNothing);
      expect(find.textContaining('Pat Lee'), findsOneWidget);
      expect(find.text('Thanks, she loved it.'), findsOneWidget);
    });

    testWidgets('staff see responses but no buttons', (tester) async {
      await pump(
        tester,
        user: _FakeAuthController._admin,
        feedback: [
          note(responses: {
            'parent-1': FeedbackResponse(
              parentId: 'parent-1',
              type: FeedbackResponseType.thanks,
              text: '',
              parentName: 'Pat Lee',
              respondedAt: DateTime.now(),
            ),
          }),
        ],
      );

      expect(find.byKey(thanksKey), findsNothing);
      expect(find.textContaining('Pat Lee'), findsOneWidget);
    });
  });
}
