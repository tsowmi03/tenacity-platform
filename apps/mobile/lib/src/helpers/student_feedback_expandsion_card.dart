import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/feedback_controller.dart';
import 'package:tenacity/src/controllers/profile_controller.dart';
import 'package:tenacity/src/ui/feedback_screen.dart';

class StudentFeedbackExpansionCard extends StatefulWidget {
  const StudentFeedbackExpansionCard({super.key});

  @override
  State<StudentFeedbackExpansionCard> createState() =>
      _StudentFeedbackExpansionCardState();
}

class _StudentFeedbackExpansionCardState
    extends State<StudentFeedbackExpansionCard>
    with SingleTickerProviderStateMixin {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final profileController = context.watch<ProfileController>();
    profileController.loadProfile();
    final feedbackController = context.read<FeedbackController>();
    final students = profileController.children;

    return Column(
      children: [
        GestureDetector(
          onTap: () {
            setState(() {
              _expanded = !_expanded;
            });
          },
          child: Card(
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            margin: const EdgeInsets.symmetric(vertical: 10),
            elevation: 3,
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Row(
                children: [
                  const Icon(Icons.rate_review,
                      size: 36, color: Color(0xFF1C71AF)),
                  const SizedBox(width: 20),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          "Student Feedback",
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 8),
                        StreamBuilder<int>(
                          stream: feedbackController
                              .getTotalUnreadCountAcrossChildren(
                                  students.map((s) => s.id).toList()),
                          builder: (context, snapshot) {
                            final count = snapshot.data ?? 0;
                            return Text(
                              "$count unread feedback",
                              style: const TextStyle(
                                fontSize: 14,
                                color: Colors.black54,
                              ),
                            );
                          },
                        ),
                      ],
                    ),
                  ),
                  AnimatedRotation(
                    turns: _expanded ? 0.25 : 0.0,
                    duration: const Duration(milliseconds: 200),
                    child: const Icon(Icons.arrow_forward_ios,
                        size: 16, color: Colors.grey),
                  ),
                ],
              ),
            ),
          ),
        ),
        AnimatedCrossFade(
          firstChild: const SizedBox.shrink(),
          secondChild: _expanded
              ? Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 0, 0),
                  child: students.isEmpty
                      ? Card(
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12)),
                          elevation: 2,
                          child: const ListTile(
                            title: Text("No students enrolled."),
                          ),
                        )
                      : Column(
                          children: students.map((student) {
                            return Card(
                              shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12)),
                              elevation: 2,
                              margin: const EdgeInsets.only(bottom: 16),
                              child: StreamBuilder<int>(
                                stream: feedbackController
                                    .getUnreadFeedbackCount(student.id),
                                builder: (context, snapshot) {
                                  final unreadCount = snapshot.data ?? 0;
                                  return ListTile(
                                    leading: const Icon(Icons.school,
                                        color: Color(0xFF1C71AF)),
                                    title: Text(
                                        "${student.firstName} ${student.lastName}"),
                                    subtitle: Text("Grade: ${student.grade}"),
                                    trailing: unreadCount > 0
                                        ? CircleAvatar(
                                            radius: 12,
                                            backgroundColor: Colors.red,
                                            child: Text(
                                              unreadCount.toString(),
                                              style: const TextStyle(
                                                  color: Colors.white,
                                                  fontSize: 13,
                                                  fontWeight: FontWeight.bold),
                                            ),
                                          )
                                        : null,
                                    onTap: () => Navigator.of(context).push(
                                      MaterialPageRoute(
                                        builder: (_) => FeedbackScreen(
                                            studentId: student.id),
                                      ),
                                    ),
                                  );
                                },
                              ),
                            );
                          }).toList(),
                        ),
                )
              : const SizedBox.shrink(),
          crossFadeState:
              _expanded ? CrossFadeState.showSecond : CrossFadeState.showFirst,
          duration: const Duration(milliseconds: 200),
        ),
      ],
    );
  }
}
