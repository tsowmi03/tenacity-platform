import 'dart:async';

import 'package:flutter/material.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/models/waitlist_entry_model.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/dashboard/dashboard_formatting.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';
import 'package:tenacity/src/ui/timetable/admin/admin_class_management_data.dart';

typedef AdminSheetSubmit<T> = Future<String?> Function(T value);

class AdminRosterSheet extends StatefulWidget {
  final String classTitle;
  final String whenLabel;
  final bool hasSession;
  final Future<AdminRosterSnapshot> Function() loadEntries;
  final Future<bool> Function() onAddStudent;
  final Future<bool> Function(AdminRosterEntry entry) onRemove;
  final AdminSheetSubmit<AdminWeekBookingsUpdate> onSaveWeekBookings;
  final ValueChanged<AdminRosterEntry> onOpenFeedback;
  final ValueChanged<AdminRosterEntry> onComposeFeedback;
  final VoidCallback onClose;

  const AdminRosterSheet({
    super.key,
    required this.classTitle,
    required this.whenLabel,
    required this.hasSession,
    required this.loadEntries,
    required this.onAddStudent,
    required this.onRemove,
    required this.onSaveWeekBookings,
    required this.onOpenFeedback,
    required this.onComposeFeedback,
    required this.onClose,
  });

  @override
  State<AdminRosterSheet> createState() => _AdminRosterSheetState();
}

class _AdminRosterSheetState extends State<AdminRosterSheet> {
  List<AdminRosterEntry> _entries = const [];
  final _bookedIds = <String>{};
  List<String> _expectedBookedIds = const [];
  String? _attendanceDocId;
  final _busyStudentIds = <String>{};
  bool _isLoading = true;
  bool _isAdding = false;
  bool _isSaving = false;
  Object? _loadError;
  String? _saveError;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _loadError = null;
    });
    try {
      final snapshot = await widget.loadEntries();
      if (!mounted) return;
      setState(() {
        _entries = snapshot.entries;
        _expectedBookedIds = snapshot.bookedStudentIds;
        _attendanceDocId = snapshot.attendanceDocId;
        _bookedIds
          ..clear()
          ..addAll(snapshot.bookedStudentIds);
        _isLoading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _loadError = error;
      });
    }
  }

  Future<void> _addStudent() async {
    if (_isAdding || _isSaving || _isLoading || _busyStudentIds.isNotEmpty) {
      return;
    }
    setState(() {
      _isAdding = true;
      _saveError = null;
    });
    final changed = await widget.onAddStudent();
    if (!mounted) return;
    setState(() => _isAdding = false);
    if (changed) await _load();
  }

  Future<void> _remove(AdminRosterEntry entry) async {
    final id = entry.student.id;
    if (_isSaving || _isAdding || _isLoading || _busyStudentIds.isNotEmpty) {
      return;
    }
    setState(() {
      _busyStudentIds.add(id);
      _saveError = null;
    });
    final changed = await widget.onRemove(entry);
    if (!mounted) return;
    setState(() => _busyStudentIds.remove(id));
    if (changed) await _load();
  }

  Future<void> _save() async {
    if (_isSaving ||
        _isAdding ||
        _isLoading ||
        _loadError != null ||
        _busyStudentIds.isNotEmpty ||
        !widget.hasSession) {
      return;
    }
    setState(() {
      _isSaving = true;
      _saveError = null;
    });
    final error = await widget.onSaveWeekBookings(
      AdminWeekBookingsUpdate(
        expectedStudentIds: _expectedBookedIds,
        studentIds: _bookedIds,
        attendanceDocId: _attendanceDocId,
      ),
    );
    if (!mounted) return;
    if (error == null) {
      Navigator.of(context).pop();
      return;
    }
    setState(() {
      _isSaving = false;
      _saveError = error;
    });
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final mutationBusy = _isSaving || _isAdding || _busyStudentIds.isNotEmpty;
    final controlsBusy = mutationBusy || _isLoading;

    return AppBottomSheet(
      title: 'Enrolments',
      subtitle: '${widget.classTitle} · ${widget.whenLabel}',
      maxHeightFactor: 0.92,
      footer: widget.hasSession
          ? SheetActions(
              confirmLabel: 'Save weekly bookings',
              isBusy: mutationBusy,
              onConfirm: !_isLoading && _loadError == null ? _save : null,
              onCancel: widget.onClose,
              cancelLabel: 'Close',
            )
          : OutlinedButton(
              onPressed: widget.onClose,
              child: const Text('Close'),
            ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          FilledButton.icon(
            key: const Key('admin-roster-add'),
            onPressed: controlsBusy ? null : _addStudent,
            icon: _isAdding
                ? const SizedBox(
                    width: AppSpacing.lg,
                    height: AppSpacing.lg,
                    child: CircularProgressIndicator(
                      color: Colors.white,
                      strokeWidth: 2,
                    ),
                  )
                : const Icon(Icons.person_add_alt_1_rounded),
            label: const Text('Add student'),
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            widget.hasSession
                ? 'Booked this week'
                : 'This class has no generated session for this week.',
            style: AppText.body(
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
              color: widget.hasSession ? AppColors.muted : AppColors.warning,
            ),
          ),
          const SizedBox(height: AppSpacing.labelGap),
          if (_saveError != null) ...[
            _InlineMessage(
              key: const Key('admin-roster-save-error'),
              message: _saveError!,
              isError: true,
            ),
            const SizedBox(height: AppSpacing.md),
          ],
          if (_isLoading)
            const _RosterSkeleton()
          else if (_loadError != null)
            ErrorStateView(
              key: const Key('admin-roster-error'),
              title: 'Enrolments could not be loaded',
              message: 'Please check your connection and try again.',
              onRetry: _load,
            )
          else if (_entries.isEmpty)
            const EmptyStateView(
              key: Key('admin-roster-empty'),
              icon: Icons.people_outline_rounded,
              title: 'No students enrolled',
              message: 'Add an existing student to start this class roster.',
            )
          else
            for (var index = 0; index < _entries.length; index++) ...[
              if (index > 0) const SizedBox(height: AppSpacing.sm),
              _RosterTile(
                entry: _entries[index],
                checked: _bookedIds.contains(_entries[index].student.id),
                checkingEnabled: widget.hasSession,
                enabled: !controlsBusy,
                isBusy: _busyStudentIds.contains(_entries[index].student.id),
                onChecked: (checked) {
                  setState(() {
                    if (checked) {
                      _bookedIds.add(_entries[index].student.id);
                    } else {
                      _bookedIds.remove(_entries[index].student.id);
                    }
                  });
                },
                onOpenFeedback: () => widget.onOpenFeedback(_entries[index]),
                onComposeFeedback: () =>
                    widget.onComposeFeedback(_entries[index]),
                onRemove: () => _remove(_entries[index]),
              ),
            ],
        ],
      ),
    );
  }
}

class _RosterTile extends StatelessWidget {
  final AdminRosterEntry entry;
  final bool checked;
  final bool checkingEnabled;
  final bool enabled;
  final bool isBusy;
  final ValueChanged<bool> onChecked;
  final VoidCallback onOpenFeedback;
  final VoidCallback onComposeFeedback;
  final VoidCallback onRemove;

  const _RosterTile({
    required this.entry,
    required this.checked,
    required this.checkingEnabled,
    required this.enabled,
    required this.isBusy,
    required this.onChecked,
    required this.onOpenFeedback,
    required this.onComposeFeedback,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      key: Key('admin-roster-${entry.student.id}'),
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: checked && checkingEnabled ? AppColors.blue50 : AppColors.paper,
        border: Border.all(
          color:
              checked && checkingEnabled ? AppColors.blue300 : AppColors.line,
        ),
        borderRadius: BorderRadius.circular(AppRadii.md),
      ),
      child: Column(
        children: [
          Row(
            children: [
              if (checkingEnabled) ...[
                Checkbox(
                  key: Key('admin-roster-booked-${entry.student.id}'),
                  value: checked,
                  onChanged: !enabled || isBusy
                      ? null
                      : (value) => onChecked(value ?? false),
                ),
                const SizedBox(width: AppSpacing.xs),
              ] else ...[
                CircleAvatar(
                  radius: 18,
                  backgroundColor: AppColors.blue100,
                  child: Text(
                    entry.initials,
                    style: AppText.body(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: AppColors.blue600,
                    ),
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
              ],
              Expanded(
                child: InkWell(
                  onTap: enabled && !isBusy ? onOpenFeedback : null,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        entry.name,
                        style: AppText.body(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: AppColors.ink,
                        ),
                      ),
                      const SizedBox(height: AppSpacing.xxs),
                      Text(
                        entry.subtitle,
                        style: AppText.body(
                          fontSize: 11.5,
                          color: AppColors.muted,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              if (isBusy)
                const SizedBox(
                  width: AppSpacing.xl,
                  height: AppSpacing.xl,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              else
                PopupMenuButton<String>(
                  key: Key('admin-roster-actions-${entry.student.id}'),
                  tooltip: 'Student actions',
                  enabled: enabled,
                  onSelected: (action) {
                    if (action == 'history') onOpenFeedback();
                    if (action == 'feedback') onComposeFeedback();
                    if (action == 'remove') onRemove();
                  },
                  itemBuilder: (_) => [
                    const PopupMenuItem(
                      value: 'history',
                      child: Text('View feedback'),
                    ),
                    const PopupMenuItem(
                      value: 'feedback',
                      child: Text('Add feedback'),
                    ),
                    PopupMenuItem(
                      value: 'remove',
                      child: Text(
                        entry.isPermanent
                            ? 'Unenrol from class'
                            : 'Remove from this week',
                        style: const TextStyle(color: AppColors.danger),
                      ),
                    ),
                  ],
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class AdminStudentPickerSheet extends StatefulWidget {
  final Future<List<Student>> students;
  final ValueChanged<Student> onSelected;
  final VoidCallback onCancel;

  const AdminStudentPickerSheet({
    super.key,
    required this.students,
    required this.onSelected,
    required this.onCancel,
  });

  @override
  State<AdminStudentPickerSheet> createState() =>
      _AdminStudentPickerSheetState();
}

class _AdminStudentPickerSheetState extends State<AdminStudentPickerSheet> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Student>>(
      future: widget.students,
      builder: (context, snapshot) {
        final students = [...?snapshot.data]..sort((a, b) => _studentName(a)
            .toLowerCase()
            .compareTo(_studentName(b).toLowerCase()));
        final query = _query.trim().toLowerCase();
        final matches = query.isEmpty
            ? students
            : students
                .where((student) =>
                    _studentName(student).toLowerCase().contains(query) ||
                    student.grade.toLowerCase().contains(query))
                .toList();

        return AppBottomSheet(
          title: 'Add student',
          subtitle: 'Choose an existing student account.',
          maxHeightFactor: 0.9,
          footer: OutlinedButton(
            onPressed: widget.onCancel,
            child: const Text('Cancel'),
          ),
          child: Column(
            children: [
              TextField(
                key: const Key('admin-student-search'),
                onChanged: (value) => setState(() => _query = value),
                textInputAction: TextInputAction.search,
                decoration: const InputDecoration(
                  hintText: 'Search students',
                  prefixIcon: Icon(Icons.search_rounded),
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              if (snapshot.connectionState == ConnectionState.waiting)
                const _RosterSkeleton()
              else if (snapshot.hasError)
                const ErrorStateView(
                  key: Key('admin-student-picker-error'),
                  title: 'Students could not be loaded',
                  message: 'Please check your connection and try again.',
                )
              else if (matches.isEmpty)
                EmptyStateView(
                  key: const Key('admin-student-picker-empty'),
                  icon: Icons.person_search_rounded,
                  title: query.isEmpty ? 'No students found' : 'No matches',
                  message: query.isEmpty
                      ? 'There are no existing student accounts to enrol.'
                      : 'Try a different name or year.',
                )
              else
                for (var index = 0; index < matches.length; index++) ...[
                  if (index > 0) const SizedBox(height: AppSpacing.sm),
                  _SelectionTile(
                    key: Key('admin-student-choice-${matches[index].id}'),
                    title: _studentName(matches[index]),
                    // The year alone was shown here, and bare — a student in
                    // year 9 read as "9". This is the one screen where getting
                    // the wrong student wrong enrols them into a class meant
                    // for another year, so it names both.
                    subtitle: _studentDetail(matches[index]),
                    onTap: () => widget.onSelected(matches[index]),
                  ),
                ],
            ],
          ),
        );
      },
    );
  }
}

/// Picks the class to enrol into, for the dashboard's New enrol flow.
///
/// The class-side flow already knows its class and starts at the student
/// picker; this is the mirror of that, reached when an admin starts from the
/// student instead.
class AdminClassPickerSheet extends StatefulWidget {
  final Future<List<AdminClassChoice>> choices;
  final String studentName;
  final ValueChanged<AdminClassChoice> onSelected;
  final VoidCallback onCancel;

  const AdminClassPickerSheet({
    super.key,
    required this.choices,
    required this.studentName,
    required this.onSelected,
    required this.onCancel,
  });

  @override
  State<AdminClassPickerSheet> createState() => _AdminClassPickerSheetState();
}

class _AdminClassPickerSheetState extends State<AdminClassPickerSheet> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<AdminClassChoice>>(
      future: widget.choices,
      builder: (context, snapshot) {
        final choices = [...?snapshot.data];
        final query = _query.trim().toLowerCase();
        final matches = query.isEmpty
            ? choices
            : choices
                .where((choice) =>
                    choice.title.toLowerCase().contains(query) ||
                    choice.subtitle.toLowerCase().contains(query))
                .toList();

        return AppBottomSheet(
          title: 'Choose a class',
          subtitle: 'Enrolling ${widget.studentName}.',
          maxHeightFactor: 0.9,
          footer: OutlinedButton(
            onPressed: widget.onCancel,
            child: const Text('Cancel'),
          ),
          child: Column(
            children: [
              TextField(
                key: const Key('admin-class-search'),
                onChanged: (value) => setState(() => _query = value),
                textInputAction: TextInputAction.search,
                decoration: const InputDecoration(
                  hintText: 'Search classes',
                  prefixIcon: Icon(Icons.search_rounded),
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              if (snapshot.connectionState == ConnectionState.waiting)
                const _RosterSkeleton()
              else if (snapshot.hasError)
                const ErrorStateView(
                  key: Key('admin-class-picker-error'),
                  title: 'Classes could not be loaded',
                  message: 'Please check your connection and try again.',
                )
              else if (matches.isEmpty)
                EmptyStateView(
                  key: const Key('admin-class-picker-empty'),
                  icon: Icons.event_busy_rounded,
                  title: query.isEmpty ? 'No classes found' : 'No matches',
                  message: query.isEmpty
                      ? 'There are no classes to enrol into yet.'
                      : 'Try a different class name, day or time.',
                )
              else
                for (var index = 0; index < matches.length; index++) ...[
                  if (index > 0) const SizedBox(height: AppSpacing.sm),
                  _SelectionTile(
                    key: Key(
                        'admin-class-choice-${matches[index].classModel.id}'),
                    title: matches[index].title,
                    subtitle: '${matches[index].subtitle} · '
                        '${matches[index].seatsLabel}',
                    onTap: matches[index].isSelectable
                        ? () => widget.onSelected(matches[index])
                        : null,
                  ),
                ],
            ],
          ),
        );
      },
    );
  }
}

class AdminEnrolmentTypeSheet extends StatelessWidget {
  final String studentName;
  final bool canBookOneOff;
  final ValueChanged<AdminEnrolmentType> onSelected;
  final VoidCallback onCancel;

  const AdminEnrolmentTypeSheet({
    super.key,
    required this.studentName,
    required this.canBookOneOff,
    required this.onSelected,
    required this.onCancel,
  });

  @override
  Widget build(BuildContext context) {
    return AppBottomSheet(
      title: 'Enrol $studentName',
      subtitle: 'Choose whether this applies once or from now on.',
      footer: OutlinedButton(
        onPressed: onCancel,
        child: const Text('Cancel'),
      ),
      child: Column(
        children: [
          if (canBookOneOff) ...[
            _SelectionTile(
              key: const Key('admin-enrol-one-off'),
              title: 'One-off',
              subtitle: 'Book this student into the displayed week only.',
              onTap: () => onSelected(AdminEnrolmentType.oneOff),
            ),
            const SizedBox(height: AppSpacing.sm),
          ] else ...[
            const _InlineMessage(
              key: Key('admin-enrol-one-off-unavailable'),
              message: 'A one-off booking needs a generated session for this '
                  'week. Permanent enrolment is still available.',
              isError: false,
            ),
            const SizedBox(height: AppSpacing.sm),
          ],
          _SelectionTile(
            key: const Key('admin-enrol-permanent'),
            title: 'Permanent',
            subtitle: 'Add this student to the standing class roster.',
            onTap: () => onSelected(AdminEnrolmentType.permanent),
          ),
        ],
      ),
    );
  }
}

class AdminTutorAssignmentSheet extends StatefulWidget {
  final String classTitle;
  final String whenLabel;
  final int currentWeek;
  final List<AdminTutorChoice> tutors;
  final List<String> initialTutorIds;
  final bool canApplyThisWeek;
  final AdminSheetSubmit<AdminTutorAssignment> onSubmit;
  final VoidCallback onCancel;

  const AdminTutorAssignmentSheet({
    super.key,
    required this.classTitle,
    required this.whenLabel,
    required this.currentWeek,
    required this.tutors,
    required this.initialTutorIds,
    required this.canApplyThisWeek,
    required this.onSubmit,
    required this.onCancel,
  });

  @override
  State<AdminTutorAssignmentSheet> createState() =>
      _AdminTutorAssignmentSheetState();
}

class _AdminTutorAssignmentSheetState extends State<AdminTutorAssignmentSheet> {
  late final Set<String> _selected = widget.initialTutorIds.toSet();
  AdminTutorScope _scope = AdminTutorScope.classOnly;
  late AdminTutorEffective _effective = widget.canApplyThisWeek
      ? AdminTutorEffective.thisWeek
      : AdminTutorEffective.permanent;
  bool _isSaving = false;
  bool _requiresReload = false;
  String? _error;

  Future<void> _submit() async {
    if (_isSaving || _requiresReload || _selected.isEmpty) return;
    setState(() {
      _isSaving = true;
      _error = null;
    });
    final error = await widget.onSubmit(
      AdminTutorAssignment(
        tutorIds: _selected.toList(),
        scope: _scope,
        effective: _effective,
      ),
    );
    if (!mounted) return;
    if (error == null) {
      Navigator.of(context).pop();
      return;
    }
    setState(() {
      _isSaving = false;
      _requiresReload = true;
      // The submitted message already advises what to do about the failure
      // itself; this adds only what is specific to the sheet, which is that
      // its snapshot is now stale. Saying "before trying again" here read as a
      // second, contradictory instruction once the messages stopped being raw
      // exception text (MOB-34).
      _error = '$error This editor is now out of date — close and reopen it.';
    });
  }

  @override
  Widget build(BuildContext context) {
    return AppBottomSheet(
      title: 'Assign tutors',
      subtitle: '${widget.classTitle} · ${widget.whenLabel}',
      maxHeightFactor: 0.92,
      footer: SheetActions(
        confirmLabel: 'Save assignment',
        isBusy: _isSaving,
        onConfirm: _selected.isEmpty || _requiresReload ? null : _submit,
        onCancel: widget.onCancel,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionLabel(title: 'TUTORS'),
          const SizedBox(height: AppSpacing.labelGap),
          for (var index = 0; index < widget.tutors.length; index++) ...[
            if (index > 0) const SizedBox(height: AppSpacing.sm),
            _CheckTile(
              key: Key('admin-tutor-${widget.tutors[index].id}'),
              title: widget.tutors[index].name,
              selected: _selected.contains(widget.tutors[index].id),
              enabled: !_isSaving && !_requiresReload,
              onChanged: (selected) {
                setState(() {
                  if (selected) {
                    _selected.add(widget.tutors[index].id);
                  } else {
                    _selected.remove(widget.tutors[index].id);
                  }
                });
              },
            ),
          ],
          if (_selected.isEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              'Choose at least one tutor.',
              style: AppText.body(fontSize: 12, color: AppColors.danger),
            ),
          ],
          const SizedBox(height: AppSpacing.xl),
          const SectionLabel(title: 'APPLY TO'),
          const SizedBox(height: AppSpacing.labelGap),
          _RadioTile<AdminTutorScope>(
            key: const Key('admin-tutor-scope-class'),
            value: AdminTutorScope.classOnly,
            groupValue: _scope,
            title: 'This class only',
            enabled: !_isSaving && !_requiresReload,
            onChanged: (value) => setState(() => _scope = value),
          ),
          const SizedBox(height: AppSpacing.sm),
          _RadioTile<AdminTutorScope>(
            key: const Key('admin-tutor-scope-day'),
            value: AdminTutorScope.day,
            groupValue: _scope,
            title: 'All ${widget.whenLabel.split(',').first} classes',
            enabled: !_isSaving && !_requiresReload,
            onChanged: (value) => setState(() => _scope = value),
          ),
          const SizedBox(height: AppSpacing.xl),
          const SectionLabel(title: 'EFFECTIVE'),
          const SizedBox(height: AppSpacing.labelGap),
          _RadioTile<AdminTutorEffective>(
            key: const Key('admin-tutor-effective-week'),
            value: AdminTutorEffective.thisWeek,
            groupValue: _effective,
            title: 'This week only',
            subtitle: widget.canApplyThisWeek
                ? null
                : 'No generated session is available this week.',
            enabled: widget.canApplyThisWeek && !_isSaving && !_requiresReload,
            onChanged: (value) => setState(() => _effective = value),
          ),
          const SizedBox(height: AppSpacing.sm),
          _RadioTile<AdminTutorEffective>(
            key: const Key('admin-tutor-effective-permanent'),
            value: AdminTutorEffective.permanent,
            groupValue: _effective,
            title: 'From week ${widget.currentWeek} onward',
            enabled: !_isSaving && !_requiresReload,
            onChanged: (value) => setState(() => _effective = value),
          ),
          if (_error != null) ...[
            const SizedBox(height: AppSpacing.lg),
            _InlineMessage(
              key: const Key('admin-tutor-error'),
              message: _error!,
              isError: true,
            ),
          ],
        ],
      ),
    );
  }
}

class AdminWaitlistSheet extends StatefulWidget {
  final String classTitle;
  final String whenLabel;
  final Future<List<AdminWaitlistEntryData>> Function() loadEntries;
  final Future<void> Function(AdminWaitlistEntryData entry) onPromote;
  final VoidCallback onClose;

  const AdminWaitlistSheet({
    super.key,
    required this.classTitle,
    required this.whenLabel,
    required this.loadEntries,
    required this.onPromote,
    required this.onClose,
  });

  @override
  State<AdminWaitlistSheet> createState() => _AdminWaitlistSheetState();
}

class _AdminWaitlistSheetState extends State<AdminWaitlistSheet> {
  List<AdminWaitlistEntryData> _entries = const [];
  final _busy = <String>{};
  bool _isLoading = true;
  Object? _error;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      final entries = await widget.loadEntries();
      if (!mounted) return;
      setState(() {
        _entries = entries;
        _isLoading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error;
        _isLoading = false;
      });
    }
  }

  Future<void> _promote(AdminWaitlistEntryData entry) async {
    if (_busy.isNotEmpty) return;
    setState(() => _busy.add(entry.entry.id));
    try {
      await widget.onPromote(entry);
      if (!mounted) return;
      await _load();
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error;
        _isLoading = false;
      });
    } finally {
      if (mounted) setState(() => _busy.remove(entry.entry.id));
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppBottomSheet(
      title: 'Waitlist',
      subtitle: '${widget.classTitle} · ${widget.whenLabel}',
      maxHeightFactor: 0.92,
      footer: Row(
        children: [
          Expanded(
            child: OutlinedButton.icon(
              key: const Key('admin-waitlist-refresh'),
              onPressed: _isLoading || _busy.isNotEmpty ? null : _load,
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('Refresh'),
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: FilledButton(
              onPressed: _busy.isNotEmpty ? null : widget.onClose,
              child: const Text('Close'),
            ),
          ),
        ],
      ),
      child: _body(),
    );
  }

  Widget _body() {
    if (_isLoading) return const _RosterSkeleton();
    if (_error != null) {
      return ErrorStateView(
        key: const Key('admin-waitlist-error'),
        title: 'Waitlist could not be loaded',
        message: 'Please check your connection and try again.',
        onRetry: _load,
      );
    }
    if (_entries.isEmpty) {
      return const EmptyStateView(
        key: Key('admin-waitlist-empty'),
        icon: Icons.hourglass_empty_rounded,
        title: 'Nobody is waiting',
        message: 'This class has no waitlist entries.',
      );
    }
    return Column(
      children: [
        for (var index = 0; index < _entries.length; index++) ...[
          if (index > 0) const SizedBox(height: AppSpacing.sm),
          _WaitlistTile(
            data: _entries[index],
            isBusy: _busy.contains(_entries[index].entry.id),
            isBlocked: _busy.isNotEmpty,
            onPromote: () => _promote(_entries[index]),
          ),
        ],
      ],
    );
  }
}

class _WaitlistTile extends StatelessWidget {
  final AdminWaitlistEntryData data;
  final bool isBusy;
  final bool isBlocked;
  final VoidCallback onPromote;

  const _WaitlistTile({
    required this.data,
    required this.isBusy,
    required this.isBlocked,
    required this.onPromote,
  });

  @override
  Widget build(BuildContext context) {
    final tone = switch (data.entry.status) {
      WaitlistStatus.active => StatusTone.info,
      WaitlistStatus.offered || WaitlistStatus.accepted => StatusTone.action,
      WaitlistStatus.promoted => StatusTone.success,
      _ => StatusTone.neutral,
    };

    return Container(
      key: Key('admin-waitlist-entry-${data.entry.id}'),
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        border: Border.all(color: AppColors.line),
        borderRadius: BorderRadius.circular(AppRadii.md),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  data.studentName,
                  style: AppText.body(
                    fontSize: 14.5,
                    fontWeight: FontWeight.w700,
                    color: AppColors.ink,
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              StatusPill(
                label: data.statusLabel.toUpperCase(),
                tone: tone,
                size: StatusPillSize.compact,
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            'Parent: ${data.parentName}',
            style: AppText.body(fontSize: 12.5, color: AppColors.muted),
          ),
          const SizedBox(height: AppSpacing.xxs),
          Text(
            'Position ${data.entry.position} · ${data.reasonLabel}',
            style: AppText.body(fontSize: 12.5, color: AppColors.muted),
          ),
          const SizedBox(height: AppSpacing.xxs),
          Text(
            'Joined ${data.joinedLabel}',
            style: AppText.body(fontSize: 11.5, color: AppColors.muted),
          ),
          if (data.entry.offeredAt != null)
            Text(
              'Offered ${formatAdminWaitlistDate(data.entry.offeredAt)}',
              style: AppText.body(fontSize: 11.5, color: AppColors.muted),
            ),
          if (data.entry.offerExpiresAt != null)
            Text(
              'Offer expires '
              '${formatAdminWaitlistDate(data.entry.offerExpiresAt)}',
              style: AppText.body(fontSize: 11.5, color: AppColors.muted),
            ),
          if (data.entry.promotedAt != null)
            Text(
              'Promoted ${formatAdminWaitlistDate(data.entry.promotedAt)}',
              style: AppText.body(fontSize: 11.5, color: AppColors.muted),
            ),
          if (data.canPromote) ...[
            const SizedBox(height: AppSpacing.md),
            FilledButton(
              key: Key('admin-waitlist-promote-${data.entry.id}'),
              onPressed: isBlocked ? null : onPromote,
              child: isBusy
                  ? const SizedBox(
                      width: AppSpacing.lg,
                      height: AppSpacing.lg,
                      child: CircularProgressIndicator(
                        color: Colors.white,
                        strokeWidth: 2,
                      ),
                    )
                  : const Text('Promote'),
            ),
          ],
        ],
      ),
    );
  }
}

class AdminAddClassSheet extends StatefulWidget {
  final List<AdminTutorChoice> tutors;
  final AdminSheetSubmit<AdminAddClassDraft> onSubmit;
  final VoidCallback onCancel;

  const AdminAddClassSheet({
    super.key,
    required this.tutors,
    required this.onSubmit,
    required this.onCancel,
  });

  @override
  State<AdminAddClassSheet> createState() => _AdminAddClassSheetState();
}

class _AdminAddClassSheetState extends State<AdminAddClassSheet> {
  String _type = adminClassTypes.first;
  String _day = adminClassDays.first;
  String _start = adminClassTimeSlots.first;
  String _end = adminClassTimeSlots.first;
  int _capacity = adminClassCapacities.first;
  final _tutorIds = <String>{};
  bool _isSaving = false;
  String? _error;

  Future<void> _submit() async {
    if (_isSaving) return;
    final draft = AdminAddClassDraft(
      type: _type,
      dayOfWeek: _day,
      startTime: _start,
      endTime: _end,
      capacity: _capacity,
      tutorIds: _tutorIds.toList(),
    );
    final validationError = validateAdminAddClassDraft(draft);
    if (validationError != null) {
      setState(() => _error = validationError);
      return;
    }
    setState(() {
      _isSaving = true;
      _error = null;
    });
    final error = await widget.onSubmit(draft);
    if (!mounted) return;
    if (error == null) {
      Navigator.of(context).pop();
      return;
    }
    setState(() {
      _isSaving = false;
      _error = error;
    });
  }

  @override
  Widget build(BuildContext context) {
    return AppBottomSheet(
      title: 'Add a class',
      subtitle: 'Create the standing class and its remaining term sessions.',
      maxHeightFactor: 0.94,
      footer: SheetActions(
        confirmLabel: 'Add class',
        isBusy: _isSaving,
        onConfirm: _submit,
        onCancel: widget.onCancel,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          DropdownButtonFormField<String>(
            key: const Key('admin-add-class-type'),
            value: _type,
            decoration: const InputDecoration(labelText: 'Class type'),
            items: [
              for (final type in adminClassTypes)
                DropdownMenuItem(
                  value: type,
                  child: Text(formatDashboardClassType(type)),
                ),
            ],
            onChanged: _isSaving
                ? null
                : (value) {
                    if (value != null) setState(() => _type = value);
                  },
          ),
          const SizedBox(height: AppSpacing.lg),
          DropdownButtonFormField<String>(
            key: const Key('admin-add-class-day'),
            value: _day,
            decoration: const InputDecoration(labelText: 'Day'),
            items: [
              for (final day in adminClassDays)
                DropdownMenuItem(value: day, child: Text(day)),
            ],
            onChanged: _isSaving
                ? null
                : (value) {
                    if (value != null) setState(() => _day = value);
                  },
          ),
          const SizedBox(height: AppSpacing.lg),
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  key: const Key('admin-add-class-start'),
                  value: _start,
                  decoration: const InputDecoration(labelText: 'Starts'),
                  items: [
                    for (final time in adminClassTimeSlots)
                      DropdownMenuItem(
                        value: time,
                        child: Text(formatAdminClassTime(time)),
                      ),
                  ],
                  onChanged: _isSaving
                      ? null
                      : (value) {
                          if (value != null) setState(() => _start = value);
                        },
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: DropdownButtonFormField<String>(
                  key: const Key('admin-add-class-end'),
                  value: _end,
                  decoration: const InputDecoration(labelText: 'Ends'),
                  items: [
                    for (final time in adminClassTimeSlots)
                      DropdownMenuItem(
                        value: time,
                        child: Text(formatAdminClassTime(time)),
                      ),
                  ],
                  onChanged: _isSaving
                      ? null
                      : (value) {
                          if (value != null) setState(() => _end = value);
                        },
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          DropdownButtonFormField<int>(
            key: const Key('admin-add-class-capacity'),
            value: _capacity,
            decoration: const InputDecoration(labelText: 'Capacity'),
            items: [
              for (final capacity in adminClassCapacities)
                DropdownMenuItem(
                  value: capacity,
                  child: Text('$capacity'),
                ),
            ],
            onChanged: _isSaving
                ? null
                : (value) {
                    if (value != null) setState(() => _capacity = value);
                  },
          ),
          const SizedBox(height: AppSpacing.xl),
          const SectionLabel(title: 'TUTORS'),
          const SizedBox(height: AppSpacing.labelGap),
          if (widget.tutors.isEmpty)
            const _InlineMessage(
              message: 'No tutor accounts are available. '
                  'The class can still be created unassigned.',
              isError: false,
            )
          else
            for (var index = 0; index < widget.tutors.length; index++) ...[
              if (index > 0) const SizedBox(height: AppSpacing.sm),
              _CheckTile(
                key: Key(
                  'admin-add-class-tutor-${widget.tutors[index].id}',
                ),
                title: widget.tutors[index].name,
                selected: _tutorIds.contains(widget.tutors[index].id),
                enabled: !_isSaving,
                onChanged: (selected) {
                  setState(() {
                    if (selected) {
                      _tutorIds.add(widget.tutors[index].id);
                    } else {
                      _tutorIds.remove(widget.tutors[index].id);
                    }
                  });
                },
              ),
            ],
          if (_error != null) ...[
            const SizedBox(height: AppSpacing.lg),
            _InlineMessage(
              key: const Key('admin-add-class-error'),
              message: _error!,
              isError: true,
            ),
          ],
        ],
      ),
    );
  }
}

class AdminFeedbackComposerSheet extends StatefulWidget {
  final String studentName;
  final Future<bool> Function(String subject, String message) onSubmit;
  final VoidCallback onCancel;

  const AdminFeedbackComposerSheet({
    super.key,
    required this.studentName,
    required this.onSubmit,
    required this.onCancel,
  });

  @override
  State<AdminFeedbackComposerSheet> createState() =>
      _AdminFeedbackComposerSheetState();
}

class _AdminFeedbackComposerSheetState
    extends State<AdminFeedbackComposerSheet> {
  final _formKey = GlobalKey<FormState>();
  final _subject = TextEditingController();
  final _message = TextEditingController();
  bool _isSaving = false;
  bool _failed = false;

  @override
  void dispose() {
    _subject.dispose();
    _message.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _isSaving = true;
      _failed = false;
    });
    final saved = await widget.onSubmit(
      _subject.text.trim(),
      _message.text.trim(),
    );
    if (!mounted) return;
    if (saved) {
      Navigator.of(context).pop(true);
      return;
    }
    setState(() {
      _isSaving = false;
      _failed = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    return AppBottomSheet(
      title: 'Add feedback',
      subtitle: '${widget.studentName} · Their family will be notified.',
      footer: SheetActions(
        confirmLabel: 'Post feedback',
        isBusy: _isSaving,
        onConfirm: _submit,
        onCancel: widget.onCancel,
      ),
      child: Form(
        key: _formKey,
        child: Column(
          children: [
            TextFormField(
              key: const Key('admin-feedback-subject'),
              controller: _subject,
              enabled: !_isSaving,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(labelText: 'Subject'),
              validator: (value) =>
                  (value ?? '').trim().isEmpty ? 'Enter a subject' : null,
            ),
            const SizedBox(height: AppSpacing.lg),
            TextFormField(
              key: const Key('admin-feedback-message'),
              controller: _message,
              enabled: !_isSaving,
              minLines: 3,
              maxLines: 6,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(labelText: 'Feedback'),
              validator: (value) =>
                  (value ?? '').trim().isEmpty ? 'Enter feedback' : null,
            ),
            if (_failed) ...[
              const SizedBox(height: AppSpacing.lg),
              const _InlineMessage(
                key: Key('admin-feedback-error'),
                message: 'Feedback could not be posted. Please try again.',
                isError: true,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _SelectionTile extends StatelessWidget {
  final String title;
  final String? subtitle;

  /// A null callback renders the tile as unavailable rather than hiding it, so
  /// an admin can see why a choice is not offered.
  final VoidCallback? onTap;

  const _SelectionTile({
    super.key,
    required this.title,
    required this.onTap,
    this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null;
    return Material(
      color:
          enabled ? AppColors.blue50 : AppColors.blue50.withValues(alpha: 0.5),
      borderRadius: BorderRadius.circular(AppRadii.md),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: AppText.body(
                        fontSize: 14.5,
                        fontWeight: FontWeight.w700,
                        color: enabled ? AppColors.ink : AppColors.muted,
                      ),
                    ),
                    if (subtitle != null) ...[
                      const SizedBox(height: AppSpacing.xxs),
                      Text(
                        subtitle!,
                        style: AppText.body(
                          fontSize: 12,
                          color: AppColors.muted,
                        ).copyWith(height: 1.35),
                      ),
                    ],
                  ],
                ),
              ),
              if (enabled)
                const Icon(
                  Icons.chevron_right_rounded,
                  color: AppColors.blue,
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CheckTile extends StatelessWidget {
  final String title;
  final bool selected;
  final bool enabled;
  final ValueChanged<bool> onChanged;

  const _CheckTile({
    super.key,
    required this.title,
    required this.selected,
    required this.onChanged,
    this.enabled = true,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.blue50 : AppColors.paper,
      borderRadius: BorderRadius.circular(AppRadii.md),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: enabled ? () => onChanged(!selected) : null,
        child: Container(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: AppSpacing.sm,
          ),
          decoration: BoxDecoration(
            border: Border.all(
              color: selected ? AppColors.blue : AppColors.line,
            ),
            borderRadius: BorderRadius.circular(AppRadii.md),
          ),
          child: Row(
            children: [
              Checkbox(
                value: selected,
                onChanged:
                    enabled ? (value) => onChanged(value ?? false) : null,
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  title,
                  style: AppText.body(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppColors.ink,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RadioTile<T> extends StatelessWidget {
  final T value;
  final T groupValue;
  final String title;
  final String? subtitle;
  final bool enabled;
  final ValueChanged<T> onChanged;

  const _RadioTile({
    super.key,
    required this.value,
    required this.groupValue,
    required this.title,
    required this.onChanged,
    this.subtitle,
    this.enabled = true,
  });

  @override
  Widget build(BuildContext context) {
    final selected = value == groupValue;
    return Material(
      color: selected && enabled ? AppColors.blue50 : AppColors.paper,
      borderRadius: BorderRadius.circular(AppRadii.md),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: enabled ? () => onChanged(value) : null,
        child: Container(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: AppSpacing.sm,
          ),
          decoration: BoxDecoration(
            border: Border.all(
              color: selected && enabled ? AppColors.blue : AppColors.line,
            ),
            borderRadius: BorderRadius.circular(AppRadii.md),
          ),
          child: Row(
            children: [
              Radio<T>(
                value: value,
                groupValue: groupValue,
                onChanged: enabled ? (choice) => onChanged(choice as T) : null,
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: AppText.body(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: enabled ? AppColors.ink : AppColors.disabled,
                      ),
                    ),
                    if (subtitle != null) ...[
                      const SizedBox(height: AppSpacing.xxs),
                      Text(
                        subtitle!,
                        style: AppText.body(
                          fontSize: 11.5,
                          color: enabled ? AppColors.muted : AppColors.disabled,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _InlineMessage extends StatelessWidget {
  final String message;
  final bool isError;

  const _InlineMessage({
    super.key,
    required this.message,
    required this.isError,
  });

  @override
  Widget build(BuildContext context) {
    final colour = isError ? AppColors.danger : AppColors.blue;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: colour.withValues(alpha: 0.08),
        border: Border.all(color: colour.withValues(alpha: 0.22)),
        borderRadius: BorderRadius.circular(AppRadii.sm),
      ),
      child: Text(
        message,
        style:
            AppText.body(fontSize: 12.5, color: colour).copyWith(height: 1.4),
      ),
    );
  }
}

class _RosterSkeleton extends StatelessWidget {
  const _RosterSkeleton();

  @override
  Widget build(BuildContext context) {
    return const Column(
      children: [
        SkeletonBlock(height: 68, radius: AppRadii.md),
        SizedBox(height: AppSpacing.sm),
        SkeletonBlock(height: 68, radius: AppRadii.md),
        SizedBox(height: AppSpacing.sm),
        SkeletonBlock(height: 68, radius: AppRadii.md),
      ],
    );
  }
}

String _studentName(Student student) {
  final value = '${student.firstName} ${student.lastName}'.trim();
  return value.isEmpty ? 'Unknown student' : value;
}

/// `Year 9 · Maths`, or null for a record carrying neither — the tile drops its
/// subtitle rather than reserving a blank line for one.
String? _studentDetail(Student student) {
  final detail = studentYearAndSubjects(
    grade: student.grade,
    subjects: student.subjects,
  );
  return detail.isEmpty ? null : detail;
}
