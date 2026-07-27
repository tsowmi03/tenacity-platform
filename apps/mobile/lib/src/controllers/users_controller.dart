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

    debugPrint('[UsersController][fetchAllUsers] Starting fetch...');

    // Fetched independently rather than in sequence. Firestore Rules let any
    // signed-in user read staff, but only staff may list parents — so for a
    // parent the parent query is *expected* to be denied. Awaiting it first
    // inside one try meant that denial threw before the staff query ran, and a
    // parent ended up with no contacts at all and could not start a chat.
    final parents = await _fetchOrNull(
      'parents',
      _authService.fetchAllParents,
    );
    final tutors = await _fetchOrNull('tutors', _authService.fetchAllTutors);

    if (parents == null && tutors == null) {
      _errorMessage = 'We could not load the contact list. Please try again.';
      _isLoading = false;
      notifyListeners();
      return;
    }

    debugPrint(
        '[UsersController][fetchAllUsers] Loaded parents=${parents?.length} '
        'tutors/admins=${tutors?.length}');

    await _loadStudentsFor(parents ?? const []);

    _allUsers = [...?parents, ...?tutors];
    _allUsers.sort((a, b) => ('${a.firstName} ${a.lastName}')
        .compareTo('${b.firstName} ${b.lastName}'));

    _filteredUsers = List<AppUser>.from(_allUsers);
    _isLoading = false;
    debugPrint('[UsersController][fetchAllUsers] Finished OK');
    notifyListeners();
  }

  /// Runs [fetch], returning null instead of throwing. The caller decides
  /// whether a missing list is fatal.
  Future<List<T>?> _fetchOrNull<T>(
    String label,
    Future<List<T>> Function() fetch,
  ) async {
    try {
      return await fetch();
    } catch (e, st) {
      debugPrint('[UsersController][fetchAllUsers] $label unavailable: $e');
      debugPrint('[UsersController][fetchAllUsers] stackTrace=\n$st');
      return null;
    }
  }

  /// Students are only used to widen the search, so one parent's students
  /// failing to load must not empty the whole user list.
  Future<void> _loadStudentsFor(List<AppUser> parents) async {
    parentStudents.clear();
    await Future.wait(
      parents.map((parent) async {
        try {
          parentStudents[parent.uid] =
              await _authService.fetchStudentsForParent(parent.uid);
        } catch (e) {
          debugPrint(
              '[UsersController][fetchAllUsers] students for ${parent.uid} '
              'unavailable: $e');
        }
      }),
    );
  }

  void filterUsers(String query) {
    if (query.isEmpty) {
      _filteredUsers = List<AppUser>.from(_allUsers);
    } else {
      final lowerQuery = query.toLowerCase();
      _filteredUsers = _allUsers.where((user) {
        final fullName = '${user.firstName} ${user.lastName}'.toLowerCase();
        final role = user.role.toLowerCase();

        // If user is a parent, check their students' names too
        if (user.role == 'parent') {
          final students = parentStudents[user.uid] ?? [];
          final matchesStudent = students.any((student) {
            final studentName =
                '${student.firstName} ${student.lastName}'.toLowerCase();
            return studentName.contains(lowerQuery);
          });
          return fullName.contains(lowerQuery) ||
              matchesStudent ||
              role.contains(lowerQuery);
        } else {
          // For tutors/admins, match name or role
          return fullName.contains(lowerQuery) || role.contains(lowerQuery);
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
