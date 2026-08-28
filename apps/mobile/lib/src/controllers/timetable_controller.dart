import 'package:flutter/material.dart';
import 'package:flutter/widgets.dart'; // for WidgetsBinding
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/one_off_enrollment_result_model.dart';
import 'package:tenacity/src/models/parent_model.dart';
import 'package:tenacity/src/models/permanent_enrollment_result_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/models/term_model.dart';
import 'package:tenacity/src/models/waitlist_entry_model.dart';
import 'package:tenacity/src/models/waitlist_promotion_result_model.dart';
import 'package:tenacity/src/services/audit_service.dart';
import 'package:tenacity/src/services/timetable_service.dart';
import 'package:tenacity/src/utils/class_session_dates.dart';
import 'package:tenacity/src/utils/error_presenter.dart';

enum AdminPermanentEnrollmentOutcome { enrolled, alreadyEnrolled }

class TimetableController extends ChangeNotifier {
  final TimetableService _service;
  final AuditService _auditService;

  TimetableController({
    required TimetableService service,
    AuditService? auditService,
  })  : _service = service,
        _auditService = auditService ?? AuditService();

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
  String? loadedAttendanceDocId;

  /// Guards [loadAttendanceForWeek] against committing a stale result.
  ///
  /// The silent background refresh deliberately does not block the screen, so
  /// a user can page to another week while a refresh for the old week is
  /// still in flight. Both calls read [currentWeek] as it stood when they
  /// started, and network order is not call order — without this, the older
  /// call finishing last would overwrite [attendanceByClass] with the
  /// previous week's sessions after [currentWeek] and the header had already
  /// moved on.
  int _attendanceLoadGeneration = 0;

  /// Whether the load that most recently committed to [attendanceByClass]
  /// succeeded.
  ///
  /// A superseded call has no way to know, on its own, whether the request
  /// that replaced it will succeed — it returns before that request has
  /// necessarily finished. Reporting a superseded call as trustworthy by
  /// default would let a caller draw conclusions from data that never
  /// actually loaded successfully; reading this field instead ties the
  /// answer to the true state of [attendanceByClass] rather than to which
  /// call happened to return first.
  bool _lastAttendanceLoadOk = true;

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
      _reportFailure(e, action: 'load your terms', namesAction: false);
    }
  }

  /// 2) Fetch the active term
  ///
  /// Returns whether the read succeeded. [activeTerm] ending up null is
  /// ambiguous on its own — a genuinely termless period and a failed fetch
  /// both leave it null — and a caller that treats every null as "quiet"
  /// cannot tell the two apart without this.
  Future<bool> loadActiveTerm({bool silent = false}) async {
    debugPrint('[TimetableController] loadActiveTerm called');
    _beginLoad(silent: silent);
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
      return true;
    } catch (e) {
      debugPrint('[TimetableController] loadActiveTerm error: $e');
      _reportFailure(e,
          action: 'load the current term', silent: silent, namesAction: false);
      return false;
    }
  }

  /// 3) Load all classes
  ///
  /// Returns whether the read succeeded, for the same reason as
  /// [loadActiveTerm]: [allClasses] staying empty does not say whether there
  /// are genuinely no classes or the read failed.
  Future<bool> loadAllClasses({bool silent = false}) async {
    debugPrint('[TimetableController] loadAllClasses called');
    _beginLoad(silent: silent);
    try {
      final classes = await _service.fetchAllClasses();
      debugPrint(
          '[TimetableController] fetchAllClasses returned: ${classes.length}');
      allClasses = classes;
      if (!silent) _stopLoading();
      return true;
    } catch (e) {
      debugPrint('[TimetableController] loadAllClasses error: $e');
      _reportFailure(e,
          action: 'load your classes', silent: silent, namesAction: false);
      return false;
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
      _reportFailure(e, action: 'set up attendance for this week');
    }
  }

  /// 5) Load attendance for all classes for the current week
  ///
  /// Returns whether [attendanceByClass] can now be trusted. Callers that draw
  /// conclusions from an *absence* of sessions need to tell a failed read from
  /// a genuinely quiet week: the admin console reports "0 need action" from
  /// this data, and a swallowed failure turns that into a false all-clear.
  Future<bool> loadAttendanceForWeek({bool silent = false}) async {
    debugPrint('[TimetableController] loadAttendanceForWeek called');
    if (activeTerm == null) {
      debugPrint('[TimetableController] activeTerm is null');
      // Left unreported on the silent path: this is a precondition rather than
      // a failure — a background refresh that runs before a term is loaded
      // would otherwise stamp a confusing message over whatever the caller
      // was actually reporting.
      // Not a failure to explain away — there is genuinely no term on right
      // now — but the screens render this field or sit blank, so it has to say
      // something, and it is read under a "We couldn't load..." heading.
      if (!silent) _handleError('There is no active term at the moment.');
      return false;
    }
    final generation = ++_attendanceLoadGeneration;
    _beginLoad(silent: silent);
    try {
      final termId = activeTerm!.id;
      final requestedWeek = currentWeek;
      final docId = '${termId}_W$requestedWeek';
      debugPrint('[TimetableController] loading attendance for docId: $docId');

      // One query for the whole week, rather than a document read per class.
      final fetched = await _service.fetchAttendanceForWeek(
        termId: termId,
        weekNumber: requestedWeek,
      );

      if (generation != _attendanceLoadGeneration) {
        // Superseded — the week changed while this was in flight. Committing
        // a stale result would show sessions for a week that is no longer the
        // one on screen.
        debugPrint(
            '[TimetableController] loadAttendanceForWeek stale, discarding docId: $docId');
        // The newer request owns the data now. Whether it is trustworthy is
        // not this call's to say — it defers to whatever the most recent
        // commit actually was, which may itself still be in flight.
        return _lastAttendanceLoadOk;
      }

      // A collection-group query also returns sessions belonging to classes
      // that are no longer on the books — something the old per-class fetch
      // could not do, because it only ever asked about classes it had.
      final knownClassIds = {for (final c in allClasses) c.id};
      final loaded = <String, Attendance>{
        for (final entry in fetched.entries)
          if (knownClassIds.contains(entry.key)) entry.key: entry.value,
      };

      // Swapped in at the end. Clearing up front meant a silent reload still
      // blanked the week for the duration of the fetch, which defeats the
      // point of refreshing quietly behind what is already on screen.
      attendanceByClass = loaded;
      loadedAttendanceDocId = docId;
      _lastAttendanceLoadOk = true;
      debugPrint('[TimetableController] loadAttendanceForWeek complete');
      return true;
    } catch (e) {
      if (generation != _attendanceLoadGeneration) {
        // As above: a failure from a superseded request should not stamp an
        // error over whatever the current request is doing, and does not by
        // itself mean the current request has failed.
        debugPrint(
            '[TimetableController] loadAttendanceForWeek stale error, discarding: $e');
        return _lastAttendanceLoadOk;
      }
      debugPrint('[TimetableController] loadAttendanceForWeek error: $e');
      // Only the message here — the `finally` below owns isLoading and the
      // notification for both the success and failure paths.
      errorMessage =
          presentError(e, action: 'load attendance for this week').reason;
      _lastAttendanceLoadOk = false;
      return false;
    } finally {
      // A superseded call's own bookkeeping is redundant — the request that
      // replaced it owns isLoading and will notify when it settles — and
      // running it anyway risks a stray `isLoading = false` while that newer
      // request is still in flight.
      if (generation == _attendanceLoadGeneration) {
        if (!silent) _stopLoading();
        notifyListeners();
      }
    }
  }

  /// A day another screen has asked the admin timetable to open on.
  ///
  /// Set by the admin dashboard when it sends someone to a specific session,
  /// and consumed once by the timetable. It lives here rather than being passed
  /// through navigation because the tabs are kept alive and built without
  /// arguments, so there is nowhere to hand it to on the way.
  DateTime? _requestedAdminDate;

  void requestAdminDate(DateTime date) {
    _requestedAdminDate = DateTime(date.year, date.month, date.day);
  }

  /// Returns the requested day and forgets it, so returning to the timetable
  /// later lands wherever the user left it rather than replaying an old jump.
  DateTime? takeRequestedAdminDate() {
    final date = _requestedAdminDate;
    _requestedAdminDate = null;
    return date;
  }

  /// Reads one session without touching [attendanceByClass].
  ///
  /// [loadAttendanceForWeek] replaces the cached week, which is right for the
  /// timetable but wrong for any screen that needs a specific week — the Users
  /// directory has to know about *this* week regardless of where the Classes
  /// pager was left.
  Future<Attendance?> fetchAttendanceDocFor({
    required String classId,
    required String attendanceDocId,
  }) {
    return _service.fetchAttendanceDoc(
      classId: classId,
      attendanceDocId: attendanceDocId,
    );
  }

  /// Updates one or more generated sessions without overwriting a newer tutor
  /// assignment or any unrelated attendance fields.
  ///
  /// Errors deliberately propagate to the sheet. The older tutor-update
  /// methods convert failures into controller state and return normally, which
  /// made the admin UI report success after a rejected or conflicting write.
  Future<void> updateSessionTutorsChecked({
    required String attendanceDocId,
    required Map<String, List<String>> expectedTutorIdsByClass,
    required List<String> tutorIds,
    required String updatedBy,
  }) async {
    _startLoading();
    try {
      await _service.updateSessionTutorsChecked(
        attendanceDocId: attendanceDocId,
        expectedTutorIdsByClass: expectedTutorIdsByClass,
        tutorIds: tutorIds,
        updatedBy: updatedBy,
      );
      errorMessage = null;
    } catch (e) {
      errorMessage =
          presentError(e, action: 'update the tutors for this class').message;
      rethrow;
    } finally {
      // A conflict means the cached assignment is stale; a success means the
      // cache needs the committed assignment. Refresh in both cases.
      await loadAttendanceForWeek(silent: true);
      isLoading = false;
      notifyListeners();
    }
  }

  /// Updates standing class tutor fields through the service's checked class
  /// transaction, then refreshes both class and generated-session caches.
  ///
  /// The service writes only tutor and audit metadata fields, so a concurrent
  /// capacity or roster change cannot be replaced by a stale [ClassModel].
  /// A propagation failure is rethrown because the class phase has committed
  /// while some generated future sessions may not have.
  Future<void> updateStandingTutorsChecked({
    required Map<String, List<String>> expectedTutorIdsByClass,
    required List<String> tutorIds,
    required DateTime fromDate,
    required String updatedBy,
  }) async {
    _startLoading();
    try {
      await _service.updateStandingTutorsChecked(
        expectedTutorIdsByClass: expectedTutorIdsByClass,
        tutorIds: tutorIds,
        fromDate: fromDate,
        updatedBy: updatedBy,
      );
      errorMessage = null;
    } catch (e) {
      errorMessage =
          presentError(e, action: 'update the tutors for this class').message;
      rethrow;
    } finally {
      await loadAllClasses(silent: true);
      await loadAttendanceForWeek(silent: true);
      isLoading = false;
      notifyListeners();
    }
  }

  Future<void> updateSessionBookingsChecked({
    required String classId,
    required String attendanceDocId,
    required List<String> expectedStudentIds,
    required List<String> studentIds,
    required String updatedBy,
  }) async {
    _startLoading();
    try {
      await _service.updateSessionBookingsChecked(
        classId: classId,
        attendanceDocId: attendanceDocId,
        expectedStudentIds: expectedStudentIds,
        studentIds: studentIds,
        updatedBy: updatedBy,
      );
      final classModel = _classById(classId);
      _auditService.record(
        action: 'attendance.bookings_update',
        targetType: 'attendance',
        targetId: attendanceDocId,
        targetName: classModel == null
            ? null
            : '${AuditService.classTargetName(classModel)} · '
                '$attendanceDocId',
        payloadSummary: {
          'classId': classId,
          'className': classModel == null
              ? null
              : AuditService.classTargetName(classModel),
          'beforeCount': expectedStudentIds.length,
          'afterCount': studentIds.length,
        },
        before: {'attendance': expectedStudentIds},
        after: {'attendance': studentIds},
      );
      errorMessage = null;
    } catch (e) {
      errorMessage =
          presentError(e, action: 'update bookings for this week').message;
      rethrow;
    } finally {
      await loadAttendanceForWeek(silent: true);
      isLoading = false;
      notifyListeners();
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
      _reportFailure(e, action: 'save this attendance change');
    }
  }

  Future<bool> toggleSessionCancelled({
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
      return newCancelled;
    } catch (e) {
      _reportFailure(e, action: 'change whether this session runs');
      rethrow;
    }
  }

  Future<bool> loadWaitlistForClass({
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
      return true;
    } catch (e) {
      if (!silent) _reportFailure(e, action: 'load the waitlist');
      return false;
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
      if (!silent) _reportFailure(e, action: 'load your waitlist');
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
      _auditService.record(
        action: 'waitlist.join',
        targetType: 'waitlistEntry',
        targetId: entry.id,
        targetName:
            '${entry.classType} · ${entry.dayOfWeek} · ${entry.startTime}',
        payloadSummary: {
          'classId': classId,
          'studentId': studentId,
          'reason': reason.value,
          'position': entry.position,
        },
        after: {'status': entry.status.value, 'position': entry.position},
      );
      waitlistEntriesByClass[classId] =
          await _service.fetchWaitlistEntriesForClass(classId: classId);
      parentWaitlistEntries = await _service.fetchWaitlistEntriesForParent(
        parentId: parentId,
      );
      _stopLoading();
      return entry;
    } catch (e) {
      _reportFailure(e, action: 'join the waitlist');
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
      _reportFailure(e, action: 'enrol your student');
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
      _reportFailure(e, action: 'update this waitlist entry');
    }
  }

  Future<void> leaveWaitlist({
    required String classId,
    required String studentId,
    String? parentId,
  }) async {
    _startLoading();
    try {
      final entry = waitlistEntriesByClass[classId]
          ?.where((e) => e.studentId == studentId)
          .firstOrNull;
      await _service.leaveWaitlist(
        classId: classId,
        studentId: studentId,
      );
      if (entry != null) {
        _auditService.record(
          action: 'waitlist.cancel',
          targetType: 'waitlistEntry',
          targetId: entry.id,
          targetName:
              '${entry.classType} · ${entry.dayOfWeek} · ${entry.startTime}',
          payloadSummary: {'classId': classId, 'studentId': studentId},
          before: {'status': entry.status.value, 'position': entry.position},
          after: {'status': WaitlistStatus.cancelled.value},
        );
      }
      waitlistEntriesByClass[classId] =
          await _service.fetchWaitlistEntriesForClass(classId: classId);
      if (parentId != null) {
        parentWaitlistEntries = await _service.fetchWaitlistEntriesForParent(
          parentId: parentId,
        );
      }
      _stopLoading();
    } catch (e) {
      _reportFailure(e, action: 'leave the waitlist');
    }
  }

  Future<WaitlistPromotionResult?> promoteWaitlistEntry({
    required String entryId,
  }) async {
    _startLoading();
    try {
      final result = await _service.promoteWaitlistEntry(entryId: entryId);

      final classModel = _classById(result.classId);
      _auditService.record(
        action: 'waitlist.promote',
        targetType: 'waitlistEntry',
        targetId: result.entryId,
        targetName: classModel != null
            ? AuditService.classTargetName(classModel)
            : result.classId,
        payloadSummary: {
          'classId': result.classId,
          'studentId': result.studentId,
          'outcome': result.outcome.value,
          'permanentSpotsRemaining': result.permanentSpotsRemaining,
        },
        before: {'status': result.previousStatus.value},
        after: {'status': result.outcome.value},
      );

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
      _reportFailure(e, action: 'move this student off the waitlist');
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
  Future<AdminPermanentEnrollmentOutcome> enrollStudentPermanent({
    required String classId,
    required String studentId,
  }) async {
    _startLoading();
    try {
      final classModel = allClasses.firstWhere((c) => c.id == classId,
          orElse: () => throw Exception("Class not found"));
      if (classModel.enrolledStudents.contains(studentId)) {
        errorMessage = null;
        return AdminPermanentEnrollmentOutcome.alreadyEnrolled;
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
      await loadAllClasses(silent: true);
      errorMessage = null;
      return AdminPermanentEnrollmentOutcome.enrolled;
    } catch (e) {
      errorMessage = presentError(e, action: 'enrol this student').message;
      rethrow;
    } finally {
      isLoading = false;
      notifyListeners();
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
      await loadAllClasses(silent: true);
      errorMessage = null;
    } catch (e) {
      errorMessage = presentError(e, action: 'unenrol this student').message;
      rethrow;
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  /// One-off booking
  Future<OneOffEnrollmentResult?> enrollStudentOneOff({
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
        return const OneOffEnrollmentResult(
          added: false,
          alreadyEnrolled: true,
        );
      }

      final result = await _service.enrollStudentOneOff(
        classId: classId,
        studentId: studentId,
        attendanceDocId: attendanceDocId,
      );
      final classModel = _classById(classId);
      if (result.added && classModel != null && attendance != null) {
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
      return result;
    } catch (e) {
      _reportFailure(e, action: 'book this class');
      return null;
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
      errorMessage = null;
    } catch (e) {
      errorMessage =
          presentError(e, action: 'cancel this class for the week').message;
      rethrow;
    } finally {
      isLoading = false;
      notifyListeners();
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
      _reportFailure(e, action: 'reschedule this student');
      rethrow;
    }
  }

  Future<bool> notifyAbsence({
    required String classId,
    required String studentId,
    required String attendanceDocId,
    required String parentId,
    BuildContext? context,
  }) async {
    _startLoading();
    bool tokenAwarded = false;
    try {
      final authController = context != null
          ? Provider.of<AuthController>(context, listen: false)
          : null;

      final attendanceObj = await _service.fetchAttendanceDoc(
        classId: classId,
        attendanceDocId: attendanceDocId,
      );
      tokenAwarded = await _service.notifyStudentAbsence(
        classId: classId,
        studentId: studentId,
        attendanceDocId: attendanceDocId,
        parentId: parentId,
      );
      final classModel = _classById(classId);
      if (classModel != null && attendanceObj != null) {
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
      _reportFailure(e, action: 'record this absence');
      rethrow;
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
      _reportFailure(e, action: 'add a lesson token');
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
      _reportFailure(e, action: 'use a lesson token');
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
      _reportFailure(e, action: 'update lesson tokens');
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
      _reportFailure(e, action: 'swap this enrolment');
      rethrow;
    }
  }

  /// --- Internal Helpers ---

  void _startLoading() {
    isLoading = true;
    errorMessage = null;
    notifyListeners();
  }

  /// Opens a load that may be silent.
  ///
  /// A silent load leaves [isLoading] alone so screens showing cached data are
  /// not thrown back to a spinner. It deliberately does *not* clear
  /// [errorMessage] either: silent refreshes run inside other operations'
  /// `finally` blocks — see [updateSessionTutorsChecked] — and clearing here
  /// would erase the conflict those operations had just recorded. Clearing is
  /// the job of whoever owns the error, via [clearError].
  void _beginLoad({required bool silent}) {
    if (!silent) _startLoading();
  }

  /// Records a failure from a caught [error], in words the user can act on.
  ///
  /// [action] is the infinitive phrase the presenter builds around — see
  /// [presentError].
  ///
  /// Pass [namesAction] as false only for the loads that fill the timetable.
  /// The class lists head [errorMessage] with what failed already ("We
  /// couldn't load the timetable"), so for those the cause alone is enough and
  /// the whole sentence would say the heading twice. Every other caller here
  /// is a change rather than a load — adding a class, enrolling a student —
  /// and that same fixed heading does not describe it, so those keep the
  /// sentence naming what they were actually doing.
  ///
  /// The error itself never reaches [errorMessage]: interpolating it is what
  /// put Firebase stack traces in front of users (MOB-33).
  void _reportFailure(
    Object error, {
    required String action,
    bool silent = false,
    bool namesAction = true,
    StackTrace? stackTrace,
  }) {
    final presented =
        presentError(error, action: action, stackTrace: stackTrace);
    _setError(
      namesAction ? presented.message : presented.reason,
      silent: silent,
    );
  }

  /// Records a load failure, whether or not the load was silent.
  ///
  /// [silent] governs the spinner, not the error: a silent load that fails
  /// still has to say so, or the tutor and admin timetables — which render
  /// [errorMessage] and their retry button from it — would sit blank with no
  /// way back.
  void _setError(String message, {required bool silent}) {
    if (silent) {
      errorMessage = message;
      notifyListeners();
      return;
    }
    _handleError(message);
  }

  /// Drops any error currently on show.
  ///
  /// For a screen about to reload on the user's behalf: a silent load cannot
  /// clear this itself without trampling errors it did not set.
  void clearError() {
    if (errorMessage == null) return;
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
      await _service.createClassWithAttendance(
        classModel: newClass,
        termIds: activeTerm == null ? const [] : [activeTerm!.id],
        attendanceFromDate: activeTerm == null
            ? null
            : startOfTermWeek(activeTerm!.startDate, currentWeek),
      );
      await loadAllClasses(silent: true);
      errorMessage = null;
    } catch (e) {
      errorMessage = presentError(e, action: 'add this class').message;
      rethrow;
    } finally {
      isLoading = false;
      notifyListeners();
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
      errorMessage = null;
    } catch (e) {
      errorMessage = presentError(e, action: 'delete this class').message;
      rethrow;
    } finally {
      isLoading = false;
      notifyListeners();
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
      _reportFailure(e, action: 'set up attendance for this term');
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
