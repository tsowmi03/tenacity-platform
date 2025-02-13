import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';

import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/timetable_controller.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/parent_model.dart';

class TimetableScreen extends StatefulWidget {
  const TimetableScreen({Key? key}) : super(key: key);

  @override
  TimetableScreenState createState() => TimetableScreenState();
}

class TimetableScreenState extends State<TimetableScreen> {
  // For demonstration, define some static lists.
  // You can adjust the time slots or capacity range as you like.
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
    // half-hour intervals, e.g. 8am - 8pm
    '08:00', '08:30',
    '09:00', '09:30',
    '10:00', '10:30',
    '11:00', '11:30',
    '12:00', '12:30',
    '13:00', '13:30',
    '14:00', '14:30',
    '15:00', '15:30',
    '16:00', '16:30',
    '17:00', '17:30',
    '18:00', '18:30',
    '19:00', '19:30',
    '20:00',
  ];

  final List<int> _capacities = [1,2,3,4,5,6,7,8,9,10];

  @override
  void initState() {
    super.initState();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      final timetableController = Provider.of<TimetableController>(context, listen: false);
      _initData(timetableController);
    });
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

    // Identify user role (for FAB visibility)
    final userRole = authController.currentUser?.role ?? 'parent';

    // We'll always return the SAME Scaffold so the FAB is consistent:
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

  Widget _buildBody(TimetableController timetableController, AuthController authController) {
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
    final startOfCurrentWeek = activeTerm.startDate.add(
      Duration(days: (currentWeek - 1) * 7),
    );
    final formattedStart = DateFormat('dd/MM').format(startOfCurrentWeek);

    final currentUser = authController.currentUser;
    List<String> userStudentIds = [];
    if (currentUser != null && currentUser.role == 'parent') {
      final parentUser = currentUser as Parent;
      userStudentIds = parentUser.students;
    }

    final yourClasses = timetableController.allClasses.where((c) {
      return c.enrolledStudents.any((id) => userStudentIds.contains(id));
    }).toList();

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

        // Main Timetable Content
        Expanded(
          child: ListView(
            children: [
              // --- "Your Classes" Section ---
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
                  final attendance = timetableController.attendanceByClass[classInfo.id];
                  final currentlyEnrolled =
                      attendance?.attendance.length ?? classInfo.enrolledStudents.length;
                  final spotsRemaining = classInfo.capacity - currentlyEnrolled;

                  return _buildClassCard(
                    classInfo: classInfo,
                    spotsRemaining: spotsRemaining,
                    barColor: const Color(0xFF1C71AF),
                    onTap: () {},
                  );
                }),

              // --- "All Classes" Section ---
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

                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Day header
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        child: Text(
                          day,
                          style: const TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      // Classes for that day
                      ...dayClasses.map((classInfo) {
                        final attendance = timetableController.attendanceByClass[classInfo.id];
                        final currentlyEnrolled =
                            attendance?.attendance.length ?? classInfo.enrolledStudents.length;
                        final spotsRemaining = classInfo.capacity - currentlyEnrolled;

                        // Color logic
                        Color classColor;
                        if (spotsRemaining > 1) {
                          classColor = const Color.fromARGB(255, 50, 151, 53); // Green
                        } else if (spotsRemaining == 1) {
                          classColor = Colors.amber;
                        } else {
                          classColor = const Color.fromARGB(255, 244, 51, 37); // Red
                        }

                        return _buildClassCard(
                          classInfo: classInfo,
                          spotsRemaining: spotsRemaining,
                          barColor: classColor,
                          onTap: () {},
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

  Widget _buildClassCard({
    required ClassModel classInfo,
    required int spotsRemaining,
    required Color barColor,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
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
                    '${classInfo.dayOfWeek} ${classInfo.startTime}',
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Available Spots: $spotsRemaining',
                    style: TextStyle(fontSize: 16, color: Colors.grey[700]),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Students: [List or count of students here]',
                    style: TextStyle(fontSize: 16, color: Colors.grey),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// "Add Class" dialog with drop-downs for day, time, capacity, etc.
  void _showAddClassDialog(BuildContext context) {
    String classType = '';       // "Maths", "Science" etc.
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
                // --- Day of the week dropdown ---
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
                // --- Start Time dropdown ---
                DropdownButtonFormField<String>(
                  decoration: const InputDecoration(labelText: 'Start Time'),
                  value: selectedStartTime,
                  items: _timeSlots.map((time) {
                    return DropdownMenuItem<String>(
                      value: time,
                      child: Text(time),
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
                // --- End Time dropdown ---
                DropdownButtonFormField<String>(
                  decoration: const InputDecoration(labelText: 'End Time'),
                  value: selectedEndTime,
                  items: _timeSlots.map((time) {
                    return DropdownMenuItem<String>(
                      value: time,
                      child: Text(time),
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
                // --- Capacity dropdown ---
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
                // Create new ClassModel
                final newClass = ClassModel(
                  id: DateTime.now().millisecondsSinceEpoch.toString(),
                  type: classType.trim(),
                  dayOfWeek: selectedDay,
                  startTime: selectedStartTime,
                  endTime: selectedEndTime,
                  capacity: selectedCapacity,
                  enrolledStudents: [],
                );
                print('newClass is $newClass');
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
