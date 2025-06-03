import 'package:flutter/material.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/services/auth_service.dart';

class UsersController extends ChangeNotifier {
  final AuthService _authService = AuthService();

  List<AppUser> _allUsers = [];
  List<AppUser> get allUsers => _allUsers;

  List<AppUser> _filteredUsers = [];
  List<AppUser> get filteredUsers => _filteredUsers;

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  String? _errorMessage;
  String? get errorMessage => _errorMessage;

  UsersController() {
    fetchAllUsers();
  }

  Future<void> fetchAllUsers() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      // Fetch all parents and tutors
      final parents = await _authService.fetchAllParents();
      final tutors = await _authService.fetchAllTutors();

      // Combine and sort by full name
      _allUsers = [...parents, ...tutors];
      _allUsers.sort((a, b) => ('${a.firstName} ${a.lastName}')
          .compareTo('${b.firstName} ${b.lastName}'));

      _filteredUsers = List<AppUser>.from(_allUsers);
    } catch (e) {
      _errorMessage = 'Failed to load users: $e';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  void filterUsers(String query) {
    if (query.isEmpty) {
      _filteredUsers = List<AppUser>.from(_allUsers);
    } else {
      _filteredUsers = _allUsers.where((user) {
        final fullName = '${user.firstName} ${user.lastName}'.toLowerCase();
        return fullName.contains(query.toLowerCase());
      }).toList();
    }
    notifyListeners();
  }

  AppUser? getUserById(String uid) {
    try {
      return _allUsers.firstWhere((user) => user.uid == uid);
    } catch (_) {
      return null;
    }
  }
}
