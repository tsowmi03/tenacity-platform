import 'package:flutter/material.dart';
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
    } catch (_) {
      setState(() => _students = []);
    } finally {
      setState(() => _isLoadingStudents = false);
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
        ],
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

  Widget _buildStudentExpansionTile(Student student) {
    print(student.subjects);
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
