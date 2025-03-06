import 'package:flutter/material.dart';
import 'package:tenacity/src/models/student_model.dart';

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

  Future<void> login(String email, String password) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      _currentUser = await _authService.signInWithEmailAndPassword(email, password);
      notifyListeners();
    } catch (e) {
      _errorMessage = 'Failed to log in: Check your details are correct, and try again.';
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

  Future<Student?> fetchStudentData (String uid) async {
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
    } catch (e) {
      _errorMessage = 'Failed to send password reset email. Please try again later.';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }
}