import 'package:flutter/material.dart';
import 'package:tenacity/src/models/parent_model.dart';
import '../models/app_user_model.dart';
import '../models/student_model.dart';
import '../services/profile_service.dart';

class ProfileController extends ChangeNotifier {
  final ProfileService _profileService = ProfileService();

  bool isLoading = false;
  AppUser? parent;
  List<Student> children = [];

  Future<void> loadProfile() async {
    isLoading = true;
    notifyListeners();

    final user = await _profileService.fetchCurrentUser();
    if (user != null) {
      parent = user;

      if (user is Parent) {
        children = await _profileService.fetchStudentsForUser(user.uid);
      } else {
        children = [];
      }
    }

    isLoading = false;
    notifyListeners();
  }

  Future<void> updateParent({
    required String firstName,
    required String lastName,
    required String email,
  }) async {
    if (parent == null) return;

    isLoading = true;
    notifyListeners();

    await _profileService.updateParentProfile(
      uid: parent!.uid,
      firstName: firstName,
      lastName: lastName,
      email: email,
    );

    parent = (parent as Parent).copyWith(
      firstName: firstName,
      lastName: lastName,
      email: email,
    );

    isLoading = false;
    notifyListeners();
  }

  Future<void> updateStudent(
    Student student, {
    required String firstName,
    required String lastName,
    required int lessonTokens,
  }) async {
    isLoading = true;
    notifyListeners();

    final updatedStudent = student.copyWith(
      firstName: firstName,
      lastName: lastName,
      lessonTokens: lessonTokens,
    );

    await _profileService.updateStudentProfile(updatedStudent);

    final index = children.indexWhere((s) => s.id == student.id);
    if (index != -1) {
      children[index] = updatedStudent;
    }

    isLoading = false;
    notifyListeners();
  }
}