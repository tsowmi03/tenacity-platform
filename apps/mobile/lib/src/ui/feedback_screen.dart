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

    final isAdmin = authController.currentUser?.role == 'admin';
    final currentUserId = authController.currentUser?.uid ?? '';

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
                  final canEdit = isAdmin || fb.tutorId == currentUserId;
                  final canDelete = isAdmin;

                  return isAdmin
                      ? Dismissible(
                          key: Key(fb.id),
                          direction: DismissDirection.endToStart,
                          background: Container(
                            alignment: Alignment.centerRight,
                            padding: const EdgeInsets.only(right: 20),
                            color: Colors.red,
                            child: const Icon(Icons.delete,
                                color: Colors.white, size: 30),
                          ),
                          confirmDismiss: (direction) async {
                            return await _showDeleteConfirmationDialog(context);
                          },
                          onDismissed: (direction) async {
                            await feedbackController.deleteFeedback(fb.id);
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                    content: Text('Feedback deleted')),
                              );
                            }
                          },
                          child: _buildFeedbackCard(
                              context, fb, tutorName, canEdit, canDelete),
                        )
                      : _buildFeedbackCard(
                          context, fb, tutorName, canEdit, canDelete);
                },
              );
            },
          );
        },
      ),
      floatingActionButton: isAdmin
          ? FloatingActionButton(
              onPressed: () {
                _showAddFeedbackDialog(context, studentId);
              },
              backgroundColor: const Color(0xFF1C71AF),
              tooltip: 'Add Feedback',
              child: const Icon(Icons.add, color: Colors.white),
            )
          : null,
    );
  }

  Future<bool?> _showDeleteConfirmationDialog(BuildContext context) async {
    return showDialog<bool>(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: const Text('Delete Feedback'),
          content: const Text(
              'Are you sure you want to delete this feedback? This action cannot be undone.'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              style: TextButton.styleFrom(foregroundColor: Colors.red),
              child: const Text('Delete'),
            ),
          ],
        );
      },
    );
  }

  void _showEditFeedbackDialog(BuildContext context, StudentFeedback feedback) {
    final feedbackController =
        Provider.of<FeedbackController>(context, listen: false);

    final formKey = GlobalKey<FormState>();
    String subject = feedback.subject;
    String feedbackText = feedback.feedback;

    showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: const Text('Edit Feedback'),
          content: Form(
            key: formKey,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextFormField(
                    initialValue: subject,
                    decoration: const InputDecoration(labelText: 'Subject'),
                    textCapitalization: TextCapitalization.sentences,
                    onChanged: (val) => subject = val,
                    validator: (val) =>
                        val == null || val.isEmpty ? 'Enter a subject' : null,
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    initialValue: feedbackText,
                    decoration: const InputDecoration(labelText: 'Feedback'),
                    textCapitalization: TextCapitalization.sentences,
                    minLines: 3,
                    maxLines: 6,
                    onChanged: (val) => feedbackText = val,
                    validator: (val) =>
                        val == null || val.isEmpty ? 'Enter feedback' : null,
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel'),
            ),
            TextButton(
              onPressed: () async {
                if (formKey.currentState?.validate() ?? false) {
                  await feedbackController.updateFeedback(
                    feedback.id,
                    feedbackText,
                    subject,
                  );
                  if (context.mounted) {
                    Navigator.pop(ctx);
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Feedback updated')),
                    );
                  }
                }
              },
              child: const Text('Save'),
            ),
          ],
        );
      },
    );
  }

  void _showAddFeedbackDialog(BuildContext context, String studentId) {
    final feedbackController =
        Provider.of<FeedbackController>(context, listen: false);
    final authController = Provider.of<AuthController>(context, listen: false);

    final tutorId = authController.currentUser?.uid ?? '';
    final formKey = GlobalKey<FormState>();
    String subject = '';
    String feedbackText = '';

    showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: const Text('Add Feedback'),
          content: Form(
            key: formKey,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextFormField(
                    decoration: const InputDecoration(labelText: 'Subject'),
                    textCapitalization: TextCapitalization.sentences,
                    onChanged: (val) => subject = val,
                    validator: (val) =>
                        val == null || val.isEmpty ? 'Enter a subject' : null,
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    decoration: const InputDecoration(labelText: 'Feedback'),
                    textCapitalization: TextCapitalization.sentences,
                    minLines: 3,
                    maxLines: 6,
                    onChanged: (val) => feedbackText = val,
                    validator: (val) =>
                        val == null || val.isEmpty ? 'Enter feedback' : null,
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel'),
            ),
            TextButton(
              onPressed: () async {
                if (formKey.currentState?.validate() ?? false) {
                  // Fetch the student to get parent IDs
                  final authController =
                      Provider.of<AuthController>(context, listen: false);
                  final student =
                      await authController.fetchStudentData(studentId);
                  final parentIds = student?.parents ?? [];

                  await feedbackController.addFeedback(
                    StudentFeedback(
                      id: DateTime.now().millisecondsSinceEpoch.toString(),
                      studentId: studentId,
                      tutorId: tutorId,
                      subject: subject,
                      feedback: feedbackText,
                      createdAt: DateTime.now(),
                      isUnread: true,
                      parentIds: parentIds,
                    ),
                  );
                  if (context.mounted) Navigator.pop(ctx);
                }
              },
              child: const Text('Add'),
            ),
          ],
        );
      },
    );
  }

  Widget _buildFeedbackCard(BuildContext context, StudentFeedback fb,
      String tutorName, bool canEdit, bool canDelete) {
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
            // Header with subject and edit button
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Subject as a bold title
                if (fb.subject.isNotEmpty)
                  Expanded(
                    child: Text(
                      fb.subject,
                      style: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF1C71AF),
                      ),
                    ),
                  ),
                if (canEdit)
                  IconButton(
                    onPressed: () => _showEditFeedbackDialog(context, fb),
                    icon: const Icon(Icons.edit, size: 18, color: Colors.grey),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                  ),
              ],
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
