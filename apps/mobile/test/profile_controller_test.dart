import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/controllers/profile_controller.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/models/parent_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/services/profile_service.dart';

Parent _parent(String uid) => Parent(
      uid: uid,
      firstName: 'Pat',
      lastName: 'Parent',
      email: '$uid@example.com',
      fcmTokens: const [],
      students: const ['student-1'],
      phone: '0400 000 000',
      unreadChats: const {},
      activeChats: const [],
    );

Student _student(String id) => Student(
      id: id,
      firstName: 'Ella',
      lastName: 'Parent',
      parents: const ['parent-1'],
      grade: 'Year 9',
      subjects: const ['advmath11'],
    );

class _FakeProfileRepository implements ProfileRepository {
  final List<Completer<AppUser?>> userRequests = [];
  final List<Completer<List<Student>>> studentRequests = [];

  @override
  Future<AppUser?> fetchCurrentUser() {
    final request = Completer<AppUser?>();
    userRequests.add(request);
    return request.future;
  }

  @override
  Future<List<Student>> fetchStudentsForUser(String userUid) {
    final request = Completer<List<Student>>();
    studentRequests.add(request);
    return request.future;
  }

  @override
  Future<void> updateParentProfile({
    required String uid,
    required String firstName,
    required String lastName,
    required String email,
  }) async {}

  @override
  Future<void> updateStudentProfile(Student student) async {}
}

void main() {
  test('loads parent data and linked students', () async {
    final repository = _FakeProfileRepository();
    final controller = ProfileController(profileService: repository);

    final loading = controller.loadProfile(expectedUserId: 'parent-1');
    expect(controller.isLoading, isTrue);

    repository.userRequests.single.complete(_parent('parent-1'));
    await Future<void>.delayed(Duration.zero);
    repository.studentRequests.single.complete([_student('student-1')]);
    await loading;

    expect(controller.loadedUserId, 'parent-1');
    expect(controller.parent?.uid, 'parent-1');
    expect(controller.children.single.id, 'student-1');
    expect(controller.loadError, isNull);
    expect(controller.isLoading, isFalse);
  });

  test('rejects a profile returned for a different account', () async {
    final repository = _FakeProfileRepository();
    final controller = ProfileController(profileService: repository);

    final loading = controller.loadProfile(expectedUserId: 'parent-2');
    repository.userRequests.single.complete(_parent('parent-1'));
    await loading;

    expect(controller.parent, isNull);
    expect(controller.children, isEmpty);
    expect(controller.loadError, 'Your profile could not be found.');
  });

  test('an older request cannot replace a newer account', () async {
    final repository = _FakeProfileRepository();
    final controller = ProfileController(profileService: repository);

    final oldLoad = controller.loadProfile(expectedUserId: 'old');
    final newLoad = controller.loadProfile(expectedUserId: 'new');

    repository.userRequests[1].complete(_parent('new'));
    await Future<void>.delayed(Duration.zero);
    repository.studentRequests.single.complete([_student('new-student')]);
    await newLoad;

    repository.userRequests[0].complete(_parent('old'));
    await oldLoad;

    expect(controller.loadedUserId, 'new');
    expect(controller.parent?.uid, 'new');
    expect(controller.children.single.id, 'new-student');
  });

  test('a failed read leaves a retryable non-loading state', () async {
    final repository = _FakeProfileRepository();
    final controller = ProfileController(profileService: repository);

    final loading = controller.loadProfile(expectedUserId: 'parent-1');
    repository.userRequests.single.completeError(Exception('offline'));
    await loading;

    expect(controller.isLoading, isFalse);
    // The view's 'Profile unavailable' heading says what failed, so the
    // controller supplies the reason alone.
    expect(controller.loadError, 'Please try again in a moment.');
  });

  test('a refused profile read does not blame the connection (MOB-26)',
      () async {
    final repository = _FakeProfileRepository();
    final controller = ProfileController(profileService: repository);

    final loading = controller.loadProfile(expectedUserId: 'parent-1');
    repository.userRequests.single.completeError(
      FirebaseException(plugin: 'cloud_firestore', code: 'permission-denied'),
    );
    await loading;

    expect(controller.loadError, "Your account doesn't have access to this.");
  });
}
