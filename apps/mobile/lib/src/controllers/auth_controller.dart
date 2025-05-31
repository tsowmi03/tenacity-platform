import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/models/tutor_model.dart';

import '../models/app_user_model.dart';
import '../services/auth_service.dart';

class AuthController extends ChangeNotifier {
  final AuthService _authService = AuthService();

  AppUser? _currentUser;
  AppUser? get currentUser => _currentUser;

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  String? _errorMessage;
  String? get errorMessage => _errorMessage;

  AuthController() {
    _loadCurrentUser();
  }

  /// Call this after any transaction that changes user data (e.g., lesson tokens)
  Future<void> refreshCurrentUser() async {
    print('Refreshing current user data...');
    if (_currentUser == null) return;
    _isLoading = true;
    notifyListeners();
    _currentUser = await _authService.fetchUserData(_currentUser!.uid);
    _isLoading = false;
    notifyListeners();
  }

  Future<void> login(String email, String password) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      _currentUser =
          await _authService.signInWithEmailAndPassword(email, password);
      // Refresh user after login to ensure latest data
      await refreshCurrentUser();
    } on FirebaseAuthException catch (e) {
      print(e.code);
      if (e.code == 'user-not-found') {
        _errorMessage = 'No user found for that email.';
      } else if (e.code == 'wrong-password') {
        _errorMessage = 'Incorrect password provided.';
      } else if (e.code == 'invalid-credential') {
        _errorMessage = 'Invalid username or password.';
      } else if (e.code == 'network-request-failed') {
        _errorMessage =
            'No internet connection. Please reconnect, then try again.';
      } else {
        _errorMessage = 'Failed to log in, please try again later.';
      }
    } catch (e) {
      _errorMessage = 'Failed to log in. Please try again later.';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> _loadCurrentUser() async {
    _isLoading = true;
    notifyListeners();
    _currentUser = await _authService.getCurrentUser();
    _isLoading = false;
    notifyListeners();
  }

  Future<String> fetchUserNameById(String userId) async {
    final user = await _authService.fetchUserData(userId);
    return user?.firstName ?? "Unknown User";
  }

  Future<String> fetchUserFullNameById(String userId) async {
    final user = await _authService.fetchUserData(userId);
    return '${user?.firstName} ${user?.lastName}';
  }

  Future<Map<String, String>> fetchTutorNamesByIds(
      List<String> tutorIds) async {
    // Remove duplicates for efficiency
    final uniqueIds = tutorIds.toSet().toList();
    final nameMap = <String, String>{};

    final results = await Future.wait(
      uniqueIds.map((id) async {
        final fullName = await fetchUserFullNameById(id);
        return MapEntry(id, fullName);
      }),
    );

    for (final entry in results) {
      nameMap[entry.key] = entry.value;
    }

    return nameMap;
  }

  Future<Student?> fetchStudentData(String uid) async {
    final student = await _authService.fetchStudentData(uid);

    return student;
  }

  void logout() async {
    await _authService.signOut();
    _currentUser = null;
    notifyListeners();
  }

  Future<void> resetPassword(String email) async {
    if (email.isEmpty) {
      _errorMessage = 'Please enter your email address.';
      notifyListeners();
      return;
    }
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      await _authService.sendPasswordResetEmail(email);
      _errorMessage = 'Sent! Please check your inbox to reset your password.';
      // Optionally refresh user if password reset affects user doc
      await refreshCurrentUser();
    } catch (e) {
      _errorMessage =
          'Failed to send password reset email. Please try again later.';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<List<AppUser>> fetchAllParents() async {
    try {
      return _authService.fetchAllParents();
    } catch (e) {
      print("Error fetching all parets: $e");
      rethrow;
    }
  }

  Future<List<Student>> fetchAllStudents() async {
    try {
      return _authService.fetchAllStudents();
    } catch (e) {
      print("Error fetching all parets: $e");
      rethrow;
    }
  }

  Future<List<Tutor>> fetchAllTutors() async {
    try {
      final tutors = await _authService.fetchAllTutors();
      final sortedTutors = List<Tutor>.from(tutors)
        ..sort((a, b) => ('${a.firstName} ${a.lastName}')
            .compareTo('${b.firstName} ${b.lastName}'));
      return sortedTutors;
    } catch (e) {
      print("Error fetching all tutors: $e");
      rethrow;
    }
  }

  Future<List<Student>> fetchStudentsForParent(String parentId) {
    try {
      return _authService.fetchStudentsForParent(parentId);
    } catch (e) {
      print('Error fetching students for $parentId: $e');
      rethrow;
    }
  }

  Future<void> updateFcmToken(String token) async {
    if (_currentUser != null) {
      await _authService.updateFcmToken(_currentUser!.uid, token);
      // Refresh user after updating FCM token
      await refreshCurrentUser();
    }
  }
}
