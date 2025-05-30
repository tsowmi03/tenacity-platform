import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/parent_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/models/term_model.dart';
import 'package:tenacity/src/services/timetable_service.dart';

class TimetableController extends ChangeNotifier {
  final TimetableService _service;

  TimetableController({required TimetableService service}) : _service = service;

  bool isLoading = false;
  String? errorMessage;

  /// Terms
  List<Term> allTerms = [];
  Term? activeTerm;

  /// Classes
  List<ClassModel> allClasses = [];

  /// For example, which week the user is currently viewing.
  /// (Could be 1..activeTerm.totalWeeks, if activeTerm is not null)
  int currentWeek = 1;

  Map<String, Attendance> attendanceByClass = {};

  /// --- Public Methods ---

  /// 1) Load all terms from Firestore
  Future<void> loadAllTerms() async {
    _startLoading();
    try {
      final terms = await _service.fetchAllTerms();
      allTerms = terms;
      _stopLoading();
    } catch (e) {
      _handleError('Failed to load terms: $e');
    }
  }

  /// 2) Fetch the active term
  Future<void> loadActiveTerm() async {
    _startLoading();
    try {
      final term = await _service.fetchActiveOrUpcomingTerm();
      activeTerm = term;
      if (activeTerm != null) {
        final now = DateTime.now();
        DateTime effectiveNow = now;
        if (now.weekday == DateTime.saturday ||
            now.weekday == DateTime.sunday) {
          // Roll over: act as if it's next week starting Monday
          effectiveNow = now.add(Duration(days: 8 - now.weekday));
        }
        if (effectiveNow.isBefore(activeTerm!.startDate)) {
          currentWeek = 1;
        } else {
          final diffDays =
              effectiveNow.difference(activeTerm!.startDate).inDays;
          currentWeek = (diffDays ~/ 7) + 1;
          if (currentWeek > activeTerm!.totalWeeks) {
            currentWeek = activeTerm!.totalWeeks;
          }
        }
      }
      _stopLoading();
    } catch (e) {
      _handleError('Failed to load active term: $e');
    }
  }

  /// 3) Load all classes
  Future<void> loadAllClasses() async {
    _startLoading();
    try {
      final classes = await _service.fetchAllClasses();
      allClasses = classes;
      _stopLoading();
    } catch (e) {
      _handleError('Failed to load classes: $e');
    }
  }

  /// 4) Generate Attendance Docs for a given class/term
  Future<void> generateAttendanceForTerm({
    required ClassModel classModel,
    required Term term,
  }) async {
    _startLoading();
    try {
      DateTime date = computeClassSessionDate(classModel);
      await _service.generateAttendanceDocsForTerm(
          classModel, term, date, currentWeek);
      _stopLoading();
    } catch (e) {
      _handleError('Failed to generate attendance docs: $e');
    }
  }

  /// 5) Load attendance for all classes for the current week
  Future<void> loadAttendanceForWeek() async {
    if (activeTerm == null) {
      _handleError('No active term to load attendance from');
      return;
    }
    _startLoading();
    try {
      attendanceByClass.clear();
      final termId = activeTerm!.id;
      final docId = '${termId}_W$currentWeek'; // e.g., "2025_T1_W3"

      // Fetch attendance docs concurrently instead of sequentially.
      final futures = allClasses.map((c) async {
        final attendance = await _service.fetchAttendanceDoc(
          classId: c.id,
          attendanceDocId: docId,
        );
        if (attendance != null) {
          attendanceByClass[c.id] = attendance;
        }
      }).toList();

      await Future.wait(futures);
      _stopLoading();
    } catch (e) {
      _handleError('Failed to load attendance for week $currentWeek: $e');
    }
  }

  Future<void> updateClass(ClassModel updatedClass) async {
    _startLoading();
    try {
      await _service.updateClass(updatedClass);
      await loadAllClasses();
      _stopLoading();
    } catch (e) {
      _handleError('Failed to update class: $e');
    }
  }

  Future<void> updateAttendanceDoc(
      Attendance attendance, String classId) async {
    _startLoading();
    try {
      await _service.updateAttendanceDoc(classId, attendance);
      _stopLoading();
    } catch (e) {
      _handleError('Failed to update attendance doc: $e');
    }
  }

  /// Moves the currentWeek forward by 1 (if within the term range)
  void incrementWeek() {
    if (activeTerm == null) return;
    if (currentWeek < activeTerm!.totalWeeks) {
      currentWeek++;
      notifyListeners();
    }
  }

  /// Moves currentWeek backward by 1 (if > 1)
  void decrementWeek() {
    if (currentWeek > 1) {
      currentWeek--;
      notifyListeners();
    }
  }

  Future<Set<String>> getEligibleSubjects(BuildContext context) async {
    final authController = Provider.of<AuthController>(context, listen: false);
    final List<String> studentIds =
        (authController.currentUser as Parent).students;
    final Set<String> subjectCodes = {};
    for (var id in studentIds) {
      final Student? student = await authController.fetchStudentData(id);
      if (student != null) {
        // Add all subject codes (converted to lowercase for consistency)
        subjectCodes.addAll(student.subjects.map((s) => s.toLowerCase()));
      }
    }
    print(subjectCodes);
    return subjectCodes;
  }

  bool isEligibleClass(ClassModel classModel, Set<String> eligibleSubjects) {
    final type = classModel.type.trim().toLowerCase();

    // If type is empty, this class is open to all students up to Year 10.
    if (type.isEmpty || type == "5-10") {
      // Only show if the parent's eligible subjects contain the generic codes.
      return eligibleSubjects.contains("maths") ||
          eligibleSubjects.contains("english");
    }

    // If the class type contains a year indicator (i.e. "11" or "12"),
    // then it's a detailed subject for Year 11/12.
    if (type.contains("11") || type.contains("12")) {
      // Only show if there's an exact match in the eligible subjects.
      return eligibleSubjects.contains(type);
    }

    // Otherwise, for non-year-specific types (e.g. "maths" or "english"),
    // allow the class if the parent's eligible subjects include it.
    return eligibleSubjects.contains(type);
  }

  /// --- Enrollment Methods ---

  /// Permanently enroll a student in a class
  Future<void> enrollStudentPermanent({
    required String classId,
    required String studentId,
  }) async {
    _startLoading();
    try {
      // Fetch the class details first to check if the student is already enrolled.
      final classModel = allClasses.firstWhere((c) => c.id == classId,
          orElse: () => throw Exception("Class not found"));
      if (classModel.enrolledStudents.contains(studentId)) {
        _stopLoading();
        errorMessage = "Student is already permanently enrolled in this class.";
        notifyListeners();
        return;
      }

      await _service.enrollStudentPermanent(
          classId: classId, studentId: studentId);
      await loadAllClasses(); // Refresh state
      _stopLoading();
    } catch (e) {
      _handleError('Failed to permanently enroll student: $e');
    }
  }

  /// Unenroll from a class permanently
  Future<void> unenrollStudentPermanent({
    required String classId,
    required String studentId,
  }) async {
    _startLoading();
    try {
      await _service.unenrollStudentPermanent(
          classId: classId, studentId: studentId);
      _stopLoading();
    } catch (e) {
      _handleError('Failed to permanently unenroll student: $e');
    }
  }

  /// One-off booking
  Future<void> enrollStudentOneOff({
    required String classId,
    required String studentId,
    required String attendanceDocId,
  }) async {
    _startLoading();
    try {
      // Fetch the attendance doc for this class/week to check if the student is already booked.
      final attendance = await _service.fetchAttendanceDoc(
        classId: classId,
        attendanceDocId: attendanceDocId,
      );
      if (attendance != null && attendance.attendance.contains(studentId)) {
        _stopLoading();
        errorMessage =
            "Student already has a booking for this class this week.";
        notifyListeners();
        return;
      }

      await _service.enrollStudentOneOff(
        classId: classId,
        studentId: studentId,
        attendanceDocId: attendanceDocId,
      );
      _stopLoading();
    } catch (e) {
      _handleError('Failed to book one-off class: $e');
    }
  }

  /// Cancel for a specific week
  Future<void> cancelStudentForWeek({
    required String classId,
    required String studentId,
    required String attendanceDocId,
  }) async {
    _startLoading();
    try {
      await _service.cancelStudentForWeek(
        classId: classId,
        studentId: studentId,
        attendanceDocId: attendanceDocId,
      );
      _stopLoading();
    } catch (e) {
      _handleError('Failed to cancel class for week: $e');
    }
  }

  /// Reschedule to a different class
  Future<void> rescheduleToDifferentClass({
    required String oldClassId,
    required String oldAttendanceDocId,
    required String newClassId,
    required String newAttendanceDocId,
    required String studentId,
  }) async {
    _startLoading();
    try {
      await _service.rescheduleToDifferentClass(
        oldClassId: oldClassId,
        oldAttendanceDocId: oldAttendanceDocId,
        newClassId: newClassId,
        newAttendanceDocId: newAttendanceDocId,
        studentId: studentId,
      );
      _stopLoading();
    } catch (e) {
      _handleError('Failed to reschedule student: $e');
    }
  }

  Future<bool> notifyAbsence({
    required String classId,
    required String studentId,
    required String attendanceDocId,
    required String parentId,
  }) async {
    _startLoading();
    bool tokenAwarded = false;
    try {
      final attendanceObj = await _service.fetchAttendanceDoc(
        classId: classId,
        attendanceDocId: attendanceDocId,
      );
      if (attendanceObj == null) {
        throw Exception(
            "Attendance doc not found for $classId / $attendanceDocId");
      }

      await _service.notifyStudentAbsence(
        classId: classId,
        studentId: studentId,
        attendanceDocId: attendanceDocId,
      );

      final cutoff = DateTime(
        attendanceObj.date.year,
        attendanceObj.date.month,
        attendanceObj.date.day,
        10,
      );

      if (DateTime.now().isBefore(cutoff)) {
        await incrementTokens(parentId, 1);
        tokenAwarded = true;
      }

      _stopLoading();
    } catch (e) {
      _handleError('Failed to notify absence: $e');
    }
    return tokenAwarded;
  }

  Future<void> incrementTokens(String parentId, int count) async {
    _startLoading();
    try {
      await _service.incrementLessonTokens(parentId, count);
      _stopLoading();
    } catch (e) {
      _handleError('Failed to increment tokens: $e');
    }
  }

  Future<void> decrementTokens(String parentId, int count) async {
    _startLoading();
    try {
      await _service.decrementLessonTokens(parentId, count);
      _stopLoading();
    } catch (e) {
      _handleError('Failed to decrement tokens: $e');
    }
  }

  Future<bool> hasLessonToken(String parentId) async {
    final tokenCount = await _service.getLessonTokenCount(parentId);
    return tokenCount > 0;
  }

  Future<void> swapPermanentEnrollment({
    required String oldClassId,
    required String newClassId,
    required String studentId,
  }) async {
    _startLoading();
    try {
      // First, remove the student from the permanent enrolment of the old class.
      await _service.unenrollStudentPermanent(
          classId: oldClassId, studentId: studentId);
      // Then, permanently enrol the student in the new class.
      await _service.enrollStudentPermanent(
          classId: newClassId, studentId: studentId);
      _stopLoading();
    } catch (e) {
      _handleError('Failed to swap permanent enrollment: $e');
    }
  }

  /// --- Internal Helpers ---

  void _startLoading() {
    isLoading = true;
    errorMessage = null;
    notifyListeners();
  }

  void _stopLoading() {
    isLoading = false;
    notifyListeners();
  }

  void _handleError(String message) {
    isLoading = false;
    errorMessage = message;
    notifyListeners();
  }

  Future<void> createNewClass(ClassModel newClass) async {
    _startLoading();
    try {
      await _service.createClass(newClass);
      // Immediately generate attendance docs for this new class if an active term exists.
      if (activeTerm != null) {
        DateTime date = computeClassSessionDate(newClass);
        await _service.generateAttendanceDocsForTerm(
            newClass, activeTerm!, date, currentWeek);
      }
      await loadAllClasses();
      _stopLoading();
    } catch (e) {
      _handleError('Failed to add new class: $e');
    }
  }

  Future<List<String>> fetchTutorsForClass(String classId) async {
    return _service.fetchTutorsForClass(classId);
  }

  Future<List<String>> fetchTutorAttendance(String classId) async {
    final termId = activeTerm!.id;
    final docId = '${termId}_W$currentWeek';

    return _service.fetchTutorAttendance(classId, docId);
  }

  Future<void> deleteClass(String classId) async {
    _startLoading();
    try {
      await _service.deleteClass(classId);
    } catch (e) {
      _handleError('Failed to delete class $classId: $e');
    }
  }

  Future<void> populateAttendanceDocsForActiveTerm() async {
    if (activeTerm == null) return;
    _startLoading();
    try {
      // Run for all classes concurrently.
      await Future.wait(allClasses.map((classModel) {
        final date = computeClassSessionDate(classModel);
        return _service.generateAttendanceDocsForTerm(
            classModel, activeTerm!, date, currentWeek);
      }));
      _stopLoading();
    } catch (e) {
      _handleError("Error populating attendance docs: $e");
    }
  }

  String format24HourToAmPm(String time24) {
    // Expecting a string like "18:30" or "09:05"
    final parts = time24.split(':');
    if (parts.length < 2) return time24; // fallback if something's off

    int hour = int.tryParse(parts[0]) ?? 0;
    int minute = int.tryParse(parts[1]) ?? 0;

    final suffix = hour >= 12 ? 'PM' : 'AM';

    // Convert 24-hour to 12-hour
    if (hour == 0) {
      hour = 12; // 00 => 12 AM
    } else if (hour > 12) {
      hour -= 12;
    }

    final minuteStr = minute.toString().padLeft(2, '0');
    return "$hour:$minuteStr $suffix";
  }

  Future<List<ClassModel>> fetchClassesForStudent(String studentId) async {
    return _service.fetchClassesForStudent(studentId);
  }

  /// Computes the DateTime of the class session for a given class model.
  DateTime computeClassSessionDate(ClassModel classModel) {
    if (activeTerm == null) {
      throw Exception("No active term available");
    }
    // Calculate the start of the week by adding (week - 1) * 7 days to term.startDate.
    DateTime startOfWeek =
        activeTerm!.startDate.add(Duration(days: (currentWeek - 1) * 7));

    // Convert the class's dayOfWeek (e.g., "Tuesday") to an offset.
    int dayOffset = _dayStringToOffset(classModel.dayOfWeek);

    // Parse the class start time, assuming the format "HH:mm" (e.g., "16:00").
    List<String> timeParts = classModel.startTime.split(':');
    int hour = int.parse(timeParts[0]);
    int minute = int.parse(timeParts[1]);

    // Construct the DateTime for the class session.
    DateTime classDateTime = DateTime(
      startOfWeek.year,
      startOfWeek.month,
      startOfWeek.day,
      hour,
      minute,
    ).add(Duration(days: dayOffset));

    return classDateTime;
  }

  /// Helper to convert day string to an offset.
  int _dayStringToOffset(String day) {
    switch (day.toLowerCase()) {
      case 'monday':
        return 0;
      case 'tuesday':
        return 1;
      case 'wednesday':
        return 2;
      case 'thursday':
        return 3;
      case 'friday':
        return 4;
      case 'saturday':
        return 5;
      case 'sunday':
        return 6;
      default:
        return 0; // default to Monday if unexpected string.
    }
  }

  Future<String> getUpcomingClassTextForUser(BuildContext context) async {
    final authController = Provider.of<AuthController>(context, listen: false);
    final user = authController.currentUser;

    if (user == null) return "No upcoming class";

    if (user.role == 'parent') {
      // --- Inline logic from getUpcomingClassTextForParent ---
      final parent = authController.currentUser as Parent;
      final studentIds = parent.students;
      if (studentIds.isEmpty) {
        debugPrint("Parent's student list is empty.");
        return "No upcoming class";
      }
      final classModel = await _service.fetchUpcomingClassForParent(
        studentIds: studentIds,
      );
      if (classModel == null) return "No upcoming class";
      final amPmTime = format24HourToAmPm(classModel.startTime);
      return "${classModel.dayOfWeek} @ $amPmTime";
      // --- End inline logic ---
    } else if (user.role == 'tutor' || user.role == 'admin') {
      if (activeTerm == null) {
        await loadActiveTerm();
        if (activeTerm == null) return "No upcoming class";
      }
      final now = DateTime.now();

      for (int week = currentWeek; week <= activeTerm!.totalWeeks; week++) {
        final termId = activeTerm!.id;
        final docId = '${termId}_W$week';

        // Fetch all attendance docs for this week in parallel
        final attendanceFutures = allClasses.map((classModel) async {
          final attendance = await _service.fetchAttendanceDoc(
            classId: classModel.id,
            attendanceDocId: docId,
          );
          if (attendance != null && attendance.tutors.contains(user.uid)) {
            // Compute the class session date for this week
            final startOfWeek =
                activeTerm!.startDate.add(Duration(days: (week - 1) * 7));
            int dayOffset = _dayStringToOffset(classModel.dayOfWeek);
            List<String> timeParts = classModel.startTime.split(':');
            int hour = int.parse(timeParts[0]);
            int minute = int.parse(timeParts[1]);
            DateTime classDate = DateTime(
              startOfWeek.year,
              startOfWeek.month,
              startOfWeek.day,
              hour,
              minute,
            ).add(Duration(days: dayOffset));
            if (classDate.isAfter(now)) {
              return _UpcomingClassInfo(
                classModel: classModel,
                classDate: classDate,
              );
            }
          }
          return null;
        }).toList();

        final results = await Future.wait(attendanceFutures);
        final foundClasses = results.whereType<_UpcomingClassInfo>().toList();

        if (foundClasses.isNotEmpty) {
          // Sort by soonest class
          foundClasses.sort((a, b) => a.classDate.compareTo(b.classDate));
          final next = foundClasses.first;
          final amPmTime = format24HourToAmPm(next.classModel.startTime);
          return "${next.classModel.dayOfWeek} @ $amPmTime";
        }
      }

      return "No upcoming class";
    }
    return "No upcoming class";
  }
}

// Helper class for sorting
class _UpcomingClassInfo {
  final ClassModel classModel;
  final DateTime classDate;
  _UpcomingClassInfo({required this.classModel, required this.classDate});
}
