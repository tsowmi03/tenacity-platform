import 'package:flutter/material.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/services/auth_service.dart';

class UsersController extends ChangeNotifier {
  final AuthService _authService = AuthService();

  List<AppUser> _allUsers = [];
  List<AppUser> get allUsers => _allUsers;

  List<AppUser> _filteredUsers = [];
  List<AppUser> get filteredUsers => _filteredUsers;

  // Map of parentId -> List<Student>
  final Map<String, List<Student>> parentStudents = {};

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
      final parents = await _authService.fetchAllParents();
      final tutors = await _authService.fetchAllTutors();

      // Fetch all students for all parents in parallel
      parentStudents.clear();
      final futures = parents.map((parent) async {
        final students = await _authService.fetchStudentsForParent(parent.uid);
        parentStudents[parent.uid] = students;
      }).toList();
      await Future.wait(futures);

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
      final lowerQuery = query.toLowerCase();
      _filteredUsers = _allUsers.where((user) {
        final fullName = '${user.firstName} ${user.lastName}'.toLowerCase();

        // If user is a parent, check their students' names too
        if (user.role == 'parent') {
          final students = parentStudents[user.uid] ?? [];
          final matchesStudent = students.any((student) {
            final studentName =
                '${student.firstName} ${student.lastName}'.toLowerCase();
            return studentName.contains(lowerQuery);
          });
          return fullName.contains(lowerQuery) || matchesStudent;
        } else {
          // For tutors, just match their name
          return fullName.contains(lowerQuery);
        }
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
