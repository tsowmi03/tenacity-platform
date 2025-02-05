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

                            const SizedBox(height: 24),

                            // Children (if any)
                            if (appUser is Parent && profileController.children.isNotEmpty) ...[
                              Text(
                                "My Students",
                                style: Theme.of(context)
                                    .textTheme
                                    .titleMedium
                                    ?.copyWith(fontWeight: FontWeight.w600, fontSize: 20),
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
    final subjectStrings = student.subjects.map(_formatSubject).toList();

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
            title: Text("Lesson Tokens: ${student.lessonTokens ?? 0}"),
          ),
          ListTile(
            title: Text(
              "Subjects: ${subjectStrings.join(', ')}",
            ),
          ),
        ],
      ),
    );
  }

  /// Maps a Firestore subject code (e.g. "ex1eng", "advmat", "10mat")
  /// to a human-readable string (e.g. "Extension 1 English", "Advanced Mathematics", "Year 10 Mathematics").
  String _formatSubject(String raw) {
    final code = raw.toLowerCase().trim();

    // Check for senior subject prefixes first (ex1, ex2, adv, std).
    // e.g. "ex1eng" => "Extension 1 English"
    if (code.startsWith('ex2')) {
      final leftover = code.substring(3);
      return "Extension 2 ${_parseBaseSubject(leftover)}";
    } else if (code.startsWith('ex1')) {
      final leftover = code.substring(3);
      return "Extension 1 ${_parseBaseSubject(leftover)}";
    } else if (code.startsWith('adv')) {
      final leftover = code.substring(3);
      return "Advanced ${_parseBaseSubject(leftover)}";
    } else if (code.startsWith('std')) {
      final leftover = code.substring(3);
      return "Standard ${_parseBaseSubject(leftover)}";
    }

    if (code.length >= 4) {
      final yearDigits = code.substring(0, 2);
      final yearInt = int.tryParse(yearDigits) ?? 0;
      final subPart = code.substring(2);
      return "Year $yearInt ${_parseBaseSubject(subPart)}";
    }

    return raw;
  }

  /// Converts the 2-3 letter subject abbreviation to a readable name.
  String _parseBaseSubject(String abbr) {
    switch (abbr) {
      case 'mat':
        return 'Mathematics';
      case 'eng':
        return 'English';
      default:
        // Fallback: just capitalize the leftover
        return abbr.isNotEmpty
            ? "${abbr[0].toUpperCase()}${abbr.substring(1)}"
            : '';
    }
  }
}
