import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/invoice_controller.dart';
import 'package:tenacity/src/controllers/timetable_controller.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/models/invoice_model.dart';
import 'package:tenacity/src/models/parent_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/services/auth_service.dart';
import 'package:tenacity/src/ui/feedback_screen.dart';
import 'package:url_launcher/url_launcher.dart';

class UserDetailScreen extends StatefulWidget {
  final AppUser user;

  const UserDetailScreen({super.key, required this.user});

  @override
  State<UserDetailScreen> createState() => _UserDetailScreenState();
}

class _UserDetailScreenState extends State<UserDetailScreen> {
  final AuthService _authService = AuthService();
  final TextEditingController _tokenController = TextEditingController();
  List<Student> _students = [];
  bool _isLoadingStudents = false;
  bool _isProcessing = false; // For loading indicators

  @override
  void initState() {
    super.initState();
    if (widget.user.role == 'parent') {
      _fetchStudents();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        context
            .read<InvoiceController>()
            .listenToInvoicesForParent(widget.user.uid);
      });
    }
  }

  @override
  void dispose() {
    _tokenController.dispose();
    super.dispose();
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

  Future<void> _showEditTokensDialog() async {
    if (widget.user.role != 'parent') return;

    final parent = widget.user as Parent;
    _tokenController.text = parent.lessonTokens.toString();

    final result = await showDialog<int>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Edit Lesson Tokens'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Current tokens: ${parent.lessonTokens}',
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _tokenController,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              final newTokens = int.tryParse(_tokenController.text);
              if (newTokens != null && newTokens >= 0) {
                Navigator.pop(context, newTokens);
              } else {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Please enter a valid number')),
                );
              }
            },
            child: const Text('Update'),
          ),
        ],
      ),
    );

    if (result != null) {
      await _updateTokens(result);
    }
  }

  Future<void> _updateTokens(int newTokenAmount) async {
    setState(() => _isProcessing = true);
    try {
      final timetableController = context.read<TimetableController>();

      // Use the new direct update method instead of increment/decrement loops
      await timetableController.updateTokens(
        widget.user.uid,
        newTokenAmount,
      );

      // Refresh the auth controller to get updated user data
      await context.read<AuthController>().refreshCurrentUser();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Tokens updated to $newTokenAmount'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to update tokens: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = widget.user;

    final invoiceController = context.watch<InvoiceController>();
    final invoices = invoiceController.invoices;
    final sortedInvoices = List<Invoice>.from(invoices)
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    final mostRecentInvoice =
        sortedInvoices.isNotEmpty ? sortedInvoices.first : null;

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
          // User Information Card
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

          // Lesson Tokens Card (only for parents)
          if (user.role == 'parent') ...[
            const SizedBox(height: 16),
            Card(
              elevation: 3,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(15)),
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
                child: Row(
                  children: [
                    const Icon(
                      Icons.local_activity_outlined,
                      color: Color(0xFF1C71AF),
                      size: 24,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Lesson Tokens',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            '${(user as Parent).lessonTokens} available',
                            style: TextStyle(
                              fontSize: 14,
                              color: Colors.grey.shade600,
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: _isProcessing ? null : _showEditTokensDialog,
                      icon: _isProcessing
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(
                              Icons.edit,
                              color: Color(0xFF1C71AF),
                            ),
                      tooltip: 'Edit tokens',
                    ),
                  ],
                ),
              ),
            ),
          ],

          // Remove Tutor Button (for tutors)
          if (user.role == 'tutor')
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

          // Students Section (for parents)
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
            const SizedBox(height: 20),
            const Text(
              'Most Recent Invoice',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            mostRecentInvoice == null
                ? const Padding(
                    padding: EdgeInsets.all(16),
                    child: Text('No invoices found.'),
                  )
                : _buildInvoiceCard(mostRecentInvoice),
          ],
          // Spacer for bottom button
          if (user.role == 'parent') const SizedBox(height: 40),
        ],
      ),
      bottomNavigationBar: (user.role == 'parent')
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
            title: Text(
              "Subject(s): ${subjectStrings.isNotEmpty ? subjectStrings.join(', ') : 'N/A'}",
            ),
          ),
          Padding(
            padding:
                const EdgeInsets.symmetric(vertical: 4.0, horizontal: 16.0),
            child: ElevatedButton.icon(
              icon: const Icon(Icons.feedback, color: Colors.white),
              label: const Text(
                "View Feedback",
                style: TextStyle(color: Colors.white),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: Color(0xFF1C71AF),
                minimumSize: const Size.fromHeight(40),
              ),
              onPressed: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => FeedbackScreen(studentId: student.id),
                  ),
                );
              },
            ),
          ),
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

  Widget _buildStatusChip(InvoiceStatus status) {
    Color chipColor;
    switch (status) {
      case InvoiceStatus.unpaid:
        chipColor = Colors.orange;
        break;
      case InvoiceStatus.paid:
        chipColor = Colors.green;
        break;
      case InvoiceStatus.overdue:
        chipColor = Colors.red;
        break;
    }
    return Chip(
      label: Text(
        status.value.toUpperCase(),
        style: const TextStyle(color: Colors.white, fontSize: 12),
      ),
      backgroundColor: chipColor,
      padding: const EdgeInsets.symmetric(horizontal: 8),
    );
  }

  Widget _buildInvoiceCard(Invoice invoice) {
    // Extract student names from line items if available
    final studentNames = invoice.lineItems
        .map((line) => line['studentName'] as String?)
        .where((name) => name != null && name.isNotEmpty)
        .cast<String>()
        .toSet()
        .toList();
    final nameString =
        studentNames.isNotEmpty ? 'for ${studentNames.join(" and ")}' : '';

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.08),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.all(16.0),
        title: Text(
          'Invoice #${invoice.invoiceNumber ?? invoice.id.substring(0, 6)} $nameString',
          style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 8.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Due: ${invoice.dueDate.toShortDateString()}',
                style: TextStyle(
                  color: Colors.grey.shade600,
                  fontSize: 14,
                ),
              ),
              Text(
                'Amount: \$${invoice.amountDue.toStringAsFixed(2)}',
                style: TextStyle(
                  color: Colors.grey.shade600,
                  fontSize: 14,
                ),
              ),
              const SizedBox(height: 4),
              _buildStatusChip(invoice.status),
            ],
          ),
        ),
        trailing: IconButton(
          icon: const Icon(Icons.picture_as_pdf, color: Color(0xFF1C71AF)),
          tooltip: 'View PDF',
          onPressed: () async {
            try {
              final pdfUrl = await context
                  .read<InvoiceController>()
                  .fetchInvoicePdf(invoice.id);
              final Uri pdfUri = Uri.parse(pdfUrl);
              if (await canLaunchUrl(pdfUri)) {
                await launchUrl(pdfUri, mode: LaunchMode.externalApplication);
              } else {
                if (!mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text("Could not launch PDF URL")),
                );
              }
            } catch (error) {
              if (!mounted) return;
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text("Error retrieving invoice PDF")),
              );
            }
          },
        ),
        onTap: null,
      ),
    );
  }
}

extension DateTimeExtension on DateTime {
  String toShortDateString() {
    return "${this.day.toString().padLeft(2, '0')}-${this.month.toString().padLeft(2, '0')}-${this.year}";
  }
}
