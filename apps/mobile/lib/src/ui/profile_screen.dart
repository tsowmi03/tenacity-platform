import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../controllers/auth_controller.dart';
import '../controllers/profile_controller.dart';
import '../models/parent_model.dart';
import '../models/student_model.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({Key? key}) : super(key: key);

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

      // No more FAB for editing:
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

                            const SizedBox(height: 24),

                            // Children
                            if (appUser is Parent && profileController.children.isNotEmpty) ...[
                              Text(
                                "My Students",
                                style: Theme.of(context)
                                    .textTheme
                                    .titleMedium
                                    ?.copyWith(fontWeight: FontWeight.w600),
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
                            Provider.of<AuthController>(context, listen: false).logout();
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
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _readOnlyRow("First Name", appUser.firstName),
            _readOnlyRow("Last Name", appUser.lastName),
            _readOnlyRow("Email", appUser.email),
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

  Widget _buildStudentCard(Student student) {
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
              "Subjects: ${student.subjects.join(', ')}",
            ),
          ),
          ListTile(
            title: Text("Lesson Tokens: ${student.lessonTokens}"),
          ),
        ],
      ),
    );
  }
}
