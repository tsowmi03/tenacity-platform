import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

class DummyClass {
  final String id;
  final String day;      // e.g. "Monday"
  final String time;     // e.g. "17:00"
  final int capacity;
  final int enrolled;
  final String? type;    // e.g. "HSC", "Maths - Year 10", etc.

  DummyClass({
    required this.id,
    required this.day,
    required this.time,
    required this.capacity,
    required this.enrolled,
    this.type,
  });

  int get availableSpots => capacity - enrolled;
}

class TimetableScreen extends StatefulWidget {
  const TimetableScreen({super.key});

  @override
  TimetableScreenState createState() => TimetableScreenState();
}

class TimetableScreenState extends State<TimetableScreen> {
  // Simulated user role. Change to 'admin' or 'parent'
  // to see how the floating action button behaves.
  final String userRole = 'parent';

  // Simulate the current term’s start date, total weeks, and current week
  final DateTime termStartDate = DateTime(2025, 2, 10); // 10 Feb 2025
  final int totalWeeks = 9;
  int currentWeek = 3;

  // Dummy Data
  // "Your Classes"
  final List<DummyClass> yourClasses = [
    DummyClass(
      id: 'classA',
      day: 'Monday',
      time: '17:00',
      capacity: 6,
      enrolled: 5,
      type: 'HSC',
    ),
    DummyClass(
      id: 'classB',
      day: 'Wednesday',
      time: '16:00',
      capacity: 4,
      enrolled: 4,
      type: 'Year 10 Math',
    ),
  ];

  // "All Classes" grouped by day
  // In a real scenario, you'd fetch classes from Firestore and group them by day in a map.
  final Map<String, List<DummyClass>> classesByDay = {
    'Monday': [
      DummyClass(
        id: 'classA',
        day: 'Monday',
        time: '17:00',
        capacity: 6,
        enrolled: 5,
        type: 'HSC',
      ),
      DummyClass(
        id: 'classC',
        day: 'Monday',
        time: '18:30',
        capacity: 6,
        enrolled: 3,
        type: 'English',
      ),
    ],
    'Tuesday': [
      DummyClass(
        id: 'classD',
        day: 'Tuesday',
        time: '17:00',
        capacity: 5,
        enrolled: 5,
        type: 'Science',
      ),
    ],
    'Wednesday': [
      DummyClass(
        id: 'classB',
        day: 'Wednesday',
        time: '16:00',
        capacity: 4,
        enrolled: 4,
        type: 'Year 10 Math',
      ),
      DummyClass(
        id: 'classE',
        day: 'Wednesday',
        time: '18:00',
        capacity: 4,
        enrolled: 1,
        type: 'Year 9 Writing',
      ),
    ],
  };

  // Format a date like "24/02"
  String formatDate(DateTime date) {
    return DateFormat('dd/MM').format(date);
  }

  // Compute the start date for the current week
  DateTime get startOfCurrentWeek {
    // Each week is 7 days apart from the term start
    return termStartDate.add(
      Duration(days: (currentWeek - 1) * 7),
    );
  }

  void incrementWeek() {
    if (currentWeek < totalWeeks) {
      setState(() {
        currentWeek++;
      });
    }
  }

  void decrementWeek() {
    if (currentWeek > 1) {
      setState(() {
        currentWeek--;
      });
    }
  }

  // Just a placeholder to simulate an action
  void _showPlaceholderDialog(BuildContext context, String title) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text('This is just a placeholder.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // Suppose in the real version, we’d fetch data or watch streams here.
    // For now, everything is dummy.

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
      body: Column(
        children: [
          // Week Selector
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                IconButton(
                  icon: const Icon(Icons.arrow_back),
                  onPressed: currentWeek > 1 ? decrementWeek : null,
                ),
                Text(
                  'Week $currentWeek (${formatDate(startOfCurrentWeek)})',
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
                IconButton(
                  icon: const Icon(Icons.arrow_forward),
                  onPressed: currentWeek < totalWeeks ? incrementWeek : null,
                ),
              ],
            ),
          ),

          // Display everything in a ListView
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
                      style: TextStyle(fontSize: 16, color: Colors.grey),
                    ),
                  )
                else
                  ...yourClasses.map((classInfo) {
                    return GestureDetector(
                      onTap: () => _showPlaceholderDialog(context, 'Your Class Options'),
                      child: Card(
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                        margin: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
                        child: Stack(
                          children: [
                            // Color bar on the left (can use a single color for "Your" classes)
                            Positioned(
                              left: 0,
                              top: 0,
                              bottom: 0,
                              child: Container(
                                width: 8,
                                decoration: const BoxDecoration(
                                  color: Color(0xFF1C71AF),
                                  borderRadius: BorderRadius.only(
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
                                    '${classInfo.day} ${classInfo.time}',
                                    style: const TextStyle(
                                      fontSize: 18,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  Text(
                                    'Available Spots: ${classInfo.availableSpots}',
                                    style: TextStyle(
                                      fontSize: 16,
                                      color: Colors.grey[700],
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  Text(
                                    'Students: [Dummy Student Names]',
                                    style: TextStyle(
                                      fontSize: 16,
                                      color: Colors.grey[700],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  }).toList(),

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
                    final classesForDay = entry.value;

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
                        ...classesForDay.map((classInfo) {
                          final availableSpots = classInfo.availableSpots;
                          // Color logic
                          Color classColor;
                          if (availableSpots > 1) {
                            classColor = const Color.fromARGB(255, 50, 151, 53); // Green
                          } else if (availableSpots == 1) {
                            classColor = Colors.amber; // Yellow
                          } else {
                            classColor = const Color.fromARGB(255, 244, 51, 37); // Red
                          }

                          return GestureDetector(
                            onTap: () => _showPlaceholderDialog(context, 'Class Details'),
                            child: Card(
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10),
                              ),
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
                                        color: classColor,
                                        borderRadius: const BorderRadius.only(
                                          topLeft: Radius.circular(10),
                                          bottomLeft: Radius.circular(10),
                                        ),
                                      ),
                                    ),
                                  ),
                                  Padding(
                                    padding: const EdgeInsets.fromLTRB(20.0, 16.0, 16.0, 16.0),
                                    child: Row(
                                      children: [
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                classInfo.time,
                                                style: const TextStyle(
                                                  fontSize: 18,
                                                  fontWeight: FontWeight.bold,
                                                ),
                                              ),
                                              const SizedBox(height: 8),
                                              Text(
                                                'Available Spots: $availableSpots',
                                                style: TextStyle(
                                                  fontSize: 16,
                                                  color: Colors.grey[700],
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                        const Icon(Icons.arrow_forward_ios,
                                            size: 16, color: Colors.grey),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        }).toList(),
                      ],
                    );
                  }).toList(),
                ],
              ],
            ),
          ),
        ],
      ),

      // Floating Action Button only for admin
      floatingActionButton: userRole == 'admin'
          ? FloatingActionButton(
              onPressed: () => _showPlaceholderDialog(context, 'Add Class'),
              backgroundColor: const Color(0xFF1C71AF),
              child: const Icon(Icons.add, color: Colors.white),
            )
          : null,
    );
  }
}
