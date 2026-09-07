import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/timetable_controller.dart';
import 'package:tenacity/src/helpers/offline_action_guard.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/feedback_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/services/tutor_session_service.dart';
import 'package:tenacity/src/ui/classes/tutor/class_roll_data.dart';
import 'package:tenacity/src/ui/classes/tutor/class_roll_view.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/dashboard/dashboard_formatting.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';
import 'package:tenacity/src/utils/error_presenter.dart';

/// Marking one session's roll and writing feedback for it.
///
/// Holds the tutor's edits locally and commits them in one submission, so a
/// half-finished roll is never partially written to the family.
class ClassRollScreen extends StatefulWidget {
  final ClassModel classInfo;
  final String attendanceDocId;

  /// Injected by tests; defaults to the real service.
  final TutorSessionService? sessionService;

  const ClassRollScreen({
    super.key,
    required this.classInfo,
    required this.attendanceDocId,
    this.sessionService,
  });

  @override
  State<ClassRollScreen> createState() => _ClassRollScreenState();
}

class _ClassRollScreenState extends State<ClassRollScreen> {
  late final TutorSessionService _service =
      widget.sessionService ?? TutorSessionService();

  bool _isLoading = true;
  bool _isSaving = false;
  bool _isDirty = false;
  bool _saveRequiresReopen = false;
  String? _errorMessage;

  Attendance? _attendance;
  List<Student> _roster = const [];
  List<StudentFeedback> _sessionFeedback = const [];

  /// The tutor's edits. Rebuilt from storage on load, then owned here until
  /// the submission lands.
  List<RollStudent> _students = const [];

  @override
  void initState() {
    super.initState();
    // Post-frame: the load reads providers, and a first frame with the
    // skeleton is better than a blank one.
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    if (!mounted) return;
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    final authController = context.read<AuthController>();
    final timetableController = context.read<TimetableController>();

    try {
      final attendance =
          timetableController.attendanceByClass[widget.classInfo.id];

      // Shared with the cards that route here, so the list and the session it
      // opens cannot disagree about who is expected. It resolves to this
      // week's bookings — one-off visitors included, notified absences and
      // cancellations excluded.
      final rosterIds = widget.classInfo.rosterFor(attendance).toList();

      final results = await Future.wait([
        Future.wait(rosterIds.map(authController.fetchStudentData)),
        _service.feedbackForSession(
          classId: widget.classInfo.id,
          sessionId: widget.attendanceDocId,
        ),
      ]);

      if (!mounted) return;

      final students = (results[0] as List<Student?>)
          .whereType<Student>()
          .toList(growable: false);
      final feedback = results[1] as List<StudentFeedback>;

      setState(() {
        _attendance = attendance;
        _roster = students;
        _sessionFeedback = feedback;
        _students = _buildData().students;
        _isLoading = false;
        _isDirty = false;
        _saveRequiresReopen = false;
      });
    } catch (error, stackTrace) {
      if (!mounted) return;
      // Under the "We couldn't load this class" heading, so the reason alone.
      final presented = presentError(
        error,
        action: 'load this class',
        operation: Operation.read,
        stackTrace: stackTrace,
      );
      setState(() {
        _isLoading = false;
        _errorMessage = presented.reason;
      });
    }
  }

  ClassRollViewData _buildData() {
    final attendance = _attendance;
    final startsAt = attendance?.date.toLocal() ?? DateTime.now();

    return buildClassRollViewData(
      classInfo: widget.classInfo,
      roster: _roster,
      marks: attendance?.marks ?? const {},
      sessionFeedback: _sessionFeedback,
      sessionStart: startsAt,
      sessionEnd: sessionEndFor(startsAt, widget.classInfo.endTime),
      now: DateTime.now(),
      cancelled: attendance?.cancelled ?? false,
      errorMessage: _errorMessage,
    );
  }

  /// The current view data, with the tutor's unsaved edits layered over it.
  ClassRollViewData get _data {
    final base = _buildData();
    if (_students.isEmpty) return base;

    return ClassRollViewData(
      classTitle: base.classTitle,
      whenLabel: base.whenLabel,
      sessionState: base.sessionState,
      students: _students,
      errorMessage: base.errorMessage,
    );
  }

  void _updateStudent(RollStudent student, RollStudent updated) {
    setState(() {
      _students = [
        for (final existing in _students)
          existing.studentId == student.studentId ? updated : existing,
      ];
      _isDirty = true;
    });
  }

  Future<bool> _confirmDiscard() async {
    if (_isSaving) return false;
    if (!_isDirty) return true;

    return showAppConfirmationSheet(
      context: context,
      title: 'Leave without saving?',
      message: 'The attendance and feedback you have entered will be lost.',
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
      tone: AppConfirmationTone.destructive,
    );
  }

  Future<void> _save() async {
    if (_isSaving || _saveRequiresReopen) return;

    final attendance = _attendance;
    if (attendance == null) {
      _showMessage('This session could not be found.', isError: true);
      return;
    }

    final authController = context.read<AuthController>();
    final tutorId = authController.currentUser?.uid;
    if (tutorId == null) return;

    setState(() => _isSaving = true);

    if (!await OfflineActionGuard.ensureOnline(
      context,
      action: 'save this roll',
    )) {
      if (mounted) setState(() => _isSaving = false);
      return;
    }
    if (!mounted) return;

    final data = _data;
    final present = _students.where((s) => s.isHere).toList(growable: false);

    // Only students whose feedback has not already been sent for this session,
    // so a retry after a partial failure cannot double-send.
    final feedback = [
      for (final student in present)
        if (!student.feedbackAlreadySent && student.hasFeedback)
          StudentFeedback(
            id: '',
            studentId: student.studentId,
            tutorId: tutorId,
            parentIds: student.parentIds,
            feedback: student.feedback.trim(),
            subject: feedbackSubjectFor(widget.classInfo),
            createdAt: DateTime.now(),
            isUnread: true,
            classId: widget.classInfo.id,
            sessionId: widget.attendanceDocId,
            progress: student.progress,
          ),
    ];

    // Corrections to notes the family already has. Written as edits rather
    // than sent again, so the family keeps one note per lesson.
    final edits = feedbackEditsToWrite(
      students: _students,
      sent: _sessionFeedback,
    );

    // An emptied note is refused rather than skipped: a tutor who cleared the
    // box meant to change something, and a save that quietly kept the old text
    // would leave them believing the family sees nothing.
    if (edits.any((edit) => edit.feedback.isEmpty)) {
      setState(() => _isSaving = false);
      _showMessage(
        'Feedback already sent cannot be left empty. Write the correction, or '
        'put back what was there.',
        isError: true,
      );
      return;
    }

    try {
      await _service.submitSession(
        classId: widget.classInfo.id,
        sessionId: attendance.id,
        marks: marksToWrite(students: _students, stored: attendance.marks),
        feedback: feedback,
        edits: edits,
        markRollComplete: data.isAttendanceComplete,
        completedBy: tutorId,
      );

      if (!mounted) return;
      await context.read<TimetableController>().loadAttendanceForWeek(
            silent: true,
          );
      if (!mounted) return;

      setState(() {
        _isSaving = false;
        _isDirty = false;
      });

      _showMessage(_savedMessage(
        data: data,
        sent: feedback.length,
        edited: edits.length,
      ));

      // Reloaded rather than assumed: the submission may have been partially
      // superseded by an admin editing the same session.
      await _load();
    } catch (e) {
      debugPrint('[ClassRollScreen] save failed: $e');
      if (!mounted) return;
      setState(() {
        _isSaving = false;
        _saveRequiresReopen = true;
      });
      _showMessage(
        'The roll could not be fully saved. Some feedback may already have '
        'been sent or updated. Reopen the roll before retrying.',
        isError: true,
      );
    }
  }

  /// What the save actually did, so a tutor who only fixed a typo is not told
  /// their correction was sent to the family as a new note.
  String _savedMessage({
    required ClassRollViewData data,
    required int sent,
    required int edited,
  }) {
    if (!data.isAttendanceComplete) {
      final outstanding = '${data.unmarkedCount} still to mark.';
      return edited > 0
          ? 'Feedback updated and progress saved. $outstanding'
          : 'Progress saved. $outstanding';
    }
    if (sent > 0) return 'Roll saved and feedback sent.';
    if (edited > 0) return 'Roll saved and feedback updated.';
    return 'Roll saved.';
  }

  void _showMessage(String message, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? AppColors.danger : AppColors.ink,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !_isDirty && !_isSaving,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final navigator = Navigator.of(context);
        if (await _confirmDiscard() && mounted) {
          navigator.pop();
        }
      },
      child: Scaffold(
        backgroundColor: AppColors.ink,
        body: ClassRollView(
          data: _data,
          isLoading: _isLoading,
          isSaving: _isSaving,
          isDirty: _isDirty,
          canSave: !_saveRequiresReopen,
          onAttendanceChanged: (student, attendance) {
            // Marking someone away drops what was typed about them, rather
            // than sending a note and a status for a session they were not in.
            //
            // A note the family already has is left alone. Clearing it here
            // would not retract it, and toggling back to Here would then read
            // as the tutor having emptied it deliberately.
            final discardDraft = attendance == RollAttendance.away &&
                !student.feedbackAlreadySent;

            _updateStudent(
              student,
              student.copyWith(
                attendance: attendance,
                clearProgress: discardDraft,
                feedback: discardDraft ? '' : null,
              ),
            );
          },
          onProgressChanged: (student, progress) => _updateStudent(
            student,
            progress == null
                ? student.copyWith(clearProgress: true)
                : student.copyWith(progress: progress),
          ),
          onFeedbackChanged: (student, feedback) => _updateStudent(
            student,
            student.copyWith(feedback: feedback),
          ),
          onSave: _save,
          onBack: () async {
            final navigator = Navigator.of(context);
            if (await _confirmDiscard() && mounted) {
              navigator.pop();
            }
          },
          onRetry: _load,
        ),
      ),
    );
  }
}
