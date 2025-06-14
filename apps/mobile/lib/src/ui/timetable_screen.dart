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
import 'package:tenacity/src/helpers/student_names.dart';
import 'package:tenacity/src/helpers/student_search.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/feedback_model.dart';
import 'package:tenacity/src/models/parent_model.dart';
import 'package:tenacity/src/models/student_model.dart';

class TimetableScreen extends StatefulWidget {
  const TimetableScreen({super.key});

  @override
  TimetableScreenState createState() => TimetableScreenState();
}

class TimetableScreenState extends State<TimetableScreen> {
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

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final timetableController =
          Provider.of<TimetableController>(context, listen: false);
      _initData(timetableController);
    });
  }

  Future<void> _initData(TimetableController controller) async {
    // 1) let the controller compute & notify currentWeek with its own rollover logic
    await controller.loadActiveTerm();

    // 2) trigger a rebuild so the week selector updates immediately
    setState(() {});

    // 3) now load classes & attendance for that week
    await controller.loadAllClasses();
    await controller.loadAttendanceForWeek();
  }

  Future<void> _processOneOffBooking(
    ClassModel classInfo,
    List<String> selectedChildIds,
    String attendanceDocId,
  ) async {
    final timetableController = context.read<TimetableController>();
    final invoiceController = context.read<InvoiceController>();
    final authController = context.read<AuthController>();
    final parentUser = authController.currentUser as Parent;
    final parentId = parentUser.uid;

    // Check if parent has enough tokens for all selected children
    final parentTokenCount = parentUser.lessonTokens;
    final numToBook = selectedChildIds.length;

    if (parentTokenCount >= numToBook) {
      // Use tokens for all bookings
      await timetableController.decrementTokens(parentId, numToBook,
          context: context);
      for (String childId in selectedChildIds) {
        await timetableController.enrollStudentOneOff(
          classId: classInfo.id,
          studentId: childId,
          attendanceDocId: attendanceDocId,
        );
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Booking successful!")),
      );
      Navigator.pop(context);
      return;
    }

    // Use tokens for as many as possible, pay for the rest
    int tokensToUse = parentTokenCount;
    int toPayFor = numToBook - tokensToUse;

    // Book with tokens
    if (tokensToUse > 0) {
      await timetableController.decrementTokens(parentId, tokensToUse,
          context: context);
      for (String childId in selectedChildIds.take(tokensToUse)) {
        await timetableController.enrollStudentOneOff(
          classId: classInfo.id,
          studentId: childId,
          attendanceDocId: attendanceDocId,
        );
      }
    }

    // Pay for the rest
    if (toPayFor > 0) {
      final remoteConfig = FirebaseRemoteConfig.instance;
      final oneOffClassPrice = remoteConfig.getDouble('one_off_class_price');
      final totalAmount = oneOffClassPrice * toPayFor;
      final clientSecret = await invoiceController.initiatePayment(
        amount: totalAmount,
        currency: 'aud',
      );

      try {
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
          for (String childId in selectedChildIds.skip(tokensToUse)) {
            await timetableController.enrollStudentOneOff(
              classId: classInfo.id,
              studentId: childId,
              attendanceDocId: attendanceDocId,
            );
          }
          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text("Booking successful!")),
          );
          Navigator.pop(context);
        } else {
          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text("Payment verification failed. Please try again."),
              backgroundColor: Colors.red,
            ),
          );
        }
      } on StripeException catch (e) {
        // User cancelled or payment failed
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              e.error.localizedMessage ?? "Payment cancelled or failed.",
              style: const TextStyle(color: Colors.red),
            ),
            backgroundColor: Colors.red,
          ),
        );
        // Reset any loading state or re-enable buttons here if needed
      } catch (e) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text("An unexpected error occurred."),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
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
    if (timetableController.isLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (timetableController.errorMessage != null) {
      // Show error as a snackbar and clear it
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
      return const Center(child: Text('No active term found.'));
    }
    final allClasses = timetableController.allClasses;
    if (allClasses.isEmpty) {
      return const Center(child: Text('No classes available.'));
    }
    return _buildTimetableContent(timetableController, authController);
  }

  Widget _buildTimetableContent(
      TimetableController timetableController, AuthController authController) {
    final currentWeek = timetableController.currentWeek;
    final activeTerm = timetableController.activeTerm!;
    final termStart = activeTerm.startDate;
    final termStartWeekday = termStart.weekday;
    final firstMonday =
        termStart.subtract(Duration(days: termStartWeekday - 1));
    final startOfCurrentWeek =
        firstMonday.add(Duration(days: (currentWeek - 1) * 7));
    final formattedStart = DateFormat('dd/MM').format(startOfCurrentWeek);

    final currentUser = authController.currentUser;
    final userRole = currentUser?.role ?? 'parent';
    List<String> userStudentIds = [];
    if (currentUser != null && currentUser.role == 'parent') {
      final parentUser = currentUser as Parent;
      userStudentIds = parentUser.students;
    }

    int allowedMinWeek = 1;
    int allowedMaxWeek = activeTerm.totalWeeks;

    // Wrap the UI in a FutureBuilder to fetch the eligible subject codes if the user is a parent.
    return FutureBuilder<Set<String>>(
      future: userRole == 'parent'
          ? timetableController.getEligibleSubjects(context)
          : Future.value(<String>{}), // for non-parents, use an empty set
      builder: (context, snapshot) {
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

        // For regular users, apply filtering. For admins/tutors, filter out classes they are tutoring.
        final filteredClasses = (userRole != 'admin' && userRole != 'tutor')
            ? timetableController.allClasses.where((classModel) {
                final classSessionDateTime =
                    timetableController.computeClassSessionDate(classModel);
                final isInFuture =
                    classSessionDateTime.isAfter(DateTime.now()) ||
                        classSessionDateTime.isAtSameMomentAs(DateTime.now());
                if (!isInFuture) return false;
                final attendance =
                    timetableController.attendanceByClass[classModel.id];
                final currentlyEnrolled = attendance?.attendance.length ?? 0;
                return (currentlyEnrolled < classModel.capacity) &&
                    timetableController.isEligibleClass(
                        classModel, eligibleSubjects);
              }).toList()
            : timetableController.allClasses.where((classModel) {
                final attendance =
                    timetableController.attendanceByClass[classModel.id];
                // Exclude classes where the admin/tutor is already assigned.
                return attendance == null ||
                    !attendance.tutors
                        .contains(authController.currentUser!.uid);
              }).toList();

        // "Your Classes" – for parents: classes where a parent's child is enrolled,
        // for admins/tutors: classes where the tutor is teaching.
        final yourClasses = timetableController.allClasses.where((c) {
          final attendance = timetableController.attendanceByClass[c.id];
          if (attendance != null) {
            if (userRole == 'tutor' || userRole == 'admin') {
              return attendance.tutors
                  .contains(authController.currentUser!.uid);
            } else {
              return attendance.attendance
                  .any((id) => userStudentIds.contains(id));
            }
          }
          return false;
        }).toList();

        // Group the filtered classes by day.
        final Map<String, List<ClassModel>> classesByDay = {};
        for (var c in filteredClasses) {
          final day = c.dayOfWeek.isEmpty ? "Unknown" : c.dayOfWeek;
          classesByDay.putIfAbsent(day, () => []);
          classesByDay[day]!.add(c);
        }
        List<String> sortedDays = classesByDay.keys.toList()
          ..sort((a, b) => _dayOffset(a).compareTo(_dayOffset(b)));

        return Column(
          children: [
            // Week selector
            Padding(
              padding: const EdgeInsets.all(16.0),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_back),
                    onPressed: (timetableController.currentWeek >
                            allowedMinWeek)
                        ? () async {
                            timetableController.decrementWeek();
                            setState(() {});
                            await timetableController.loadAttendanceForWeek();
                          }
                        : null,
                  ),
                  Text(
                    'Week ${timetableController.currentWeek} ($formattedStart)',
                    style: const TextStyle(
                        fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  IconButton(
                    icon: const Icon(Icons.arrow_forward),
                    onPressed: (timetableController.currentWeek <
                            allowedMaxWeek)
                        ? () async {
                            timetableController.incrementWeek();
                            setState(() {});
                            if (!mounted) return;
                            await timetableController.loadAttendanceForWeek();
                          }
                        : null,
                  ),
                ],
              ),
            ),
            // Main content using filteredClasses grouped by day
            Expanded(
              child: ListView(
                children: [
                  // "Your Classes" Section
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 16, horizontal: 16),
                    child: Text(
                      'Your Classes',
                      style:
                          TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                    ),
                  ),
                  if (yourClasses.isEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Text(
                        'Looks like you have no classes this week!',
                        style: TextStyle(fontSize: 16, color: Colors.grey[700]),
                      ),
                    )
                  else
                    ...yourClasses.map((classInfo) {
                      final attendance =
                          timetableController.attendanceByClass[classInfo.id];
                      final currentlyEnrolled =
                          attendance?.attendance.length ?? 0;
                      final spotsRemaining =
                          classInfo.capacity - currentlyEnrolled;
                      final relevantChildIds = (attendance?.attendance ?? [])
                          .where((id) => userStudentIds.contains(id))
                          .toList();
                      return _buildClassCard(
                        classInfo: classInfo,
                        spotsRemaining: spotsRemaining,
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
                            _showAdminClassOptionsDialog(classInfo, attendance);
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
                        "Oops! Looks like all our classes are full for this week.",
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
                                    .where((id) => userStudentIds.contains(id))
                                    .toList())
                                : userStudentIds;
                            final bool isPast = timetableController
                                .computeClassSessionDate(classInfo)
                                .isBefore(DateTime.now());
                            final bool disableTap =
                                (isPast && userRole != 'admin') ||
                                    (userRole != 'admin' &&
                                        spotsRemaining <= 0 &&
                                        !isOwnClass);
                            return _buildClassCard(
                              classInfo: classInfo,
                              spotsRemaining: spotsRemaining,
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
                              onTap: disableTap
                                  ? () {}
                                  : () {
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
                              showStudentNames:
                                  (userRole == 'admin' || userRole == 'tutor'),
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
      },
    );
  }

  // Build a card for a class.
  Widget _buildClassCard({
    required ClassModel classInfo,
    required int spotsRemaining,
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
    final bool disableInteraction =
        !isOwnClass && spotsRemaining <= 0 && !isAdmin & !isTutor;

    final formattedStartTime = DateFormat("h:mm a")
        .format(DateFormat("HH:mm").parse(classInfo.startTime));
    return GestureDetector(
      // Disable onTap if the session is in the past.
      onTap: ((isPast || disableInteraction) && !isAdmin && !isTutor)
          ? null
          : onTap,
      child: SizedBox(
        width: double.infinity,
        child: Card(
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
                    color: barColor,
                    borderRadius: const BorderRadius.only(
                      topLeft: Radius.circular(10),
                      bottomLeft: Radius.circular(10),
                    ),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20.0, 16.0, 16.0, 16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${classInfo.dayOfWeek} $formattedStartTime',
                      style: const TextStyle(
                          fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Available Spots: $spotsRemaining',
                      style: TextStyle(fontSize: 16, color: Colors.grey[700]),
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
          style: const TextStyle(fontSize: 16, color: Colors.black),
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
          ActionOption("Cancel this class")
        ];
      } else {
        // For permanent enrollments, show two distinct swap options.
        options = [
          ActionOption("Notify of absence"),
          ActionOption("Swap (This Week)"), // one‑week only swap
          ActionOption("Swap (Permanent)"), // update permanent enrolment
        ];
        if (additionalChildren.isNotEmpty &&
            classInfo.capacity - attendance!.attendance.length > 0) {
          options.add(ActionOption("Enrol another student (This Week)"));
        }
        if (additionalChildren.isNotEmpty &&
            classInfo.capacity - classInfo.enrolledStudents.length > 0) {
          options.add(ActionOption("Enrol another student (Permanent)"));
        }
      }
    } else {
      final int currentAttendance = attendance?.attendance.length ?? 0;
      final int permanentEnrolled = classInfo.enrolledStudents.length;
      final int cancelledSpots =
          (permanentEnrolled - currentAttendance).clamp(0, permanentEnrolled);
      final int permanentSlotsOpen =
          (classInfo.capacity - permanentEnrolled).clamp(0, classInfo.capacity);

      // 1) compute "today’s" week index
      final termStart = timetableController.activeTerm!.startDate;
      final now = DateTime.now();
      int todayWeek = now.isBefore(termStart)
          ? 1
          : ((now.difference(termStart).inDays ~/ 7) + 1)
              .clamp(1, timetableController.activeTerm!.totalWeeks);

      // 2) how many weeks ahead is the displayed week?
      final int displayedWeek = timetableController.currentWeek;
      final int weeksAhead = displayedWeek - todayWeek;

      // One-off: either a cancelled spot *or* a permanent slot if within 0 or 1 weeks ahead
      final bool allowOneOffPermanent =
          weeksAhead >= 0 && weeksAhead <= 1 && permanentSlotsOpen > 0;

      options.add(
        ActionOption(
          "Book one-off class",
          enabled: (cancelledSpots > 0) || allowOneOffPermanent,
          hint: (cancelledSpots > 0)
              ? null
              : (allowOneOffPermanent
                  ? null
                  : "Sorry, you can only book a one-off class if there are cancelled spots, or if the class is the current or following week."),
        ),
      );

      // Permanent
      options.add(
        ActionOption(
          "Enrol permanent",
          enabled: permanentSlotsOpen > 0,
          hint: permanentSlotsOpen > 0
              ? null
              : "Class is at full permanent capacity",
        ),
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
                      } else if (option.title ==
                          "Enrol another student (This Week)") {
                        // For additional enrolment, pass the extra (unenrolled) children.
                        final additionalChildren = userStudentIds
                            .where((id) =>
                                !(relevantChildIds?.contains(id) ?? false))
                            .toList();
                        _showChildSelectionDialog(
                          "Book one-off class",
                          classInfo,
                          attendanceDocId,
                          additionalChildren,
                        );
                      } else if (option.title ==
                          "Enrol another student (Permanent)") {
                        // For additional enrolment, pass the extra (unenrolled) children.
                        final additionalChildren = userStudentIds
                            .where((id) =>
                                !(relevantChildIds?.contains(id) ?? false))
                            .toList();
                        _showChildSelectionDialog(
                          "Enrol permanent",
                          classInfo,
                          attendanceDocId,
                          additionalChildren,
                        );
                      } else {
                        // For other actions, follow the existing flow.
                        if (isOwnClass &&
                            (relevantChildIds?.length ?? 0) == 1 &&
                            (option.title == "Enrol permanent" ||
                                option.title == "Book one-off class")) {
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
              const Divider(height: 1, thickness: 1),
              ListTile(
                title: const Text('Back', style: TextStyle(color: Colors.red)),
                onTap: () => Navigator.pop(context),
              ),
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
      if (action == "Swap (This Week)" &&
          timetableController.currentWeek == currentWeekFromNow &&
          _dayOffset(c.dayOfWeek) < _dayOffset(oldClass.dayOfWeek)) {
        return false;
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
                        final authController =
                            Provider.of<AuthController>(context, listen: false);
                        final parentUser = authController.currentUser as Parent;
                        final tokens = parentUser.lessonTokens;
                        String message;

                        if (action == "Book one-off class" ||
                            action == "Enrol another student (This Week)") {
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
                        } else if (action == "Enrol permanent" ||
                            action == "Enrol another student (Permanent)") {
                          final timetableController =
                              Provider.of<TimetableController>(context,
                                  listen: false);
                          final activeTerm = timetableController.activeTerm;
                          final weeksRemaining = activeTerm != null
                              ? activeTerm.totalWeeks -
                                  timetableController.currentWeek +
                                  1
                              : 1;
                          final totalSessions =
                              childNames.length * weeksRemaining;
                          if (tokens == 0) {
                            message =
                                "Are you sure you want to permanently enrol ${childNames.join(', ')}?\n\nYou have no lesson tokens available. You will be invoiced for all $totalSessions sessions.";
                          } else if (tokens >= totalSessions) {
                            message =
                                "Are you sure you want to permanently enrol ${childNames.join(', ')}?\n\nYou have $tokens lesson token${tokens > 1 ? 's' : ''} available. $totalSessions token${totalSessions > 1 ? 's will' : ' will'} be used for the entire term. No invoice will be generated.";
                          } else {
                            final toInvoice = totalSessions - tokens;
                            message =
                                "Are you sure you want to permanently enrol ${childNames.join(', ')}?\n\nYou have $tokens lesson token${tokens > 1 ? 's' : ''} available. $tokens will be used, and you will be invoiced for the remaining $toInvoice session${toInvoice > 1 ? 's' : ''}.";
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
                          onPressed: () => Navigator.pop(context),
                          child: const Text("Cancel"),
                        ),
                        ElevatedButton(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Theme.of(context).primaryColorDark,
                          ),
                          onPressed: () async {
                            final timetableController =
                                Provider.of<TimetableController>(context,
                                    listen: false);
                            final authController = Provider.of<AuthController>(
                                context,
                                listen: false);
                            final parentUser =
                                authController.currentUser as Parent;
                            final parentId = parentUser.uid;

                            if (action == "Book one-off class" ||
                                action == "Enrol another student (This Week)") {
                              await _processOneOffBooking(
                                  classInfo, selectedChildIds, attendanceDocId);
                            } else if (action == "Notify of absence" ||
                                action == "Cancel this class") {
                              // Both actions do the same: remove the student from this week's attendance
                              bool anyTokenAwarded = false;
                              for (var childId in selectedChildIds) {
                                bool tokenAwarded =
                                    await timetableController.notifyAbsence(
                                        classId: classInfo.id,
                                        studentId: childId,
                                        attendanceDocId: attendanceDocId,
                                        parentId: parentId,
                                        context: context);
                                if (tokenAwarded) {
                                  anyTokenAwarded = true;
                                }
                              }

                              await timetableController.loadAttendanceForWeek();

                              // Show a snackbar based on whether a token was awarded.
                              if (!context.mounted) return;
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text(anyTokenAwarded
                                      ? "Absence notified! You have been awarded a lesson token."
                                      : "Absence notified! No lesson token awarded as notification was after 10 AM."),
                                ),
                              );
                            } else if (action == "Enrol permanent" ||
                                action == "Enrol another student (Permanent)") {
                              final timetableController =
                                  Provider.of<TimetableController>(context,
                                      listen: false);
                              final authController =
                                  Provider.of<AuthController>(context,
                                      listen: false);
                              final parentUser =
                                  authController.currentUser as Parent;
                              final parentId = parentUser.uid;
                              final tokensAvailable = parentUser.lessonTokens;

                              // Calculate weeks and sessions
                              final activeTerm = timetableController.activeTerm;
                              final weeks = (activeTerm != null)
                                  ? activeTerm.totalWeeks -
                                      timetableController.currentWeek +
                                      1
                                  : 1;
                              final totalSessions =
                                  selectedChildIds.length * weeks;

                              // Use as many tokens as possible
                              final tokensToUse =
                                  tokensAvailable >= totalSessions
                                      ? totalSessions
                                      : tokensAvailable;

                              // Enrol students permanently
                              for (var childId in selectedChildIds) {
                                await timetableController
                                    .enrollStudentPermanent(
                                  classId: classInfo.id,
                                  studentId: childId,
                                );
                              }

                              // Decrement tokens
                              if (tokensToUse > 0) {
                                await timetableController.decrementTokens(
                                    parentId, tokensToUse,
                                    context: context);
                              }

                              // Fetch Student objects
                              List<Student> enrolledStudents = [];
                              for (final id in selectedChildIds) {
                                final student =
                                    await authController.fetchStudentData(id);
                                if (student != null) {
                                  enrolledStudents.add(student);
                                }
                              }

                              // Create invoice with token discount
                              if (!context.mounted) return;
                              final invoiceController =
                                  context.read<InvoiceController>();
                              await invoiceController.createInvoice(
                                parentId: parentUser.uid,
                                parentName:
                                    "${parentUser.firstName} ${parentUser.lastName}",
                                parentEmail: parentUser.email,
                                students: enrolledStudents,
                                sessionsPerStudent:
                                    List.filled(enrolledStudents.length, 1),
                                weeks: weeks,
                                tokensUsed: tokensToUse, // <-- pass tokens used
                                dueDate: DateTime.now()
                                    .add(const Duration(days: 21)),
                              );
                            } else if (action == "Enrol another student") {}
                            await timetableController.loadAttendanceForWeek();
                            if (!context.mounted) return;
                            Navigator.pop(context);
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
    final authController = Provider.of<AuthController>(context, listen: false);
    final timetableController =
        Provider.of<TimetableController>(context, listen: false);
    final isAdmin = authController.currentUser?.role == 'admin';
    final isTutor = authController.currentUser?.role == 'tutor';

    // All students for this session (permanent + one-off)
    final Set<String> allStudentIds = {
      ...classInfo.enrolledStudents,
      ...(attendance?.attendance ?? []),
    };

    // Copy attendance list for editing
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
                                _showEnrollStudentDialog(classInfo, context);
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
                              final isPermanent = classInfo.enrolledStudents
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
                                                          autofocus: true,
                                                          maxLines: 1,
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
                                                          maxLines: 4,
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
                                                        onPressed: () {
                                                          Navigator.pop(ctx);
                                                        },
                                                        child: const Text(
                                                            "Cancel"),
                                                      ),
                                                      ElevatedButton(
                                                        onPressed: (feedbackSubject
                                                                    .trim()
                                                                    .isEmpty ||
                                                                feedbackMessage
                                                                    .trim()
                                                                    .isEmpty)
                                                            ? null
                                                            : () async {
                                                                final feedbackController =
                                                                    Provider.of<
                                                                            FeedbackController>(
                                                                        context,
                                                                        listen:
                                                                            false);
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
                                                                      currentUser
                                                                              ?.uid ??
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
                                                                if (context
                                                                    .mounted) {
                                                                  Navigator.pop(
                                                                      ctx);
                                                                  ScaffoldMessenger.of(
                                                                          context)
                                                                      .showSnackBar(
                                                                    const SnackBar(
                                                                        content:
                                                                            Text("Feedback posted!")),
                                                                  );
                                                                }
                                                              },
                                                        child: const Text(
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
                          // Save attendance
                          if (attendance != null) {
                            final updatedAttendance = attendance.copyWith(
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
                          Navigator.pop(context);
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
                title: const Text("Cancel Class"),
                onTap: () {
                  Navigator.pop(context);
                  _showAdminCancelClassConfirmation(classInfo);
                },
              ),
              ListTile(
                title: const Text('Back', style: TextStyle(color: Colors.red)),
                onTap: () => Navigator.pop(context),
              ),
            ],
          ),
        );
      },
    );
  }

  void _showEditTutorsDialog(
      ClassModel classInfo, Attendance? attendance) async {
    final authController = Provider.of<AuthController>(context, listen: false);
    final tutors = await authController.fetchAllTutors();

    List<String> currentTutorIds = List.from(attendance!.tutors);
    List<String> updatedTutorIds = List.from(currentTutorIds);

    // First dialog: select tutors
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
                child: ListView(
                  shrinkWrap: true,
                  children: tutors.map((tutor) {
                    final isSelected = updatedTutorIds.contains(tutor.uid);
                    return CheckboxListTile(
                      value: isSelected,
                      title: Text('${tutor.firstName} ${tutor.lastName}'),
                      onChanged: (checked) {
                        setState(() {
                          if (checked == true) {
                            updatedTutorIds.add(tutor.uid);
                          } else {
                            updatedTutorIds.remove(tutor.uid);
                          }
                        });
                      },
                    );
                  }).toList(),
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
                      : () {
                          Navigator.pop(ctx);
                          _promptTutorActionType(
                              classInfo, attendance, updatedTutorIds);
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

  void _promptTutorActionType(ClassModel classInfo, Attendance? attendance,
      List<String> updatedTutorIds) {
    showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: const Text("Update Tutor Assignment"),
          content: const Text(
              "Would you like to update this assignment for this week or permanently?"),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(ctx); // Cancel and do nothing.
              },
              child: const Text("Cancel"),
            ),
            TextButton(
              onPressed: () async {
                Navigator.pop(ctx);
                // Week‑specific update: update the attendance document
                final updatedAttendance =
                    attendance!.copyWith(tutors: updatedTutorIds);
                final timetableController =
                    Provider.of<TimetableController>(context, listen: false);
                await timetableController.updateAttendanceDoc(
                    updatedAttendance, classInfo.id);
                await timetableController.loadAttendanceForWeek();
              },
              child: const Text("This Week"),
            ),
            TextButton(
              onPressed: () async {
                Navigator.pop(ctx);
                // Permanent update: update the class document
                final updatedClass =
                    classInfo.copyWith(tutors: updatedTutorIds);
                final timetableController =
                    Provider.of<TimetableController>(context, listen: false);
                await timetableController.updateClass(updatedClass);
                await timetableController.loadAttendanceForWeek();
              },
              child: const Text("Permanent"),
            ),
          ],
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

void _showEnrollStudentDialog(
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
  if (student == null) return; // No student selected, do nothing.

  // Ask the admin which type of enrollment to perform.
  if (!context.mounted) return;
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
    return;
  }

  try {
    if (enrollPermanent) {
      // Permanently enroll the student.
      await timetableController.enrollStudentPermanent(
        classId: classInfo.id,
        studentId: student.id,
      );
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text("Student ${student.firstName} enrolled permanently."),
        ),
      );
    } else {
      // For one‑off booking, compute the attendanceDocId.
      final attendanceDocId =
          '${timetableController.activeTerm!.id}_W${timetableController.currentWeek}';
      await timetableController.enrollStudentOneOff(
        classId: classInfo.id,
        studentId: student.id,
        attendanceDocId: attendanceDocId,
      );
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text("Student ${student.firstName} enrolled one‑off."),
        ),
      );
    }
    // Refresh attendance data if enrollment was performed.
    await timetableController.loadAttendanceForWeek();
  } catch (error) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text("Error enrolling student: $error")),
    );
  }
}
