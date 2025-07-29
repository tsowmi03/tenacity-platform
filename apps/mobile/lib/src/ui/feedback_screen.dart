import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/models/feedback_model.dart';
import 'package:tenacity/src/controllers/feedback_controller.dart';

class FeedbackScreen extends StatelessWidget {
  final String studentId;

  const FeedbackScreen({
    super.key,
    required this.studentId,
  });

  @override
  Widget build(BuildContext context) {
    final feedbackController =
        Provider.of<FeedbackController>(context, listen: false);
    final authController = Provider.of<AuthController>(context, listen: false);

    return Scaffold(
      appBar: AppBar(
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text(
          "Feedback",
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
      body: StreamBuilder<List<StudentFeedback>>(
        stream: feedbackController.getFeedbackByStudentId(studentId),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return const Center(
              child: Text(
                "Error loading feedback.",
                style: TextStyle(fontSize: 16, color: Colors.redAccent),
              ),
            );
          }
          final feedbackNotes = snapshot.data ?? [];
          if (feedbackNotes.isEmpty) {
            return const Center(
              child: Text(
                "No feedback yet.",
                style: TextStyle(fontSize: 16, color: Colors.black54),
              ),
            );
          }
          feedbackNotes.sort((a, b) => b.createdAt.compareTo(a.createdAt));
          // Mark unread feedback as read after build
          final unreadFeedbackIds = feedbackNotes
              .where((fb) => fb.isUnread)
              .map((fb) => fb.id)
              .toList();
          if (unreadFeedbackIds.isNotEmpty) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              feedbackController.markAsRead(unreadFeedbackIds);
            });
          }
          // Collect unique tutorIds
          final tutorIds =
              feedbackNotes.map((fb) => fb.tutorId).toSet().toList();

          return FutureBuilder<Map<String, String>>(
            future: authController.fetchTutorNamesByIds(tutorIds),
            builder: (context, tutorSnapshot) {
              if (tutorSnapshot.connectionState == ConnectionState.waiting) {
                return const Center(child: CircularProgressIndicator());
              }
              if (tutorSnapshot.hasError) {
                return const Center(
                  child: Text(
                    "Error loading tutor names.",
                    style: TextStyle(fontSize: 16, color: Colors.redAccent),
                  ),
                );
              }
              final tutorNamesMap = tutorSnapshot.data ?? {};

              return ListView.builder(
                itemCount: feedbackNotes.length,
                itemBuilder: (context, index) {
                  final fb = feedbackNotes[index];
                  final tutorName = tutorNamesMap[fb.tutorId] ?? fb.tutorId;
                  return _buildFeedbackCard(context, fb, tutorName);
                },
              );
            },
          );
        },
      ),
    );
  }

  Widget _buildFeedbackCard(
      BuildContext context, StudentFeedback fb, String tutorName) {
    final formattedDate =
        DateFormat('MMM d, yyyy • h:mm a').format(fb.createdAt);

    return Card(
      elevation: 2,
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Subject as a bold title (top left, its own line)
            if (fb.subject.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 4.0),
                child: Text(
                  fb.subject,
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF1C71AF),
                  ),
                ),
              ),
            const SizedBox(height: 8),
            // Feedback text
            Text(
              fb.feedback,
              style: const TextStyle(
                  fontSize: 15, color: Colors.black, height: 1.3),
            ),
            const SizedBox(height: 12),
            // Footer: Tutor name (left), date and NEW badge (right)
            Row(
              children: [
                Text(
                  tutorName,
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                    color: Colors.black,
                  ),
                ),
                const Spacer(),
                Text(
                  formattedDate,
                  style: const TextStyle(color: Colors.grey, fontSize: 12),
                ),
                if (fb.isUnread) ...[
                  const SizedBox(width: 8),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: Colors.red[400],
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Text(
                      "NEW",
                      style: TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 12),
                    ),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}
