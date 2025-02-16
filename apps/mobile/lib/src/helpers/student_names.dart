import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';

class StudentNamesWidget extends StatelessWidget {
  final List<String> studentIds;
  const StudentNamesWidget({super.key, required this.studentIds});

  Future<String> fetchNames(BuildContext context) async {
    final authController = Provider.of<AuthController>(context, listen: false);
    // Fetch student data concurrently and return each student's first name.
    final futures = studentIds.map((id) async {
      final student = await authController.fetchStudentData(id);
      return student?.firstName ?? "Unknown";
    }).toList();
    final names = await Future.wait(futures);
    return names.join(", ");
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<String>(
      future: fetchNames(context),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Text(
            "Loading names...",
            style: TextStyle(fontSize: 16, color: Colors.grey),
          );
        }
        if (snapshot.hasError) {
          return const Text(
            "Error loading names",
            style: TextStyle(fontSize: 16, color: Colors.grey),
          );
        }
        return Text(
          "Students: ${snapshot.data}",
          style: const TextStyle(fontSize: 16, color: Colors.grey),
        );
      },
    );
  }
}
