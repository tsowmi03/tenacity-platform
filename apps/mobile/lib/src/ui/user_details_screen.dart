import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/services/auth_service.dart';

class UserDetailScreen extends StatefulWidget {
  final AppUser user;

  const UserDetailScreen({super.key, required this.user});

  @override
  State<UserDetailScreen> createState() => _UserDetailScreenState();
}

class _UserDetailScreenState extends State<UserDetailScreen> {
  final AuthService _authService = AuthService();
  List<Student> _students = [];
  bool _isLoadingStudents = false;
  bool _isProcessing = false; // For loading indicators

  bool get isAdmin {
    return context.read<AuthController>().currentUser?.role == 'admin';
  }

  @override
  void initState() {
    super.initState();
    if (widget.user.role == 'parent') {
      _fetchStudents();
    }
  }

  Future<void> _fetchStudents() async {
    setState(() => _isLoadingStudents = true);
    try {
      final students =
          await _authService.fetchStudentsForParent(widget.user.uid);
      setState(() => _students = students);
    } catch (e, stack) {
      setState(() => _students = []);
      debugPrint("Error fetching students for parent: $e");
      debugPrintStack(stackTrace: stack);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Failed to load students: $e")),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoadingStudents = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = widget.user;

    return Scaffold(
      appBar: AppBar(
        title: Text('${user.firstName} ${user.lastName}'),
        backgroundColor: const Color(0xFF1C71AF),
        foregroundColor: Colors.white,
      ),
      backgroundColor: const Color(0xFFF6F9FC),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            elevation: 3,
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _readOnlyRow('Name', '${user.firstName} ${user.lastName}'),
                  _readOnlyRow('Email', user.email),
                  _readOnlyRow('Phone', user.phone),
                  _readOnlyRow('Role', user.role),
                ],
              ),
            ),
          ),
          if (isAdmin && user.role == 'tutor')
            Padding(
              padding: const EdgeInsets.only(top: 16.0),
              child: ElevatedButton.icon(
                icon: const Icon(Icons.delete_forever, color: Colors.white),
                label: _isProcessing
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          color: Colors.white,
                          strokeWidth: 2,
                        ),
                      )
                    : const Text(
                        "Remove Tutor",
                        style: TextStyle(color: Colors.white),
                      ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.red,
                  minimumSize: const Size.fromHeight(48),
                ),
                onPressed: _isProcessing
                    ? null
                    : () async {
                        final confirm = await showDialog<bool>(
                          context: context,
                          builder: (ctx) => AlertDialog(
                            title: const Text("Remove Tutor"),
                            content: const Text(
                                "Are you sure you want to remove this tutor from all classes and the system? This action cannot be undone."),
                            actions: [
                              TextButton(
                                onPressed: () => Navigator.pop(ctx, false),
                                child: const Text("Cancel"),
                              ),
                              ElevatedButton(
                                onPressed: () => Navigator.pop(ctx, true),
                                child: const Text("Remove"),
                              ),
                            ],
                          ),
                        );
                        if (confirm == true) {
                          setState(() => _isProcessing = true);
                          try {
                            await _authService.fullyRemoveTutorOrAdmin(
                                tutorId: user.uid);
                            if (mounted) {
                              Navigator.pop(context);
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(content: Text("Tutor removed.")),
                              );
                            }
                          } catch (e) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text("Error: $e")),
                            );
                          } finally {
                            if (mounted) setState(() => _isProcessing = false);
                          }
                        }
                      },
              ),
            ),
          if (user.role == 'parent') ...[
            const SizedBox(height: 20),
            const Text(
              'Students',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            _isLoadingStudents
                ? const Padding(
                    padding: EdgeInsets.all(16),
                    child: Center(child: CircularProgressIndicator()),
                  )
                : _students.isEmpty
                    ? const Padding(
                        padding: EdgeInsets.all(16),
                        child: Text('No students found.'),
                      )
                    : Column(
                        children: _students
                            .map((student) =>
                                _buildStudentExpansionTile(student))
                            .toList(),
                      ),
          ],
          // Spacer for bottom button
          if (isAdmin && user.role == 'parent') const SizedBox(height: 40),
        ],
      ),
      bottomNavigationBar: (isAdmin && user.role == 'parent')
          ? Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 40),
              child: ElevatedButton.icon(
                icon: const Icon(Icons.delete_forever, color: Colors.white),
                label: _isProcessing
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          color: Colors.white,
                          strokeWidth: 2,
                        ),
                      )
                    : const Text(
                        "Remove Parent",
                        style: TextStyle(color: Colors.white),
                      ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.red,
                  minimumSize: const Size.fromHeight(48),
                ),
                onPressed: _isProcessing
                    ? null
                    : () async {
                        final confirm = await showDialog<bool>(
                          context: context,
                          builder: (ctx) => AlertDialog(
                            title: const Text("Remove Parent"),
                            content: const Text(
                                "Are you sure you want to remove this parent and all their students? This action cannot be undone."),
                            actions: [
                              TextButton(
                                onPressed: () => Navigator.pop(ctx, false),
                                child: const Text("Cancel"),
                              ),
                              ElevatedButton(
                                onPressed: () => Navigator.pop(ctx, true),
                                child: const Text("Remove"),
                              ),
                            ],
                          ),
                        );
                        if (confirm == true) {
                          setState(() => _isProcessing = true);
                          try {
                            await _authService.fullyRemoveParentAndStudents(
                              parentId: user.uid,
                            );
                            if (mounted) {
                              Navigator.pop(context); // Go back after removal
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                    content: Text(
                                        "Parent and all students removed.")),
                              );
                            }
                          } catch (e) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text("Error: $e")),
                            );
                          } finally {
                            if (mounted) setState(() => _isProcessing = false);
                          }
                        }
                      },
              ),
            )
          : null,
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

  Widget _buildStudentExpansionTile(Student student) {
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
              "Subject(s): ${subjectStrings.isNotEmpty ? subjectStrings.join(', ') : 'N/A'}",
            ),
          ),
          if (isAdmin)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8.0),
              child: ElevatedButton.icon(
                icon: const Icon(Icons.remove_circle, color: Colors.white),
                label: _isProcessing
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          color: Colors.white,
                          strokeWidth: 2,
                        ),
                      )
                    : const Text(
                        "Unenrol Student",
                        style: TextStyle(color: Colors.white),
                      ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.red,
                ),
                onPressed: _isProcessing
                    ? null
                    : () async {
                        final confirm = await showDialog<bool>(
                          context: context,
                          builder: (ctx) => AlertDialog(
                            title: const Text("Unenrol Student"),
                            content: Text(
                                "Are you sure you want to unenrol ${student.firstName}? This action cannot be undone."),
                            actions: [
                              TextButton(
                                onPressed: () => Navigator.pop(ctx, false),
                                child: const Text("Cancel"),
                              ),
                              ElevatedButton(
                                onPressed: () => Navigator.pop(ctx, true),
                                child: const Text("Unenrol"),
                              ),
                            ],
                          ),
                        );
                        if (confirm == true) {
                          setState(() => _isProcessing = true);
                          try {
                            await _authService.fullyUnenrolStudent(
                              parentId: widget.user.uid,
                              studentId: student.id,
                            );
                            await _fetchStudents();
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                  content:
                                      Text("${student.firstName} unenrolled.")),
                            );
                          } catch (e) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text("Error: $e")),
                            );
                          } finally {
                            if (mounted) setState(() => _isProcessing = false);
                          }
                        }
                      },
              ),
            ),
        ],
      ),
    );
  }

  String convertSubjectForDisplay(String shortCode) {
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
    return mapping[shortCode.toLowerCase()] ?? shortCode;
  }
}
