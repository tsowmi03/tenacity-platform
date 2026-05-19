import 'package:flutter/material.dart';
import 'package:flutter/widgets.dart'; // for WidgetsBinding
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/parent_model.dart';
import 'package:tenacity/src/models/permanent_enrollment_result_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/models/term_model.dart';
import 'package:tenacity/src/models/waitlist_entry_model.dart';
import 'package:tenacity/src/models/waitlist_promotion_result_model.dart';
import 'package:tenacity/src/services/audit_service.dart';
import 'package:tenacity/src/services/timetable_service.dart';
import 'package:tenacity/src/utils/class_session_dates.dart';

class TimetableController extends ChangeNotifier {
  final TimetableService _service;
  final AuditService _auditService = AuditService();

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

  Map<String, List<WaitlistEntry>> waitlistEntriesByClass = {};
  List<WaitlistEntry> parentWaitlistEntries = [];

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
  Future<void> loadActiveTerm({bool silent = false}) async {
    debugPrint('[TimetableController] loadActiveTerm called');
    if (!silent) _startLoading();
    try {
      final term = await _service.fetchActiveOrUpcomingTerm();
      debugPrint(
          '[TimetableController] fetchActiveOrUpcomingTerm returned: ${term?.id}');
      activeTerm = term;
      if (activeTerm != null) {
        final now = DateTime.now();
        DateTime effectiveNow = now;

        // Calculate this week's Friday at 8pm
        final daysToFriday = DateTime.friday - now.weekday;
        final fridayThisWeek = now.add(Duration(days: daysToFriday));
        final friday8pm = DateTime(
          fridayThisWeek.year,
          fridayThisWeek.month,
          fridayThisWeek.day,
          20,
          0,
          0,
          0,
          0,
        );

        debugPrint('now: $now, friday8pm: $friday8pm');
        if (now.isAfter(friday8pm)) {
          debugPrint('-> rolling over!');
          // After Friday 8pm, roll over to next Monday
          final daysToMonday = (DateTime.monday - now.weekday + 7) % 7;
          final nextMonday = now.add(Duration(days: daysToMonday));
          effectiveNow =
              DateTime(nextMonday.year, nextMonday.month, nextMonday.day);
        } else {
          debugPrint('-> not rolling over');
        }

        // Find the Monday of the week containing the term start date
        DateTime termStart = activeTerm!.startDate;
        int termStartWeekday = termStart.weekday; // 1=Mon, 7=Sun
        DateTime firstMonday = DateTime(
          termStart.year,
          termStart.month,
          termStart.day - (termStartWeekday - 1),
          0,
          0,
          0,
          0,
          0,
        );

        if (effectiveNow.isBefore(firstMonday)) {
          currentWeek = 1;
        } else {
          final diffDays = effectiveNow.difference(firstMonday).inDays;
          currentWeek = (diffDays ~/ 7) + 1;
          if (currentWeek > activeTerm!.totalWeeks) {
            currentWeek = activeTerm!.totalWeeks;
          }
        }
        debugPrint(
            'Effective now: $effectiveNow, First Monday: $firstMonday, Current Week: $currentWeek');
      }
      debugPrint('[TimetableController] currentWeek: $currentWeek');
      if (!silent) _stopLoading();
    } catch (e) {
      debugPrint('[TimetableController] loadActiveTerm error: $e');
      if (!silent) _handleError('Failed to load active term: $e');
    }
  }

  /// 3) Load all classes
  Future<void> loadAllClasses({bool silent = false}) async {
    debugPrint('[TimetableController] loadAllClasses called');
    if (!silent) _startLoading();
    try {
      final classes = await _service.fetchAllClasses();
      debugPrint(
          '[TimetableController] fetchAllClasses returned: ${classes.length}');
      allClasses = classes;
      if (!silent) _stopLoading();
    } catch (e) {
      debugPrint('[TimetableController] loadAllClasses error: $e');
      if (!silent) _handleError('Failed to load classes: $e');
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

  Future<void> loadAttendanceForWeek({bool silent = false}) async {
    debugPrint('[TimetableController] loadAttendanceForWeek called');
    if (activeTerm == null) {
      debugPrint('[TimetableController] activeTerm is null');
      if (!silent) _handleError('No active term to load attendance from');
      return;
    }
    if (!silent) _startLoading();
    try {
      attendanceByClass.clear();
      final termId = activeTerm!.id;
      final docId = '${termId}_W$currentWeek';
      debugPrint('[TimetableController] loading attendance for docId: $docId');
      final futures = allClasses.map((c) async {
        final attendance = await _service.fetchAttendanceDoc(
          classId: c.id,
          attendanceDocId: docId,
        );
        debugPrint(
            '[TimetableController] attendance for class ${c.id}: ${attendance != null}');
        if (attendance != null) {
          attendanceByClass[c.id] = attendance;
        }
      }).toList();
      await Future.wait(futures);
      debugPrint('[TimetableController] loadAttendanceForWeek complete');
      // if (!silent) _stopLoading();
      // notifyListeners();
    } catch (e) {
      debugPrint('[TimetableController] loadAttendanceForWeek error: $e');
      if (!silent) {
        _handleError('Failed to load attendance for week $currentWeek: $e');
      }
    } finally {
      if (!silent) _stopLoading();
      notifyListeners();
    }
  }

  Future<void> updateClass(ClassModel updatedClass,
      {required int fromWeek, String updatedBy = 'system'}) async {
    _startLoading();
    try {
      await _service.updateClass(updatedClass,
          fromWeek: fromWeek, updatedBy: updatedBy);
      await loadAllClasses();
      _stopLoading();
    } catch (e) {
      _handleError('Failed to update class: $e');
    }
  }

  Future<void> updateTutorsForDayThisWeek({
    required String dayOfWeek,
    required List<String> tutorIds,
    required String updatedBy,
  }) async {
    if (activeTerm == null) {
      _handleError('No active term available');
      return;
    }

    _startLoading();
    try {
      final normalizedDay = dayOfWeek.trim().toLowerCase();
      final termId = activeTerm!.id;
      final attendanceDocId = '${termId}_W$currentWeek';

      final dayClasses = allClasses
          .where((c) => c.dayOfWeek.trim().toLowerCase() == normalizedDay)
          .toList();

      for (final c in dayClasses) {
        Attendance? attendance = attendanceByClass[c.id];
        attendance ??= await _service.fetchAttendanceDoc(
          classId: c.id,
          attendanceDocId: attendanceDocId,
        );

        if (attendance == null) continue;

        final updatedAttendance = attendance.copyWith(
          tutors: tutorIds,
          updatedAt: DateTime.now(),
          updatedBy: updatedBy,
        );

        await _service.updateAttendanceDoc(c.id, updatedAttendance);
      }

      await loadAttendanceForWeek(silent: true);
      _stopLoading();
    } catch (e) {
      _handleError('Failed to update tutors for day (this week): $e');
    }
  }

  Future<void> updateTutorsForDayPermanent({
    required String dayOfWeek,
    required List<String> tutorIds,
    required int fromWeek,
    required String updatedBy,
  }) async {
    _startLoading();
    try {
      final normalizedDay = dayOfWeek.trim().toLowerCase();
      final dayClasses = allClasses
          .where((c) => c.dayOfWeek.trim().toLowerCase() == normalizedDay)
          .toList();

      for (final c in dayClasses) {
        final updatedClass = c.copyWith(tutors: tutorIds);
        await _service.updateClass(
          updatedClass,
          fromWeek: fromWeek,
          updatedBy: updatedBy,
        );
      }

      await loadAllClasses(silent: true);
      await loadAttendanceForWeek(silent: true);
      _stopLoading();
    } catch (e) {
      _handleError('Failed to update tutors for day (permanent): $e');
    }
  }

  Future<void> updateAttendanceDoc(
      Attendance attendance, String classId) async {
    _startLoading();
    try {
      final previousAttendance = attendanceByClass[classId];
      await _service.updateAttendanceDoc(classId, attendance);
      final classModel = _classById(classId);
      if (classModel != null &&
          previousAttendance != null &&
          !_sameStringList(
            previousAttendance.attendance,
            attendance.attendance,
          )) {
        _auditService.record(
          action: 'attendance.mark',
          targetType: 'attendance',
          targetId: attendance.id,
          targetName: AuditService.attendanceTargetName(
            classModel: classModel,
            attendance: attendance,
          ),
          payloadSummary: {
            'classId': classId,
            'className': AuditService.classTargetName(classModel),
            'attendanceDate': AuditService.dateOnly(attendance.date),
            'presentCount': attendance.attendance.length,
          },
          before: {'attendance': previousAttendance.attendance},
          after: {'attendance': attendance.attendance},
        );
      }
      _stopLoading();
    } catch (e) {
      _handleError('Failed to update attendance doc: $e');
    }
  }

  Future<void> toggleSessionCancelled({
    required String classId,
    required String attendanceDocId,
    required String updatedBy,
  }) async {
    _startLoading();
    try {
      final attendance = await _service.fetchAttendanceDoc(
        classId: classId,
        attendanceDocId: attendanceDocId,
      );
      if (attendance == null) {
        throw Exception('Attendance doc $attendanceDocId not found');
      }

      final newCancelled = !attendance.cancelled;
      await _service.setSessionCancelled(
        classId: classId,
        attendanceDocId: attendanceDocId,
        cancelled: newCancelled,
        updatedBy: updatedBy,
      );

      // Keep local cache coherent for immediate UI updates.
      attendanceByClass[classId] = attendance.copyWith(
        cancelled: newCancelled,
        updatedAt: DateTime.now(),
        updatedBy: updatedBy,
      );
      final classModel = _classById(classId);
      if (classModel != null) {
        _auditService.record(
          action: newCancelled ? 'attendance.cancel' : 'attendance.uncancel',
          targetType: 'attendance',
          targetId: attendanceDocId,
          targetName: AuditService.attendanceTargetName(
            classModel: classModel,
            attendance: attendance,
          ),
          payloadSummary: {
            'classId': classId,
            'className': AuditService.classTargetName(classModel),
            'attendanceDate': AuditService.dateOnly(attendance.date),
          },
          before: {'cancelled': attendance.cancelled},
          after: {'cancelled': newCancelled},
        );
      }

      _stopLoading();
      notifyListeners();
    } catch (e) {
      _handleError('Failed to toggle session cancelled: $e');
    }
  }

  Future<void> loadWaitlistForClass({
    required String classId,
    WaitlistStatus? status,
    bool silent = false,
  }) async {
    if (!silent) _startLoading();
    try {
      final entries = await _service.fetchWaitlistEntriesForClass(
        classId: classId,
        status: status,
      );
      waitlistEntriesByClass[classId] = entries;
      if (!silent) _stopLoading();
    } catch (e) {
      if (!silent) _handleError('Failed to load class waitlist: $e');
    } finally {
      if (silent) notifyListeners();
    }
  }

  Future<void> loadWaitlistForParent({
    required String parentId,
    WaitlistStatus? status,
    bool silent = false,
  }) async {
    if (!silent) _startLoading();
    try {
      parentWaitlistEntries = await _service.fetchWaitlistEntriesForParent(
        parentId: parentId,
        status: status,
      );
      if (!silent) _stopLoading();
    } catch (e) {
      if (!silent) _handleError('Failed to load parent waitlist: $e');
    } finally {
      if (silent) notifyListeners();
    }
  }

  Future<WaitlistEntry?> fetchWaitlistEntryForStudentInClass({
    required String classId,
    required String studentId,
  }) {
    return _service.fetchWaitlistEntryForStudentInClass(
      classId: classId,
      studentId: studentId,
    );
  }

  Future<WaitlistEntry?> joinWaitlist({
    required String classId,
    required String studentId,
    required String parentId,
    required WaitlistReason reason,
  }) async {
    _startLoading();
    try {
      final entry = await _service.joinWaitlist(
        classId: classId,
        studentId: studentId,
        parentId: parentId,
        reason: reason,
      );
      waitlistEntriesByClass[classId] =
          await _service.fetchWaitlistEntriesForClass(classId: classId);
      parentWaitlistEntries = await _service.fetchWaitlistEntriesForParent(
        parentId: parentId,
      );
      _stopLoading();
      return entry;
    } catch (e) {
      _handleError('Failed to join waitlist: $e');
      return null;
    }
  }

  Future<PermanentEnrollmentResult?> enrollStudentPermanentForParent({
    required String classId,
    required String studentId,
    required String parentId,
  }) async {
    _startLoading();
    try {
      final result = await _service.enrollStudentPermanentForParent(
        classId: classId,
        studentId: studentId,
        parentId: parentId,
      );

      if (result.enrolled) {
        await loadAllClasses(silent: true);
      }
      waitlistEntriesByClass[classId] =
          await _service.fetchWaitlistEntriesForClass(classId: classId);
      parentWaitlistEntries = await _service.fetchWaitlistEntriesForParent(
        parentId: parentId,
      );

      _stopLoading();
      return result;
    } catch (e) {
      _handleError('Failed to permanently enroll parent student: $e');
      return null;
    }
  }

  Future<void> updateWaitlistEntryStatus({
    required String entryId,
    required WaitlistStatus status,
    String? classId,
    String? parentId,
    DateTime? offerExpiresAt,
  }) async {
    _startLoading();
    try {
      await _service.updateWaitlistEntryStatus(
        entryId: entryId,
        status: status,
        offerExpiresAt: offerExpiresAt,
      );
      if (classId != null) {
        waitlistEntriesByClass[classId] =
            await _service.fetchWaitlistEntriesForClass(classId: classId);
      }
      if (parentId != null) {
        parentWaitlistEntries = await _service.fetchWaitlistEntriesForParent(
          parentId: parentId,
        );
      }
      _stopLoading();
    } catch (e) {
      _handleError('Failed to update waitlist entry: $e');
    }
  }

  Future<void> leaveWaitlist({
    required String classId,
    required String studentId,
    String? parentId,
  }) async {
    _startLoading();
    try {
      await _service.leaveWaitlist(
        classId: classId,
        studentId: studentId,
      );
      waitlistEntriesByClass[classId] =
          await _service.fetchWaitlistEntriesForClass(classId: classId);
      if (parentId != null) {
        parentWaitlistEntries = await _service.fetchWaitlistEntriesForParent(
          parentId: parentId,
        );
      }
      _stopLoading();
    } catch (e) {
      _handleError('Failed to leave waitlist: $e');
    }
  }

  Future<WaitlistPromotionResult?> promoteWaitlistEntry({
    required String entryId,
  }) async {
    _startLoading();
    try {
      final result = await _service.promoteWaitlistEntry(entryId: entryId);

      if (result.promoted) {
        await loadAllClasses(silent: true);
        await loadAttendanceForWeek(silent: true);
      }

      waitlistEntriesByClass[result.classId] =
          await _service.fetchWaitlistEntriesForClass(classId: result.classId);
      if (result.parentId.isNotEmpty) {
        parentWaitlistEntries = await _service.fetchWaitlistEntriesForParent(
          parentId: result.parentId,
        );
      }

      _stopLoading();
      return result;
    } catch (e) {
      _handleError('Failed to promote waitlist entry: $e');
      return null;
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
      _auditService.record(
        action: 'class.enrol_permanent',
        targetType: 'class',
        targetId: classId,
        targetName: AuditService.classTargetName(classModel),
        payloadSummary: {
          'classId': classId,
          'className': AuditService.classTargetName(classModel),
          'studentId': studentId,
        },
        before: {'enrolledStudents': classModel.enrolledStudents},
        after: {
          'enrolledStudents': [
            ...classModel.enrolledStudents,
            studentId,
          ],
        },
      );
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
      final classModel = _classById(classId);
      await _service.unenrollStudentPermanent(
          classId: classId, studentId: studentId);
      if (classModel != null) {
        _auditService.record(
          action: 'class.unenrol_permanent',
          targetType: 'class',
          targetId: classId,
          targetName: AuditService.classTargetName(classModel),
          payloadSummary: {
            'classId': classId,
            'className': AuditService.classTargetName(classModel),
            'studentId': studentId,
          },
          before: {'enrolledStudents': classModel.enrolledStudents},
          after: {
            'enrolledStudents': classModel.enrolledStudents
                .where((id) => id != studentId)
                .toList(),
          },
        );
      }
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
      final classModel = _classById(classId);
      if (classModel != null && attendance != null) {
        _auditService.record(
          action: 'class.book_one_off',
          targetType: 'attendance',
          targetId: attendanceDocId,
          targetName: AuditService.attendanceTargetName(
            classModel: classModel,
            attendance: attendance,
          ),
          payloadSummary: {
            'classId': classId,
            'className': AuditService.classTargetName(classModel),
            'attendanceDate': AuditService.dateOnly(attendance.date),
            'studentId': studentId,
          },
          before: {'attendance': attendance.attendance},
          after: {
            'attendance': [...attendance.attendance, studentId],
          },
        );
      }
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
      final attendance = await _service.fetchAttendanceDoc(
        classId: classId,
        attendanceDocId: attendanceDocId,
      );
      await _service.cancelStudentForWeek(
        classId: classId,
        studentId: studentId,
        attendanceDocId: attendanceDocId,
      );
      final classModel = _classById(classId);
      if (classModel != null && attendance != null) {
        _auditService.record(
          action: 'class.cancel_booking',
          targetType: 'attendance',
          targetId: attendanceDocId,
          targetName: AuditService.attendanceTargetName(
            classModel: classModel,
            attendance: attendance,
          ),
          payloadSummary: {
            'classId': classId,
            'className': AuditService.classTargetName(classModel),
            'attendanceDate': AuditService.dateOnly(attendance.date),
            'studentId': studentId,
          },
          before: {'attendance': attendance.attendance},
          after: {
            'attendance':
                attendance.attendance.where((id) => id != studentId).toList(),
          },
        );
      }
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
      final oldClass = _classById(oldClassId);
      final newClass = _classById(newClassId);
      await _service.rescheduleToDifferentClass(
        oldClassId: oldClassId,
        oldAttendanceDocId: oldAttendanceDocId,
        newClassId: newClassId,
        newAttendanceDocId: newAttendanceDocId,
        studentId: studentId,
      );
      if (oldClass != null && newClass != null) {
        _auditService.record(
          action: 'class.reschedule',
          targetType: 'class',
          targetId: newClassId,
          targetName: AuditService.classTargetName(newClass),
          payloadSummary: {
            'studentId': studentId,
            'oldClassId': oldClassId,
            'oldClassName': AuditService.classTargetName(oldClass),
            'oldAttendanceDocId': oldAttendanceDocId,
            'newClassId': newClassId,
            'newClassName': AuditService.classTargetName(newClass),
            'newAttendanceDocId': newAttendanceDocId,
          },
        );
      }
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
    BuildContext? context,
  }) async {
    final authController = context == null
        ? null
        : Provider.of<AuthController>(context, listen: false);
    _startLoading();
    bool tokenAwarded = false;
    try {
      final authController = context != null
          ? Provider.of<AuthController>(context, listen: false)
          : null;

      tokenAwarded = await _service.notifyStudentAbsence(
        classId: classId,
        studentId: studentId,
        attendanceDocId: attendanceDocId,
        parentId: parentId,
      );
      final classModel = _classById(classId);
      if (classModel != null) {
        _auditService.record(
          action: 'class.cancel_booking',
          targetType: 'attendance',
          targetId: attendanceDocId,
          targetName: AuditService.attendanceTargetName(
            classModel: classModel,
            attendance: attendanceObj,
          ),
          payloadSummary: {
            'classId': classId,
            'className': AuditService.classTargetName(classModel),
            'attendanceDate': AuditService.dateOnly(attendanceObj.date),
            'studentId': studentId,
            'reason': 'absence_notified',
          },
          before: {'attendance': attendanceObj.attendance},
          after: {
            'attendance': attendanceObj.attendance
                .where((id) => id != studentId)
                .toList(),
          },
        );
      }

      if (authController?.currentUser?.uid == parentId) {
        await authController?.refreshCurrentUser();
      }

      _stopLoading();
    } catch (e) {
      _handleError('Failed to notify absence: $e');
    }
    return tokenAwarded;
  }

  Future<void> incrementTokens(String parentId, int count,
      {BuildContext? context, AuthController? authController}) async {
    final controller = authController ??
        (context == null
            ? null
            : Provider.of<AuthController>(context, listen: false));
    _startLoading();
    try {
      final beforeCount = await _service.getLessonTokenCount(parentId);
      await _service.incrementLessonTokens(parentId, count);
      _recordTokenAdjustment(
        parentId: parentId,
        delta: count,
        beforeCount: beforeCount,
        reason: 'increment',
      );
      if (controller != null) {
        if (controller.currentUser?.uid == parentId) {
          await controller.refreshCurrentUser();
        }
      }
      _stopLoading();
    } catch (e) {
      _handleError('Failed to increment tokens: $e');
    }
  }

  Future<void> decrementTokens(String parentId, int count,
      {BuildContext? context, AuthController? authController}) async {
    final controller = authController ??
        (context == null
            ? null
            : Provider.of<AuthController>(context, listen: false));
    _startLoading();
    try {
      final beforeCount = await _service.getLessonTokenCount(parentId);
      await _service.decrementLessonTokens(parentId, count);
      _recordTokenAdjustment(
        parentId: parentId,
        delta: count * -1,
        beforeCount: beforeCount,
        reason: 'decrement',
      );
      // Refresh current user if context is provided and parentId matches
      if (controller != null) {
        if (controller.currentUser?.uid == parentId) {
          await controller.refreshCurrentUser();
        }
      }
      _stopLoading();
    } catch (e) {
      _handleError('Failed to decrement tokens: $e');
    }
  }

  Future<void> setLessonTokens(String parentId, int count) async {
    _startLoading();
    try {
      final beforeCount = await _service.getLessonTokenCount(parentId);
      await _service.setLessonTokens(parentId, count);
      _recordTokenAdjustment(
        parentId: parentId,
        delta: count - beforeCount,
        beforeCount: beforeCount,
        reason: 'manual_set',
      );
      _stopLoading();
    } catch (e) {
      _handleError('Failed to set tokens: $e');
      rethrow;
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
      final oldClass = _classById(oldClassId);
      final newClass = _classById(newClassId);
      if (oldClass != null && newClass != null) {
        _auditService.record(
          action: 'class.reschedule',
          targetType: 'class',
          targetId: newClassId,
          targetName: AuditService.classTargetName(newClass),
          payloadSummary: {
            'studentId': studentId,
            'oldClassId': oldClassId,
            'oldClassName': AuditService.classTargetName(oldClass),
            'newClassId': newClassId,
            'newClassName': AuditService.classTargetName(newClass),
            'mode': 'permanent',
          },
        );
      }
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

  ClassModel? _classById(String classId) {
    for (final classModel in allClasses) {
      if (classModel.id == classId) return classModel;
    }
    return null;
  }

  bool _sameStringList(List<String> a, List<String> b) {
    final sortedA = List<String>.from(a)..sort();
    final sortedB = List<String>.from(b)..sort();
    if (sortedA.length != sortedB.length) return false;
    for (var i = 0; i < sortedA.length; i++) {
      if (sortedA[i] != sortedB[i]) return false;
    }
    return true;
  }

  void _recordTokenAdjustment({
    required String parentId,
    required int delta,
    required int beforeCount,
    required String reason,
  }) async {
    _auditService.record(
      action: 'user.adjust_lesson_tokens',
      targetType: 'user',
      targetId: parentId,
      targetName: parentId,
      payloadSummary: {
        'mode': reason == 'manual_set' ? 'set' : 'delta',
        'value': delta,
        'reason': reason,
      },
      before: {'lessonTokens': beforeCount},
      after: {'lessonTokens': beforeCount + delta},
    );
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
    return classSessionDateForWeek(
      termStartDate: activeTerm!.startDate,
      classDay: classModel.dayOfWeek,
      startTime: classModel.startTime,
      weekNumber: currentWeek,
    );
  }

  /// Helper for a specific week
  DateTime computeClassSessionDateForWeek(ClassModel classModel, int week) {
    if (activeTerm == null) throw Exception("No active term available");
    return classSessionDateForWeek(
      termStartDate: activeTerm!.startDate,
      classDay: classModel.dayOfWeek,
      startTime: classModel.startTime,
      weekNumber: week,
    );
  }

  Future<String> getUpcomingClassTextForUser(BuildContext context) async {
    final authController = Provider.of<AuthController>(context, listen: false);
    final user = authController.currentUser;
    if (user == null) return "No upcoming class";

    // Always ensure data is loaded
    if (activeTerm == null) {
      await loadActiveTerm(silent: true);
    }
    if (allClasses.isEmpty) {
      await loadAllClasses(silent: true);
    }
    if (activeTerm == null) return "No upcoming class";

    final now = DateTime.now();

    if (user.role == 'parent') {
      final parent = user as Parent;
      final studentIds = parent.students;
      if (studentIds.isEmpty) return "No upcoming class";
      final classModel = await _service.fetchUpcomingClassForParent(
        studentIds: studentIds,
      );
      if (classModel == null) return "No upcoming class";
      final amPmTime = format24HourToAmPm(classModel.startTime);
      return "${classModel.dayOfWeek} @ $amPmTime";
    } else if (user.role == 'tutor' || user.role == 'admin') {
      // Find all upcoming classes for this user as tutor/admin
      List<_UpcomingClassInfo> upcoming = [];
      for (final classModel in allClasses) {
        // Only include classes where this user is a tutor (or all for admin)
        if (user.role == 'admin' || classModel.tutors.contains(user.uid)) {
          for (int week = currentWeek; week <= activeTerm!.totalWeeks; week++) {
            final classDate = computeClassSessionDateForWeek(classModel, week);
            if (classDate.isAfter(now)) {
              upcoming.add(_UpcomingClassInfo(
                  classModel: classModel, classDate: classDate));
            }
          }
        }
      }
      if (upcoming.isEmpty) return "No upcoming class";
      upcoming.sort((a, b) => a.classDate.compareTo(b.classDate));
      final next = upcoming.first.classModel;
      final amPmTime = format24HourToAmPm(next.startTime);
      return "${next.dayOfWeek} @ $amPmTime";
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
