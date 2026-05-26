import 'dart:async';

import 'package:firebase_remote_config/firebase_remote_config.dart';
import 'package:flutter/material.dart';
import 'package:flutter_stripe/flutter_stripe.dart' hide Card;
import 'package:multi_select_flutter/multi_select_flutter.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/feedback_controller.dart';
import 'package:tenacity/src/controllers/invoice_controller.dart';
import 'package:tenacity/src/controllers/timetable_controller.dart';
import 'package:tenacity/src/helpers/action_option.dart';
import 'package:tenacity/src/helpers/offline_action_guard.dart';
import 'package:tenacity/src/helpers/one_off_booking_plan.dart';
import 'package:tenacity/src/helpers/parent_class_availability.dart';
import 'package:tenacity/src/helpers/student_names.dart';
import 'package:tenacity/src/helpers/student_search.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/feedback_model.dart';
import 'package:tenacity/src/models/parent_model.dart';
import 'package:tenacity/src/models/permanent_enrollment_result_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/models/waitlist_entry_model.dart';
import 'package:tenacity/src/models/waitlist_promotion_result_model.dart';
import 'package:tenacity/src/ui/feedback_screen.dart';

class TimetableScreen extends StatefulWidget {
  const TimetableScreen({super.key});

  @override
  TimetableScreenState createState() => TimetableScreenState();
}

class TimetableScreenState extends State<TimetableScreen> {
  static const String _bookOneOffAction = "Book one-off class";
  static const String _enrolPermanentAction = "Enrol permanent";
  static const String _joinWaitlistAction = "Join waitlist";
  static const String _enrolAnotherThisWeekAction =
      "Enrol another student (This Week)";
  static const String _enrolAnotherPermanentAction =
      "Enrol another student (Permanent)";
  static const String _joinWaitlistAnotherAction =
      "Join waitlist for another student";

  late Future<Set<String>>? _eligibleSubjectsFuture;
  bool _initialLoadComplete = false;
  bool _isWeekLoading = false;

  final List<String> _daysOfWeek = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ];

  final List<String> _timeSlots = [
    '16:00',
    '16:30',
    '17:00',
    '17:30',
    '18:00',
    '18:30',
    '19:00',
    '19:30',
    '20:00',
    '20:30',
    '21:00',
    '21:30',
    '22:00'
  ];

  final List<String> _classTypes = [
    '5-10',
    'stdmath11',
    'stdmath12',
    'advmath11',
    'advmath12',
    'ex1math11',
    'ex1math12',
    'ex2math12',
    'stdeng11',
    'stdeng12',
    'adveng11',
    'adveng12',
    'ex1eng11',
    'ex1eng12',
    'ex2eng12',
  ];

  final List<int> _capacities = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  bool _isPermanentEnrollmentAction(String action) {
    return action == _enrolPermanentAction ||
        action == _enrolAnotherPermanentAction ||
        _isWaitlistOnlyAction(action);
  }

  bool _isWaitlistOnlyAction(String action) {
    return action == _joinWaitlistAction ||
        action == _joinWaitlistAnotherAction;
  }

  String _permanentEnrollmentActionForClass(ClassModel classInfo) {
    return classInfo.canAcceptParentPermanentEnrollment
        ? _enrolPermanentAction
        : _joinWaitlistAction;
  }

  String _additionalPermanentEnrollmentActionForClass(ClassModel classInfo) {
    return classInfo.canAcceptParentPermanentEnrollment
        ? _enrolAnotherPermanentAction
        : _joinWaitlistAnotherAction;
  }

  String _childSelectionPermanentAction(String action) {
    if (action == _enrolAnotherPermanentAction) {
      return _enrolPermanentAction;
    }
    if (action == _joinWaitlistAnotherAction) {
      return _joinWaitlistAction;
    }
    return action;
  }

  int _weeksAheadForDisplayedWeek(TimetableController timetableController) {
    final termStart = timetableController.activeTerm?.startDate;
    if (termStart == null) return 0;
    final now = DateTime.now();
    final todayWeek = now.isBefore(termStart)
        ? 1
        : ((now.difference(termStart).inDays ~/ 7) + 1)
            .clamp(1, timetableController.activeTerm!.totalWeeks);
    return timetableController.currentWeek - todayWeek;
  }

  ParentClassAvailability _parentClassAvailability({
    required ClassModel classInfo,
    required Attendance? attendance,
    required TimetableController timetableController,
  }) {
    return ParentClassAvailability.forClass(
      classInfo: classInfo,
      attendance: attendance,
      weeksAhead: _weeksAheadForDisplayedWeek(timetableController),
    );
  }

  Future<bool> _ensureOnlineFor(String action) {
    return OfflineActionGuard.ensureOnline(context, action: action);
  }

  @override
  void initState() {
    super.initState();
    debugPrint('[TimetableScreen] initState');

    final authController = Provider.of<AuthController>(context, listen: false);
    authController.refreshCurrentUser();
    if (authController.currentUser?.role == 'parent') {
      _eligibleSubjectsFuture =
          Provider.of<TimetableController>(context, listen: false)
              .getEligibleSubjects(context);
    } else {
      _eligibleSubjectsFuture = null;
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      debugPrint('[TimetableScreen] addPostFrameCallback');
      final timetableController =
          Provider.of<TimetableController>(context, listen: false);
      _initData(timetableController);
    });
  }

  Future<void> _initData(TimetableController controller) async {
    debugPrint('[TimetableScreen] _initData start');
    try {
      if (!_initialLoadComplete) {
        await controller.loadActiveTerm(silent: _initialLoadComplete);
        debugPrint('[TimetableScreen] loadActiveTerm done');
        await controller.loadAllClasses(silent: _initialLoadComplete);
        debugPrint('[TimetableScreen] loadAllClasses done');
        await controller.loadAttendanceForWeek(silent: _initialLoadComplete);
        debugPrint('[TimetableScreen] loadAttendanceForWeek done');
        _initialLoadComplete = true;
      } else {
        // Subsequent loads are silent
        await controller.loadActiveTerm(silent: true);
        debugPrint('[TimetableScreen] loadActiveTerm done');
        await controller.loadAllClasses(silent: true);
        debugPrint('[TimetableScreen] loadAllClasses done');
        await controller.loadAttendanceForWeek(silent: true);
        debugPrint('[TimetableScreen] loadAttendanceForWeek done');
      }
    } catch (e, st) {
      debugPrint('[TimetableScreen] _initData error: $e\n$st');
    }
  }

  Future<bool> _processOneOffBooking(
    ClassModel classInfo,
    List<String> selectedChildIds,
    String attendanceDocId,
  ) async {
    final timetableController = context.read<TimetableController>();
    final invoiceController = context.read<InvoiceController>();
    final authController = context.read<AuthController>();
    final parentUser = authController.currentUser as Parent;
    final parentId = parentUser.uid;
    if (!mounted) return false;
    debugPrint(
        '[TimetableScreen] _processOneOffBooking: classId=${classInfo.id}, selectedChildIds=$selectedChildIds, attendanceDocId=$attendanceDocId');
    final attendance = timetableController.attendanceByClass[classInfo.id];
    final availability = _parentClassAvailability(
      classInfo: classInfo,
      attendance: attendance,
      timetableController: timetableController,
    );

    if (!availability.canBookOneOff) {
      if (!mounted) return false;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            availability.oneOffSpots <= 0
                ? 'This session is already full. No lesson tokens were used.'
                : 'Only ${availability.oneOffSpots} one-off spot${availability.oneOffSpots == 1 ? '' : 's'} available. No lesson tokens were used.',
          ),
          backgroundColor: Colors.red,
        ),
      );
      return false;
    }

    final bookedChildIds = <String>[];
    final tokenBookedChildIds = <String>[];
    final paidBookedChildIds = <String>[];
    final alreadyBookedChildIds = <String>[];
    final failedChildIds = <String>[];
    final currentAttendance = attendance?.attendance.toSet() ?? <String>{};
    final candidateChildIds = <String>[];

    for (final childId in selectedChildIds) {
      if (currentAttendance.contains(childId)) {
        alreadyBookedChildIds.add(childId);
      } else {
        candidateChildIds.add(childId);
      }
    }

    if (candidateChildIds.isEmpty) {
      if (!mounted) return false;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            alreadyBookedChildIds.isNotEmpty
                ? 'No new bookings were made because the selected student${alreadyBookedChildIds.length == 1 ? '' : 's'} already had a booking.'
                : 'No bookings were made. No lesson tokens were used.',
          ),
          backgroundColor: alreadyBookedChildIds.isNotEmpty ? null : Colors.red,
        ),
      );
      return false;
    }

    if (candidateChildIds.length > availability.oneOffSpots) {
      if (!mounted) return false;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Only ${availability.oneOffSpots} one-off spot${availability.oneOffSpots == 1 ? '' : 's'} available. No lesson tokens were used.',
          ),
          backgroundColor: Colors.red,
        ),
      );
      return false;
    }

    final bookingPlan = OneOffBookingPlan.fromSelection(
      selectedChildIds: candidateChildIds,
      availableTokens: parentUser.lessonTokens,
    );
    double? oneOffClassPrice;
    String? paidPaymentIntentId;

    if (bookingPlan.requiresPayment) {
      final remoteConfig = FirebaseRemoteConfig.instance;
      oneOffClassPrice = remoteConfig.getDouble('one_off_class_price');
      final totalAmount = oneOffClassPrice * bookingPlan.paidBookings;

      try {
        final clientSecret = await invoiceController.initiateOneOffPayment(
          parentId: parentId,
          amount: totalAmount,
          currency: 'aud',
        );
        await Stripe.instance.initPaymentSheet(
          paymentSheetParameters: SetupPaymentSheetParameters(
            paymentIntentClientSecret: clientSecret,
            merchantDisplayName: 'Tenacity Tutoring',
            applePay: const PaymentSheetApplePay(
              merchantCountryCode: 'AU',
            ),
            googlePay: const PaymentSheetGooglePay(
              merchantCountryCode: 'AU',
              currencyCode: 'AUD',
              testEnv: false,
            ),
          ),
        );
        await Stripe.instance.presentPaymentSheet();
        final isVerified =
            await invoiceController.verifyPaymentStatus(clientSecret);
        if (isVerified) {
          paidPaymentIntentId = clientSecret.split('_secret_').first;
        }
        if (!isVerified) {
          if (!mounted) return false;
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                "Payment verification failed. Please try again.",
                style: TextStyle(color: Colors.white),
              ),
              backgroundColor: Colors.red,
            ),
          );
          return false;
        }
      } on StripeException catch (e) {
        // User cancelled or payment failed
        if (!mounted) return false;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              e.error.localizedMessage ?? "Payment cancelled or failed.",
              style: const TextStyle(color: Colors.white),
            ),
            backgroundColor: Colors.red,
          ),
        );
        return false;
      } catch (e) {
        if (!mounted) return false;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              "An unexpected error occurred.",
              style: TextStyle(color: Colors.white),
            ),
            backgroundColor: Colors.red,
          ),
        );
        return false;
      }

      await _enrollOneOffStudents(
        timetableController: timetableController,
        classInfo: classInfo,
        attendanceDocId: attendanceDocId,
        childIds: bookingPlan.paidStudentIds,
        bookedChildIds: bookedChildIds,
        bucketBookedChildIds: paidBookedChildIds,
        alreadyBookedChildIds: alreadyBookedChildIds,
        failedChildIds: failedChildIds,
      );
    }

    if (bookingPlan.tokenStudentIds.isNotEmpty) {
      await _enrollOneOffStudents(
        timetableController: timetableController,
        classInfo: classInfo,
        attendanceDocId: attendanceDocId,
        childIds: bookingPlan.tokenStudentIds,
        bookedChildIds: bookedChildIds,
        bucketBookedChildIds: tokenBookedChildIds,
        alreadyBookedChildIds: alreadyBookedChildIds,
        failedChildIds: failedChildIds,
      );

      if (tokenBookedChildIds.isNotEmpty) {
        await timetableController.decrementTokens(
          parentId,
          tokenBookedChildIds.length,
          authController: authController,
        );
      }
    }

    if (paidBookedChildIds.isNotEmpty && oneOffClassPrice != null) {
      await invoiceController.generateOneOffInvoice(
        paidBookedChildIds.length,
        oneOffClassPrice,
        paidBookedChildIds,
        classInfo,
        parentUser,
        0,
        paymentIntentId: paidPaymentIntentId,
      );
    }

    if (bookedChildIds.isEmpty) {
      if (!mounted) return false;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            alreadyBookedChildIds.isNotEmpty
                ? 'No new bookings were made because the selected student${alreadyBookedChildIds.length == 1 ? '' : 's'} already had a booking.'
                : 'No bookings were made. No lesson tokens were used.',
          ),
          backgroundColor: alreadyBookedChildIds.isNotEmpty ? null : Colors.red,
        ),
      );
      return false;
    }

    if (bookingPlan.requiresPayment &&
        paidBookedChildIds.length < bookingPlan.paidBookings &&
        mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Payment succeeded, but one or more bookings could not be confirmed. Please contact Tenacity Tutoring.',
            style: TextStyle(color: Colors.white),
          ),
          backgroundColor: Colors.red,
        ),
      );
    } else {
      if (!mounted) return false;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _buildOneOffBookingResultMessage(
              bookedCount: bookedChildIds.length,
              alreadyBookedCount: alreadyBookedChildIds.length,
              failedCount: failedChildIds.length,
            ),
          ),
        ),
      );
    }
    debugPrint('[TimetableScreen] _processOneOffBooking complete');
    return true;
  }

  Future<void> _enrollOneOffStudents({
    required TimetableController timetableController,
    required ClassModel classInfo,
    required String attendanceDocId,
    required Iterable<String> childIds,
    required List<String> bookedChildIds,
    required List<String> bucketBookedChildIds,
    required List<String> alreadyBookedChildIds,
    required List<String> failedChildIds,
  }) async {
    for (final childId in childIds) {
      final result = await timetableController.enrollStudentOneOff(
        classId: classInfo.id,
        studentId: childId,
        attendanceDocId: attendanceDocId,
      );
      if (result == null) {
        failedChildIds.add(childId);
      } else if (result.added) {
        bookedChildIds.add(childId);
        bucketBookedChildIds.add(childId);
      } else if (result.alreadyEnrolled) {
        alreadyBookedChildIds.add(childId);
      }
    }
  }

  Future<void> _processParentPermanentEnrollment(
    ClassModel classInfo,
    List<String> selectedChildIds,
  ) async {
    if (!await _ensureOnlineFor('enrol permanently')) return;
    final timetableController = context.read<TimetableController>();
    final invoiceController = context.read<InvoiceController>();
    final authController = context.read<AuthController>();
    final parentUser = authController.currentUser as Parent;
    final parentId = parentUser.uid;

    final enrolledChildIds = <String>[];
    final waitlistedChildIds = <String>[];
    final alreadyEnrolledChildIds = <String>[];
    final failedChildIds = <String>[];
    final enrolledResults = <PermanentEnrollmentResult>[];

    for (final childId in selectedChildIds) {
      final result = await timetableController.enrollStudentPermanentForParent(
        classId: classInfo.id,
        studentId: childId,
        parentId: parentId,
      );

      if (result == null) {
        failedChildIds.add(childId);
        continue;
      }

      switch (result.outcome) {
        case PermanentEnrollmentOutcome.enrolled:
          enrolledChildIds.add(childId);
          enrolledResults.add(result);
        case PermanentEnrollmentOutcome.waitlisted:
          waitlistedChildIds.add(childId);
        case PermanentEnrollmentOutcome.alreadyEnrolled:
          alreadyEnrolledChildIds.add(childId);
      }
    }

    if (enrolledChildIds.isNotEmpty) {
      final weeks = enrolledResults.isEmpty
          ? 0
          : enrolledResults
              .map((result) => result.attendanceSessionsAdded)
              .reduce((a, b) => a > b ? a : b);
      final totalSessions = enrolledResults.fold<int>(
        0,
        (sum, result) => sum + result.attendanceSessionsAdded,
      );
      final tokensAvailable = parentUser.lessonTokens;
      final tokensToUse =
          tokensAvailable >= totalSessions ? totalSessions : tokensAvailable;

      if (tokensToUse > 0) {
        await timetableController.decrementTokens(
          parentId,
          tokensToUse,
        );
        await authController.refreshCurrentUser();
      }

      final enrolledStudents = <Student>[];
      for (final id in enrolledChildIds) {
        final student = await authController.fetchStudentData(id);
        if (student != null) {
          enrolledStudents.add(student);
        }
      }

      if (enrolledStudents.isNotEmpty && weeks > 0) {
        await invoiceController.createInvoice(
          parentId: parentUser.uid,
          parentName: "${parentUser.firstName} ${parentUser.lastName}",
          parentEmail: parentUser.email,
          students: enrolledStudents,
          sessionsPerStudent: List.filled(enrolledStudents.length, 1),
          weeks: weeks,
          tokensUsed: tokensToUse,
          dueDate: DateTime.now().add(const Duration(days: 21)),
        );
      }
    }

    await timetableController.loadAllClasses(silent: true);
    await timetableController.loadWaitlistForParent(
      parentId: parentId,
      silent: true,
    );

    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          _buildPermanentEnrollmentResultMessage(
            enrolledCount: enrolledChildIds.length,
            waitlistedCount: waitlistedChildIds.length,
            alreadyEnrolledCount: alreadyEnrolledChildIds.length,
            failedCount: failedChildIds.length,
            deferredStartCount: enrolledResults
                .where((result) => result.skippedFullSessionCount > 0)
                .length,
            firstDeferredStartDate: _earliestDeferredStartDate(
              enrolledResults,
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _processParentWaitlistJoin(
    ClassModel classInfo,
    List<String> selectedChildIds,
  ) async {
    if (!await _ensureOnlineFor('join the waitlist')) return;
    final timetableController = context.read<TimetableController>();
    final authController = context.read<AuthController>();
    final parentUser = authController.currentUser as Parent;
    final parentId = parentUser.uid;
    final reason = classInfo.enrollmentState == ClassEnrollmentState.full
        ? WaitlistReason.classFull
        : WaitlistReason.classNotOpen;

    final waitlistedChildIds = <String>[];
    final failedChildIds = <String>[];

    for (final childId in selectedChildIds) {
      final entry = await timetableController.joinWaitlist(
        classId: classInfo.id,
        studentId: childId,
        parentId: parentId,
        reason: reason,
      );

      if (entry == null) {
        failedChildIds.add(childId);
      } else {
        waitlistedChildIds.add(childId);
      }
    }

    await timetableController.loadWaitlistForParent(
      parentId: parentId,
      silent: true,
    );

    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          _buildWaitlistJoinResultMessage(
            waitlistedCount: waitlistedChildIds.length,
            failedCount: failedChildIds.length,
          ),
        ),
      ),
    );
  }

  String _buildWaitlistJoinResultMessage({
    required int waitlistedCount,
    required int failedCount,
  }) {
    final parts = <String>[];
    if (waitlistedCount > 0) {
      parts.add(
          "$waitlistedCount student${waitlistedCount == 1 ? '' : 's'} added to the waitlist.");
    }
    if (failedCount > 0) {
      parts.add(
          "$failedCount waitlist request${failedCount == 1 ? '' : 's'} could not be processed.");
    }
    if (parts.isEmpty) {
      return "No waitlist requests were changed.";
    }
    return parts.join(' ');
  }

  Future<List<_WaitlistEntryDisplayData>> _loadWaitlistDisplayData(
    String classId,
  ) async {
    final timetableController = context.read<TimetableController>();
    final authController = context.read<AuthController>();

    await timetableController.loadWaitlistForClass(
      classId: classId,
      silent: true,
    );

    final entries = List<WaitlistEntry>.from(
        timetableController.waitlistEntriesByClass[classId] ??
            const <WaitlistEntry>[]);

    return Future.wait(entries.map((entry) async {
      final student = await authController.fetchStudentData(entry.studentId);
      final parentName = await authController.fetchUserFullNameById(
        entry.parentId,
      );

      return _WaitlistEntryDisplayData(
        entry: entry,
        studentName: student == null
            ? 'Unknown student'
            : '${student.firstName} ${student.lastName}',
        parentName: _cleanDisplayName(parentName, fallback: 'Unknown parent'),
      );
    }));
  }

  String _cleanDisplayName(String name, {required String fallback}) {
    final trimmed = name.trim();
    if (trimmed.isEmpty || trimmed == 'null null') {
      return fallback;
    }
    return trimmed;
  }

  String _formatWaitlistDate(DateTime? date) {
    if (date == null) return '-';
    return DateFormat('d MMM yyyy, h:mm a').format(date);
  }

  String _waitlistStatusLabel(WaitlistStatus status) {
    switch (status) {
      case WaitlistStatus.active:
        return 'Active';
      case WaitlistStatus.offered:
        return 'Offered';
      case WaitlistStatus.accepted:
        return 'Accepted';
      case WaitlistStatus.declined:
        return 'Declined';
      case WaitlistStatus.expired:
        return 'Expired';
      case WaitlistStatus.cancelled:
        return 'Cancelled';
      case WaitlistStatus.promoted:
        return 'Promoted';
    }
  }

  Color _waitlistStatusColor(WaitlistStatus status) {
    switch (status) {
      case WaitlistStatus.active:
        return const Color(0xFF1C71AF);
      case WaitlistStatus.offered:
      case WaitlistStatus.accepted:
        return Colors.orange.shade800;
      case WaitlistStatus.promoted:
        return Colors.green.shade700;
      case WaitlistStatus.declined:
      case WaitlistStatus.expired:
      case WaitlistStatus.cancelled:
        return Colors.grey.shade700;
    }
  }

  String _waitlistReasonLabel(WaitlistReason reason) {
    switch (reason) {
      case WaitlistReason.classNotOpen:
        return 'Class not open';
      case WaitlistReason.classFull:
        return 'Class full';
    }
  }

  bool _canPromoteWaitlistStatus(WaitlistStatus status) {
    return status == WaitlistStatus.active ||
        status == WaitlistStatus.offered ||
        status == WaitlistStatus.accepted;
  }

  String _waitlistPromotionOutcomeMessage(
    WaitlistPromotionResult result,
    String studentName,
  ) {
    switch (result.outcome) {
      case WaitlistPromotionOutcome.promoted:
        return '$studentName promoted to permanent enrolment.';
      case WaitlistPromotionOutcome.alreadyEnrolled:
        return '$studentName was already enrolled. Waitlist entry marked promoted.';
      case WaitlistPromotionOutcome.classFull:
        return 'Class is full. $studentName was not promoted.';
      case WaitlistPromotionOutcome.notPromotable:
        return 'This waitlist entry can no longer be promoted.';
    }
  }

  String _buildPermanentEnrollmentResultMessage({
    required int enrolledCount,
    required int waitlistedCount,
    required int alreadyEnrolledCount,
    required int failedCount,
    int deferredStartCount = 0,
    DateTime? firstDeferredStartDate,
  }) {
    final parts = <String>[];
    if (enrolledCount > 0) {
      parts.add(
          "$enrolledCount student${enrolledCount == 1 ? '' : 's'} permanently enrolled.");
    }
    if (waitlistedCount > 0) {
      parts.add(
          "$waitlistedCount student${waitlistedCount == 1 ? '' : 's'} added to the waitlist.");
    }
    if (alreadyEnrolledCount > 0) {
      parts.add(
          "$alreadyEnrolledCount student${alreadyEnrolledCount == 1 ? ' was' : 's were'} already enrolled.");
    }
    if (failedCount > 0) {
      parts.add(
          "$failedCount enrolment${failedCount == 1 ? '' : 's'} could not be processed.");
    }
    if (deferredStartCount > 0 && firstDeferredStartDate != null) {
      parts.add(
          "This week's session is full, so ${deferredStartCount == 1 ? 'attendance starts' : 'their attendance starts'} from ${DateFormat('EEE d MMM').format(firstDeferredStartDate)}.");
    } else if (deferredStartCount > 0) {
      parts.add(
          "This week's session is full, so no charge was applied for that full session.");
    }
    if (parts.isEmpty) {
      return "No enrolments were changed.";
    }
    return parts.join(' ');
  }

  DateTime? _earliestDeferredStartDate(
      List<PermanentEnrollmentResult> results) {
    final dates = results
        .where((result) => result.startsAfterFullSessions)
        .map((result) => result.firstAttendanceDate!)
        .toList();
    if (dates.isEmpty) return null;
    dates.sort();
    return dates.first;
  }

  String _buildOneOffBookingResultMessage({
    required int bookedCount,
    required int alreadyBookedCount,
    required int failedCount,
  }) {
    final parts = <String>[];
    if (bookedCount > 0) {
      parts
          .add("$bookedCount booking${bookedCount == 1 ? '' : 's'} confirmed.");
    }
    if (alreadyBookedCount > 0) {
      parts.add(
          "$alreadyBookedCount student${alreadyBookedCount == 1 ? ' already had' : 's already had'} a booking.");
    }
    if (failedCount > 0) {
      parts.add(
          "$failedCount booking${failedCount == 1 ? '' : 's'} could not be processed.");
    }
    return parts.isEmpty ? "No bookings were changed." : parts.join(' ');
  }

  @override
  @override
  Widget build(BuildContext context) {
    final timetableController = context.watch<TimetableController>();
    final authController = context.watch<AuthController>();

    final userRole = authController.currentUser?.role ?? 'parent';

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          "Timetable",
          style: TextStyle(
              color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
        ),
        elevation: 0,
        flexibleSpace: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              colors: [Color(0xFF1C71AF), Color(0xFF1B3F71)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
          ),
        ),
      ),
      body: _buildBody(timetableController, authController),
      floatingActionButton: userRole == 'admin'
          ? FloatingActionButton(
              onPressed: () {
                _showAddClassDialog(context);
              },
              backgroundColor: const Color(0xFF1C71AF),
              child: const Icon(Icons.add, color: Colors.white),
            )
          : null,
    );
  }

  Widget _buildBody(
      TimetableController timetableController, AuthController authController) {
    debugPrint('[TimetableScreen] _buildBody called');
    debugPrint('[TimetableScreen] isLoading: ${timetableController.isLoading}');
    debugPrint(
        '[TimetableScreen] errorMessage: ${timetableController.errorMessage}');
    debugPrint(
        '[TimetableScreen] activeTerm: ${timetableController.activeTerm}');
    debugPrint(
        '[TimetableScreen] allClasses.length: ${timetableController.allClasses.length}');
    if (timetableController.isLoading) {
      debugPrint(
          '[TimetableScreen] Returning: CircularProgressIndicator (isLoading)');
      return const Center(child: CircularProgressIndicator());
    }
    if (timetableController.errorMessage != null) {
      debugPrint('[TimetableScreen] Returning: Error Snackbar');
      WidgetsBinding.instance.addPostFrameCallback((_) {
        final context = this.context;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              timetableController.errorMessage!.toLowerCase().contains('full')
                  ? "This class is already full. Please increase capacity or remove a student first."
                  : timetableController.errorMessage!,
            ),
            backgroundColor: Colors.red,
          ),
        );
        timetableController.errorMessage = null;
      });
    }
    if (timetableController.activeTerm == null) {
      debugPrint('[TimetableScreen] Returning: No active term found');
      return const Center(child: Text('No active term found.'));
    }
    final allClasses = timetableController.allClasses;
    if (allClasses.isEmpty) {
      debugPrint('[TimetableScreen] Returning: No classes available');
      return const Center(child: Text('No classes available.'));
    }
    debugPrint('[TimetableScreen] Returning: _buildTimetableContent');
    return _buildTimetableContent(timetableController, authController);
  }

  Widget _buildTimetableContent(
      TimetableController timetableController, AuthController authController) {
    debugPrint('[TimetableScreen] _buildTimetableContent called');
    debugPrint(
        '[TimetableScreen] currentWeek: ${timetableController.currentWeek}');
    debugPrint(
        '[TimetableScreen] activeTerm: ${timetableController.activeTerm}');
    final currentUser = authController.currentUser;
    final userRole = currentUser?.role ?? 'parent';

    // For admins/tutors, skip FutureBuilder and use empty eligibleSubjects set
    if (userRole != 'parent') {
      return _buildTimetableContentInner(
        timetableController,
        authController,
        <String>{}, // empty eligibleSubjects
      );
    }

    // For parents, use FutureBuilder as before
    return FutureBuilder<Set<String>>(
      future: _eligibleSubjectsFuture,
      builder: (context, snapshot) {
        debugPrint(
            '[TimetableScreen] FutureBuilder connectionState: ${snapshot.connectionState}');
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return const Center(
            child: Text(
              "Sorry, we couldn't load subjects. Please try again later.",
              style: TextStyle(fontSize: 16, color: Colors.red),
            ),
          );
        }
        final eligibleSubjects = snapshot.data ?? <String>{};
        return _buildTimetableContentInner(
          timetableController,
          authController,
          eligibleSubjects,
        );
      },
    );
  }

  Widget _buildTimetableContentInner(
    TimetableController timetableController,
    AuthController authController,
    Set<String> eligibleSubjects,
  ) {
    final currentWeek = timetableController.currentWeek;
    final activeTerm = timetableController.activeTerm!;
    DateTime termStart = activeTerm.startDate;
    //DEBUG OVERRIDE:
    // termStart = DateTime.now().add(const Duration(days: 30));
    final termStartWeekday = termStart.weekday;
    final firstMonday =
        termStart.subtract(Duration(days: termStartWeekday - 1));
    final startOfCurrentWeek =
        firstMonday.add(Duration(days: (currentWeek - 1) * 7));
    final formattedStart = DateFormat('dd/MM').format(startOfCurrentWeek);
    final endOfCurrentWeek = startOfCurrentWeek.add(Duration(days: 4));
    final formattedEnd = DateFormat('dd/MM').format(endOfCurrentWeek);

    final currentUser = authController.currentUser;
    final userRole = currentUser?.role ?? 'parent';
    List<String> userStudentIds = [];
    if (currentUser != null && currentUser.role == 'parent') {
      final parentUser = currentUser as Parent;
      userStudentIds = parentUser.students;
    }

    int allowedMinWeek = 1;
    int allowedMaxWeek = activeTerm.totalWeeks;

    final bool showPreTermBanner = DateTime.now().isBefore(termStart);

    // For regular users, apply filtering. For admins/tutors, filter out classes they are tutoring.
    final filteredClasses = (userRole != 'admin' && userRole != 'tutor')
        ? timetableController.allClasses.where((classModel) {
            final classSessionDateTime =
                timetableController.computeClassSessionDate(classModel);
            final isInFuture = classSessionDateTime.isAfter(DateTime.now()) ||
                classSessionDateTime.isAtSameMomentAs(DateTime.now());
            if (!isInFuture) return false;
            return timetableController.isEligibleClass(
                classModel, eligibleSubjects);
          }).toList()
        : timetableController.allClasses.where((classModel) {
            final attendance =
                timetableController.attendanceByClass[classModel.id];
            // Exclude classes where the admin/tutor is already assigned.
            return attendance == null ||
                !attendance.tutors.contains(authController.currentUser!.uid);
          }).toList();

    debugPrint('filteredClasses (${filteredClasses.length}):');
    for (var c in filteredClasses) {
      debugPrint('  ${c.id}: ${c.dayOfWeek} ${c.startTime}');
    }

    // "Your Classes" – for parents: classes where a parent's child is enrolled,
    // for admins/tutors: classes where the tutor is teaching.
    final yourClasses = timetableController.allClasses.where((c) {
      final attendance = timetableController.attendanceByClass[c.id];
      if (attendance != null) {
        if (userRole == 'tutor' || userRole == 'admin') {
          return attendance.tutors.contains(authController.currentUser!.uid);
        } else {
          return attendance.attendance.any((id) => userStudentIds.contains(id));
        }
      }
      return false;
    }).toList();

    // Sort yourClasses by day and then by start time
    yourClasses.sort((a, b) {
      final dayCmp = _dayOffset(a.dayOfWeek).compareTo(_dayOffset(b.dayOfWeek));
      if (dayCmp != 0) return dayCmp;
      return a.startTime.compareTo(b.startTime);
    });

    debugPrint('[TimetableScreen] eligibleSubjects: $eligibleSubjects');
    debugPrint(
        '[TimetableScreen] filteredClasses.length: ${filteredClasses.length}');
    debugPrint('[TimetableScreen] yourClasses.length: ${yourClasses.length}');

    // Group the filtered classes by day.
    final Map<String, List<ClassModel>> classesByDay = {};
    for (var c in filteredClasses) {
      debugPrint(
          'Class: ${c.id}, dayOfWeek: "${c.dayOfWeek}", startTime: ${c.startTime}');
      final day = c.dayOfWeek.isEmpty ? "Unknown" : c.dayOfWeek;
      classesByDay.putIfAbsent(day, () => []);
      classesByDay[day]!.add(c);
    }
    List<String> sortedDays = classesByDay.keys.toList()
      ..sort((a, b) {
        debugPrint(
            'Sorting days: "$a" (${_dayOffset(a)}) vs "$b" (${_dayOffset(b)})');
        return _dayOffset(a).compareTo(_dayOffset(b));
      });
    debugPrint('Sorted days: $sortedDays');

    return Column(
      children: [
        if (showPreTermBanner)
          Container(
            width: double.infinity,
            color: Colors.amber[200],
            padding: const EdgeInsets.all(12),
            child: Text(
              "Term ${activeTerm.termNumber} starts on ${DateFormat('d MMMM').format(termStart)}. "
              "Bookings are open, but lessons begin then.",
              style: const TextStyle(
                color: Colors.black87,
                fontWeight: FontWeight.w600,
              ),
              textAlign: TextAlign.center,
            ),
          ),
        // Week selector
        Padding(
          padding: const EdgeInsets.all(16.0),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: (timetableController.currentWeek > allowedMinWeek)
                    ? () async {
                        debugPrint(
                            "← pressed, was week ${timetableController.currentWeek}");
                        setState(() => _isWeekLoading = true);
                        timetableController.decrementWeek();
                        debugPrint(
                            " now week ${timetableController.currentWeek}");
                        await timetableController.loadAttendanceForWeek(
                            silent: true);
                        setState(() => _isWeekLoading = false);
                      }
                    : null,
              ),
              Text(
                'Week ${timetableController.currentWeek} ($formattedStart - $formattedEnd)',
                style:
                    const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              IconButton(
                icon: const Icon(Icons.arrow_forward),
                onPressed: (timetableController.currentWeek < allowedMaxWeek)
                    ? () async {
                        setState(() => _isWeekLoading = true);
                        timetableController.incrementWeek();
                        if (!mounted) return;
                        await timetableController.loadAttendanceForWeek(
                            silent: true);
                        setState(() => _isWeekLoading = false);
                      }
                    : null,
              ),
            ],
          ),
        ),
        // Main content using filteredClasses grouped by day
        Expanded(
          child: _isWeekLoading
              ? const Center(
                  child: CircularProgressIndicator(),
                )
              : ListView(
                  children: [
                    // "Your Classes" Section
                    const Padding(
                      padding:
                          EdgeInsets.symmetric(vertical: 16, horizontal: 16),
                      child: Text(
                        'Your Classes',
                        style: TextStyle(
                            fontSize: 22, fontWeight: FontWeight.bold),
                      ),
                    ),
                    if (yourClasses.isEmpty)
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: Text(
                          'Looks like you have no classes this week!',
                          style:
                              TextStyle(fontSize: 16, color: Colors.grey[700]),
                        ),
                      )
                    else
                      ...yourClasses.map((classInfo) {
                        final attendance =
                            timetableController.attendanceByClass[classInfo.id];
                        final relevantChildIds = (attendance?.attendance ?? [])
                            .where((id) => userStudentIds.contains(id))
                            .toList();
                        return _buildClassCard(
                          classInfo: classInfo,
                          barColor: const Color(0xFF1C71AF),
                          isOwnClass: true,
                          isAdmin: userRole == 'admin',
                          isTutor: userRole == 'tutor',
                          onTap: () {
                            if (userRole == 'parent') {
                              _showParentClassOptionsDialog(
                                classInfo,
                                true, // isOwnClass
                                attendance,
                                userStudentIds,
                                relevantChildIds: relevantChildIds,
                              );
                            } else if (userRole == 'admin') {
                              _showAdminClassOptionsDialog(
                                  classInfo, attendance);
                            } else if (userRole == 'tutor') {
                              _showEditStudentsDialog(classInfo, attendance);
                            }
                          },
                          showStudentNames:
                              (userRole == 'admin' || userRole == 'tutor'),
                          studentIdsToShow: attendance?.attendance ?? [],
                          relevantChildIds: relevantChildIds,
                          attendance: attendance,
                        );
                      }),
                    // "All Classes" Section
                    Padding(
                      padding: const EdgeInsets.symmetric(
                          vertical: 16, horizontal: 16),
                      child: Text(
                        (userRole == 'admin' || userRole == 'tutor')
                            ? 'All Classes'
                            : 'Available Classes',
                        style: const TextStyle(
                            fontSize: 22, fontWeight: FontWeight.bold),
                      ),
                    ),
                    if (sortedDays.isEmpty)
                      const Padding(
                        padding:
                            EdgeInsets.symmetric(vertical: 0, horizontal: 16),
                        child: Text(
                          "No eligible future classes are available this week.",
                          style: TextStyle(fontSize: 16, color: Colors.grey),
                          textAlign: TextAlign.left,
                        ),
                      )
                    else
                      ...sortedDays.map((day) {
                        final dayClasses = classesByDay[day]!;
                        dayClasses
                            .sort((a, b) => a.startTime.compareTo(b.startTime));
                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Padding(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 16, vertical: 8),
                              child: Text(
                                day,
                                style: const TextStyle(
                                    fontSize: 20, fontWeight: FontWeight.bold),
                              ),
                            ),
                            ...dayClasses.map((classInfo) {
                              final attendance = timetableController
                                  .attendanceByClass[classInfo.id];
                              final currentlyEnrolled =
                                  attendance?.attendance.length ?? 0;
                              final spotsRemaining =
                                  classInfo.capacity - currentlyEnrolled;
                              // Use attendance.attendance for isOwnClass in Available Classes section
                              final bool isOwnClass =
                                  (attendance?.attendance ?? [])
                                      .any((id) => userStudentIds.contains(id));
                              final relevantChildIds = isOwnClass
                                  ? ((attendance?.attendance ?? [])
                                      .where(
                                          (id) => userStudentIds.contains(id))
                                      .toList())
                                  : userStudentIds;
                              final bool isPast = timetableController
                                  .computeClassSessionDate(classInfo)
                                  .isBefore(DateTime.now());
                              final bool disableTap =
                                  isPast && userRole != 'admin';
                              return _buildClassCard(
                                classInfo: classInfo,
                                isOwnClass: isOwnClass,
                                isAdmin: userRole == 'admin',
                                isTutor: userRole == 'tutor',
                                barColor: isOwnClass
                                    ? const Color(0xFF1C71AF)
                                    : (spotsRemaining > 1
                                        ? const Color.fromARGB(255, 50, 151, 53)
                                        : (spotsRemaining == 1
                                            ? Colors.amber
                                            : const Color.fromARGB(
                                                255, 244, 51, 37))),
                                onTap: () {
                                  if (disableTap) {
                                    ScaffoldMessenger.of(context)
                                        .showSnackBar(const SnackBar(
                                      content: Text(
                                          "Sorry, you can't interact with past classes!"),
                                      backgroundColor: Colors.red,
                                    ));
                                    return;
                                  }
                                  if (userRole == 'admin') {
                                    _showAdminClassOptionsDialog(
                                        classInfo, attendance);
                                  } else if (userRole == 'tutor') {
                                    _showEditStudentsDialog(
                                        classInfo, attendance);
                                  } else {
                                    _showParentClassOptionsDialog(
                                      classInfo,
                                      isOwnClass,
                                      attendance,
                                      userStudentIds,
                                      relevantChildIds: relevantChildIds,
                                    );
                                  }
                                },
                                showStudentNames: (userRole == 'admin' ||
                                    userRole == 'tutor'),
                                studentIdsToShow: attendance?.attendance ?? [],
                                relevantChildIds:
                                    isOwnClass ? relevantChildIds : null,
                                attendance: attendance,
                              );
                            }),
                          ],
                        );
                      }),
                  ],
                ),
        ),
      ],
    );
  }

  // Build a card for a class.
  Widget _buildClassCard({
    required ClassModel classInfo,
    required Color barColor,
    required VoidCallback onTap,
    required bool isOwnClass,
    required bool showStudentNames,
    List<String>? studentIdsToShow,
    List<String>? relevantChildIds,
    required bool isAdmin,
    required bool isTutor,
    Attendance? attendance,
  }) {
    final timetableController =
        Provider.of<TimetableController>(context, listen: false);

    // Compute the DateTime for this class session.
    DateTime classSessionDateTime =
        timetableController.computeClassSessionDate(classInfo);

    // Check if the class session is in the past.
    bool isPast = classSessionDateTime.isBefore(DateTime.now());
    final bool isCancelled = attendance?.cancelled ?? false;

    final formattedStartTime = DateFormat("h:mm a")
        .format(DateFormat("HH:mm").parse(classInfo.startTime));

    final availability = _parentClassAvailability(
      classInfo: classInfo,
      attendance: attendance,
      timetableController: timetableController,
    );
    final int permanentSpots = availability.permanentSpots;
    final int oneOffSpots = availability.oneOffSpots;

    return GestureDetector(
      onTap: () {
        if (isCancelled && !isAdmin && !isTutor) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('This session has been cancelled.'),
              backgroundColor: Colors.red,
            ),
          );
          return;
        }
        if (isPast && !isAdmin && !isTutor) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                "Sorry, you can't interact with past classes!",
              ),
              backgroundColor: Colors.red,
            ),
          );
          return;
        }
        onTap();
      },
      child: SizedBox(
        width: double.infinity,
        child: Card(
          color: isCancelled ? Colors.red.shade50 : null,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          margin: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
          child: Stack(
            children: [
              Positioned(
                left: 0,
                top: 0,
                bottom: 0,
                child: Container(
                  width: 8,
                  decoration: BoxDecoration(
                    color: isCancelled ? Colors.red : barColor,
                    borderRadius: const BorderRadius.only(
                      topLeft: Radius.circular(10),
                      bottomLeft: Radius.circular(10),
                    ),
                  ),
                ),
              ),
              if (isCancelled)
                Positioned(
                  right: 12,
                  top: 12,
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.red,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: const Text(
                      'CANCELLED',
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 12,
                        letterSpacing: 0.5,
                      ),
                    ),
                  ),
                ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20.0, 16.0, 16.0, 16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (isCancelled)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8.0),
                        child: Text(
                          'This session is cancelled',
                          style: TextStyle(
                            color: Colors.red.shade800,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    Text(
                      '${classInfo.dayOfWeek} $formattedStartTime',
                      style: const TextStyle(
                          fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 8),
                    // --- NEW: Show both permanent and one-off spots ---
                    Row(
                      children: [
                        Text(
                          'Available: ',
                          style:
                              TextStyle(fontSize: 16, color: Colors.grey[700]),
                        ),
                        if (permanentSpots > 0)
                          Container(
                            margin: const EdgeInsets.only(right: 8),
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: Colors.blue[50],
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              'Permanent: $permanentSpots',
                              style: TextStyle(
                                color: Colors.blue[900],
                                fontWeight: FontWeight.w500,
                                fontSize: 14,
                              ),
                            ),
                          ),
                        if (oneOffSpots > 0)
                          Container(
                            margin: const EdgeInsets.only(right: 8),
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: Colors.orange[50],
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              'One-off: $oneOffSpots',
                              style: TextStyle(
                                color: Colors.orange[900],
                                fontWeight: FontWeight.w500,
                                fontSize: 14,
                              ),
                            ),
                          ),
                        if (permanentSpots == 0 && oneOffSpots == 0)
                          Text(
                            '0',
                            style: TextStyle(
                                fontSize: 16, color: Colors.grey[700]),
                          ),
                      ],
                    ),
                    // Tutor assignment and display logic
                    if (attendance != null &&
                        (isAdmin ||
                            isTutor ||
                            (isOwnClass && !isAdmin && !isTutor))) ...[
                      if (attendance.tutors.isEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 8.0),
                          child: Text(
                            isAdmin
                                ? "You need to assign tutors to this class."
                                : "No assigned tutors.",
                            style: const TextStyle(
                              fontSize: 16,
                              color: Colors.red,
                            ),
                          ),
                        )
                      else
                        Padding(
                          padding: const EdgeInsets.only(top: 8.0),
                          child: FutureBuilder<List<String>>(
                            future: Future.wait(
                              attendance.tutors.map((tutorId) =>
                                  Provider.of<AuthController>(context,
                                          listen: false)
                                      .fetchUserFullNameById(tutorId)),
                            ),
                            builder: (context, snapshot) {
                              if (snapshot.connectionState ==
                                  ConnectionState.waiting) {
                                return const Text("Loading tutors...",
                                    style: TextStyle(
                                        fontSize: 16, color: Colors.grey));
                              }
                              if (snapshot.hasError) {
                                return const Text("Error loading tutors",
                                    style: TextStyle(
                                        fontSize: 16, color: Colors.grey));
                              }
                              final tutorNames = snapshot.data ?? [];
                              if (tutorNames.isEmpty) return const SizedBox();
                              return Text(
                                "Tutors: ${tutorNames.join(', ')}",
                                style: TextStyle(
                                    fontSize: 16, color: Colors.grey[700]),
                              );
                            },
                          ),
                        ),
                    ],
                    if (showStudentNames) ...[
                      const SizedBox(height: 8),
                      studentIdsToShow != null && studentIdsToShow.isNotEmpty
                          ? StudentNamesWidget(studentIds: studentIdsToShow)
                          : Text(
                              'Students: [No attendance data]',
                              style: TextStyle(
                                  fontSize: 16, color: Colors.grey[700]),
                            ),
                    ],
                    if (relevantChildIds != null && relevantChildIds.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 8.0),
                        child: _buildYourChildList(relevantChildIds),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // This widget fetches and displays the names of the parent's children in this class.
  Widget _buildYourChildList(List<String> childIds) {
    final authController = Provider.of<AuthController>(context, listen: false);
    return FutureBuilder<List<String>>(
      future: Future.wait(childIds.map((id) async {
        final Student? student = await authController.fetchStudentData(id);
        return student?.firstName ?? "Unknown";
      })),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Text("Loading your child(ren)...",
              style: TextStyle(fontSize: 16, color: Colors.grey));
        }
        if (snapshot.hasError) {
          return const Text(
            "Error loading child data. Please refresh the screen.",
            style: TextStyle(fontSize: 16, color: Colors.red),
          );
        }
        final names = snapshot.data ?? [];
        if (names.isEmpty) return const SizedBox();
        return Text(
          names.join(', '),
          style: const TextStyle(
              fontSize: 16, color: Colors.black, fontWeight: FontWeight.bold),
        );
      },
    );
  }

  // When a class card is tapped, show an options bottom sheet.
  void _showParentClassOptionsDialog(
    ClassModel classInfo,
    bool isOwnClass,
    Attendance? attendance,
    List<String> userStudentIds, {
    List<String>? relevantChildIds,
  }) {
    debugPrint(
        '[TimetableScreen] _showParentClassOptionsDialog: classId=${classInfo.id}, isOwnClass=$isOwnClass');
    if (attendance?.cancelled ?? false) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('This session has been cancelled.'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }
    final timetableController =
        Provider.of<TimetableController>(context, listen: false);
    final attendanceDocId =
        '${timetableController.activeTerm!.id}_W${timetableController.currentWeek}';

    // Determine which children are already enrolled.
    final enrolledChildren = attendance != null
        ? attendance.attendance
            .where((id) => userStudentIds.contains(id))
            .toList()
        : <String>[];
    // Compute the additional children available (i.e. not already enrolled).
    final additionalChildren =
        userStudentIds.where((id) => !enrolledChildren.contains(id)).toList();

    final bool isOneOffBooking = attendance != null &&
        attendance.attendance.any((id) => userStudentIds.contains(id)) &&
        !classInfo.enrolledStudents.any((id) => userStudentIds.contains(id));

    List<ActionOption> options = [];
    if (isOwnClass) {
      if (isOneOffBooking) {
        options = [
          ActionOption("Swap (This Week)"),
          ActionOption("Notify of absence"),
        ];
      } else {
        // For permanent enrollments, show two distinct swap options.
        final termStart = timetableController.activeTerm!.startDate;
        final now = DateTime.now();
        int todayWeek = now.isBefore(termStart)
            ? 1
            : ((now.difference(termStart).inDays ~/ 7) + 1)
                .clamp(1, timetableController.activeTerm!.totalWeeks);
        final int displayedWeek = timetableController.currentWeek;
        final int weeksAhead = displayedWeek - todayWeek;
        final bool allowSwap = weeksAhead >= 0 && weeksAhead <= 1;
        options = [
          ActionOption("Notify of absence"),
          ActionOption("Swap (This Week)",
              enabled: allowSwap,
              hint: allowSwap
                  ? null
                  : "Sorry, you can only swap a one-off class if it is the current or following week"), // one‑week only swap
          ActionOption("Swap (Permanent)"), // update permanent enrolment
        ];
        if (additionalChildren.isNotEmpty &&
            classInfo.capacity - attendance!.attendance.length > 0) {
          options.add(ActionOption(_enrolAnotherThisWeekAction,
              enabled: allowSwap,
              hint: allowSwap
                  ? null
                  : "Sorry, you can only book a one-off class if it is the current or following week."));
        }
        if (additionalChildren.isNotEmpty) {
          options.add(
            ActionOption(
                _additionalPermanentEnrollmentActionForClass(classInfo)),
          );
        }
      }
    } else {
      final availability = _parentClassAvailability(
        classInfo: classInfo,
        attendance: attendance,
        timetableController: timetableController,
      );

      options.add(
        ActionOption(
          _bookOneOffAction,
          enabled: availability.canBookOneOff,
          hint: availability.oneOffDisabledHint,
        ),
      );

      // Permanent
      options.add(
        ActionOption(_permanentEnrollmentActionForClass(classInfo)),
      );
    }

    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16.0)),
      ),
      builder: (context) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12.0),
                child: Text(
                  'Select an Action',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
              ),
              const Divider(height: 1, thickness: 1),
              ...options.map((option) {
                return ListTile(
                  // Grey-out text when disabled
                  title: Text(
                    option.title,
                    style:
                        TextStyle(color: option.enabled ? null : Colors.grey),
                  ),
                  // Always attach onTap
                  onTap: () {
                    Navigator.pop(context);
                    if (option.enabled) {
                      // <— your existing tap‐handling logic here —
                      if (isOwnClass &&
                          (option.title == "Swap (This Week)" ||
                              option.title == "Swap (Permanent)")) {
                        _showChildSelectionDialog(
                          option.title,
                          classInfo,
                          attendanceDocId,
                          isOwnClass
                              ? (relevantChildIds ?? [])
                              : userStudentIds,
                        );
                      } else if (option.title == _enrolAnotherThisWeekAction) {
                        // For additional enrolment, pass the extra (unenrolled) children.
                        final additionalChildren = userStudentIds
                            .where((id) =>
                                !(relevantChildIds?.contains(id) ?? false))
                            .toList();
                        _showChildSelectionDialog(
                          _bookOneOffAction,
                          classInfo,
                          attendanceDocId,
                          additionalChildren,
                        );
                      } else if (option.title == _enrolAnotherPermanentAction ||
                          option.title == _joinWaitlistAnotherAction) {
                        // For additional enrolment, pass the extra (unenrolled) children.
                        final additionalChildren = userStudentIds
                            .where((id) =>
                                !(relevantChildIds?.contains(id) ?? false))
                            .toList();
                        _showChildSelectionDialog(
                          _childSelectionPermanentAction(option.title),
                          classInfo,
                          attendanceDocId,
                          additionalChildren,
                        );
                      } else {
                        // For other actions, follow the existing flow.
                        if (isOwnClass &&
                            (relevantChildIds?.length ?? 0) == 1 &&
                            (option.title == _bookOneOffAction ||
                                _isPermanentEnrollmentAction(option.title))) {
                          _showActionConfirmationDialog(
                            option.title,
                            relevantChildIds!,
                            classInfo,
                            attendanceDocId,
                          );
                        } else {
                          _showChildSelectionDialog(
                            option.title,
                            classInfo,
                            attendanceDocId,
                            isOwnClass
                                ? (relevantChildIds ?? [])
                                : userStudentIds,
                          );
                        }
                      }
                    } else if (option.hint != null) {
                      // show why it’s disabled
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(option.hint!),
                          duration: Duration(seconds: 8),
                        ),
                      );
                    }
                  },
                );
              }),
            ],
          ),
        );
      },
    );
  }

  void _showChildSelectionDialog(
    String action,
    ClassModel classInfo,
    String attendanceDocId,
    List<String> availableChildIds,
  ) {
    List<String> selectedChildIds = [];

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16.0)),
      ),
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setState) {
            return SafeArea(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(
                        vertical: 12.0, horizontal: 12.0),
                    child: Text(
                      "Select Students for '$action'",
                      style: const TextStyle(
                          fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                  ),
                  const Divider(height: 1, thickness: 1),
                  Flexible(
                    child: SingleChildScrollView(
                      child: Column(
                        children: availableChildIds.map((childId) {
                          final isSelected = selectedChildIds.contains(childId);
                          return _buildChildCheckboxTile(
                            childId,
                            isSelected,
                            (bool? value) {
                              setState(() {
                                if (value ?? false) {
                                  selectedChildIds.add(childId);
                                } else {
                                  selectedChildIds.remove(childId);
                                }
                              });
                            },
                          );
                        }).toList(),
                      ),
                    ),
                  ),
                  const Divider(height: 1, thickness: 1),
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8.0),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                      children: [
                        TextButton(
                          onPressed: () => Navigator.pop(context),
                          child: const Text("Cancel"),
                        ),
                        ElevatedButton(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Theme.of(context).primaryColorDark,
                          ),
                          onPressed: selectedChildIds.isEmpty
                              ? null
                              : () {
                                  Navigator.pop(context);
                                  // If this is a swap action, show the class selection dialog.
                                  if (action == "Swap (This Week)" ||
                                      action == "Swap (Permanent)") {
                                    _showNewClassSelectionDialog(
                                      action,
                                      classInfo,
                                      attendanceDocId,
                                      selectedChildIds,
                                    );
                                  } else {
                                    // For other actions, show the standard confirmation.
                                    _showActionConfirmationDialog(
                                      action,
                                      selectedChildIds,
                                      classInfo,
                                      attendanceDocId,
                                    );
                                  }
                                },
                          child: const Text("Confirm",
                              style: TextStyle(color: Colors.white)),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  void _showNewClassSelectionDialog(
    String action,
    ClassModel oldClass,
    String attendanceDocId,
    List<String> selectedChildIds,
  ) {
    final timetableController =
        Provider.of<TimetableController>(context, listen: false);
    final activeTerm = timetableController.activeTerm;
    int currentWeekFromNow = 0;
    if (activeTerm != null) {
      currentWeekFromNow =
          (DateTime.now().difference(activeTerm.startDate).inDays ~/ 7) + 1;
    }
    // Filter out the current class, classes that are full, and classes with a different type.
    final availableClasses = timetableController.allClasses.where((c) {
      if (c.id == oldClass.id) return false;
      if (c.type != oldClass.type) return false;
      // If the action is "Swap (This Week)" and the user is on the current week,
      // filter out classes whose day is before the current class's day.
      if (action == "Swap (Permanent)") {
        if (c.enrolledStudents.length >= c.capacity) {
          return false; //class is full
        }
      } else if (action == "Swap (This Week)" &&
          timetableController.currentWeek == currentWeekFromNow) {
        final classDateTime = timetableController.computeClassSessionDate(c);
        if (classDateTime.isBefore(DateTime.now())) return false;
      }
      final attendance = timetableController.attendanceByClass[c.id];
      final enrolledCount = attendance?.attendance.length ?? 0;
      return enrolledCount < c.capacity;
    }).toList()
      ..sort(
          (a, b) => _dayOffset(a.dayOfWeek).compareTo(_dayOffset(b.dayOfWeek)));

    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16.0)),
      ),
      builder: (context) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Padding(
                padding: EdgeInsets.all(16.0),
                child: Text(
                  "Select a New Class",
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
              ),
              const Divider(height: 1, thickness: 1),
              Flexible(
                child: ListView.separated(
                  shrinkWrap: true,
                  itemCount: availableClasses.length,
                  separatorBuilder: (context, index) => const Divider(),
                  itemBuilder: (context, index) {
                    final newClass = availableClasses[index];
                    final formattedTime = DateFormat("h:mm a").format(
                      DateFormat("HH:mm").parse(newClass.startTime),
                    );
                    final timetableController =
                        Provider.of<TimetableController>(context,
                            listen: false);
                    final attendance =
                        timetableController.attendanceByClass[newClass.id];
                    final currentlyEnrolled =
                        attendance?.attendance.length ?? 0;
                    final availableSpots =
                        newClass.capacity - currentlyEnrolled;
                    return ListTile(
                      title: Text("${newClass.dayOfWeek} $formattedTime"),
                      subtitle: Text("Available Spots: $availableSpots"),
                      onTap: () {
                        Navigator.pop(context);
                        _showSwapConfirmationDialog(
                          action,
                          oldClass,
                          newClass,
                          attendanceDocId,
                          selectedChildIds,
                        );
                      },
                    );
                  },
                ),
              ),
              const SizedBox(height: 16),
            ],
          ),
        );
      },
    );
  }

  Future<List<String>> _fetchChildNames(
      List<String> childIds, BuildContext context) async {
    final authController = Provider.of<AuthController>(context, listen: false);
    final List<Student?> students = await Future.wait(
        childIds.map((id) => authController.fetchStudentData(id)));
    return students.map((student) => student?.firstName ?? "Unknown").toList();
  }

  // This dialog confirms the parent's selection before making the backend call.
  void _showActionConfirmationDialog(
    String action,
    List<String> selectedChildIds,
    ClassModel classInfo,
    String attendanceDocId,
  ) {
    bool isLoading = false; // Moved outside StatefulBuilder

    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16.0)),
      ),
      builder: (context) {
        return SafeArea(
          child: FutureBuilder<List<String>>(
            future: _fetchChildNames(selectedChildIds, context),
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Padding(
                  padding: EdgeInsets.all(16.0),
                  child: Center(child: CircularProgressIndicator()),
                );
              }
              if (snapshot.hasError) {
                return Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Text("Error loading child names: ${snapshot.error}"),
                );
              }
              final childNames = snapshot.data ?? [];
              return StatefulBuilder(
                builder: (context, setState) {
                  return Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 12.0),
                        child: Text(
                          "Confirm '$action'",
                          style: const TextStyle(
                              fontSize: 18, fontWeight: FontWeight.bold),
                        ),
                      ),
                      const Divider(height: 1, thickness: 1),
                      Padding(
                        padding: const EdgeInsets.all(16.0),
                        child: Builder(
                          builder: (context) {
                            final authController = Provider.of<AuthController>(
                                context,
                                listen: false);
                            final parentUser =
                                authController.currentUser as Parent;
                            final tokens = parentUser.lessonTokens;
                            String message;

                            if (action == _bookOneOffAction ||
                                action == _enrolAnotherThisWeekAction) {
                              if (tokens == 0) {
                                message =
                                    "Are you sure you want to book a one-off class for ${childNames.join(', ')}?\n\nYou have no lesson tokens available. You will be prompted to pay for all bookings.";
                              } else if (tokens >= childNames.length) {
                                message =
                                    "Are you sure you want to book a one-off class for ${childNames.join(', ')}?\n\nYou have $tokens lesson token${tokens > 1 ? 's' : ''} available. ${childNames.length == 1 ? 'One token will be used.' : '${childNames.length} tokens will be used.'}";
                              } else {
                                final toPay = childNames.length - tokens;
                                message =
                                    "Are you sure you want to book a one-off class for ${childNames.join(', ')}?\n\nYou have $tokens lesson token${tokens > 1 ? 's' : ''} available. $tokens will be used, and you will be prompted to pay for the remaining $toPay booking${toPay > 1 ? 's' : ''}.";
                              }
                            } else if (_isPermanentEnrollmentAction(action)) {
                              final timetableController =
                                  Provider.of<TimetableController>(context,
                                      listen: false);
                              final activeTerm = timetableController.activeTerm;
                              final weeksRemaining = activeTerm != null
                                  ? activeTerm.totalWeeks -
                                      timetableController.currentWeek +
                                      1
                                  : 1;
                              if (action == _joinWaitlistAction ||
                                  action == _joinWaitlistAnotherAction) {
                                final reason = classInfo.enrollmentState ==
                                        ClassEnrollmentState.full
                                    ? "This class is at permanent capacity."
                                    : "This class is not open for permanent enrolment yet because it needs at least ${classInfo.minimumStudentsToOpen} students.";
                                message =
                                    "$reason\n\n${childNames.join(', ')} will be added to the waitlist. You won't be charged unless a permanent place is confirmed.";
                              } else if (classInfo.enrollmentState ==
                                  ClassEnrollmentState.pending) {
                                message =
                                    "This class is not open for permanent enrolment yet because it needs at least ${classInfo.minimumStudentsToOpen} students.\n\n${childNames.join(', ')} will be added to the waitlist. You won't be charged unless a permanent place is confirmed.";
                              } else if (classInfo.enrollmentState ==
                                  ClassEnrollmentState.full) {
                                message =
                                    "This class is at permanent capacity.\n\n${childNames.join(', ')} will be added to the waitlist. You won't be charged unless a permanent place is confirmed.";
                              } else {
                                final spotsToEnrol =
                                    classInfo.permanentSpotsRemaining <
                                            childNames.length
                                        ? classInfo.permanentSpotsRemaining
                                        : childNames.length;
                                final waitlistCount =
                                    childNames.length - spotsToEnrol;
                                final totalSessions =
                                    spotsToEnrol * weeksRemaining;

                                if (waitlistCount > 0) {
                                  message =
                                      "There ${spotsToEnrol == 1 ? 'is' : 'are'} only $spotsToEnrol permanent spot${spotsToEnrol == 1 ? '' : 's'} available.\n\nYou will only be charged for confirmed permanent enrolments. Any remaining selected student${waitlistCount == 1 ? '' : 's'} will be added to the waitlist.";
                                } else if (tokens == 0) {
                                  message =
                                      "Are you sure you want to permanently enrol ${childNames.join(', ')}?\n\nYou have no lesson tokens available. You will be invoiced for all $totalSessions sessions.";
                                } else if (tokens >= totalSessions) {
                                  message =
                                      "Are you sure you want to permanently enrol ${childNames.join(', ')}?\n\nYou have $tokens lesson token${tokens > 1 ? 's' : ''} available. $totalSessions token${totalSessions > 1 ? 's will' : ' will'} be used for the entire term. No additional payment will be required.";
                                } else {
                                  final toInvoice = totalSessions - tokens;
                                  message =
                                      "Are you sure you want to permanently enrol ${childNames.join(', ')}?\n\nYou have $tokens lesson token${tokens > 1 ? 's' : ''} available. $tokens will be used, and you will be invoiced for the remaining $toInvoice session${toInvoice > 1 ? 's' : ''}.";
                                }
                              }
                            } else {
                              message =
                                  "Are you sure you want to confirm '$action' for ${childNames.join(', ')}?";
                            }

                            return Text(
                              message,
                              style: const TextStyle(fontSize: 16),
                            );
                          },
                        ),
                      ),
                      const Divider(height: 1, thickness: 1),
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8.0),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                          children: [
                            TextButton(
                              onPressed: isLoading
                                  ? null
                                  : () => Navigator.pop(context),
                              child: const Text("Cancel"),
                            ),
                            ElevatedButton(
                              style: ElevatedButton.styleFrom(
                                backgroundColor:
                                    Theme.of(context).primaryColorDark,
                              ),
                              onPressed: isLoading
                                  ? null
                                  : () async {
                                      final guardAction =
                                          action == "Notify of absence"
                                              ? 'notify an absence'
                                              : action.toLowerCase();
                                      final timetableController =
                                          Provider.of<TimetableController>(
                                              context,
                                              listen: false);
                                      final authController =
                                          Provider.of<AuthController>(context,
                                              listen: false);
                                      final parentUser =
                                          authController.currentUser as Parent;
                                      final parentId = parentUser.uid;
                                      if (!await OfflineActionGuard
                                          .ensureOnline(
                                        context,
                                        action: guardAction,
                                      )) {
                                        return;
                                      }
                                      if (!context.mounted) return;
                                      setState(() => isLoading = true);
                                      var didPopSheet = false;
                                      var refreshAttendanceAfterClose = false;

                                      try {
                                        if (action == _bookOneOffAction ||
                                            action ==
                                                _enrolAnotherThisWeekAction) {
                                          refreshAttendanceAfterClose =
                                              await _processOneOffBooking(
                                            classInfo,
                                            selectedChildIds,
                                            attendanceDocId,
                                          );
                                        } else if (action ==
                                            "Notify of absence") {
                                          // Both actions do the same: remove the student from this week's attendance
                                          bool anyTokenAwarded = false;
                                          for (var childId
                                              in selectedChildIds) {
                                            bool tokenAwarded =
                                                await timetableController
                                                    .notifyAbsence(
                                                        classId: classInfo.id,
                                                        studentId: childId,
                                                        attendanceDocId:
                                                            attendanceDocId,
                                                        parentId: parentId);
                                            if (tokenAwarded) {
                                              anyTokenAwarded = true;
                                            }
                                          }

                                          await timetableController
                                              .loadAttendanceForWeek();

                                          // Show a snackbar based on whether a token was awarded.
                                          if (!context.mounted) return;
                                          ScaffoldMessenger.of(context)
                                              .showSnackBar(
                                            SnackBar(
                                              content: Text(anyTokenAwarded
                                                  ? "Absence notified! You have been awarded a lesson token."
                                                  : "Absence notified! No lesson token awarded as notification was after 10 AM."),
                                            ),
                                          );
                                          await authController
                                              .refreshCurrentUser();
                                        } else if (_isWaitlistOnlyAction(
                                            action)) {
                                          await _processParentWaitlistJoin(
                                            classInfo,
                                            selectedChildIds,
                                          );
                                          await timetableController
                                              .loadAttendanceForWeek();
                                        } else if (_isPermanentEnrollmentAction(
                                            action)) {
                                          await _processParentPermanentEnrollment(
                                            classInfo,
                                            selectedChildIds,
                                          );
                                          await timetableController
                                              .loadAttendanceForWeek();
                                        } else if (action ==
                                            "Enrol another student") {}
                                        if (context.mounted) {
                                          Navigator.pop(
                                              context); // Close the dialog
                                          didPopSheet = true;
                                        }
                                        if (refreshAttendanceAfterClose) {
                                          unawaited(timetableController
                                              .loadAttendanceForWeek(
                                                  silent: true));
                                        }
                                      } catch (e, st) {
                                        debugPrint(
                                            '[TimetableScreen] confirm action error: $e\n$st');
                                        if (context.mounted) {
                                          ScaffoldMessenger.of(context)
                                              .showSnackBar(
                                            const SnackBar(
                                              content: Text(
                                                "The action could not be completed. Please try again.",
                                                style: TextStyle(
                                                    color: Colors.white),
                                              ),
                                              backgroundColor: Colors.red,
                                            ),
                                          );
                                        }
                                      } finally {
                                        if (!didPopSheet && context.mounted) {
                                          setState(() => isLoading = false);
                                        }
                                      }
                                    },
                              child: isLoading
                                  ? const SizedBox(
                                      width: 20,
                                      height: 20,
                                      child: CircularProgressIndicator(
                                        color: Colors.white,
                                        strokeWidth: 2,
                                      ),
                                    )
                                  : const Text("Confirm",
                                      style: TextStyle(color: Colors.white)),
                            ),
                          ],
                        ),
                      ),
                    ],
                  );
                },
              );
            },
          ),
        );
      },
    );
  }

  Widget _buildChildCheckboxTile(
      String childId, bool isSelected, Function(bool?) onChanged) {
    final authController = Provider.of<AuthController>(context, listen: false);
    return FutureBuilder<Student?>(
      future: authController.fetchStudentData(childId),
      builder: (context, snapshot) {
        String childName = "Loading...";
        if (snapshot.hasData) {
          final Student? student = snapshot.data;
          childName = student?.firstName ?? "Unknown";
        } else if (snapshot.hasError) {
          childName = "Unknown";
        }
        return CheckboxListTile(
          title: Text(childName),
          value: isSelected,
          onChanged: onChanged,
        );
      },
    );
  }

  void _showSwapConfirmationDialog(
    String action,
    ClassModel oldClass,
    ClassModel newClass,
    String attendanceDocId,
    List<String> selectedChildIds,
  ) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16.0)),
      ),
      builder: (context) {
        return SafeArea(
          child: FutureBuilder<List<String>>(
            future: _fetchChildNames(selectedChildIds, context),
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Padding(
                  padding: EdgeInsets.all(16.0),
                  child: Center(child: CircularProgressIndicator()),
                );
              }
              if (snapshot.hasError) {
                return Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Text("Error loading child names: ${snapshot.error}"),
                );
              }
              final childNames = snapshot.data ?? [];
              final oldTime = DateFormat("h:mm a")
                  .format(DateFormat("HH:mm").parse(oldClass.startTime));
              final newTime = DateFormat("h:mm a")
                  .format(DateFormat("HH:mm").parse(newClass.startTime));
              return Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12.0),
                    child: Text(
                      "Confirm '$action'",
                      style: const TextStyle(
                          fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                  ),
                  const Divider(height: 1, thickness: 1),
                  Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Text(
                      "Swap from ${oldClass.dayOfWeek} at $oldTime to ${newClass.dayOfWeek} at $newTime for ${childNames.join(', ')}?",
                      style: const TextStyle(fontSize: 16),
                    ),
                  ),
                  const Divider(height: 1, thickness: 1),
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8.0),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                      children: [
                        TextButton(
                          onPressed: () => Navigator.pop(context),
                          child: const Text("Cancel"),
                        ),
                        ElevatedButton(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Theme.of(context).primaryColorDark,
                          ),
                          onPressed: () async {
                            if (!await _ensureOnlineFor('swap classes')) {
                              return;
                            }
                            Navigator.pop(context);
                            final timetableController =
                                Provider.of<TimetableController>(context,
                                    listen: false);
                            if (action == "Swap (This Week)") {
                              // One‑week swap: update the attendance doc only.
                              for (var childId in selectedChildIds) {
                                await timetableController
                                    .rescheduleToDifferentClass(
                                  oldClassId: oldClass.id,
                                  oldAttendanceDocId: attendanceDocId,
                                  newClassId: newClass.id,
                                  newAttendanceDocId: attendanceDocId,
                                  studentId: childId,
                                );
                              }
                            } else if (action == "Swap (Permanent)") {
                              // Permanent swap: update the permanent enrolment.
                              for (var childId in selectedChildIds) {
                                await timetableController
                                    .swapPermanentEnrollment(
                                  oldClassId: oldClass.id,
                                  newClassId: newClass.id,
                                  studentId: childId,
                                );
                              }
                            }
                            await timetableController.loadAttendanceForWeek();
                          },
                          child: const Text("Confirm",
                              style: TextStyle(color: Colors.white)),
                        ),
                      ],
                    ),
                  ),
                ],
              );
            },
          ),
        );
      },
    );
  }

  void _showAdminCancelClassConfirmation(ClassModel classInfo) {
    showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: const Text("Cancel Class"),
          content: Text(
              "Are you sure you want to cancel (delete) the class '${classInfo.type}' on ${classInfo.dayOfWeek}?"),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text("No"),
            ),
            TextButton(
              onPressed: () async {
                if (!await _ensureOnlineFor('delete this class')) {
                  return;
                }
                Navigator.pop(ctx); // close confirmation dialog
                final timetableController =
                    Provider.of<TimetableController>(context, listen: false);
                await timetableController.deleteClass(classInfo.id);
                await timetableController.loadAllClasses();
                if (!mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text("Class cancelled.")),
                );
              },
              child: const Text("Yes"),
            ),
          ],
        );
      },
    );
  }

  void _showEditStudentsDialog(ClassModel classInfo, Attendance? attendance) {
    final screenContext = context;
    final authController = Provider.of<AuthController>(context, listen: false);
    final timetableController =
        Provider.of<TimetableController>(context, listen: false);
    final isAdmin = authController.currentUser?.role == 'admin';
    final isTutor = authController.currentUser?.role == 'tutor';

    // Copy attendance list for editing
    Attendance? editableAttendance = attendance;
    List<String> presentStudentIds = List.from(attendance?.attendance ?? []);

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16.0)),
      ),
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setState) {
            var currentClassInfo = classInfo;
            for (final candidate in timetableController.allClasses) {
              if (candidate.id == classInfo.id) {
                currentClassInfo = candidate;
                break;
              }
            }
            final currentAttendance = editableAttendance ??
                timetableController.attendanceByClass[classInfo.id];
            final Set<String> allStudentIds = {
              ...currentClassInfo.enrolledStudents,
              ...(currentAttendance?.attendance ?? []),
            };

            return SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text(
                        "Edit Students & Attendance",
                        style: TextStyle(
                            fontSize: 20, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 16),
                      if (isAdmin)
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            ElevatedButton(
                              onPressed: () async {
                                final enrolled = await _showEnrollStudentDialog(
                                  classInfo,
                                  screenContext,
                                );
                                if (!enrolled || !context.mounted) return;
                                editableAttendance = timetableController
                                        .attendanceByClass[classInfo.id] ??
                                    editableAttendance;
                                presentStudentIds = List.from(
                                    editableAttendance?.attendance ??
                                        presentStudentIds);
                                // Rebuild the open sheet after the helper refreshes attendance.
                                setState(() {});
                              },
                              child: const Text("Add Student"),
                            ),
                          ],
                        ),
                      if (isAdmin) const SizedBox(height: 16),
                      // Combined student list
                      FutureBuilder<List<Student?>>(
                        future: Future.wait(allStudentIds
                            .map((id) => authController.fetchStudentData(id))),
                        builder: (context, snapshot) {
                          if (snapshot.connectionState ==
                              ConnectionState.waiting) {
                            return const Center(
                                child: CircularProgressIndicator());
                          }
                          final students = snapshot.data ?? [];
                          if (students.isEmpty) {
                            return const Text("No students enrolled.");
                          }
                          return ListView.builder(
                            shrinkWrap: true,
                            physics: const NeverScrollableScrollPhysics(),
                            itemCount: students.length,
                            itemBuilder: (context, index) {
                              final student = students[index];
                              if (student == null) return const SizedBox();
                              final isPresent =
                                  presentStudentIds.contains(student.id);
                              final isPermanent = currentClassInfo
                                  .enrolledStudents
                                  .contains(student.id);
                              return ListTile(
                                leading: Checkbox(
                                  value: isPresent,
                                  onChanged: (val) {
                                    setState(() {
                                      if (val == true) {
                                        presentStudentIds.add(student.id);
                                      } else {
                                        presentStudentIds.remove(student.id);
                                      }
                                    });
                                  },
                                ),
                                title: Text(
                                    '${student.firstName} ${student.lastName}'),
                                subtitle:
                                    Text(isPermanent ? "Permanent" : "One-off"),
                                onTap: () {
                                  //Close sheet first
                                  Navigator.pop(context);
                                  Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                          builder: (_) => FeedbackScreen(
                                              studentId: student.id)));
                                },
                                trailing: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    if (isAdmin)
                                      IconButton(
                                        icon: const Icon(Icons.delete,
                                            color: Colors.red),
                                        onPressed: () async {
                                          final studentName =
                                              '${student.firstName} ${student.lastName}';
                                          final removalOption =
                                              await showModalBottomSheet<
                                                  String>(
                                            context: context,
                                            shape: const RoundedRectangleBorder(
                                              borderRadius:
                                                  BorderRadius.vertical(
                                                      top: Radius.circular(
                                                          16.0)),
                                            ),
                                            builder: (context) {
                                              return SafeArea(
                                                child: Column(
                                                  mainAxisSize:
                                                      MainAxisSize.min,
                                                  children: [
                                                    const Padding(
                                                      padding:
                                                          EdgeInsets.all(16.0),
                                                      child: Text(
                                                        "Remove Enrollment",
                                                        style: TextStyle(
                                                          fontSize: 18,
                                                          fontWeight:
                                                              FontWeight.bold,
                                                        ),
                                                      ),
                                                    ),
                                                    if (isPermanent)
                                                      ListTile(
                                                        title: const Text(
                                                            "Remove permanently"),
                                                        onTap: () {
                                                          Navigator.pop(context,
                                                              "permanent");
                                                        },
                                                      ),
                                                    if (!isPermanent)
                                                      ListTile(
                                                        title: const Text(
                                                            "Remove one-off"),
                                                        onTap: () {
                                                          Navigator.pop(context,
                                                              "oneoff");
                                                        },
                                                      ),
                                                    ListTile(
                                                      title: const Text(
                                                          "Cancel",
                                                          style: TextStyle(
                                                              color:
                                                                  Colors.red)),
                                                      onTap: () {
                                                        Navigator.pop(
                                                            context, null);
                                                      },
                                                    ),
                                                  ],
                                                ),
                                              );
                                            },
                                          );
                                          if (removalOption == null) return;
                                          if (!context.mounted) return;
                                          if (removalOption == "permanent" &&
                                              isPermanent) {
                                            bool confirmed =
                                                await _showConfirmDialog(
                                                    "Remove $studentName permanently?");
                                            if (confirmed) {
                                              if (!await _ensureOnlineFor(
                                                  'remove this enrolment')) {
                                                return;
                                              }
                                              await timetableController
                                                  .unenrollStudentPermanent(
                                                classId: classInfo.id,
                                                studentId: student.id,
                                              );
                                              await timetableController
                                                  .loadAttendanceForWeek();
                                              setState(() {
                                                presentStudentIds
                                                    .remove(student.id);
                                              });
                                            }
                                          } else if (removalOption ==
                                                  "oneoff" &&
                                              !isPermanent) {
                                            bool confirmed =
                                                await _showConfirmDialog(
                                                    "Remove $studentName from this week's attendance?");
                                            if (confirmed) {
                                              if (!await _ensureOnlineFor(
                                                  'remove this one-off booking')) {
                                                return;
                                              }
                                              await timetableController
                                                  .cancelStudentForWeek(
                                                classId: classInfo.id,
                                                studentId: student.id,
                                                attendanceDocId:
                                                    currentAttendance?.id ?? '',
                                              );
                                              await timetableController
                                                  .loadAttendanceForWeek();
                                              editableAttendance =
                                                  timetableController
                                                          .attendanceByClass[
                                                      classInfo.id];
                                              setState(() {
                                                presentStudentIds
                                                    .remove(student.id);
                                              });
                                            }
                                          }
                                        },
                                      ),
                                    if (isAdmin || isTutor)
                                      IconButton(
                                        icon: const Icon(
                                            Icons.feedback_outlined,
                                            color: Colors.blue),
                                        onPressed: () async {
                                          String feedbackSubject = '';
                                          String feedbackMessage = '';
                                          await showDialog(
                                            context: context,
                                            builder: (ctx) {
                                              var isSubmitting = false;
                                              return StatefulBuilder(
                                                builder: (context, setState) {
                                                  return AlertDialog(
                                                    title: const Text(
                                                        "Post Feedback"),
                                                    content: Column(
                                                      mainAxisSize:
                                                          MainAxisSize.min,
                                                      children: [
                                                        TextField(
                                                          enabled:
                                                              !isSubmitting,
                                                          autofocus: true,
                                                          maxLines: 1,
                                                          textCapitalization:
                                                              TextCapitalization
                                                                  .sentences,
                                                          decoration:
                                                              const InputDecoration(
                                                            labelText:
                                                                "Subject",
                                                            hintText:
                                                                "Enter subject",
                                                          ),
                                                          onChanged: (val) {
                                                            setState(() {
                                                              feedbackSubject =
                                                                  val;
                                                            });
                                                          },
                                                        ),
                                                        const SizedBox(
                                                            height: 8),
                                                        TextField(
                                                          enabled:
                                                              !isSubmitting,
                                                          maxLines: 4,
                                                          textCapitalization:
                                                              TextCapitalization
                                                                  .sentences,
                                                          decoration:
                                                              const InputDecoration(
                                                            labelText:
                                                                "Message",
                                                            hintText:
                                                                "Enter feedback message",
                                                          ),
                                                          onChanged: (val) {
                                                            setState(() {
                                                              feedbackMessage =
                                                                  val;
                                                            });
                                                          },
                                                        ),
                                                      ],
                                                    ),
                                                    actions: [
                                                      TextButton(
                                                        onPressed: isSubmitting
                                                            ? null
                                                            : () {
                                                                Navigator.pop(
                                                                    ctx);
                                                              },
                                                        child: const Text(
                                                            "Cancel"),
                                                      ),
                                                      ElevatedButton(
                                                        onPressed: (isSubmitting ||
                                                                feedbackSubject
                                                                    .trim()
                                                                    .isEmpty ||
                                                                feedbackMessage
                                                                    .trim()
                                                                    .isEmpty)
                                                            ? null
                                                            : () async {
                                                                setState(() =>
                                                                    isSubmitting =
                                                                        true);
                                                                final navigator =
                                                                    Navigator.of(
                                                                        context);
                                                                final messenger =
                                                                    ScaffoldMessenger.of(
                                                                        context);
                                                                final feedbackController =
                                                                    Provider.of<
                                                                            FeedbackController>(
                                                                        context,
                                                                        listen:
                                                                            false);
                                                                try {
                                                                  if (!await _ensureOnlineFor(
                                                                      'add feedback')) {
                                                                    if (context
                                                                        .mounted) {
                                                                      setState(() =>
                                                                          isSubmitting =
                                                                              false);
                                                                    }
                                                                    return;
                                                                  }
                                                                  final currentUser =
                                                                      authController
                                                                          .currentUser;
                                                                  final feedback =
                                                                      StudentFeedback(
                                                                    id: UniqueKey()
                                                                        .toString(),
                                                                    studentId:
                                                                        student
                                                                            .id,
                                                                    tutorId:
                                                                        currentUser?.uid ??
                                                                            '',
                                                                    parentIds:
                                                                        student
                                                                            .parents,
                                                                    subject:
                                                                        feedbackSubject
                                                                            .trim(),
                                                                    feedback:
                                                                        feedbackMessage
                                                                            .trim(),
                                                                    createdAt:
                                                                        DateTime
                                                                            .now(),
                                                                    isUnread:
                                                                        true,
                                                                  );
                                                                  await feedbackController
                                                                      .addFeedback(
                                                                          feedback);
                                                                } catch (_) {
                                                                  if (!context
                                                                      .mounted) {
                                                                    return;
                                                                  }
                                                                  setState(() =>
                                                                      isSubmitting =
                                                                          false);
                                                                  messenger
                                                                      .showSnackBar(
                                                                    const SnackBar(
                                                                      content: Text(
                                                                          "Failed to post feedback. Please try again."),
                                                                      backgroundColor:
                                                                          Colors
                                                                              .red,
                                                                    ),
                                                                  );
                                                                  return;
                                                                }
                                                                if (context
                                                                    .mounted) {
                                                                  navigator
                                                                      .pop();
                                                                  navigator
                                                                      .pop();
                                                                  messenger
                                                                      .showSnackBar(
                                                                    const SnackBar(
                                                                        content:
                                                                            Text("Feedback posted!")),
                                                                  );
                                                                }
                                                              },
                                                        child: isSubmitting
                                                            ? const SizedBox(
                                                                width: 18,
                                                                height: 18,
                                                                child:
                                                                    CircularProgressIndicator(
                                                                  strokeWidth:
                                                                      2,
                                                                ),
                                                              )
                                                            : const Text(
                                                                "Submit"),
                                                      ),
                                                    ],
                                                  );
                                                },
                                              );
                                            },
                                          );
                                        },
                                      ),
                                  ],
                                ),
                              );
                            },
                          );
                        },
                      ),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: () async {
                          if (!await _ensureOnlineFor('update attendance')) {
                            return;
                          }
                          // Save attendance
                          final attendanceToUpdate = editableAttendance;
                          if (attendanceToUpdate != null) {
                            final updatedAttendance =
                                attendanceToUpdate.copyWith(
                              attendance: presentStudentIds,
                              updatedAt: DateTime.now(),
                              updatedBy: authController.currentUser?.uid ?? '',
                            );
                            await timetableController.updateAttendanceDoc(
                                updatedAttendance, classInfo.id);
                            await timetableController.loadAttendanceForWeek();
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                    content: Text("Attendance updated.")),
                              );
                            }
                          }
                          if (context.mounted) {
                            Navigator.pop(context);
                          }
                        },
                        child: const Text("Confirm Attendance"),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }

  void _showAdminClassOptionsDialog(
      ClassModel classInfo, Attendance? attendance) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16.0)),
      ),
      builder: (context) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                title: const Text("View/Edit Students"),
                onTap: () {
                  Navigator.pop(context);
                  _showEditStudentsDialog(classInfo, attendance);
                },
              ),
              ListTile(
                title: const Text("View/Edit Tutors"),
                onTap: () {
                  Navigator.pop(context);
                  _showEditTutorsDialog(classInfo, attendance);
                },
              ),
              ListTile(
                title: const Text("View Waitlist"),
                onTap: () {
                  Navigator.pop(context);
                  _showAdminWaitlistDialog(classInfo);
                },
              ),
              ListTile(
                title: Text(
                  (attendance?.cancelled ?? false)
                      ? 'Uncancel This Session'
                      : 'Cancel This Session',
                  style: const TextStyle(color: Colors.red),
                ),
                onTap: () async {
                  Navigator.pop(context);

                  final timetableController = Provider.of<TimetableController>(
                      this.context,
                      listen: false);
                  final authController =
                      Provider.of<AuthController>(this.context, listen: false);

                  final termId = timetableController.activeTerm?.id;
                  if (termId == null) {
                    if (!this.context.mounted) return;
                    ScaffoldMessenger.of(this.context).showSnackBar(
                      const SnackBar(
                        content: Text('No active term found.'),
                        backgroundColor: Colors.red,
                      ),
                    );
                    return;
                  }

                  final attendanceDocId =
                      '${termId}_W${timetableController.currentWeek}';
                  final updatedBy = authController.currentUser?.uid ?? 'system';

                  await timetableController.toggleSessionCancelled(
                    classId: classInfo.id,
                    attendanceDocId: attendanceDocId,
                    updatedBy: updatedBy,
                  );
                  await timetableController.loadAttendanceForWeek(silent: true);

                  if (!this.context.mounted) return;
                  final isNowCancelled = timetableController
                          .attendanceByClass[classInfo.id]?.cancelled ??
                      false;
                  ScaffoldMessenger.of(this.context).showSnackBar(
                    SnackBar(
                      content: Text(isNowCancelled
                          ? 'Session cancelled.'
                          : 'Session uncancelled.'),
                    ),
                  );
                },
              ),
              ListTile(
                title: const Text(
                  "Cancel Class",
                  style: TextStyle(color: Colors.red),
                ),
                onTap: () {
                  Navigator.pop(context);
                  _showAdminCancelClassConfirmation(classInfo);
                },
              ),
            ],
          ),
        );
      },
    );
  }

  void _showAdminWaitlistDialog(ClassModel classInfo) {
    var waitlistFuture = _loadWaitlistDisplayData(classInfo.id);

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16.0)),
      ),
      builder: (context) {
        final formattedStartTime = DateFormat("h:mm a")
            .format(DateFormat("HH:mm").parse(classInfo.startTime));

        return SafeArea(
          child: StatefulBuilder(
            builder: (context, setModalState) {
              void refreshWaitlist() {
                if (!context.mounted) return;
                setModalState(() {
                  waitlistFuture = _loadWaitlistDisplayData(classInfo.id);
                });
              }

              return FractionallySizedBox(
                heightFactor: 0.8,
                child: Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  'Waitlist',
                                  style: TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  '${classInfo.dayOfWeek} $formattedStartTime · ${classInfo.type}',
                                  style: TextStyle(
                                    color: Colors.grey[700],
                                    fontSize: 14,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          IconButton(
                            icon: const Icon(Icons.refresh),
                            onPressed: refreshWaitlist,
                          ),
                          IconButton(
                            icon: const Icon(Icons.close),
                            onPressed: () => Navigator.pop(context),
                          ),
                        ],
                      ),
                    ),
                    const Divider(height: 1, thickness: 1),
                    Expanded(
                      child: FutureBuilder<List<_WaitlistEntryDisplayData>>(
                        future: waitlistFuture,
                        builder: (context, snapshot) {
                          if (snapshot.connectionState ==
                              ConnectionState.waiting) {
                            return const Center(
                                child: CircularProgressIndicator());
                          }
                          if (snapshot.hasError) {
                            return Padding(
                              padding: const EdgeInsets.all(16.0),
                              child: Text(
                                'Error loading waitlist: ${snapshot.error}',
                                style: const TextStyle(color: Colors.red),
                              ),
                            );
                          }

                          final entries = snapshot.data ?? [];
                          if (entries.isEmpty) {
                            return const Center(
                              child: Padding(
                                padding: EdgeInsets.all(16.0),
                                child: Text(
                                  'No waitlist entries for this class.',
                                  textAlign: TextAlign.center,
                                ),
                              ),
                            );
                          }

                          return ListView.separated(
                            itemCount: entries.length,
                            separatorBuilder: (_, __) =>
                                const Divider(height: 1),
                            itemBuilder: (context, index) {
                              return _buildAdminWaitlistEntryTile(
                                entries[index],
                                onPromote: () async {
                                  final shouldRefresh =
                                      await _confirmAndPromoteWaitlistEntry(
                                    entries[index],
                                  );
                                  if (shouldRefresh) {
                                    refreshWaitlist();
                                  }
                                },
                              );
                            },
                          );
                        },
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        );
      },
    );
  }

  Future<bool> _confirmAndPromoteWaitlistEntry(
    _WaitlistEntryDisplayData data,
  ) async {
    final entry = data.entry;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('Promote Student'),
          content: Text(
            'Promote ${data.studentName} into this class as a permanent enrolment?',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: Theme.of(context).primaryColorDark,
              ),
              onPressed: () => Navigator.pop(dialogContext, true),
              child: const Text(
                'Promote',
                style: TextStyle(color: Colors.white),
              ),
            ),
          ],
        );
      },
    );

    if (confirmed != true) return false;
    if (!mounted) return false;
    if (!await _ensureOnlineFor('promote this waitlist entry')) return false;

    final timetableController = context.read<TimetableController>();
    final result = await timetableController.promoteWaitlistEntry(
      entryId: entry.id,
    );

    if (!mounted) return true;

    final message = result == null
        ? 'Promotion could not be processed.'
        : _waitlistPromotionOutcomeMessage(result, data.studentName);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );

    return result != null;
  }

  Widget _buildAdminWaitlistEntryTile(
    _WaitlistEntryDisplayData data, {
    required Future<void> Function() onPromote,
  }) {
    final entry = data.entry;
    final statusColor = _waitlistStatusColor(entry.status);
    final canPromote = _canPromoteWaitlistStatus(entry.status);

    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      title: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text(
              data.studentName,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: statusColor.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              _waitlistStatusLabel(entry.status),
              style: TextStyle(
                color: statusColor,
                fontWeight: FontWeight.w600,
                fontSize: 12,
              ),
            ),
          ),
        ],
      ),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 6),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Parent: ${data.parentName}'),
            Text(
              'Position: ${entry.position} · Reason: ${_waitlistReasonLabel(entry.reason)}',
            ),
            Text('Joined: ${_formatWaitlistDate(entry.createdAt)}'),
            Text('Updated: ${_formatWaitlistDate(entry.updatedAt)}'),
            if (entry.offeredAt != null)
              Text('Offered: ${_formatWaitlistDate(entry.offeredAt)}'),
            if (entry.offerExpiresAt != null)
              Text(
                  'Offer expires: ${_formatWaitlistDate(entry.offerExpiresAt)}'),
            if (entry.promotedAt != null)
              Text('Promoted: ${_formatWaitlistDate(entry.promotedAt)}'),
            if (canPromote) ...[
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerLeft,
                child: ElevatedButton(
                  onPressed: () async {
                    await onPromote();
                  },
                  child: const Text('Promote'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  void _showEditTutorsDialog(
      ClassModel classInfo, Attendance? attendance) async {
    final authController = Provider.of<AuthController>(context, listen: false);
    final tutors = await authController.fetchAllTutors();

    final timetableController =
        Provider.of<TimetableController>(context, listen: false);

    final initialTutorIds = List<String>.from(
      (attendance?.tutors.isNotEmpty ?? false)
          ? attendance!.tutors
          : classInfo.tutors,
    );

    List<String> updatedTutorIds = List.from(initialTutorIds);
    String applyTo = 'class'; // 'class' | 'day'
    String effective = 'week'; // 'week' | 'permanent'

    if (!mounted) return;
    showDialog(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setState) {
            return AlertDialog(
              title: const Text('Select Tutors'),
              content: SizedBox(
                width: double.maxFinite,
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      ConstrainedBox(
                        constraints: const BoxConstraints(maxHeight: 320),
                        child: ListView(
                          shrinkWrap: true,
                          children: tutors.map((tutor) {
                            final isSelected =
                                updatedTutorIds.contains(tutor.uid);
                            return CheckboxListTile(
                              value: isSelected,
                              title:
                                  Text('${tutor.firstName} ${tutor.lastName}'),
                              onChanged: (checked) {
                                setState(() {
                                  if (checked == true) {
                                    if (!updatedTutorIds.contains(tutor.uid)) {
                                      updatedTutorIds.add(tutor.uid);
                                    }
                                  } else {
                                    updatedTutorIds.remove(tutor.uid);
                                  }
                                });
                              },
                            );
                          }).toList(),
                        ),
                      ),
                      const SizedBox(height: 12),
                      const Divider(),
                      const SizedBox(height: 8),
                      const Text(
                        'Apply to',
                        style: TextStyle(fontWeight: FontWeight.w600),
                      ),
                      RadioListTile<String>(
                        value: 'class',
                        groupValue: applyTo,
                        title: const Text('This class only'),
                        onChanged: (val) {
                          if (val == null) return;
                          setState(() => applyTo = val);
                        },
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                      ),
                      RadioListTile<String>(
                        value: 'day',
                        groupValue: applyTo,
                        title: Text('All ${classInfo.dayOfWeek} classes'),
                        onChanged: (val) {
                          if (val == null) return;
                          setState(() => applyTo = val);
                        },
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                      ),
                      const SizedBox(height: 6),
                      const Text(
                        'Effective',
                        style: TextStyle(fontWeight: FontWeight.w600),
                      ),
                      RadioListTile<String>(
                        value: 'week',
                        groupValue: effective,
                        title: const Text('This week only'),
                        onChanged: (val) {
                          if (val == null) return;
                          setState(() => effective = val);
                        },
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                      ),
                      RadioListTile<String>(
                        value: 'permanent',
                        groupValue: effective,
                        title: Text(
                            'From week ${timetableController.currentWeek} onward'),
                        onChanged: (val) {
                          if (val == null) return;
                          setState(() => effective = val);
                        },
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                      ),
                    ],
                  ),
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('Cancel'),
                ),
                TextButton(
                  onPressed: updatedTutorIds.isEmpty
                      ? null
                      : () async {
                          if (!await _ensureOnlineFor('update tutors')) {
                            return;
                          }
                          Navigator.pop(ctx);

                          final updatedBy =
                              authController.currentUser?.uid ?? 'system';

                          try {
                            if (applyTo == 'class') {
                              if (effective == 'week') {
                                final Attendance? resolvedAttendance =
                                    attendance ??
                                        timetableController
                                            .attendanceByClass[classInfo.id];
                                if (resolvedAttendance == null) {
                                  if (!mounted) return;
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text(
                                          'Attendance not loaded for this class/week.'),
                                    ),
                                  );
                                  return;
                                }

                                final updatedAttendance =
                                    resolvedAttendance.copyWith(
                                  tutors: updatedTutorIds,
                                  updatedAt: DateTime.now(),
                                  updatedBy: updatedBy,
                                );

                                await timetableController.updateAttendanceDoc(
                                    updatedAttendance, classInfo.id);
                                await timetableController.loadAttendanceForWeek(
                                    silent: true);
                              } else {
                                final updatedClass =
                                    classInfo.copyWith(tutors: updatedTutorIds);
                                await timetableController.updateClass(
                                  updatedClass,
                                  fromWeek: timetableController.currentWeek,
                                  updatedBy: updatedBy,
                                );
                                await timetableController.loadAttendanceForWeek(
                                    silent: true);
                              }
                            } else {
                              if (effective == 'week') {
                                await timetableController
                                    .updateTutorsForDayThisWeek(
                                  dayOfWeek: classInfo.dayOfWeek,
                                  tutorIds: updatedTutorIds,
                                  updatedBy: updatedBy,
                                );
                              } else {
                                await timetableController
                                    .updateTutorsForDayPermanent(
                                  dayOfWeek: classInfo.dayOfWeek,
                                  tutorIds: updatedTutorIds,
                                  fromWeek: timetableController.currentWeek,
                                  updatedBy: updatedBy,
                                );
                              }
                            }

                            if (!mounted) return;
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(
                                  applyTo == 'day'
                                      ? 'Tutors updated for all ${classInfo.dayOfWeek} classes.'
                                      : 'Tutors updated.',
                                ),
                              ),
                            );
                          } catch (e) {
                            if (!mounted) return;
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text('Failed to update tutors: $e'),
                              ),
                            );
                          }
                        },
                  child: const Text('Confirm'),
                ),
              ],
            );
          },
        );
      },
    );
  }

  void _showAddClassDialog(BuildContext context) async {
    String selectedType = _classTypes.first;
    String selectedDay = _daysOfWeek.first;
    String selectedStartTime = _timeSlots.first;
    String selectedEndTime = _timeSlots.first;
    int selectedCapacity = _capacities.first;

    final authController = Provider.of<AuthController>(context, listen: false);
    final tutors = await authController.fetchAllTutors();

    List<String> selectedTutorIds = [];
    if (!context.mounted) return;
    showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: const Text('Add New Class'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<String>(
                  decoration: const InputDecoration(labelText: 'Class Type'),
                  value: selectedType,
                  items: _classTypes.map((type) {
                    return DropdownMenuItem<String>(
                      value: type,
                      child: Text(type),
                    );
                  }).toList(),
                  onChanged: (val) {
                    if (val != null) {
                      setState(() {
                        selectedType = val;
                      });
                    }
                  },
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  decoration: const InputDecoration(labelText: 'Day of Week'),
                  value: selectedDay,
                  items: _daysOfWeek.map((day) {
                    return DropdownMenuItem<String>(
                      value: day,
                      child: Text(day),
                    );
                  }).toList(),
                  onChanged: (val) {
                    if (val != null) {
                      setState(() {
                        selectedDay = val;
                      });
                    }
                  },
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  decoration: const InputDecoration(labelText: 'Start Time'),
                  value: selectedStartTime,
                  items: _timeSlots.map((time) {
                    final formattedTime = DateFormat("h:mm a")
                        .format(DateFormat("HH:mm").parse(time));
                    return DropdownMenuItem<String>(
                      value: time,
                      child: Text(formattedTime),
                    );
                  }).toList(),
                  onChanged: (val) {
                    if (val != null) {
                      setState(() {
                        selectedStartTime = val;
                      });
                    }
                  },
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  decoration: const InputDecoration(labelText: 'End Time'),
                  value: selectedEndTime,
                  items: _timeSlots.map((time) {
                    final formattedTime = DateFormat("h:mm a")
                        .format(DateFormat("HH:mm").parse(time));
                    return DropdownMenuItem<String>(
                      value: time,
                      child: Text(formattedTime),
                    );
                  }).toList(),
                  onChanged: (val) {
                    if (val != null) {
                      setState(() {
                        selectedEndTime = val;
                      });
                    }
                  },
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<int>(
                  decoration: const InputDecoration(labelText: 'Capacity'),
                  value: selectedCapacity,
                  items: _capacities.map((cap) {
                    return DropdownMenuItem<int>(
                      value: cap,
                      child: Text(cap.toString()),
                    );
                  }).toList(),
                  onChanged: (val) {
                    if (val != null) {
                      setState(() {
                        selectedCapacity = val;
                      });
                    }
                  },
                ),
                const SizedBox(height: 10),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Select Tutors',
                      style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                          color: Colors.black54),
                    ),
                    const SizedBox(height: 8),
                    MultiSelectDialogField<String>(
                      selectedColor: Theme.of(context).primaryColor,
                      items: tutors
                          .map((tutor) => MultiSelectItem<String>(
                                tutor.uid,
                                '${tutor.firstName} ${tutor.lastName}',
                              ))
                          .toList(),
                      title: const Text("Select Tutors"),
                      buttonText: const Text("Select Tutors"),
                      decoration: BoxDecoration(
                        border: Border.all(color: Colors.grey, width: 1),
                        borderRadius: BorderRadius.circular(5),
                      ),
                      initialValue: selectedTutorIds,
                      onConfirm: (values) {
                        setState(() {
                          selectedTutorIds = values.cast<String>();
                        });
                      },
                    ),
                  ],
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel'),
            ),
            TextButton(
              onPressed: () async {
                if (!await _ensureOnlineFor('add this class')) {
                  return;
                }
                final newClass = ClassModel(
                  id: DateTime.now().millisecondsSinceEpoch.toString(),
                  type: selectedType,
                  dayOfWeek: selectedDay,
                  startTime: selectedStartTime,
                  endTime: selectedEndTime,
                  capacity: selectedCapacity,
                  enrolledStudents: const [],
                  tutors: selectedTutorIds,
                );
                final timetableController =
                    Provider.of<TimetableController>(context, listen: false);
                await timetableController.createNewClass(newClass);
                if (!context.mounted) return;
                Navigator.pop(ctx);
              },
              child: const Text('Add Class'),
            ),
          ],
        );
      },
    );
  }

  Future<bool> _showConfirmDialog(String message) async {
    return await showDialog<bool>(
          context: context,
          builder: (context) {
            return AlertDialog(
              title: const Text("Confirm"),
              content: Text(message),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context, false),
                  child: const Text("No"),
                ),
                TextButton(
                  onPressed: () => Navigator.pop(context, true),
                  child: const Text("Yes"),
                ),
              ],
            );
          },
        ) ??
        false;
  }
}

class _WaitlistEntryDisplayData {
  final WaitlistEntry entry;
  final String studentName;
  final String parentName;

  const _WaitlistEntryDisplayData({
    required this.entry,
    required this.studentName,
    required this.parentName,
  });
}

//a helper for day offsets
int _dayOffset(String day) {
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
      // For "Unknown" or any unexpected day, just push them to the end
      return 99;
  }
}

Future<bool> _showEnrollStudentDialog(
    ClassModel classInfo, BuildContext context) async {
  // Capture the controller using the current (active) context.
  final timetableController =
      Provider.of<TimetableController>(context, listen: false);

  // Launch the search dialog using a builder context that is safe.
  final Student? student = await showDialog<Student>(
    context: context,
    builder: (dialogContext) => StudentSearchWidget(
      onStudentSelected: (student) => Navigator.pop(dialogContext, student),
    ),
  );
  if (student == null) return false; // No student selected, do nothing.

  // Ask the admin which type of enrollment to perform.
  if (!context.mounted) return false;
  final bool? enrollPermanent = await showDialog<bool>(
    context: context,
    builder: (dialogContext) {
      return AlertDialog(
        title: const Text("Enrolment Type"),
        content: const Text("How would you like to enrol this student?"),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, null),
            child: const Text("Cancel"),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text("One‑Off"),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text("Permanent"),
          ),
        ],
      );
    },
  );

  // If the admin cancelled the dialog, exit without reloading or enrolling.
  if (enrollPermanent == null) {
    return false;
  }
  if (!context.mounted) return false;

  try {
    if (enrollPermanent) {
      if (!await OfflineActionGuard.ensureOnline(
        context,
        action: 'enrol this student',
      )) {
        return false;
      }
      // Permanently enroll the student.
      await timetableController.enrollStudentPermanent(
        classId: classInfo.id,
        studentId: student.id,
      );
      if (!context.mounted) return false;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text("Student ${student.firstName} enrolled permanently."),
        ),
      );
    } else {
      if (!await OfflineActionGuard.ensureOnline(
        context,
        action: 'book this student one-off',
      )) {
        return false;
      }
      // For one‑off booking, compute the attendanceDocId.
      final attendanceDocId =
          '${timetableController.activeTerm!.id}_W${timetableController.currentWeek}';
      final result = await timetableController.enrollStudentOneOff(
        classId: classInfo.id,
        studentId: student.id,
        attendanceDocId: attendanceDocId,
      );
      if (!context.mounted) return false;
      if (result == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text("Unable to book this student one-off."),
            backgroundColor: Colors.red,
          ),
        );
        return false;
      }
      if (result.alreadyEnrolled) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
                "Student ${student.firstName} already has a booking for this class."),
          ),
        );
        return false;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text("Student ${student.firstName} enrolled one‑off."),
        ),
      );
    }
    // Refresh attendance data if enrollment was performed.
    await timetableController.loadAttendanceForWeek();
    return true;
  } catch (error) {
    if (!context.mounted) return false;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text("Error enrolling student: $error")),
    );
    return false;
  }
}
