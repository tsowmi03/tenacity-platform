import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/auth_wrapper.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/ui/settings_screen.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:tenacity/src/controllers/timetable_controller.dart';

import '../controllers/auth_controller.dart';
import '../controllers/profile_controller.dart';
import '../models/parent_model.dart';
import '../models/student_model.dart';

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
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text(
          "My Profile",
          style: TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings, color: Colors.white),
            onPressed: () {
              Navigator.push(context,
                  MaterialPageRoute(builder: (_) => const SettingsScreen()));
            },
          ),
        ],
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
                                      const Icon(Icons.local_activity_outlined,
                                          color: Color(0xFF1C71AF)),
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
                              const SizedBox(height: 16),
                              Center(
                                child: TextButton.icon(
                                  icon: const Icon(Icons.person_add_alt_1,
                                      color: Color(0xFF1C71AF)),
                                  label: const Text(
                                    "Enrol Another Student",
                                    style: TextStyle(
                                      color: Color(0xFF1C71AF),
                                      fontWeight: FontWeight.bold,
                                      fontSize: 16,
                                    ),
                                  ),
                                  onPressed: () async {
                                    final url = Uri.parse(
                                        'https://www.tenacitytutoring.com/register');
                                    if (await canLaunchUrl(url)) {
                                      await launchUrl(url,
                                          mode: LaunchMode.externalApplication);
                                    }
                                  },
                                ),
                              ),
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
                          onPressed: () async {
                            await Provider.of<AuthController>(context,
                                    listen: false)
                                .logout();
                            if (mounted) {
                              Navigator.of(context).pushAndRemoveUntil(
                                MaterialPageRoute(
                                    builder: (_) => const AuthWrapper()),
                                (route) => false,
                              );
                            }
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
            title: Text(
              "Subject(s): ${subjectStrings.join(', ')}",
            ),
          ),
          FutureBuilder<List<ClassModel>>(
            future: Provider.of<TimetableController>(context, listen: false)
                .fetchClassesForStudent(student.id),
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const ListTile(
                  title: Text("Class(es): Loading..."),
                );
              }
              if (snapshot.hasError) {
                return const ListTile(
                  title: Text("Class(es): Failed to load"),
                );
              }
              final classes = snapshot.data ?? [];
              if (classes.isEmpty) {
                return const ListTile(
                  title: Text("Class(es): Not enrolled in any classes."),
                );
              }
              return ListTile(
                title: Text(
                  "Class(es): ${classes.map((c) => "${c.dayOfWeek} ${Provider.of<TimetableController>(context, listen: false).format24HourToAmPm(c.startTime)}").join(', ')}",
                ),
              );
            },
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
