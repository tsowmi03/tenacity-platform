import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/invoice_controller.dart';
import 'package:tenacity/src/controllers/timetable_controller.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/models/parent_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/services/auth_service.dart';
import 'package:tenacity/src/ui/chat_screen.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';
import 'package:tenacity/src/ui/users/admin/admin_person_data.dart';
import 'package:tenacity/src/ui/users/admin/admin_person_view.dart';
import 'package:tenacity/src/helpers/offline_action_guard.dart';
import 'package:url_launcher/url_launcher.dart';

/// The admin record for one person, on the V3 design.
///
/// Replaces the legacy `UserDetailScreen`. Every mutation calls the same
/// service the legacy screen called, behind the same offline guard, and every
/// destructive action still requires an explicit confirmation — only the
/// surface is new.
class AdminPersonScreen extends StatefulWidget {
  final AppUser user;

  const AdminPersonScreen({super.key, required this.user});

  @override
  State<AdminPersonScreen> createState() => _AdminPersonScreenState();
}

class _AdminPersonScreenState extends State<AdminPersonScreen> {
  final AuthService _authService = AuthService();

  List<Student> _students = const [];
  bool _isLoadingStudents = false;
  bool _isBusy = false;
  late int _lessonTokens;

  @override
  void initState() {
    super.initState();
    final user = widget.user;
    _lessonTokens = user is Parent ? user.lessonTokens : 0;

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (widget.user.role == 'parent') _loadStudents();
    });
  }

  Future<void> _loadStudents() async {
    setState(() => _isLoadingStudents = true);
    try {
      final students =
          await _authService.fetchStudentsForParent(widget.user.uid);
      if (!mounted) return;
      setState(() {
        _students = students;
        _isLoadingStudents = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _isLoadingStudents = false);
      _notify('Failed to load students: $e');
    }
  }

  void _notify(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _editTokens() async {
    final controller = TextEditingController(text: '$_lessonTokens');

    final result = await showDialog<int>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Edit lesson tokens'),
        content: TextField(
          controller: controller,
          keyboardType: TextInputType.number,
          autofocus: true,
          decoration: const InputDecoration(labelText: 'Lesson tokens'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              final value = int.tryParse(controller.text.trim());
              if (value == null || value < 0) return;
              Navigator.pop(dialogContext, value);
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );

    if (result == null || !mounted) return;

    // Captured before the guard awaits, so the controller is never read from a
    // context that may have gone away in the meantime.
    final timetable = context.read<TimetableController>();
    if (!await OfflineActionGuard.ensureOnline(
      context,
      action: 'update lesson tokens',
    )) {
      return;
    }

    try {
      await timetable.setLessonTokens(widget.user.uid, result);
      if (!mounted) return;
      setState(() => _lessonTokens = result);
      _notify('Tokens updated to $result.');
    } catch (e) {
      _notify('Error updating tokens: $e');
    }
  }

  Future<void> _unenrol(AdminPersonStudent student) async {
    final confirmed = await _confirm(
      title: 'Unenrol student',
      message: '${student.name} will be removed from their classes and from '
          'this parent. This cannot be undone.',
      confirmLabel: 'Unenrol',
    );
    if (!confirmed || !mounted) return;

    if (!await OfflineActionGuard.ensureOnline(
      context,
      action: 'unenrol this student',
    )) {
      return;
    }

    setState(() => _isBusy = true);
    try {
      await _authService.fullyUnenrolStudent(
        parentId: widget.user.uid,
        studentId: student.id,
      );
      await _loadStudents();
      _notify('${student.name} unenrolled.');
    } catch (e) {
      _notify('Error: $e');
    } finally {
      if (mounted) setState(() => _isBusy = false);
    }
  }

  Future<void> _removeAccount(AdminPersonViewData data) async {
    final confirmed = await _confirm(
      title: data.removeLabel,
      message: data.removeWarning,
      confirmLabel: 'Remove',
    );
    if (!confirmed || !mounted) return;

    if (!await OfflineActionGuard.ensureOnline(
      context,
      action: 'remove this account',
    )) {
      return;
    }

    setState(() => _isBusy = true);
    try {
      if (data.isParent) {
        await _authService.fullyRemoveParentAndStudents(
          parentId: widget.user.uid,
        );
      } else {
        await _authService.fullyRemoveTutorOrAdmin(tutorId: widget.user.uid);
      }
      if (!mounted) return;
      Navigator.pop(context);
      _notify('${data.name} removed.');
    } catch (e) {
      _notify('Error: $e');
      if (mounted) setState(() => _isBusy = false);
    }
  }

  Future<bool> _confirm({
    required String title,
    required String message,
    required String confirmLabel,
  }) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            style: TextButton.styleFrom(foregroundColor: AppColors.danger),
            child: Text(confirmLabel),
          ),
        ],
      ),
    );
    return result ?? false;
  }

  Future<void> _openInvoicePdf(AdminPersonInvoice invoice) async {
    try {
      final url =
          await context.read<InvoiceController>().fetchInvoicePdf(invoice.id);
      final uri = Uri.parse(url);
      if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
        _notify('Could not open the invoice PDF.');
      }
    } catch (e) {
      _notify('Error retrieving invoice PDF: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final invoiceController = context.watch<InvoiceController>();
    final timetableController = context.watch<TimetableController>();

    final user = widget.user;
    final data = buildAdminPersonViewData(
      // The stored token count goes stale as soon as it is edited here, so the
      // locally tracked value wins for a parent.
      user: user is Parent
          ? Parent(
              uid: user.uid,
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email,
              fcmTokens: user.fcmTokens,
              students: user.students,
              phone: user.phone,
              unreadChats: user.unreadChats,
              activeChats: user.activeChats,
              lessonTokens: _lessonTokens,
            )
          : user,
      students: _students,
      classes: timetableController.allClasses,
      invoices: invoiceController.invoices,
      now: DateTime.now(),
      isLoadingStudents: _isLoadingStudents,
    );

    return Scaffold(
      backgroundColor: AppColors.ink,
      body: Stack(
        children: [
          AdminPersonView(
            data: data,
            isBusy: _isBusy,
            onBack: () => Navigator.of(context).pop(),
            onEditTokens: _editTokens,
            onMessage: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => ChatScreen(
                  chatId: null,
                  otherUserName: data.name.isEmpty ? data.roleLabel : data.name,
                  receipientId: widget.user.uid,
                ),
              ),
            ),
            onUnenrol: _unenrol,
            onOpenInvoice: _openInvoicePdf,
            onRemoveAccount: () => _removeAccount(data),
            onRefresh: () async {
              if (widget.user.role == 'parent') await _loadStudents();
            },
          ),
          if (_isBusy)
            const ColoredBox(
              color: Color(0x33000000),
              child: Center(
                child: CircularProgressIndicator(color: AppColors.blue300),
              ),
            ),
        ],
      ),
    );
  }
}
