import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/timetable_controller.dart';
import 'package:tenacity/src/helpers/action_option.dart';
import 'package:tenacity/src/helpers/student_names.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/parent_model.dart';

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
    '16:00', '16:30',
    '17:00', '17:30',
    '18:00', '18:30',
    '19:00', '19:30',
    '20:00', '20:30',
    '21:00', '21:30',
    '22:00'
  ];

  final List<int> _capacities = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  @override
  void initState() {
    super.initState();
    final timetableController =
        Provider.of<TimetableController>(context, listen: false);
    _initData(timetableController);
  }

  Future<void> _initData(TimetableController controller) async {
    await controller.loadActiveTerm();
    await controller.loadAllClasses();
    await controller.loadAttendanceForWeek();
  }

  @override
  Widget build(BuildContext context) {
    final timetableController = context.watch<TimetableController>();
    final authController = context.watch<AuthController>();

    // Determine the user's role (defaulting to 'parent')
    final userRole = authController.currentUser?.role ?? 'parent';

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          "Timetable",
          style: TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
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
      return Center(child: Text(timetableController.errorMessage!));
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
    final startOfCurrentWeek =
        activeTerm.startDate.add(Duration(days: (currentWeek - 1) * 7));
    final formattedStart = DateFormat('dd/MM').format(startOfCurrentWeek);

    final currentUser = authController.currentUser;
    final userRole = currentUser?.role ?? 'parent';
    List<String> userStudentIds = [];
    if (currentUser != null && currentUser.role == 'parent') {
      final parentUser = currentUser as Parent;
      userStudentIds = parentUser.students;
    }

    // "Your Classes" for parents are classes where at least one child is enrolled.
    final yourClasses = timetableController.allClasses.where((c) {
      final attendance = timetableController.attendanceByClass[c.id];
      if (attendance != null) {
        return attendance.attendance.any((id) => userStudentIds.contains(id));
      }
      return false;
    }).toList();

    // Organize classes by day.
    final Map<String, List<ClassModel>> classesByDay = {};
    for (var c in timetableController.allClasses) {
      final day = c.dayOfWeek.isEmpty ? "Unknown" : c.dayOfWeek;
      classesByDay.putIfAbsent(day, () => []);
      classesByDay[day]!.add(c);
    }

    return Column(
      children: [
        // Week Selector
        Padding(
          padding: const EdgeInsets.all(16.0),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: currentWeek > 1
                    ? () async {
                        timetableController.decrementWeek();
                        await timetableController.loadAttendanceForWeek();
                      }
                    : null,
              ),
              Text(
                'Week $currentWeek ($formattedStart)',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              IconButton(
                icon: const Icon(Icons.arrow_forward),
                onPressed: currentWeek < activeTerm.totalWeeks
                    ? () async {
                        timetableController.incrementWeek();
                        await timetableController.loadAttendanceForWeek();
                      }
                    : null,
              ),
            ],
          ),
        ),
        // Main Content
        Expanded(
          child: ListView(
            children: [
              // "Your Classes" Section
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 16, horizontal: 16),
                child: Text(
                  'Your Classes',
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                ),
              ),
              if (yourClasses.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Text(
                    'No classes enrolled for this week.',
                    style: TextStyle(fontSize: 16, color: Colors.grey[700]),
                  ),
                )
              else
                ...yourClasses.map((classInfo) {
                  final attendance =
                      timetableController.attendanceByClass[classInfo.id];
                  final currentlyEnrolled =
                      attendance?.attendance.length ?? classInfo.enrolledStudents.length;
                  final spotsRemaining = classInfo.capacity - currentlyEnrolled;
                  // For parent's "Your Classes", these are their own classes.
                  const bool isOwnClass = true;
                  return _buildClassCard(
                    classInfo: classInfo,
                    spotsRemaining: spotsRemaining,
                    barColor: const Color(0xFF1C71AF),
                    onTap: () {
                      _showClassOptionsDialog(
                        classInfo,
                        isOwnClass,
                        attendance,
                        userStudentIds,
                      );
                    },
                    showStudentNames: (userRole == 'admin' || userRole == 'tutor'),
                    studentIdsToShow: attendance?.attendance ?? [],
                  );
                }),
              // "All Classes" Section
              if (classesByDay.isNotEmpty) ...[
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 16, horizontal: 16),
                  child: Text(
                    'All Classes',
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                  ),
                ),
                ...classesByDay.entries.map((entry) {
                  final day = entry.key;
                  final dayClasses = entry.value;
                  dayClasses.sort((a, b) => a.startTime.compareTo(b.startTime));
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Day header
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        child: Text(
                          day,
                          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                        ),
                      ),
                      // Classes for that day
                      ...dayClasses.map((classInfo) {
                        final attendance =
                            timetableController.attendanceByClass[classInfo.id];
                        final currentlyEnrolled =
                            attendance?.attendance.length ?? classInfo.enrolledStudents.length;
                        final spotsRemaining = classInfo.capacity - currentlyEnrolled;
                        final bool isOwnClass = classInfo.enrolledStudents
                            .any((id) => userStudentIds.contains(id));
                        return _buildClassCard(
                          classInfo: classInfo,
                          spotsRemaining: spotsRemaining,
                          barColor: isOwnClass
                              ? const Color(0xFF1C71AF)
                              : (spotsRemaining > 1
                                  ? const Color.fromARGB(255, 50, 151, 53)
                                  : (spotsRemaining == 1 ? Colors.amber : const Color.fromARGB(255, 244, 51, 37))),
                          onTap: () {
                            _showClassOptionsDialog(
                              classInfo,
                              isOwnClass,
                              attendance,
                              userStudentIds,
                            );
                          },
                          showStudentNames: (userRole == 'admin' || userRole == 'tutor'),
                          studentIdsToShow: attendance?.attendance ?? [],
                        );
                      }),
                    ],
                  );
                }),
              ],
            ],
          ),
        ),
      ],
    );
  }

  // Build a card for a class.
  Widget _buildClassCard({
    required ClassModel classInfo,
    required int spotsRemaining,
    required Color barColor,
    required VoidCallback onTap,
    required bool showStudentNames,
    List<String>? studentIdsToShow,
  }) {
    final formattedStartTime = DateFormat("h:mm a")
        .format(DateFormat("HH:mm").parse(classInfo.startTime));
    return GestureDetector(
      onTap: onTap,
      child: SizedBox(
        width: double.infinity,
        child: Card(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
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
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Available Spots: $spotsRemaining',
                      style: TextStyle(fontSize: 16, color: Colors.grey[700]),
                    ),
                    if (showStudentNames) ...[
                      const SizedBox(height: 8),
                      studentIdsToShow != null && studentIdsToShow.isNotEmpty
                          ? StudentNamesWidget(studentIds: studentIdsToShow)
                          : Text(
                              'Students: [No attendance data]',
                              style: TextStyle(fontSize: 16, color: Colors.grey[700]),
                            ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // When a class card is tapped, show an options dialog.
  void _showClassOptionsDialog(
      ClassModel classInfo,
      bool isOwnClass,
      Attendance? attendance,
      List<String> userStudentIds,
      ) {
    final timetableController =
        Provider.of<TimetableController>(context, listen: false);
    final attendanceDocId =
        '${timetableController.activeTerm!.id}_W${timetableController.currentWeek}';

    // Define options based on whether this is one of the user's own classes.
    List<ActionOption> options;
    if (isOwnClass) {
      options = [
        ActionOption("Unenrol from class"),
        ActionOption("Notify of absence"),
        ActionOption("Reschedule"),
        ActionOption("Swap classes"),
      ];
    } else {
      options = [
        ActionOption("Book one-off class"),
        ActionOption("Enrol permanent"),
        ActionOption("Swap for one of my classes"),
      ];
    }

    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('Select an Action'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: options.map((option) {
              return ListTile(
                title: Text(option.title),
                onTap: () {
                  Navigator.pop(context);
                  _showChildSelectionDialog(option.title, classInfo, attendanceDocId, userStudentIds);
                },
              );
            }).toList(),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text("Cancel"),
            ),
          ],
        );
      },
    );
  }

  void _showChildSelectionDialog(String action, ClassModel classInfo, String attendanceDocId, List<String> userStudentIds) {
    List<String> selectedChildIds = [];
    showDialog(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setState) {
            return AlertDialog(
              title: Text("Select Child(ren) for '$action'"),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: userStudentIds.map((childId) {
                  final isSelected = selectedChildIds.contains(childId);
                  return _buildChildCheckboxTile(childId, isSelected, (bool? value) {
                    setState(() {
                      if (value ?? false) {
                        if (!selectedChildIds.contains(childId)) {
                          selectedChildIds.add(childId);
                        }
                      } else {
                        selectedChildIds.remove(childId);
                      }
                    });
                  });
                }).toList(),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text("Cancel"),
                ),
                // Disable Confirm if no child is selected.
                TextButton(
                  onPressed: selectedChildIds.isEmpty
                      ? null
                      : () {
                          Navigator.pop(context);
                          _showActionConfirmationDialog(action, selectedChildIds, classInfo, attendanceDocId);
                        },
                  child: const Text("Confirm"),
                ),
              ],
            );
          },
        );
      },
    );
  }

  // This dialog confirms the parent's selection before making a backend call.
  void _showActionConfirmationDialog(String action, List<String> selectedChildIds, ClassModel classInfo, String attendanceDocId) {
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: Text("Confirm '$action'"),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text("You are about to perform '$action' for the following child(ren):"),
              const SizedBox(height: 8),
              // Reuse StudentNamesWidget to display the names of selected children.
              StudentNamesWidget(studentIds: selectedChildIds),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text("Cancel"),
            ),
            TextButton(
              onPressed: () async {
                // Here, call the corresponding timetable controller method based on action.
                // For demonstration, we simply print the selection.
                print("Action: $action for class ${classInfo.id} and children: ${selectedChildIds.join(", ")}");
                // e.g., timetableController.unenrollStudentPermanent(...);
                final timetableController = Provider.of<TimetableController>(context, listen: false);
                await timetableController.loadAttendanceForWeek();
                Navigator.pop(context);
              },
              child: const Text("Confirm"),
            ),
          ],
        );
      },
    );
  }

  Widget _buildChildCheckboxTile(String childId, bool isSelected, Function(bool?) onChanged) {
    final authController = Provider.of<AuthController>(context, listen: false);
    return FutureBuilder(
      future: authController.fetchStudentData(childId),
      builder: (context, snapshot) {
        String childName = "Loading...";
        if (snapshot.hasData) {
          // Assuming the fetched Student model has a firstName property.
          childName = (snapshot.data as dynamic).firstName;
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

  void _showAddClassDialog(BuildContext context) {
    String classType = '';
    String selectedDay = _daysOfWeek.first;
    String selectedStartTime = _timeSlots.first;
    String selectedEndTime = _timeSlots.first;
    int selectedCapacity = _capacities.first;
    showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: const Text('Add New Class'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  decoration: const InputDecoration(labelText: 'Class Type'),
                  onChanged: (val) => classType = val,
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
                  type: classType.trim(),
                  dayOfWeek: selectedDay,
                  startTime: selectedStartTime,
                  endTime: selectedEndTime,
                  capacity: selectedCapacity,
                  enrolledStudents: const [],
                );
                final timetableController =
                    Provider.of<TimetableController>(context, listen: false);
                await timetableController.createNewClass(newClass);
                Navigator.pop(ctx);
              },
              child: const Text('Add Class'),
            ),
          ],
        );
      },
    );
  }
}
