import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/invoice_controller.dart';
import 'package:tenacity/src/controllers/timetable_controller.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/models/parent_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/services/auth_service.dart';
import 'package:tenacity/src/ui/chat_screen.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';
import 'package:tenacity/src/ui/users/admin/admin_person_data.dart';
import 'package:tenacity/src/ui/users/admin/admin_person_view.dart';
import 'package:tenacity/src/helpers/offline_action_guard.dart';
import 'package:url_launcher/url_launcher.dart';

/// The V3 form used by an admin to replace a parent's lesson-token balance.
class AdminLessonTokensSheet extends StatefulWidget {
  final int initialValue;
  final ValueChanged<int> onSave;
  final VoidCallback onCancel;

  const AdminLessonTokensSheet({
    super.key,
    required this.initialValue,
    required this.onSave,
    required this.onCancel,
  });

  @override
  State<AdminLessonTokensSheet> createState() => _AdminLessonTokensSheetState();
}

class _AdminLessonTokensSheetState extends State<AdminLessonTokensSheet> {
  late final TextEditingController _controller =
      TextEditingController(text: '${widget.initialValue}');
  String? _errorText;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _save() {
    final rawValue = _controller.text.trim();
    final value = int.tryParse(rawValue);
    final errorText = switch ((rawValue, value)) {
      ('', _) => 'Enter a lesson-token balance.',
      (_, null) => 'Enter a whole number.',
      (_, final parsed?) when parsed < 0 => 'Lesson tokens cannot be negative.',
      _ => null,
    };
    if (errorText != null) {
      setState(() => _errorText = errorText);
      return;
    }

    widget.onSave(value!);
  }

  @override
  Widget build(BuildContext context) {
    return AppBottomSheet(
      title: 'Edit lesson tokens',
      footer: SheetActions(
        confirmLabel: 'Save',
        onConfirm: _save,
        onCancel: widget.onCancel,
      ),
      child: TextField(
        key: const Key('admin-lesson-tokens-field'),
        controller: _controller,
        keyboardType: TextInputType.number,
        autofocus: true,
        onChanged: (_) {
          if (_errorText != null) setState(() => _errorText = null);
        },
        decoration: InputDecoration(
          labelText: 'Lesson tokens',
          errorText: _errorText,
        ),
      ),
    );
  }
}

/// The admin record for one person, on the V3 design.
///
/// Replaces the legacy `UserDetailScreen`. Every mutation calls the same
/// service the legacy screen called, behind the same offline guard, and every
/// destructive action still requires an explicit confirmation — only the
/// surface is new.
class AdminPersonScreen extends StatefulWidget {
  final AppUser user;
  final AuthService? authService;

  const AdminPersonScreen({
    super.key,
    required this.user,
    this.authService,
  });

  @override
  State<AdminPersonScreen> createState() => _AdminPersonScreenState();
}

class _AdminPersonScreenState extends State<AdminPersonScreen> {
  late final AuthService _authService = widget.authService ?? AuthService();

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
    if (_isBusy) return;
    final result = await showAppBottomSheet<int>(
      context: context,
      builder: (sheetContext) => AdminLessonTokensSheet(
        initialValue: _lessonTokens,
        onCancel: () => Navigator.pop(sheetContext),
        onSave: (value) => Navigator.pop(sheetContext, value),
      ),
    );

    if (result == null || !mounted) return;

    setState(() => _isBusy = true);
    // Captured before the guard awaits, so the controller is never read from a
    // context that may have gone away in the meantime.
    final timetable = context.read<TimetableController>();
    try {
      if (!await OfflineActionGuard.ensureOnline(
        context,
        action: 'update lesson tokens',
      )) {
        return;
      }
      if (!mounted) return;

      await timetable.setLessonTokens(widget.user.uid, result);
      if (!mounted) return;
      setState(() => _lessonTokens = result);
      _notify('Tokens updated to $result.');
    } catch (e) {
      _notify('Error updating tokens: $e');
    } finally {
      if (mounted) setState(() => _isBusy = false);
    }
  }

  Future<void> _unenrol(AdminPersonStudent student) async {
    if (_isBusy) return;
    final confirmed = await _confirm(
      title: 'Unenrol student',
      message: '${student.name} will be removed from their classes and from '
          'this parent. This cannot be undone.',
      confirmLabel: 'Unenrol',
    );
    if (!confirmed || !mounted || _isBusy) return;
    setState(() => _isBusy = true);
    try {
      if (!await OfflineActionGuard.ensureOnline(
        context,
        action: 'unenrol this student',
      )) {
        return;
      }
      if (!mounted) return;

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
    if (_isBusy) return;
    final confirmed = await _confirm(
      title: data.removeLabel,
      message: data.removeWarning,
      confirmLabel: 'Remove',
    );
    if (!confirmed || !mounted || _isBusy) return;
    setState(() => _isBusy = true);
    try {
      if (!await OfflineActionGuard.ensureOnline(
        context,
        action: 'remove this account',
      )) {
        return;
      }
      if (!mounted) return;

      if (data.isParent) {
        await _authService.fullyRemoveParentAndStudents(
          parentId: widget.user.uid,
        );
      } else {
        await _authService.fullyRemoveTutorOrAdmin(tutorId: widget.user.uid);
      }
      if (!mounted) return;
      final messenger = ScaffoldMessenger.of(context);
      Navigator.pop(context);
      messenger.showSnackBar(SnackBar(content: Text('${data.name} removed.')));
    } catch (e) {
      _notify('Error: $e');
    } finally {
      if (mounted) setState(() => _isBusy = false);
    }
  }

  Future<bool> _confirm({
    required String title,
    required String message,
    required String confirmLabel,
  }) async {
    return showAppConfirmationSheet(
      context: context,
      title: title,
      message: message,
      confirmLabel: confirmLabel,
      tone: AppConfirmationTone.destructive,
    );
  }

  Future<void> _openInvoicePdf(AdminPersonInvoice invoice) async {
    if (_isBusy) return;
    try {
      final url =
          await context.read<InvoiceController>().fetchInvoicePdf(invoice.id);
      if (!mounted) return;
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

    return PopScope(
      canPop: !_isBusy,
      child: Scaffold(
        backgroundColor: AppColors.ink,
        body: Stack(
          children: [
            AdminPersonView(
              data: data,
              isBusy: _isBusy,
              onBack: _isBusy ? null : () => Navigator.of(context).pop(),
              onEditTokens: _editTokens,
              onMessage: () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => ChatScreen(
                    chatId: null,
                    otherUserName:
                        data.name.isEmpty ? data.roleLabel : data.name,
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
      ),
    );
  }
}
