import 'package:flutter/material.dart';
import 'package:tenacity/src/models/parent_model.dart';
import '../models/app_user_model.dart';
import '../models/student_model.dart';
import '../services/audit_service.dart';
import '../services/profile_service.dart';
import '../utils/error_presenter.dart';

class ProfileController extends ChangeNotifier {
  ProfileController({
    ProfileRepository? profileService,
    AuditService? auditService,
  })  : _profileService = profileService ?? ProfileService(),
        _auditService = auditService;

  final ProfileRepository _profileService;
  AuditService? _auditService;
  AuditService get _audit => _auditService ??= AuditService();

  bool isLoading = false;
  AppUser? parent;
  List<Student> children = [];
  String? loadError;
  String? loadedUserId;
  int _loadGeneration = 0;
  bool _isDisposed = false;

  Future<void> loadProfile({String? expectedUserId}) async {
    final generation = ++_loadGeneration;
    isLoading = true;
    loadError = null;
    loadedUserId = expectedUserId;
    parent = null;
    children = [];
    notifyListeners();

    try {
      final user = await _profileService.fetchCurrentUser();
      if (generation != _loadGeneration) return;
      if (user == null ||
          (expectedUserId != null && user.uid != expectedUserId)) {
        loadError = 'Your profile could not be found.';
        return;
      }

      parent = user;
      loadedUserId = user.uid;

      if (user is Parent) {
        children = await _profileService.fetchStudentsForUser(user.uid);
        if (generation != _loadGeneration) return;
      } else {
        children = [];
      }
    } catch (error, stackTrace) {
      if (generation != _loadGeneration) return;
      // Sits under ErrorStateView's 'Profile unavailable' heading, so the
      // reason alone.
      loadError = presentError(
        error,
        action: 'load your profile',
        operation: Operation.read,
        stackTrace: stackTrace,
      ).reason;
    } finally {
      if (generation == _loadGeneration) {
        isLoading = false;
        notifyListeners();
      }
    }
  }

  Future<void> updateParent({
    required String firstName,
    required String lastName,
    required String email,
  }) async {
    final profile = parent;
    if (profile == null) return;
    final generation = _loadGeneration;

    isLoading = true;
    notifyListeners();

    try {
      await _profileService.updateParentProfile(
        uid: profile.uid,
        firstName: firstName,
        lastName: lastName,
        email: email,
      );

      final before = {
        'firstName': profile.firstName,
        'lastName': profile.lastName,
        'email': profile.email,
      };
      final after = {
        'firstName': firstName,
        'lastName': lastName,
        'email': email,
      };

      _audit.record(
        action: 'profile.update',
        targetType: 'user',
        targetId: profile.uid,
        targetName: AuditService.personName(
          firstName: firstName,
          lastName: lastName,
          fallback: email,
        ),
        payloadSummary: {'fields': AuditService.changedFields(before, after)},
        before: before,
        after: after,
      );

      if (generation == _loadGeneration) {
        parent = profile.copyWith(
          firstName: firstName,
          lastName: lastName,
          email: email,
        );
      }
    } finally {
      if (generation == _loadGeneration && !_isDisposed) {
        isLoading = false;
        notifyListeners();
      }
    }
  }

  Future<void> updateStudent(
    Student student, {
    required String firstName,
    required String lastName,
  }) async {
    final generation = _loadGeneration;
    isLoading = true;
    notifyListeners();

    final updatedStudent = student.copyWith(
      firstName: firstName,
      lastName: lastName,
    );

    try {
      await _profileService.updateStudentProfile(updatedStudent);
      final before = {
        'firstName': student.firstName,
        'lastName': student.lastName,
      };
      final after = {
        'firstName': firstName,
        'lastName': lastName,
      };
      _audit.record(
        action: 'student.update',
        targetType: 'student',
        targetId: student.id,
        targetName: AuditService.personName(
          firstName: firstName,
          lastName: lastName,
          fallback: student.id,
        ),
        payloadSummary: {'fields': AuditService.changedFields(before, after)},
        before: before,
        after: after,
      );

      if (generation == _loadGeneration) {
        final index = children.indexWhere((s) => s.id == student.id);
        if (index != -1) {
          children[index] = updatedStudent;
        }
      }
    } finally {
      if (generation == _loadGeneration && !_isDisposed) {
        isLoading = false;
        notifyListeners();
      }
    }
  }

  @override
  void dispose() {
    _isDisposed = true;
    _loadGeneration++;
    super.dispose();
  }
}
