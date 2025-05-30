import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/feedback_controller.dart';

import '../controllers/auth_controller.dart';
import '../controllers/profile_controller.dart';
import '../models/parent_model.dart';
import '../models/student_model.dart';
import 'feedback_screen.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      Provider.of<ProfileController>(context, listen: false).loadProfile();
    });
  }

  @override
  Widget build(BuildContext context) {
    final profileController = context.watch<ProfileController>();
    final appUser = profileController.parent;
    final isLoading = profileController.isLoading;

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          "My Profile",
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
      backgroundColor: const Color(0xFFF6F9FC),

      // No edit FAB -> read-only
      floatingActionButton: null,

      body: isLoading
          ? const Center(child: CircularProgressIndicator())
          : (appUser == null)
              ? const Center(child: Text("No user data available."))
              : Column(
                  children: [
                    Expanded(
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 20,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            // Parent's Name
                            Text(
                              "${appUser.firstName} ${appUser.lastName}",
                              style: const TextStyle(
                                fontSize: 22,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 8),
                            const Divider(height: 1, thickness: 1),
                            const SizedBox(height: 16),

                            // Parent Info (read-only)
                            _buildParentInfoCard(appUser),

                            // Show parent's lesson tokens here
                            if (appUser is Parent) ...[
                              const SizedBox(height: 16),
                              Card(
                                elevation: 2,
                                shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12)),
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 16, vertical: 14),
                                  child: Row(
                                    children: [
                                      const Icon(Icons.token_outlined,
                                          color: Colors.amber, size: 28),
                                      const SizedBox(width: 12),
                                      Text(
                                        "Lesson Tokens: ${appUser.lessonTokens}",
                                        style: const TextStyle(
                                          fontSize: 18,
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ],

                            const SizedBox(height: 24),

                            // Children (if any)
                            if (appUser is Parent &&
                                profileController.children.isNotEmpty) ...[
                              Text(
                                "My Students",
                                style: Theme.of(context)
                                    .textTheme
                                    .titleMedium
                                    ?.copyWith(
                                        fontWeight: FontWeight.w600,
                                        fontSize: 20),
                              ),
                              const SizedBox(height: 12),
                              for (final student in profileController.children)
                                _buildStudentCard(student),
                            ],
                          ],
                        ),
                      ),
                    ),

                    // Sign Out
                    SafeArea(
                      minimum: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                      child: SizedBox(
                        width: double.infinity,
                        height: 50,
                        child: ElevatedButton.icon(
                          icon: const Icon(Icons.logout, color: Colors.white),
                          label: const Text(
                            "Sign Out",
                            style: TextStyle(color: Colors.white),
                          ),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF1C71AF),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                          ),
                          onPressed: () {
                            Provider.of<AuthController>(context, listen: false)
                                .logout();
                          },
                        ),
                      ),
                    ),
                  ],
                ),
    );
  }

  Widget _buildParentInfoCard(dynamic appUser) {
    return Card(
      elevation: 3,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _readOnlyRow("Email", appUser.email),
            _readOnlyRow("Phone", appUser.phone)
          ],
        ),
      ),
    );
  }

  Widget _readOnlyRow(String label, String? value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Text(
        "$label: ${value ?? ''}",
        style: const TextStyle(fontSize: 16),
      ),
    );
  }

  // An expandable card for each student.
  Widget _buildStudentCard(Student student) {
    // Convert each Firestore subject code to a friendly string
    final subjectStrings =
        student.subjects.map(convertSubjectForDisplay).toList();

    return Card(
      elevation: 2,
      margin: const EdgeInsets.symmetric(vertical: 6),
      child: ExpansionTile(
        leading: const Icon(Icons.school, color: Color(0xFF1C71AF)),
        title: Text("${student.firstName} ${student.lastName}"),
        children: [
          ListTile(
            title: Text("Grade: ${student.grade}"),
          ),
          ListTile(
            title: Text("Date of Birth: ${student.dob}"),
          ),
          ListTile(
            title: Text(
              "Subject(s): ${subjectStrings.join(', ')}",
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: GestureDetector(
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => FeedbackScreen(studentId: student.id),
                  ),
                );
              },
              child: Card(
                color: Colors.blue[50],
                elevation: 0,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 18, vertical: 18),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      Text(
                        "Feedback",
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          color: Colors.blue[900],
                          fontSize: 16,
                        ),
                      ),
                      const SizedBox(width: 12),
                      StreamBuilder<int>(
                        stream: Provider.of<FeedbackController>(context,
                                listen: false)
                            .getUnreadFeedbackCount(student.id),
                        builder: (context, snapshot) {
                          final count = snapshot.data ?? 0;
                          return Container(
                            width: 26,
                            height: 26,
                            decoration: BoxDecoration(
                              color: Colors.blue[400],
                              shape: BoxShape.circle,
                            ),
                            alignment: Alignment.center,
                            child: Text(
                              count.toString(),
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.bold,
                                fontSize: 15,
                              ),
                            ),
                          );
                        },
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // Helper: Convert subject short code to friendly text.
  String convertSubjectForDisplay(String shortCode) {
    // Define your mapping here.
    final mapping = <String, String>{
      // Maths mappings
      "stdmath11": "Year 11 Standard Maths",
      "advmath11": "Year 11 Advanced Maths",
      "ex1math11": "Year 11 Extension 1 Maths",
      "stdmath12": "Year 12 Standard Maths",
      "advmath12": "Year 12 Advanced Maths",
      "ex1math12": "Year 12 Extension 1 Maths",
      "ex2math12": "Year 12 Extension 2 Maths",
      // English mappings
      "stdeng11": "Year 11 Standard English",
      "adveng11": "Year 11 Advanced English",
      "ex1eng11": "Year 11 Extension 1 English",
      "stdeng12": "Year 12 Standard English",
      "adveng12": "Year 12 Advanced English",
      "ex1eng12": "Year 12 Extension 1 English",
      "ex2eng12": "Year 12 Extension 2 English",
    };

    // Look up the code (case-insensitively) and return a friendly name.
    return mapping[shortCode.toLowerCase()] ?? shortCode;
  }
}
