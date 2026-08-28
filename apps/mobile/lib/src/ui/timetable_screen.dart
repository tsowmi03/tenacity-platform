import 'dart:async';

import 'package:firebase_remote_config/firebase_remote_config.dart';
import 'package:flutter/material.dart';
import 'package:flutter_stripe/flutter_stripe.dart' hide Card;
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/feedback_controller.dart';
import 'package:tenacity/src/controllers/invoice_controller.dart';
import 'package:tenacity/src/controllers/timetable_controller.dart';
import 'package:tenacity/src/helpers/offline_action_guard.dart';
import 'package:tenacity/src/helpers/one_off_booking_plan.dart';
import 'package:tenacity/src/helpers/parent_class_availability.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/feedback_model.dart';
import 'package:tenacity/src/models/parent_model.dart';
import 'package:tenacity/src/models/permanent_enrollment_result_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/models/term_model.dart';
import 'package:tenacity/src/models/waitlist_entry_model.dart';
import 'package:tenacity/src/services/audit_service.dart';
import 'package:tenacity/src/services/payment_verification_result.dart';
import 'package:tenacity/src/services/timetable_service.dart';
import 'package:tenacity/src/ui/classes/tutor/class_roll_screen.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/feedback_screen.dart';
import 'package:tenacity/src/ui/profile_screen.dart';
import 'package:tenacity/src/ui/dashboard/dashboard_formatting.dart';
import 'package:tenacity/src/ui/tab_visibility.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';
import 'package:tenacity/src/utils/error_presenter.dart';
import 'package:tenacity/src/utils/refresh_throttle.dart';
import 'package:tenacity/src/ui/timetable/parent/booking_data.dart';
import 'package:tenacity/src/ui/timetable/parent/booking_sheets.dart';
import 'package:tenacity/src/ui/timetable/parent/one_off_payment_decision.dart';
import 'package:tenacity/src/ui/timetable/parent/parent_browse_data.dart';
import 'package:tenacity/src/ui/timetable/parent/parent_browse_view.dart';
import 'package:tenacity/src/ui/timetable/parent/parent_timetable_data.dart';
import 'package:tenacity/src/ui/timetable/parent/parent_timetable_view.dart';
import 'package:tenacity/src/utils/class_session_dates.dart';
import 'package:tenacity/src/ui/timetable/admin/admin_class_options_data.dart';
import 'package:tenacity/src/ui/timetable/admin/admin_class_options_sheet.dart';
import 'package:tenacity/src/ui/timetable/admin/admin_class_management_data.dart';
import 'package:tenacity/src/ui/timetable/admin/admin_class_management_sheets.dart';
import 'package:tenacity/src/ui/timetable/admin/admin_enrolment_flow.dart';
import 'package:tenacity/src/ui/timetable/admin/admin_classes_data.dart';
import 'package:tenacity/src/ui/timetable/admin/admin_classes_view.dart';
import 'package:tenacity/src/ui/timetable/tutor/tutor_classes_data.dart';
import 'package:tenacity/src/ui/timetable/tutor/tutor_classes_view.dart';
import 'package:uuid/uuid.dart';

class TimetableScreen extends StatefulWidget {
  /// Shows every class the parent may join, instead of the weekly view of what
  /// they have already booked.
  ///
  /// The parent timetable deliberately lists only booked classes, so this is
  /// where "Book a one-off class" leads. Parents get [ParentBrowseView];
  /// tutor and admin roles keep their dedicated V3 timetable routes.
  final bool browseOnly;

  const TimetableScreen({super.key, this.browseOnly = false});

  @override
  TimetableScreenState createState() => TimetableScreenState();
}

class TimetableScreenState extends State<TimetableScreen>
    with TabVisibilityAware<TimetableScreen> {
  /// Only ever set for the browse surface, which is the sole consumer. It used
  /// to be fetched for every parent on every mount — a read per child of work
  /// the weekly timetable never looks at.
  Future<Set<String>>? _eligibleSubjectsFuture;

  /// True while a background reload is in flight. Only blocks the screen when
  /// there is nothing cached to show behind it.
  bool _isRefreshing = false;
  bool _isWeekLoading = false;

  final RefreshThrottle _refreshThrottle = RefreshThrottle();

  /// V3 parent view state. Null means "all children" and "the whole week".
  String? _selectedChildId;
  DateTime? _selectedDay;
  List<Student> _children = const [];
  Map<String, String> _tutorNames = const {};

  /// V3 admin view state. The admin timetable lists one day of the loaded week,
  /// so it keeps its own date; null means "resolve from the loaded week on
  /// first build".
  DateTime? _adminDate;
  AdminClassesGrouping _adminGrouping = AdminClassesGrouping.time;

  /// Students for the admin timetable's expandable rosters, keyed by id. Held
  /// whole rather than as names because the roster shows each student's year
  /// and subject too.
  Map<String, Student> _students = const {};

  int _weeksAheadForDisplayedWeek(TimetableController timetableController) {
    final term = timetableController.activeTerm;
    if (term == null) return 0;

    return timetableController.currentWeek -
        currentTermWeek(
          termStart: term.startDate,
          totalWeeks: term.totalWeeks,
          now: DateTime.now(),
        );
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

    // Browse is a pushed route rather than a tab, and its list is wrong until
    // this resolves, so it starts here instead of waiting for the first
    // post-frame callback. The weekly timetable never reads it — fetching it
    // for every parent on every visit was a read per child of dead work.
    if (widget.browseOnly) {
      _eligibleSubjectsFuture =
          Provider.of<TimetableController>(context, listen: false)
              .getEligibleSubjects(context);
    }
  }

  /// Loads on first build, and refreshes each time the Classes tab is returned
  /// to. The tab is kept alive now, so this is the only remaining signal that
  /// the user is looking at the timetable again.
  @override
  Future<void> onTabVisible() async {
    debugPrint('[TimetableScreen] onTabVisible');

    // Ahead of the throttle: another screen sending an admin to a particular
    // day is a deliberate jump, and a recent refresh is no reason to land them
    // on whichever day this screen happened to be showing.
    final requestedDay =
        Provider.of<TimetableController>(context, listen: false)
            .takeRequestedAdminDate();
    if (requestedDay != null) {
      setState(() => _adminDate = requestedDay);
    }

    if (!_refreshThrottle.shouldRefresh) {
      debugPrint('[TimetableScreen] refresh throttled');
      return;
    }

    final authController = Provider.of<AuthController>(context, listen: false);
    final timetableController =
        Provider.of<TimetableController>(context, listen: false);

    // refreshCurrentUser notifies synchronously before its first await, so it
    // is left unawaited here rather than run inside a build lifecycle.
    unawaited(authController.refreshCurrentUser());

    setState(() => _isRefreshing = true);
    // The parent context derives the tutors to look up from the loaded
    // classes, so it has to wait for them. Started concurrently, it read an
    // empty class list and left every subtitle without a tutor name until the
    // first manual refresh.
    final loaded = await _initData(timetableController);
    if (!mounted) return;
    setState(() => _isRefreshing = false);

    final role = authController.currentUser?.role;
    if (role == 'parent') {
      await _loadParentContext();
    } else if (role == 'admin') {
      // The admin timetable names the tutor on every row and lists the students
      // behind it, so it needs the same lookups the parent view does — without
      // the children fetch, which is parent-only and would be denied.
      await _loadAdminNames();
    }

    // Only a clean load counts. Marking a failure would throttle out the
    // retry that comes right after it.
    if (loaded) _refreshThrottle.markRefreshed();
  }

  /// Children and tutor names for the V3 parent view. Best-effort: the
  /// timetable is still usable without them, just with thinner subtitles.
  Future<void> _loadParentContext() async {
    final authController = Provider.of<AuthController>(context, listen: false);
    final timetableController =
        Provider.of<TimetableController>(context, listen: false);
    final parentId = authController.currentUser?.uid;
    if (parentId == null) return;

    try {
      final children = await authController.fetchStudentsForParent(parentId);
      final names = await _fetchTutorNames(authController, timetableController);
      if (!mounted) return;
      setState(() {
        _children = children;
        _tutorNames = names;
      });
    } catch (e) {
      debugPrint('[TimetableScreen] _loadParentContext error: $e');
    }
  }

  /// Tutor and student names for the admin timetable. Best-effort, like the
  /// parent context: the rows still render without them, just without a tutor
  /// name and with a roster that cannot be listed yet.
  ///
  /// The two run together but succeed or fail apart. Sharing one `try` meant a
  /// failed student read threw away tutor names that had already arrived,
  /// blanking the tutor on every row of a screen that had shown them fine
  /// before the roster was ever added.
  Future<void> _loadAdminNames() async {
    final authController = Provider.of<AuthController>(context, listen: false);
    final timetableController =
        Provider.of<TimetableController>(context, listen: false);

    await Future.wait([
      _loadAdminTutorNames(authController, timetableController),
      _loadAdminStudents(authController),
    ]);
  }

  Future<void> _loadAdminTutorNames(
    AuthController authController,
    TimetableController timetableController,
  ) async {
    try {
      final names = await _fetchTutorNames(authController, timetableController);
      if (!mounted) return;
      setState(() => _tutorNames = names);
    } catch (e) {
      debugPrint('[TimetableScreen] admin tutor names failed: $e');
    }
  }

  /// Every student, for the rosters the timetable rows expand into.
  ///
  /// One collection read — the same one the admin student picker already
  /// makes — rather than a document per student per class. That per-document
  /// cost is what the enrolments sheet pays, and is why the roster could not
  /// simply be put on the timetable itself.
  Future<void> _loadAdminStudents(AuthController authController) async {
    try {
      final students = await authController.fetchAllStudents();
      if (!mounted) return;
      setState(() {
        _students = {for (final student in students) student.id: student};
      });
    } catch (e) {
      debugPrint('[TimetableScreen] admin students failed: $e');
    }
  }

  Future<Map<String, String>> _fetchTutorNames(
    AuthController authController,
    TimetableController timetableController,
  ) {
    final tutorIds = <String>{
      for (final classModel in timetableController.allClasses)
        ...classModel.tutors,
      for (final attendance in timetableController.attendanceByClass.values)
        ...attendance.tutors,
    }.toList();

    return authController.fetchTutorNamesByIds(tutorIds);
  }

  Future<void> _changeWeek(int delta) async {
    final controller = Provider.of<TimetableController>(context, listen: false);
    setState(() => _isWeekLoading = true);
    if (delta < 0) {
      controller.decrementWeek();
    } else {
      controller.incrementWeek();
    }
    await controller.loadAttendanceForWeek(silent: true);
    if (!mounted) return;
    // The selected day belongs to the week that was on screen, so clear it.
    setState(() {
      _isWeekLoading = false;
      _selectedDay = null;
    });
  }

  Future<void> _refreshParentTimetable() async {
    final controller = Provider.of<TimetableController>(context, listen: false);
    await controller.loadAllClasses(silent: true);
    await controller.loadAttendanceForWeek(silent: true);
    await _loadParentContext();
  }

  Widget _buildParentTimetable(
    TimetableController timetableController,
    AuthController authController,
  ) {
    final currentUser = authController.currentUser;
    final userStudentIds =
        currentUser is Parent ? currentUser.students : <String>[];

    final data = buildParentTimetableViewData(
      now: DateTime.now(),
      activeTerm: timetableController.activeTerm,
      week: timetableController.currentWeek,
      classes: timetableController.allClasses,
      attendanceByClass: timetableController.attendanceByClass,
      children: _children,
      tutorNamesById: _tutorNames,
      selectedChildId: _selectedChildId,
      selectedDay: _selectedDay,
    );

    return ParentTimetableView(
      data: data,
      onRefresh: _refreshParentTimetable,
      onFilterSelected: (index) {
        setState(() {
          _selectedChildId = index == 0 ? null : _children[index - 1].id;
        });
      },
      onDaySelected: (day) => setState(() => _selectedDay = day),
      onPreviousWeek: () => _changeWeek(-1),
      onNextWeek: () => _changeWeek(1),
      onSessionTapped: (session) {
        final classInfo = timetableController.allClasses
            .where((c) => c.id == session.classId)
            .firstOrNull;
        if (classInfo == null) return;

        // Straight into the existing options dialog, so swap, absence,
        // one-off and waitlist behaviour is unchanged.
        _showParentClassOptionsDialog(
          classInfo,
          true,
          timetableController.attendanceByClass[classInfo.id],
          userStudentIds,
          relevantChildIds: session.childIds,
        );
      },
      onBookOneOff: () {
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => const TimetableScreen(browseOnly: true),
          ),
        );
      },
    );
  }

  /// The tutor's teaching week. Only classes they are assigned to, with the
  /// roll state of each, routing into the roll itself.
  Widget _buildTutorClasses(
    TimetableController timetableController,
    AuthController authController,
  ) {
    final tutorId = authController.currentUser?.uid ?? '';

    final data = buildTutorClassesViewData(
      now: DateTime.now(),
      activeTerm: timetableController.activeTerm,
      week: timetableController.currentWeek,
      tutorId: tutorId,
      classes: timetableController.allClasses,
      attendanceByClass: timetableController.attendanceByClass,
      selectedDay: _selectedDay,
      errorMessage: timetableController.errorMessage,
    );

    return TutorClassesView(
      data: data,
      onRefresh: _refreshParentTimetable,
      onDaySelected: (day) => setState(() => _selectedDay = day),
      onPreviousWeek: () => _changeWeek(-1),
      onNextWeek: () => _changeWeek(1),
      onOpenProfile: () => Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => const ProfileScreen()),
      ),
      onRetry: () => _initData(timetableController),
      onSessionTapped: (session) => _openTutorRoll(session),
    );
  }

  /// The admin master timetable for one day, grouped by time or by tutor.
  ///
  /// Every action routes into the existing admin dialogs, so students, tutors,
  /// waitlist, cancellation and class creation keep the behaviour they already
  /// had rather than being reimplemented against the new layout.
  Widget _buildAdminClasses(
    TimetableController timetableController,
    AuthController authController,
  ) {
    final activeTerm = timetableController.activeTerm;
    final selected = _adminDate ??
        _defaultAdminDate(
          activeTerm: activeTerm,
          week: timetableController.currentWeek,
        );

    final data = buildAdminClassesViewData(
      now: DateTime.now(),
      activeTerm: activeTerm,
      week: timetableController.currentWeek,
      selectedDate: selected,
      classes: timetableController.allClasses,
      attendanceByClass: timetableController.attendanceByClass,
      tutorNamesById: _tutorNames,
      studentsById: _students,
      grouping: _adminGrouping,
      errorMessage: timetableController.errorMessage,
    );

    return AdminClassesView(
      data: data,
      onRefresh: _refreshAdminTimetable,
      onPreviousWeek: () => _changeAdminWeek(-1),
      onNextWeek: () => _changeAdminWeek(1),
      onDaySelected: (day) => setState(() => _adminDate = day),
      onGroupingChanged: (grouping) =>
          setState(() => _adminGrouping = grouping),
      onSessionTapped: _openAdminClassOptions,
      onAddClass: () => _showAddClassDialog(context),
      onRetry: () => _initData(timetableController),
    );
  }

  /// The day the admin timetable opens on: today when today is in the loaded
  /// week, and the start of that week otherwise.
  ///
  /// The controller resolves the week from the current date but clamps it to
  /// the term, so outside term time today is not in the loaded week at all.
  /// Opening on it would show a day the strip above has no place for.
  DateTime _defaultAdminDate({required Term? activeTerm, required int week}) {
    final today = DateUtils.dateOnly(DateTime.now());
    if (activeTerm == null || week <= 0) return today;

    final weekStart = startOfTermWeek(activeTerm.startDate, week);
    final weekEnd = weekStart.add(const Duration(days: 6));
    if (today.isBefore(weekStart) || today.isAfter(weekEnd)) return weekStart;
    return today;
  }

  Future<void> _refreshAdminTimetable() async {
    final controller = Provider.of<TimetableController>(context, listen: false);
    await controller.loadAllClasses(silent: true);
    await controller.loadAttendanceForWeek(silent: true);
    await _loadAdminNames();
  }

  /// Pages the admin timetable a week, keeping the weekday on screen.
  ///
  /// The controller loads attendance a week at a time, so the displayed day has
  /// to move with it — left where it was, it would be read against the new
  /// week's documents and show the wrong rolls, tutors and cancellations.
  Future<void> _changeAdminWeek(int delta) async {
    final controller = Provider.of<TimetableController>(context, listen: false);
    final activeTerm = controller.activeTerm;
    if (activeTerm == null) return;

    final current = _adminDate ??
        _defaultAdminDate(
          activeTerm: activeTerm,
          week: controller.currentWeek,
        );

    setState(() => _isWeekLoading = true);
    if (delta < 0) {
      controller.decrementWeek();
    } else {
      controller.incrementWeek();
    }
    await controller.loadAttendanceForWeek(silent: true);
    if (!mounted) return;
    setState(() {
      _isWeekLoading = false;
      // Both arrows are disabled at the term edges, so the controller has
      // moved and the same weekday exists in the week it moved to.
      _adminDate = DateUtils.dateOnly(current.add(Duration(days: delta * 7)));
    });
    await _loadAdminNames();
  }

  void _openAdminClassOptions(AdminSession session) {
    final controller = Provider.of<TimetableController>(context, listen: false);
    final classInfo =
        controller.allClasses.where((c) => c.id == session.classId).firstOrNull;
    if (classInfo == null) return;

    unawaited(
      _showAdminClassOptionsDialog(
        classInfo,
        controller.attendanceByClass[session.classId],
      ),
    );
  }

  Future<void> _openTutorRoll(TutorSession session) async {
    final classInfo = Provider.of<TimetableController>(context, listen: false)
        .allClasses
        .where((c) => c.id == session.classId)
        .firstOrNull;
    if (classInfo == null || session.sessionId == null) return;

    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ClassRollScreen(
          classInfo: classInfo,
          attendanceDocId: session.sessionId!,
        ),
      ),
    );
    if (!mounted) return;
    // The roll may have changed both attendance and completion state, so the
    // week is reloaded rather than trusting the cached copy behind it.
    await Provider.of<TimetableController>(context, listen: false)
        .loadAttendanceForWeek(silent: true);
  }

  /// The browse-and-book surface: every class the family is eligible for in the
  /// displayed week, whether or not they are already in it.
  ///
  /// The eligible-subject lookup is a separate round trip, so this waits on it
  /// rather than briefly showing a list that is about to shrink.
  Widget _buildParentBrowse(
    TimetableController timetableController,
    AuthController authController,
  ) {
    return FutureBuilder<Set<String>>(
      future: _eligibleSubjectsFuture,
      builder: (context, snapshot) {
        if (_eligibleSubjectsFuture != null &&
            snapshot.connectionState != ConnectionState.done) {
          return const TimetableSkeleton(
            key: Key('parent-browse-loading'),
          );
        }

        final eligibleSubjects = snapshot.data ?? <String>{};
        return _buildParentBrowseFor(
          timetableController,
          authController,
          eligibleSubjects: eligibleSubjects,
          failedToLoadSubjects: snapshot.hasError,
        );
      },
    );
  }

  Widget _buildParentBrowseFor(
    TimetableController timetableController,
    AuthController authController, {
    required Set<String> eligibleSubjects,
    required bool failedToLoadSubjects,
  }) {
    final currentUser = authController.currentUser;
    final userStudentIds =
        currentUser is Parent ? currentUser.students : <String>[];

    // Eligibility stays on the controller — this screen has never owned that
    // rule and does not start now.
    final eligible = failedToLoadSubjects
        ? const <ClassModel>[]
        : timetableController.allClasses
            .where(
                (c) => timetableController.isEligibleClass(c, eligibleSubjects))
            .toList(growable: false);

    final data = buildParentBrowseViewData(
      now: DateTime.now(),
      activeTerm: timetableController.activeTerm,
      week: timetableController.currentWeek,
      classes: eligible,
      attendanceByClass: timetableController.attendanceByClass,
      children: _children,
      tutorNamesById: _tutorNames,
      selectedDay: _selectedDay,
      errorMessage: failedToLoadSubjects
          ? 'We could not check which classes suit your children. '
              'Please try again in a moment.'
          : null,
    );

    return ParentBrowseView(
      data: data,
      onRefresh: _refreshParentTimetable,
      onDaySelected: (day) => setState(() => _selectedDay = day),
      onPreviousWeek: () => _changeWeek(-1),
      onNextWeek: () => _changeWeek(1),
      onBack: () => Navigator.of(context).maybePop(),
      onRetry: () {
        setState(() {
          _eligibleSubjectsFuture =
              timetableController.getEligibleSubjects(context);
        });
      },
      onClassTapped: (browseClass) {
        final classInfo = timetableController.allClasses
            .where((c) => c.id == browseClass.classId)
            .firstOrNull;
        if (classInfo == null) return;

        // Straight into the existing options dialog, so the one-off, permanent
        // enrolment and waitlist behaviour is unchanged.
        _showParentClassOptionsDialog(
          classInfo,
          browseClass.isBooked,
          timetableController.attendanceByClass[classInfo.id],
          userStudentIds,
          relevantChildIds:
              browseClass.isBooked ? browseClass.childIds : userStudentIds,
        );
      },
    );
  }

  /// Loads the term, its classes and the displayed week's attendance.
  ///
  /// Always silent: this screen renders whatever the controller already holds
  /// and decides for itself whether there is enough to show, so a load has no
  /// business flipping the controller's own spinner. Returns whether it
  /// finished cleanly, which is what the refresh throttle keys off.
  Future<bool> _initData(TimetableController controller) async {
    debugPrint('[TimetableScreen] _initData start');
    // This screen owns the error its own loads produce, so a fresh attempt
    // starts clean. The silent loads below cannot clear it themselves without
    // trampling errors set by whatever else is in flight.
    controller.clearError();
    try {
      // Independent of each other, so they overlap rather than queue.
      await Future.wait([
        controller.loadActiveTerm(silent: true),
        controller.loadAllClasses(silent: true),
      ]);
      debugPrint('[TimetableScreen] term and classes done');

      // Has to follow: it needs the term id and the resolved week, and it
      // iterates the loaded classes.
      await controller.loadAttendanceForWeek(silent: true);
      debugPrint('[TimetableScreen] loadAttendanceForWeek done');
      return controller.errorMessage == null;
    } catch (e, st) {
      debugPrint('[TimetableScreen] _initData error: $e\n$st');
      return false;
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
    // Whether the server confirmed the money moved. A booking can go ahead
    // without it — see decideOneOffPaymentOutcome — but the invoice then says
    // so, because nothing else would.
    var paymentConfirmed = false;
    // What the server made of the booking, when it got the chance to tell us.
    // Null means it has not answered yet, not that nothing happened: the
    // webhook completes the booking either way.
    PaymentFulfilment? fulfilment;
    // Set when the server's answer needs its own wording — a session that
    // filled, a partial fit, or one still completing — rather than the usual
    // count-derived message.
    OneOffPaymentMessage? paidOutcomeMessage;

    if (bookingPlan.requiresPayment) {
      // Shown before the parent commits; the amount actually charged is
      // computed by the server from its own price.
      final remoteConfig = FirebaseRemoteConfig.instance;
      oneOffClassPrice = remoteConfig.getDouble('one_off_class_price');
      final totalAmount = oneOffClassPrice * bookingPlan.paidBookings;

      try {
        // Sending the booking is what lets the server finish the job on its
        // own if this app never gets another turn.
        final clientSecret = await invoiceController.initiateOneOffPayment(
          parentId: parentId,
          amount: totalAmount,
          currency: 'aud',
          classId: classInfo.id,
          attendanceDocId: attendanceDocId,
          studentIds: bookingPlan.paidStudentIds,
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
        // The sheet closed without throwing, so Stripe confirmed the payment.
        // Everything below is a second opinion, and it does not get a veto.
        final verification =
            await invoiceController.verifyPaymentWithRetries(clientSecret);
        final decision = decideOneOffPaymentOutcome(
          verification: verification,
          sheetCompleted: true,
        );
        paymentConfirmed = decision.paymentConfirmed;
        fulfilment = verification.fulfilment;

        if (decision.message != null) {
          if (!mounted) return false;
          await _showOneOffPaymentMessage(decision.message!);
        }

        if (!decision.shouldBook) {
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

      // The server enrols paid students and raises their invoice, driven by
      // the booking carried on the PaymentIntent. This app no longer writes
      // either: doing so from here is what lost a paid booking when the
      // device could not finish the job.
      final paidOutcome = resolveOneOffPaidOutcome(
        fulfilment: fulfilment,
        requestedStudentIds: bookingPlan.paidStudentIds,
        classLabel: AuditService.classTargetName(classInfo),
      );
      paidOutcomeMessage = paidOutcome.message;
      paidBookedChildIds.addAll(paidOutcome.bookedStudentIds);
      bookedChildIds.addAll(paidOutcome.bookedStudentIds);
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

    // The invoice for a paid booking is raised by the server, in the same
    // idempotent step as the enrolment. There is nothing left here that can
    // fail and leave a charge unrecorded.
    final classLabel = AuditService.classTargetName(classInfo);

    // The server told us something the counts cannot express: a refund, a
    // partial fit, or a booking still completing.
    if (paidOutcomeMessage != null) {
      if (!mounted) return false;
      await _showOneOffPaymentMessage(paidOutcomeMessage);
      return bookedChildIds.isNotEmpty;
    }

    // Money moved and nothing was booked. This is the case that stranded a
    // parent on 2026-08-06, so it must never read as a no-op.
    if (bookedChildIds.isEmpty) {
      if (!mounted) return false;
      if (bookingPlan.requiresPayment) {
        await _showOneOffPaymentMessage(
          oneOffBookingOutcomeMessage(
            paymentConfirmed: paymentConfirmed,
            requestedCount: bookingPlan.paidBookings,
            bookedCount: 0,
            alreadyBookedCount: alreadyBookedChildIds.length,
            invoiceRecorded: true,
            classLabel: classLabel,
          ),
        );
        return false;
      }
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

    if (bookingPlan.requiresPayment) {
      if (!mounted) return false;
      await _showOneOffPaymentMessage(
        oneOffBookingOutcomeMessage(
          paymentConfirmed: paymentConfirmed,
          requestedCount: bookingPlan.paidBookings,
          bookedCount: paidBookedChildIds.length,
          alreadyBookedCount: alreadyBookedChildIds.length,
          invoiceRecorded: true,
          classLabel: classLabel,
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

  /// Show a one-off payment outcome.
  ///
  /// Anything that has to warn against paying twice is a dialog, not a snack
  /// bar: it is the only thing standing between a confused parent and a second
  /// $70 charge, and a snack bar disappears whether or not it was read.
  Future<void> _showOneOffPaymentMessage(OneOffPaymentMessage message) async {
    if (!mounted) return;

    if (!message.requiresAcknowledgement) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('${message.title}. ${message.body}'),
          backgroundColor:
              message.tone == OneOffMessageTone.error ? Colors.red : null,
        ),
      );
      return;
    }

    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => AlertDialog(
        title: Text(message.title),
        content: Text(message.body),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('OK'),
          ),
        ],
      ),
    );
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
    if (!mounted) return;
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
    var invoiceCreationFailed = false;

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
        try {
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
        } catch (error, stackTrace) {
          invoiceCreationFailed = true;
          debugPrint(
            '[TimetableScreen] permanent-enrolment invoice creation failed '
            'after enrolment: $error\n$stackTrace',
          );
        }
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
          '${_buildPermanentEnrollmentResultMessage(
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
          )}${invoiceCreationFailed ? ' The enrolment succeeded, but the invoice record could not be confirmed. Please contact Tenacity Tutoring.' : ''}',
        ),
        backgroundColor: invoiceCreationFailed ? Colors.red : null,
      ),
    );
  }

  Future<void> _processParentWaitlistJoin(
    ClassModel classInfo,
    List<String> selectedChildIds,
  ) async {
    if (!await _ensureOnlineFor('join the waitlist')) return;
    if (!mounted) return;
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

  Future<List<AdminWaitlistEntryData>> _loadWaitlistDisplayData(
    String classId,
  ) async {
    final timetableController = context.read<TimetableController>();
    final authController = context.read<AuthController>();

    final loaded = await timetableController.loadWaitlistForClass(
      classId: classId,
      silent: true,
    );
    if (!loaded) {
      throw StateError('The waitlist could not be loaded.');
    }

    final entries = List<WaitlistEntry>.from(
        timetableController.waitlistEntriesByClass[classId] ??
            const <WaitlistEntry>[]);

    return Future.wait(entries.map((entry) async {
      final student = await authController.fetchStudentData(entry.studentId);
      final parentName = await authController.fetchUserFullNameById(
        entry.parentId,
      );

      return AdminWaitlistEntryData(
        entry: entry,
        studentName: student == null
            ? 'Unknown student'
            : '${student.firstName} ${student.lastName}',
        parentName: cleanAdminDisplayName(
          parentName,
          fallback: 'Unknown parent',
        ),
      );
    }));
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
  Widget build(BuildContext context) {
    final timetableController = context.watch<TimetableController>();
    final authController = context.watch<AuthController>();

    final userRole = authController.currentUser?.role ?? 'parent';

    // Parents get the V3 weekly view of what they have booked, and the V3
    // browse surface behind "Book a one-off class". Tutors get the V3 teaching
    // week, admins the V3 master timetable. No other role reaches this screen:
    // HomeScreen turns an unrecognised role away before the shell is built.
    // Only block when there is genuinely nothing to show. A refresh behind
    // cached data stays invisible — the previous version threw the whole
    // screen away and spun over a week the controller was still holding.
    //
    // Week paging keeps its spinner: the header moves to the new week
    // immediately, so leaving the old week's sessions under it would be wrong
    // rather than merely stale.
    final hasContent = timetableController.activeTerm != null;
    if (_isWeekLoading ||
        ((timetableController.isLoading || _isRefreshing) && !hasContent)) {
      return const Scaffold(
        backgroundColor: AppColors.ink,
        body: TimetableSkeleton(key: Key('timetable-loading')),
      );
    }
    return Scaffold(
      backgroundColor: AppColors.ink,
      body: switch (userRole) {
        'tutor' => _buildTutorClasses(timetableController, authController),
        'admin' => _buildAdminClasses(timetableController, authController),
        _ => widget.browseOnly
            ? _buildParentBrowse(timetableController, authController)
            : _buildParentTimetable(timetableController, authController),
      },
    );
  }

  // When a class card is tapped, show an options bottom sheet.
  /// Opens the parent booking sheets for [classInfo].
  ///
  /// [isOwnClass] means one of the family's children is already in this
  /// session. [relevantChildIds] are the children that context applies to: the
  /// session's own attendees on the timetable, the whole family when browsing.
  ///
  /// Nothing here performs a booking. Each sheet reports a choice and the
  /// existing controller calls run unchanged.
  void _showParentClassOptionsDialog(
    ClassModel classInfo,
    bool isOwnClass,
    Attendance? attendance,
    List<String> userStudentIds, {
    List<String>? relevantChildIds,
  }) {
    if (attendance?.cancelled ?? false) {
      _showBookingMessage('This session has been cancelled.', isError: true);
      return;
    }

    final timetableController =
        Provider.of<TimetableController>(context, listen: false);
    final attendanceDocId =
        '${timetableController.activeTerm!.id}_W${timetableController.currentWeek}';
    final weeksAhead = _weeksAheadForDisplayedWeek(timetableController);

    final options = buildBookingOptions(
      classInfo: classInfo,
      attendance: attendance,
      isOwnClass: isOwnClass,
      userStudentIds: userStudentIds,
      availability: _parentClassAvailability(
        classInfo: classInfo,
        attendance: attendance,
        timetableController: timetableController,
      ),
      canSwapThisWeek: weeksAhead >= 0 && weeksAhead <= 1,
    );

    showAppBottomSheet<void>(
      context: context,
      builder: (sheetContext) => BookingOptionsSheet(
        classTitle: formatDashboardClassType(classInfo.type),
        whenLabel: _classWhenLabel(classInfo),
        options: options,
        onSelected: (option) {
          Navigator.pop(sheetContext);
          _startBookingAction(
            action: option.action,
            classInfo: classInfo,
            attendanceDocId: attendanceDocId,
            userStudentIds: userStudentIds,
            relevantChildIds: relevantChildIds,
            isOwnClass: isOwnClass,
          );
        },
      ),
    );
  }

  /// Routes a chosen action to the next step: pick children, pick a class, or
  /// go straight to confirmation when there is nothing left to choose.
  void _startBookingAction({
    required String action,
    required ClassModel classInfo,
    required String attendanceDocId,
    required List<String> userStudentIds,
    required List<String>? relevantChildIds,
    required bool isOwnClass,
  }) {
    // A swap applies to the children already in this class.
    if (isOwnClass && BookingActions.isSwap(action)) {
      _showChildSelectionSheet(
        action,
        classInfo,
        attendanceDocId,
        relevantChildIds ?? const [],
      );
      return;
    }

    // Adding another child offers only the ones not already in the session,
    // and from here on runs as the plain action.
    const addAnother = {
      BookingActions.enrolAnotherThisWeek: BookingActions.bookOneOff,
      BookingActions.enrolAnotherPermanent: BookingActions.enrolPermanent,
      BookingActions.joinWaitlistAnother: BookingActions.joinWaitlist,
    };
    final baseAction = addAnother[action];
    if (baseAction != null) {
      _showChildSelectionSheet(
        baseAction,
        classInfo,
        attendanceDocId,
        userStudentIds
            .where((id) => !(relevantChildIds?.contains(id) ?? false))
            .toList(),
      );
      return;
    }

    // One child in context and nothing to choose between them.
    if (isOwnClass &&
        (relevantChildIds?.length ?? 0) == 1 &&
        (action == BookingActions.bookOneOff ||
            BookingActions.isPermanentEnrollment(action))) {
      _showBookingConfirmationSheet(
        action,
        relevantChildIds!,
        classInfo,
        attendanceDocId,
      );
      return;
    }

    _showChildSelectionSheet(
      action,
      classInfo,
      attendanceDocId,
      isOwnClass ? (relevantChildIds ?? const []) : userStudentIds,
    );
  }

  void _showChildSelectionSheet(
    String action,
    ClassModel classInfo,
    String attendanceDocId,
    List<String> availableChildIds,
  ) {
    // Resolved once, above the sheet. The previous version built a future per
    // child inside the list, so every checkbox tap refetched all of them and
    // flashed "Loading..." over the names.
    final children = _resolveChildren(availableChildIds);

    showAppBottomSheet<void>(
      context: context,
      builder: (sheetContext) => BookingChildSelectionSheet(
        action: action,
        children: children,
        onCancel: () => Navigator.pop(sheetContext),
        onConfirm: (selected) {
          Navigator.pop(sheetContext);
          final selectedIds = selected.map((child) => child.id).toList();

          if (BookingActions.isSwap(action)) {
            _showNewClassSelectionSheet(
              action,
              classInfo,
              attendanceDocId,
              selectedIds,
            );
          } else {
            _showBookingConfirmationSheet(
              action,
              selectedIds,
              classInfo,
              attendanceDocId,
            );
          }
        },
      ),
    );
  }

  void _showNewClassSelectionSheet(
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

    // Filter out the current class, classes that are full, and classes with a
    // different type.
    final availableClasses = timetableController.allClasses.where((c) {
      if (c.id == oldClass.id) return false;
      if (c.type != oldClass.type) return false;
      // A permanent swap needs a permanent place; a one-week swap only needs
      // the session not to have run yet.
      if (action == BookingActions.swapPermanent) {
        if (c.enrolledStudents.length >= c.capacity) {
          return false;
        }
      } else if (action == BookingActions.swapThisWeek &&
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

    final choices = [
      for (final newClass in availableClasses)
        BookingClassChoice(
          classId: newClass.id,
          dayOfWeek: newClass.dayOfWeek,
          timeLabel: _formatClassTime(newClass.startTime),
          title: formatDashboardClassType(newClass.type),
          spotsRemaining: newClass.capacity -
              (timetableController
                      .attendanceByClass[newClass.id]?.attendance.length ??
                  0),
        ),
    ];

    showAppBottomSheet<void>(
      context: context,
      builder: (sheetContext) => BookingClassSelectionSheet(
        action: action,
        choices: choices,
        onSelected: (choice) {
          final newClass =
              availableClasses.firstWhere((c) => c.id == choice.classId);
          Navigator.pop(sheetContext);
          _showSwapConfirmationSheet(
            action,
            oldClass,
            newClass,
            attendanceDocId,
            selectedChildIds,
          );
        },
      ),
    );
  }

  /// The last step before a booking is made: what it commits the family to,
  /// and what it will cost in tokens or money.
  void _showBookingConfirmationSheet(
    String action,
    List<String> selectedChildIds,
    ClassModel classInfo,
    String attendanceDocId,
  ) {
    final children = _resolveChildren(selectedChildIds);
    final timetableController =
        Provider.of<TimetableController>(context, listen: false);
    final parentUser = Provider.of<AuthController>(context, listen: false)
        .currentUser as Parent;
    final weeksRemaining = weeksRemainingInTerm(
      totalWeeks: timetableController.activeTerm?.totalWeeks,
      currentWeek: timetableController.currentWeek,
    );

    var isBusy = false;

    showAppBottomSheet<void>(
      context: context,
      allowUserDismissal: false,
      builder: (sheetContext) => BookingChildrenGate(
        children: children,
        title: bookingActionLabel(action),
        onClose: () => Navigator.pop(sheetContext),
        builder: (resolved) {
          final message = buildBookingConfirmationMessage(
            action: action,
            childNames: [for (final child in resolved) child.name],
            classInfo: classInfo,
            lessonTokens: parentUser.lessonTokens,
            weeksRemaining: weeksRemaining,
          );

          return StatefulBuilder(
            builder: (context, setSheetState) => BookingConfirmSheet(
              action: action,
              message: message,
              isBusy: isBusy,
              onCancel: () => Navigator.pop(sheetContext),
              onConfirm: () => _runBookingAction(
                action: action,
                selectedChildIds: selectedChildIds,
                classInfo: classInfo,
                attendanceDocId: attendanceDocId,
                sheetContext: sheetContext,
                setBusy: (value) => setSheetState(() => isBusy = value),
              ),
            ),
          );
        },
      ),
    );
  }

  /// Performs the confirmed action. The controller calls are unchanged from
  /// the pre-V3 flow; only the surface around them is new.
  Future<void> _runBookingAction({
    required String action,
    required List<String> selectedChildIds,
    required ClassModel classInfo,
    required String attendanceDocId,
    required BuildContext sheetContext,
    required ValueChanged<bool> setBusy,
  }) async {
    final timetableController =
        Provider.of<TimetableController>(context, listen: false);
    final authController = Provider.of<AuthController>(context, listen: false);
    final parentId = (authController.currentUser as Parent).uid;

    setBusy(true);
    var didPopSheet = false;
    var refreshAttendanceAfterClose = false;

    try {
      if (!await OfflineActionGuard.ensureOnline(
        context,
        action: bookingGuardAction(action),
      )) {
        return;
      }
      if (!mounted) return;

      if (action == BookingActions.bookOneOff ||
          action == BookingActions.enrolAnotherThisWeek) {
        refreshAttendanceAfterClose = await _processOneOffBooking(
          classInfo,
          selectedChildIds,
          attendanceDocId,
        );
      } else if (action == BookingActions.notifyAbsence) {
        var anyTokenAwarded = false;
        for (final childId in selectedChildIds) {
          final tokenAwarded = await timetableController.notifyAbsence(
            classId: classInfo.id,
            studentId: childId,
            attendanceDocId: attendanceDocId,
            parentId: parentId,
          );
          if (tokenAwarded) anyTokenAwarded = true;
        }

        await timetableController.loadAttendanceForWeek();

        _showBookingMessage(
          anyTokenAwarded
              ? 'Absence notified. A lesson token has been added to your '
                  'account.'
              : 'Absence notified. No lesson token was awarded, because it '
                  'was after 10 AM.',
        );
        await authController.refreshCurrentUser();
      } else if (BookingActions.isWaitlistOnly(action)) {
        await _processParentWaitlistJoin(classInfo, selectedChildIds);
        await timetableController.loadAttendanceForWeek();
      } else if (BookingActions.isPermanentEnrollment(action)) {
        await _processParentPermanentEnrollment(classInfo, selectedChildIds);
        await timetableController.loadAttendanceForWeek();
      }

      if (sheetContext.mounted) {
        Navigator.pop(sheetContext);
        didPopSheet = true;
      }
      if (refreshAttendanceAfterClose) {
        unawaited(timetableController.loadAttendanceForWeek(silent: true));
      }
    } catch (e, st) {
      debugPrint('[TimetableScreen] confirm action error: $e\n$st');
      _showBookingMessage(
        'The action could not be completed. Please try again.',
        isError: true,
      );
    } finally {
      // Leaving the sheet up on failure keeps the choice intact so it can be
      // retried without walking back through the flow.
      if (!didPopSheet && sheetContext.mounted) setBusy(false);
    }
  }

  void _showSwapConfirmationSheet(
    String action,
    ClassModel oldClass,
    ClassModel newClass,
    String attendanceDocId,
    List<String> selectedChildIds,
  ) {
    final children = _resolveChildren(selectedChildIds);
    var isBusy = false;

    showAppBottomSheet<void>(
      context: context,
      allowUserDismissal: false,
      builder: (sheetContext) => BookingChildrenGate(
        children: children,
        title: bookingActionLabel(action),
        onClose: () => Navigator.pop(sheetContext),
        builder: (resolved) {
          final message = buildSwapConfirmationMessage(
            action: action,
            childNames: [for (final child in resolved) child.name],
            fromLabel:
                '${oldClass.dayOfWeek} ${_formatClassTime(oldClass.startTime)}',
            toLabel:
                '${newClass.dayOfWeek} ${_formatClassTime(newClass.startTime)}',
          );

          return StatefulBuilder(
            builder: (context, setSheetState) => BookingConfirmSheet(
              action: action,
              message: message,
              isBusy: isBusy,
              onCancel: () => Navigator.pop(sheetContext),
              onConfirm: () => _runSwap(
                action: action,
                oldClass: oldClass,
                newClass: newClass,
                attendanceDocId: attendanceDocId,
                selectedChildIds: selectedChildIds,
                sheetContext: sheetContext,
                setBusy: (value) => setSheetState(() => isBusy = value),
              ),
            ),
          );
        },
      ),
    );
  }

  Future<void> _runSwap({
    required String action,
    required ClassModel oldClass,
    required ClassModel newClass,
    required String attendanceDocId,
    required List<String> selectedChildIds,
    required BuildContext sheetContext,
    required ValueChanged<bool> setBusy,
  }) async {
    final timetableController =
        Provider.of<TimetableController>(context, listen: false);

    setBusy(true);
    try {
      if (!await _ensureOnlineFor('swap classes')) {
        if (sheetContext.mounted) setBusy(false);
        return;
      }
      if (!mounted) return;

      for (final childId in selectedChildIds) {
        if (action == BookingActions.swapThisWeek) {
          await timetableController.rescheduleToDifferentClass(
            oldClassId: oldClass.id,
            oldAttendanceDocId: attendanceDocId,
            newClassId: newClass.id,
            newAttendanceDocId: attendanceDocId,
            studentId: childId,
          );
        } else if (action == BookingActions.swapPermanent) {
          await timetableController.swapPermanentEnrollment(
            oldClassId: oldClass.id,
            newClassId: newClass.id,
            studentId: childId,
          );
        }
      }
      await timetableController.loadAttendanceForWeek();

      if (sheetContext.mounted) Navigator.pop(sheetContext);
    } catch (e, st) {
      debugPrint('[TimetableScreen] swap error: $e\n$st');
      if (sheetContext.mounted) Navigator.pop(sheetContext);
      if (mounted) {
        unawaited(timetableController.loadAllClasses(silent: true));
        unawaited(timetableController.loadAttendanceForWeek(silent: true));
      }
      _showBookingMessage(
        'The swap could not be fully confirmed. The timetable is refreshing; '
        'review both classes before trying again.',
        isError: true,
      );
    }
  }

  /// Resolves the children an action applies to, in the order given.
  Future<List<BookingChild>> _resolveChildren(List<String> childIds) async {
    final authController = Provider.of<AuthController>(context, listen: false);
    final students = await Future.wait(
      childIds.map((id) => authController.fetchStudentData(id)),
    );

    return [
      for (var i = 0; i < childIds.length; i++)
        BookingChild(
          id: childIds[i],
          name: students[i]?.firstName ?? 'Unknown',
        ),
    ];
  }

  void _showBookingMessage(String message, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? AppColors.danger : AppColors.ink,
      ),
    );
  }

  /// `Wednesday, 4:30 PM` — the class this sheet is about.
  String _classWhenLabel(ClassModel classInfo) =>
      '${classInfo.dayOfWeek}, ${_formatClassTime(classInfo.startTime)}';

  /// `16:30` as stored becomes `4:30 PM`. An unparseable value is shown as
  /// stored rather than crashing the sheet that reports it.
  String _formatClassTime(String startTime) {
    try {
      return DateFormat('h:mm a').format(DateFormat('HH:mm').parse(startTime));
    } catch (_) {
      return startTime;
    }
  }

  /// V3 enrolment and weekly-booking editor.
  ///
  /// The roll is a separate screen. This sheet manages the standing roster and
  /// the session booking list, preserving the admin's previous add, remove,
  /// feedback, and weekly-booking mutations.
  void _showEditStudentsDialog(ClassModel classInfo, Attendance? attendance) {
    final screenContext = context;

    showAppBottomSheet<void>(
      context: context,
      allowUserDismissal: false,
      builder: (sheetContext) => AdminRosterSheet(
        classTitle: formatDashboardClassType(classInfo.type),
        whenLabel: _classWhenLabel(classInfo),
        hasSession: attendance != null,
        loadEntries: () => _loadAdminRosterSnapshot(classInfo.id),
        onAddStudent: () => _showAdminStudentEnrolmentFlow(
          classInfo,
          screenContext,
        ),
        onRemove: (entry) => _removeAdminRosterEntry(
          classInfo: classInfo,
          entry: entry,
        ),
        onSaveWeekBookings: (update) => _saveAdminWeekBookings(
          classInfo: classInfo,
          update: update,
        ),
        onOpenFeedback: (entry) {
          Navigator.pop(sheetContext);
          Navigator.of(screenContext).push(
            MaterialPageRoute(
              builder: (_) => FeedbackScreen(
                studentId: entry.student.id,
                studentName: entry.name,
              ),
            ),
          );
        },
        onComposeFeedback: (entry) =>
            _showAdminFeedbackComposer(entry, screenContext),
        onClose: () => Navigator.pop(sheetContext),
      ),
    );
  }

  Future<AdminRosterSnapshot> _loadAdminRosterSnapshot(
    String classId,
  ) async {
    final timetableController = context.read<TimetableController>();
    final authController = context.read<AuthController>();
    final classInfo = timetableController.allClasses
        .where((c) => c.id == classId)
        .firstOrNull;
    if (classInfo == null) {
      return AdminRosterSnapshot(
        entries: const [],
        bookedStudentIds: const [],
        attendanceDocId: null,
      );
    }

    final attendance = timetableController.attendanceByClass[classId];
    final ids = <String>{
      ...classInfo.enrolledStudents,
      ...?attendance?.attendance,
    };
    final students = await Future.wait(
      ids.map(authController.fetchStudentData),
    );

    return buildAdminRosterSnapshot(
      classModel: classInfo,
      attendance: attendance,
      students: students.whereType<Student>(),
    );
  }

  Future<bool> _showAdminStudentEnrolmentFlow(
    ClassModel classInfo,
    BuildContext screenContext,
  ) async {
    final authController = screenContext.read<AuthController>();
    final student = await showAppBottomSheet<Student>(
      context: screenContext,
      builder: (pickerContext) => AdminStudentPickerSheet(
        students: authController.fetchAllStudents(),
        onSelected: (student) => Navigator.pop(pickerContext, student),
        onCancel: () => Navigator.pop(pickerContext),
      ),
    );
    if (student == null || !screenContext.mounted) return false;

    return showAdminEnrolmentTypeAndEnrol(
      context: screenContext,
      classInfo: classInfo,
      student: student,
      onMessage: (message, {bool isError = false}) =>
          _showBookingMessage(message, isError: isError),
    );
  }

  Future<bool> _removeAdminRosterEntry({
    required ClassModel classInfo,
    required AdminRosterEntry entry,
  }) async {
    final confirmed = await _confirmAdminClassAction(
      studentRemovalConfirmation(
        studentName: entry.name,
        classTitle: formatDashboardClassType(classInfo.type),
        isPermanent: entry.isPermanent,
      ),
    );
    if (!confirmed || !mounted) return false;

    final timetableController = context.read<TimetableController>();
    try {
      if (entry.isPermanent) {
        if (!await _ensureOnlineFor('remove this enrolment')) return false;
        await timetableController.unenrollStudentPermanent(
          classId: classInfo.id,
          studentId: entry.student.id,
        );
        await timetableController.loadAllClasses(silent: true);
      } else {
        if (!await _ensureOnlineFor('remove this one-off booking')) {
          return false;
        }
        final attendance = timetableController.attendanceByClass[classInfo.id];
        if (attendance == null) {
          _showBookingMessage(
            'This week is no longer available. Refresh and try again.',
            isError: true,
          );
          return false;
        }
        await timetableController.cancelStudentForWeek(
          classId: classInfo.id,
          studentId: entry.student.id,
          attendanceDocId: attendance.id,
        );
      }
      await timetableController.loadAttendanceForWeek(silent: true);
      return true;
    } catch (error, stackTrace) {
      final presented = presentError(
        error,
        action: 'update this enrolment',
        stackTrace: stackTrace,
      );
      // An ambiguous outcome is not painted red: the write may well have gone
      // through, and the danger colour asserts it did not.
      _showBookingMessage(presented.message, isError: !presented.isAmbiguous);
      return false;
    }
  }

  Future<String?> _saveAdminWeekBookings({
    required ClassModel classInfo,
    required AdminWeekBookingsUpdate update,
  }) async {
    if (!await _ensureOnlineFor('update weekly bookings')) {
      return 'Reconnect before updating weekly bookings.';
    }
    if (!mounted) return 'This editor is no longer available.';

    final attendanceDocId = update.attendanceDocId;
    if (attendanceDocId == null) {
      return 'This week has no generated session.';
    }

    final timetableController = context.read<TimetableController>();
    try {
      await timetableController.updateSessionBookingsChecked(
        classId: classInfo.id,
        attendanceDocId: attendanceDocId,
        expectedStudentIds: update.expectedStudentIds,
        studentIds: update.studentIds,
        updatedBy: context.read<AuthController>().currentUser?.uid ?? '',
      );
    } on SessionBookingsConflictException {
      return 'Weekly bookings changed while this editor was open. '
          'Review the refreshed roster before saving again.';
    } catch (error, stackTrace) {
      return presentError(
        error,
        action: 'update the bookings for this week',
        stackTrace: stackTrace,
      ).message;
    }

    if (mounted) _showBookingMessage('Weekly bookings updated.');
    return null;
  }

  Future<void> _showAdminFeedbackComposer(
    AdminRosterEntry entry,
    BuildContext screenContext,
  ) async {
    final authController = screenContext.read<AuthController>();
    final feedbackController = screenContext.read<FeedbackController>();
    final feedbackId = const Uuid().v4();

    final posted = await showAppBottomSheet<bool>(
      context: screenContext,
      allowUserDismissal: false,
      builder: (composerContext) => AdminFeedbackComposerSheet(
        studentName: entry.name,
        onCancel: () => Navigator.pop(composerContext),
        onSubmit: (subject, message) async {
          if (!await OfflineActionGuard.ensureOnline(
            composerContext,
            action: 'add feedback',
          )) {
            return false;
          }
          try {
            await feedbackController.addFeedback(
              StudentFeedback(
                id: feedbackId,
                studentId: entry.student.id,
                tutorId: authController.currentUser?.uid ?? '',
                parentIds: entry.student.parents,
                subject: subject,
                feedback: message,
                createdAt: DateTime.now(),
                isUnread: true,
              ),
            );
            return true;
          } catch (_) {
            return false;
          }
        },
      ),
    );
    if (posted == true && screenContext.mounted) {
      _showBookingMessage('Feedback posted.');
    }
  }

  /// The V3 class options sheet.
  ///
  /// Each option now says what it commits to, and both destructive actions
  /// confirm first. The legacy sheet showed five bare labels and fired
  /// `Cancel This Session` straight from the tap with no confirmation, while
  /// `Cancel Class` — which deletes the class and every enrolment — sat
  /// directly beneath it in the same red.
  Future<void> _showAdminClassOptionsDialog(
      ClassModel classInfo, Attendance? attendance) {
    return _loadAndShowAdminClassOptions(classInfo, attendance);
  }

  Future<void> _loadAndShowAdminClassOptions(
    ClassModel classInfo,
    Attendance? attendance,
  ) async {
    final timetableController = context.read<TimetableController>();
    final waitlistStateKnown = await timetableController.loadWaitlistForClass(
      classId: classInfo.id,
      silent: true,
    );
    if (!mounted) return;

    final options = buildAdminClassOptions(
      classModel: classInfo,
      attendance: attendance,
      waitlistStateKnown: waitlistStateKnown,
      hasWaitlistEntries: timetableController
              .waitlistEntriesByClass[classInfo.id]?.isNotEmpty ??
          false,
    );

    showAppBottomSheet<void>(
      context: context,
      builder: (sheetContext) => AdminClassOptionsSheet(
        classTitle: formatDashboardClassType(classInfo.type),
        whenLabel: '${classInfo.dayOfWeek} ${classInfo.startTime}',
        options: options,
        onSelected: (option) {
          if (!option.enabled) return;
          Navigator.pop(sheetContext);
          _handleAdminClassAction(option, classInfo, attendance);
        },
      ),
    );
  }

  Future<void> _handleAdminClassAction(
    AdminClassOption option,
    ClassModel classInfo,
    Attendance? attendance,
  ) async {
    final confirmation = confirmationFor(
      action: option.action,
      classModel: classInfo,
      attendance: attendance,
    );

    if (confirmation != null) {
      final confirmed = await _confirmAdminClassAction(confirmation);
      if (!confirmed || !mounted) return;
    }

    switch (option.action) {
      // The same V3 roll screen tutors use — it is the `Tutor Class Roll`
      // reference, and marking a roll is the same job whoever does it.
      case AdminClassAction.markRoll:
        final sessionId = attendance?.id;
        if (sessionId == null) return;
        await Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => ClassRollScreen(
              classInfo: classInfo,
              attendanceDocId: sessionId,
            ),
          ),
        );
        if (!mounted) return;
        await Provider.of<TimetableController>(context, listen: false)
            .loadAttendanceForWeek(silent: true);
      case AdminClassAction.editStudents:
        _showEditStudentsDialog(classInfo, attendance);
      case AdminClassAction.editTutors:
        await _showEditTutorsDialog(classInfo, attendance);
      case AdminClassAction.waitlist:
        _showAdminWaitlistDialog(classInfo);
      case AdminClassAction.toggleSession:
        await _toggleSessionCancelled(classInfo);
      case AdminClassAction.deleteClass:
        await _deleteAdminClass(classInfo);
    }
  }

  Future<bool> _confirmAdminClassAction(
    AdminClassConfirmation confirmation,
  ) {
    return showAppConfirmationSheet(
      context: context,
      title: confirmation.title,
      message: confirmation.message,
      confirmLabel: confirmation.confirmLabel,
      cancelLabel: 'Keep it',
      tone: confirmation.isDestructive
          ? AppConfirmationTone.destructive
          : AppConfirmationTone.standard,
    );
  }

  Future<void> _toggleSessionCancelled(ClassModel classInfo) async {
    if (!await _ensureOnlineFor('change this session')) return;
    if (!mounted) return;

    final timetableController =
        Provider.of<TimetableController>(context, listen: false);
    final authController = Provider.of<AuthController>(context, listen: false);

    final termId = timetableController.activeTerm?.id;
    if (termId == null) {
      _showBookingMessage('No active term found.', isError: true);
      return;
    }

    try {
      final isNowCancelled = await timetableController.toggleSessionCancelled(
        classId: classInfo.id,
        attendanceDocId: '${termId}_W${timetableController.currentWeek}',
        updatedBy: authController.currentUser?.uid ?? 'system',
      );
      await timetableController.loadAttendanceForWeek(silent: true);
      if (!mounted) return;

      _showBookingMessage(
        isNowCancelled ? 'This week cancelled.' : 'This week restored.',
      );
    } catch (e, stackTrace) {
      if (mounted) {
        final presented = presentError(
          e,
          action: 'change whether this week runs',
          stackTrace: stackTrace,
        );
        _showBookingMessage(presented.message, isError: !presented.isAmbiguous);
      }
    }
  }

  Future<void> _deleteAdminClass(ClassModel classInfo) async {
    if (!await _ensureOnlineFor('delete this class')) return;
    if (!mounted) return;

    final timetableController =
        Provider.of<TimetableController>(context, listen: false);

    try {
      await timetableController.deleteClass(classInfo.id);
      await timetableController.loadAllClasses();
      if (!mounted) return;
      // The legacy message said "Class cancelled", which described neither
      // what happened nor what it cost.
      _showBookingMessage('Class deleted.');
    } catch (e) {
      if (mounted) {
        _showBookingMessage(
          'The class could not be deleted. Remove all enrolments and '
          'waitlist entries first, then try again.',
          isError: true,
        );
      }
    }
  }

  void _showAdminWaitlistDialog(ClassModel classInfo) {
    showAppBottomSheet<void>(
      context: context,
      allowUserDismissal: false,
      builder: (sheetContext) => AdminWaitlistSheet(
        classTitle: formatDashboardClassType(classInfo.type),
        whenLabel: _classWhenLabel(classInfo),
        loadEntries: () => _loadWaitlistDisplayData(classInfo.id),
        onPromote: _confirmAndPromoteWaitlistEntry,
        onClose: () => Navigator.pop(sheetContext),
      ),
    );
  }

  Future<void> _confirmAndPromoteWaitlistEntry(
    AdminWaitlistEntryData data,
  ) async {
    final timetableController = context.read<TimetableController>();
    final confirmed = await showAppConfirmationSheet(
      context: context,
      title: 'Promote ${data.studentName}?',
      message: '${data.studentName} will become a permanent enrolment in this '
          'class. The server will refuse the promotion if the class filled or '
          'the waitlist entry changed.',
      confirmLabel: 'Promote',
    );
    if (!confirmed || !mounted) return;
    if (!await _ensureOnlineFor('promote this waitlist entry')) return;

    final result = await timetableController.promoteWaitlistEntry(
      entryId: data.entry.id,
    );
    if (!mounted) return;

    _showBookingMessage(
      result == null
          ? 'Promotion could not be processed.'
          : waitlistPromotionMessage(result, data.studentName),
      isError: result == null,
    );
  }

  Future<void> _showEditTutorsDialog(
    ClassModel classInfo,
    Attendance? attendance,
  ) async {
    try {
      final authController = context.read<AuthController>();
      final timetableController = context.read<TimetableController>();
      final tutors = await authController.fetchAllTutors();
      if (!mounted) return;

      final normalizedDay = classInfo.dayOfWeek.trim().toLowerCase();
      final dayClasses = timetableController.allClasses
          .where((candidate) =>
              candidate.dayOfWeek.trim().toLowerCase() == normalizedDay)
          .toList();
      final expectedStandingTutors = {
        for (final candidate in dayClasses)
          candidate.id: List<String>.from(candidate.tutors),
      };

      final expectedSessionTutors = <String, List<String>>{};
      for (final candidate in dayClasses) {
        Attendance? session = candidate.id == classInfo.id
            ? attendance
            : timetableController.attendanceByClass[candidate.id];
        final activeTerm = timetableController.activeTerm;
        if (session == null && activeTerm != null) {
          session = await timetableController.fetchAttendanceDocFor(
            classId: candidate.id,
            attendanceDocId:
                '${activeTerm.id}_W${timetableController.currentWeek}',
          );
        }
        if (session != null) {
          expectedSessionTutors[candidate.id] =
              List<String>.from(session.tutors);
        }
      }
      if (!mounted) return;

      final initialTutorIds = List<String>.from(
        (attendance?.tutors.isNotEmpty ?? false)
            ? attendance!.tutors
            : classInfo.tutors,
      );

      await showAppBottomSheet<void>(
        context: context,
        allowUserDismissal: false,
        builder: (sheetContext) => AdminTutorAssignmentSheet(
          classTitle: formatDashboardClassType(classInfo.type),
          whenLabel: _classWhenLabel(classInfo),
          currentWeek: timetableController.currentWeek,
          tutors: buildAdminTutorChoices(tutors),
          initialTutorIds: initialTutorIds,
          canApplyThisWeek: expectedSessionTutors.containsKey(classInfo.id),
          onCancel: () => Navigator.pop(sheetContext),
          onSubmit: (assignment) => _saveAdminTutorAssignment(
            classInfo: classInfo,
            assignment: assignment,
            expectedStandingTutors: expectedStandingTutors,
            expectedSessionTutors: expectedSessionTutors,
          ),
        ),
      );
    } catch (error) {
      if (mounted) {
        _showBookingMessage(
          'Tutors could not be loaded. Check your connection and try again.',
          isError: true,
        );
      }
    }
  }

  Future<String?> _saveAdminTutorAssignment({
    required ClassModel classInfo,
    required AdminTutorAssignment assignment,
    required Map<String, List<String>> expectedStandingTutors,
    required Map<String, List<String>> expectedSessionTutors,
  }) async {
    if (!await _ensureOnlineFor('update tutors')) {
      return 'Reconnect before updating tutors.';
    }
    if (!mounted) return 'This editor is no longer available.';

    final timetableController = context.read<TimetableController>();
    final authController = context.read<AuthController>();
    final activeTerm = timetableController.activeTerm;
    if (activeTerm == null) return 'No active term is available.';

    final standingTargets = assignment.scope == AdminTutorScope.classOnly
        ? {
            if (expectedStandingTutors[classInfo.id] != null)
              classInfo.id: expectedStandingTutors[classInfo.id]!,
          }
        : expectedStandingTutors;
    final sessionTargets = assignment.scope == AdminTutorScope.classOnly
        ? {
            if (expectedSessionTutors[classInfo.id] != null)
              classInfo.id: expectedSessionTutors[classInfo.id]!,
          }
        : expectedSessionTutors;

    try {
      if (assignment.effective == AdminTutorEffective.thisWeek) {
        if (sessionTargets.isEmpty) {
          return 'No generated sessions are available for this selection.';
        }
        await timetableController.updateSessionTutorsChecked(
          attendanceDocId:
              '${activeTerm.id}_W${timetableController.currentWeek}',
          expectedTutorIdsByClass: sessionTargets,
          tutorIds: assignment.tutorIds,
          updatedBy: authController.currentUser?.uid ?? 'system',
        );
      } else {
        await timetableController.updateStandingTutorsChecked(
          expectedTutorIdsByClass: standingTargets,
          tutorIds: assignment.tutorIds,
          fromDate: startOfTermWeek(
            activeTerm.startDate,
            timetableController.currentWeek,
          ),
          updatedBy: authController.currentUser?.uid ?? 'system',
        );
      }

      if (mounted) {
        _showBookingMessage(
          assignment.scope == AdminTutorScope.day
              ? 'Tutors updated for all ${classInfo.dayOfWeek} classes.'
              : 'Tutors updated.',
        );
      }
      return null;
    } on TutorAssignmentConflictException {
      return 'Tutor assignments changed while this editor was open. '
          'Review the refreshed timetable before saving again.';
    } on TutorAssignmentPropagationException {
      return 'The standing assignment was saved, but some generated future '
          'sessions were not updated. Refresh before retrying.';
    } catch (error, stackTrace) {
      return presentError(
        error,
        action: 'update the tutors',
        stackTrace: stackTrace,
      ).message;
    }
  }

  void _showAddClassDialog(BuildContext context) async {
    final authController = context.read<AuthController>();
    // Stable across retries: a lost callable response can be reconciled with
    // the class created by the atomic backend operation.
    final newClassId = DateTime.now().millisecondsSinceEpoch.toString();
    try {
      final tutors = await authController.fetchAllTutors();
      if (!context.mounted) return;

      await showAppBottomSheet<void>(
        context: context,
        allowUserDismissal: false,
        builder: (sheetContext) => AdminAddClassSheet(
          tutors: buildAdminTutorChoices(tutors),
          onCancel: () => Navigator.pop(sheetContext),
          onSubmit: (draft) async {
            final timetableController =
                sheetContext.read<TimetableController>();
            if (!await OfflineActionGuard.ensureOnline(
              sheetContext,
              action: 'add this class',
            )) {
              return 'Reconnect before adding this class.';
            }

            try {
              await timetableController.createNewClass(
                draft.toClassModel(id: newClassId),
              );
            } catch (error, stackTrace) {
              return presentError(
                error,
                action: 'add this class',
                stackTrace: stackTrace,
              ).message;
            }
            if (mounted) {
              await _loadAdminNames();
              _showBookingMessage('Class added.');
            }
            return null;
          },
        ),
      );
    } catch (error, stackTrace) {
      if (context.mounted) {
        _showBookingMessage(
          presentError(
            error,
            action: 'load the tutor list',
            stackTrace: stackTrace,
          ).message,
          isError: true,
        );
      }
    }
  }
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
