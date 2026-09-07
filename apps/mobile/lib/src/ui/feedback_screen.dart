import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/connectivity_controller.dart';
import 'package:tenacity/src/controllers/feedback_controller.dart';
import 'package:tenacity/src/helpers/offline_action_guard.dart';
import 'package:tenacity/src/models/feedback_model.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/feedback/feedback_history_data.dart';
import 'package:tenacity/src/ui/feedback/feedback_history_view.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';
import 'package:uuid/uuid.dart';
import 'package:tenacity/src/utils/error_presenter.dart';

/// A student's feedback history.
///
/// Reached by families from the dashboard, by staff from the directory, and
/// from a push notification, so it stands alone rather than assuming a caller.
class FeedbackScreen extends StatefulWidget {
  final String studentId;

  /// Shown in the header when the caller already knows it, saving a lookup.
  final String? studentName;

  const FeedbackScreen({
    super.key,
    required this.studentId,
    this.studentName,
  });

  @override
  State<FeedbackScreen> createState() => _FeedbackScreenState();
}

class _FeedbackScreenState extends State<FeedbackScreen> {
  /// The builders below re-present the same snapshot on every rebuild;
  /// this keeps one failure to one log entry.
  final _errorPresentation = ErrorPresentationCache();
  Map<String, String> _tutorNames = const {};

  /// Ids already handed to the controller, so a rebuild does not mark the same
  /// notes read again on every frame.
  final _markedRead = <String>{};

  /// Subscribed once. `getFeedbackByStudentId` returns a fresh stream per
  /// call, so building it inside `build` resubscribed on every frame and left
  /// the view stuck in its loading state.
  Stream<List<StudentFeedback>>? _feedback;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      setState(() {
        _feedback = context
            .read<FeedbackController>()
            .getFeedbackByStudentId(widget.studentId);
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    final feedbackController = context.read<FeedbackController>();
    final authController = context.read<AuthController>();
    final isAdmin = authController.currentUser?.role == 'admin';

    return Scaffold(
      backgroundColor: AppColors.ink,
      body: StreamBuilder<List<StudentFeedback>>(
        stream: _feedback,
        builder: (context, snapshot) {
          final feedback = snapshot.data ?? const <StudentFeedback>[];
          _resolveTutorNames(authController, feedback);

          final data = buildFeedbackHistory(
            feedback: feedback,
            tutorNamesById: _tutorNames,
            now: DateTime.now(),
          );

          _scheduleMarkRead(feedbackController, data.unreadIds);

          return FeedbackHistoryView(
            data: data,
            title: widget.studentName == null
                ? 'Feedback'
                : "${widget.studentName}'s feedback",
            subtitle: data.isEmpty
                ? null
                : '${data.notes.length} '
                    '${data.notes.length == 1 ? 'note' : 'notes'}',
            isLoading: _feedback == null ||
                snapshot.connectionState == ConnectionState.waiting,
            errorReason: snapshot.hasError
                ? _errorPresentation
                    .present(
                      snapshot.error!,
                      action: 'load this feedback',
                      operation: Operation.read,
                      stackTrace: snapshot.stackTrace,
                    )
                    .reason
                : null,
            onBack: () => Navigator.of(context).pop(),
            onAdd: isAdmin ? () => _showAddFeedback(context) : null,
          );
        },
      ),
    );
  }

  /// Resolves the authors once per new set of tutors, then rebuilds.
  void _resolveTutorNames(
    AuthController authController,
    List<StudentFeedback> feedback,
  ) {
    final missing = feedback
        .map((entry) => entry.tutorId)
        .where((id) => id.isNotEmpty && !_tutorNames.containsKey(id))
        .toSet();
    if (missing.isEmpty) return;

    authController.fetchTutorNamesByIds(missing.toList()).then((names) {
      if (!mounted) return;
      setState(() => _tutorNames = {..._tutorNames, ...names});
    }).catchError((Object error) {
      debugPrint('[FeedbackScreen] tutor name lookup failed: $error');
    });
  }

  /// Marks notes read after the frame that showed them.
  ///
  /// Offline the write is skipped rather than queued: a note marked read on a
  /// device that never reconnects would be lost to the family entirely.
  void _scheduleMarkRead(
    FeedbackController controller,
    List<String> unreadIds,
  ) {
    final pending = unreadIds.where((id) => !_markedRead.contains(id)).toList();
    if (pending.isEmpty) return;

    _markedRead.addAll(pending);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (!context.read<ConnectivityController>().isOnline) {
        _markedRead.removeAll(pending);
        return;
      }
      controller.markAsRead(pending);
    });
  }

  Future<void> _showAddFeedback(BuildContext context) async {
    final feedbackController = context.read<FeedbackController>();
    final tutorId = context.read<AuthController>().currentUser?.uid ?? '';
    final feedbackId = const Uuid().v4();

    await showAppBottomSheet<void>(
      context: context,
      allowUserDismissal: false,
      builder: (sheetContext) => _AddFeedbackSheet(
        onSubmit: (subject, body) async {
          if (!await OfflineActionGuard.ensureOnline(
            sheetContext,
            action: 'add feedback',
          )) {
            return false;
          }

          try {
            await feedbackController.addFeedback(
              StudentFeedback(
                id: feedbackId,
                studentId: widget.studentId,
                tutorId: tutorId,
                subject: subject,
                feedback: body,
                createdAt: DateTime.now(),
                isUnread: true,
                // Standalone admin feedback carries no session, and the
                // parents are resolved by the read rules rather than stored
                // here — matching the previous behaviour.
                parentIds: const [],
              ),
            );
            return true;
          } catch (e) {
            debugPrint('[FeedbackScreen] add feedback failed: $e');
            return false;
          }
        },
      ),
    );
  }
}

/// Admin-only: record feedback outside a session.
class _AddFeedbackSheet extends StatefulWidget {
  /// Returns true when the note was written.
  final Future<bool> Function(String subject, String body) onSubmit;

  const _AddFeedbackSheet({required this.onSubmit});

  @override
  State<_AddFeedbackSheet> createState() => _AddFeedbackSheetState();
}

class _AddFeedbackSheetState extends State<_AddFeedbackSheet> {
  final _formKey = GlobalKey<FormState>();
  final _subject = TextEditingController();
  final _body = TextEditingController();
  bool _isSaving = false;

  @override
  void dispose() {
    _subject.dispose();
    _body.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    setState(() => _isSaving = true);
    final saved = await widget.onSubmit(
      _subject.text.trim(),
      _body.text.trim(),
    );
    if (!mounted) return;

    if (saved) {
      Navigator.of(context).pop();
      return;
    }

    setState(() => _isSaving = false);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Feedback could not be added. Please try again.'),
        backgroundColor: AppColors.danger,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AppBottomSheet(
      title: 'Add feedback',
      subtitle: 'The family is notified once this is saved.',
      footer: SheetActions(
        confirmLabel: 'Add feedback',
        isBusy: _isSaving,
        onConfirm: _submit,
        onCancel: () => Navigator.of(context).pop(),
      ),
      child: Form(
        key: _formKey,
        child: Column(
          children: [
            TextFormField(
              controller: _subject,
              enabled: !_isSaving,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(labelText: 'Subject'),
              validator: (value) =>
                  (value ?? '').trim().isEmpty ? 'Enter a subject' : null,
            ),
            const SizedBox(height: AppSpacing.lg),
            TextFormField(
              controller: _body,
              enabled: !_isSaving,
              textCapitalization: TextCapitalization.sentences,
              minLines: 3,
              maxLines: 6,
              decoration: const InputDecoration(labelText: 'Feedback'),
              validator: (value) =>
                  (value ?? '').trim().isEmpty ? 'Enter feedback' : null,
            ),
          ],
        ),
      ),
    );
  }
}
