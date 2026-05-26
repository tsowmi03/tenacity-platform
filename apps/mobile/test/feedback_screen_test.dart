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
import 'package:tenacity/src/services/feedback_service.dart';
import 'package:tenacity/src/ui/feedback_screen.dart';

class _FakeAuthController extends ChangeNotifier implements AuthController {
  final AppUser _currentUser = Admin(
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
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeFeedbackController extends ChangeNotifier
    implements FeedbackController {
  Completer<void> addCompleter = Completer<void>();
  int addCalls = 0;
  StudentFeedback? addedFeedback;

  @override
  FeedbackService get service => throw UnimplementedError();

  @override
  Stream<List<StudentFeedback>> getFeedbackByStudentId(String studentId) {
    return Stream<List<StudentFeedback>>.value(const []);
  }

  @override
  Future<void> addFeedback(StudentFeedback feedback) async {
    addCalls += 1;
    addedFeedback = feedback;
    await addCompleter.future;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _OnlineConnectivityController extends ConnectivityController {
  @override
  Future<bool> refreshAndCheckOnline() async => true;
}

void main() {
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

    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.widgetWithText(TextFormField, 'Subject'),
      '  Great progress  ',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Feedback'),
      '  Strong algebra work this week.  ',
    );
    await tester.tap(find.widgetWithText(TextButton, 'Add'));
    await tester.pump();

    expect(feedbackController.addCalls, 1);
    expect(find.text('Add Feedback'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);

    final cancelButton = tester.widget<TextButton>(
      find.widgetWithText(TextButton, 'Cancel'),
    );
    expect(cancelButton.onPressed, isNull);

    feedbackController.addCompleter.complete();
    await tester.pumpAndSettle();

    expect(find.text('Add Feedback'), findsNothing);
    expect(feedbackController.addedFeedback?.studentId, 'student-1');
    expect(feedbackController.addedFeedback?.tutorId, 'admin-1');
    expect(feedbackController.addedFeedback?.parentIds, isEmpty);
    expect(feedbackController.addedFeedback?.subject, 'Great progress');
    expect(
      feedbackController.addedFeedback?.feedback,
      'Strong algebra work this week.',
    );
  });
}
