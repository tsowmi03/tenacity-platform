import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/invoice_controller.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/ui/admin_review_invoice_screen.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

/// First half of the admin invoice wizard.
///
/// Parent/student selection and draft construction still use the established
/// AuthController and InvoiceController contracts. This screen only owns the
/// V3 presentation and the temporary choices made before review.
class AdminCreateInvoiceScreen extends StatefulWidget {
  const AdminCreateInvoiceScreen({super.key});

  @override
  State<AdminCreateInvoiceScreen> createState() =>
      _AdminCreateInvoiceScreenState();
}

class _AdminCreateInvoiceScreenState extends State<AdminCreateInvoiceScreen> {
  final TextEditingController _searchController = TextEditingController();
  final TextEditingController _weeksController =
      TextEditingController(text: '1');

  List<AppUser> _allParents = const [];
  List<AppUser> _filteredParents = const [];
  AppUser? _selectedParent;

  List<Student> _parentStudents = const [];
  final List<String> _selectedStudentIds = [];
  final Map<String, TextEditingController> _sessionControllers = {};

  DateTime _selectedDueDate = DateTime.now().add(const Duration(days: 21));

  bool _isLoadingParents = true;
  bool _isLoadingStudents = false;
  bool _isPreparingInvoice = false;
  String? _parentsError;
  String? _studentsError;
  int _studentLoadGeneration = 0;

  @override
  void initState() {
    super.initState();
    _searchController.addListener(_onSearchChanged);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _loadParents();
    });
  }

  @override
  void dispose() {
    _studentLoadGeneration++;
    _searchController.removeListener(_onSearchChanged);
    _searchController.dispose();
    _weeksController.dispose();
    for (final controller in _sessionControllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _loadParents() async {
    setState(() {
      _isLoadingParents = true;
      _parentsError = null;
    });

    try {
      final parents = await context.read<AuthController>().fetchAllParents();
      if (!mounted) return;
      setState(() {
        _allParents = parents;
        _filteredParents = parents;
        _isLoadingParents = false;
      });
      _onSearchChanged();
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _isLoadingParents = false;
        _parentsError = 'Check your connection and try again.';
      });
    }
  }

  void _onSearchChanged() {
    if (!mounted) return;
    final query = _searchController.text.trim().toLowerCase();
    setState(() {
      _filteredParents = _allParents.where((parent) {
        final fullName = '${parent.firstName} ${parent.lastName}'.toLowerCase();
        return fullName.contains(query);
      }).toList(growable: false);
    });
  }

  Future<void> _selectParent(AppUser parent) async {
    final generation = ++_studentLoadGeneration;
    final oldControllers = _sessionControllers.values.toList(growable: false);

    _searchController.clear();
    FocusManager.instance.primaryFocus?.unfocus();
    setState(() {
      _selectedParent = parent;
      _parentStudents = const [];
      _selectedStudentIds.clear();
      _sessionControllers.clear();
      _isLoadingStudents = true;
      _studentsError = null;
    });

    WidgetsBinding.instance.addPostFrameCallback((_) {
      for (final controller in oldControllers) {
        controller.dispose();
      }
    });

    try {
      final students = await context
          .read<AuthController>()
          .fetchStudentsForParent(parent.uid);
      if (!mounted || generation != _studentLoadGeneration) return;
      setState(() {
        _parentStudents = students;
        for (final student in students) {
          _sessionControllers[student.id] = TextEditingController(text: '1');
        }
        _isLoadingStudents = false;
      });
    } catch (_) {
      if (!mounted || generation != _studentLoadGeneration) return;
      setState(() {
        _isLoadingStudents = false;
        _studentsError =
            "This parent's students could not be loaded. Try again.";
      });
    }
  }

  void _changeParent() {
    _studentLoadGeneration++;
    final controllers = _sessionControllers.values.toList(growable: false);
    setState(() {
      _selectedParent = null;
      _parentStudents = const [];
      _selectedStudentIds.clear();
      _sessionControllers.clear();
      _studentsError = null;
      _isLoadingStudents = false;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      for (final controller in controllers) {
        controller.dispose();
      }
    });
  }

  Future<void> _pickDueDate() async {
    final now = DateTime.now();
    final picked = await showAppBottomSheet<DateTime>(
      context: context,
      builder: (_) => _InvoiceDueDateSheet(
        initialDate: _selectedDueDate,
        firstDate: now.subtract(const Duration(days: 365)),
        lastDate: now.add(const Duration(days: 365 * 3)),
      ),
    );
    if (picked != null && mounted) {
      setState(() => _selectedDueDate = picked);
    }
  }

  Future<void> _reviewInvoice() async {
    if (_isPreparingInvoice) return;
    final parent = _selectedParent;
    if (parent == null) {
      _notify('Please select a parent.');
      return;
    }

    final weeks = int.tryParse(_weeksController.text.trim());
    if (weeks == null || weeks <= 0) {
      _notify('Please enter a valid number of weeks.');
      return;
    }

    final selectedStudents = _parentStudents
        .where((student) => _selectedStudentIds.contains(student.id))
        .toList(growable: false);
    if (selectedStudents.isEmpty) {
      _notify('Please select at least one student.');
      return;
    }

    final sessionsPerStudent = <int>[];
    for (final student in selectedStudents) {
      final controller = _sessionControllers[student.id];
      if (controller == null) continue;
      final sessions = int.tryParse(controller.text.trim());
      if (sessions == null || sessions <= 0) {
        _notify(
          'Please enter a valid session count for ${student.firstName}.',
        );
        return;
      }
      sessionsPerStudent.add(sessions);
    }

    setState(() => _isPreparingInvoice = true);
    try {
      final draft = await context.read<InvoiceController>().buildInvoiceDraft(
            parentId: parent.uid,
            parentName: '${parent.firstName} ${parent.lastName}',
            parentEmail: parent.email,
            students: selectedStudents,
            sessionsPerStudent: sessionsPerStudent,
            weeks: weeks,
            dueDate: _selectedDueDate,
          );
      if (!mounted) return;

      final created = await Navigator.of(context).push<bool>(
        MaterialPageRoute(
          builder: (_) => AdminReviewInvoiceScreen(initialDraft: draft),
        ),
      );
      if (created == true && mounted) {
        Navigator.of(context).pop(true);
      }
    } catch (_) {
      _notify('The invoice could not be prepared. Try again.');
    } finally {
      if (mounted) setState(() => _isPreparingInvoice = false);
    }
  }

  void _notify(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !_isPreparingInvoice,
      child: Scaffold(
        backgroundColor: AppColors.ink,
        body: SafeArea(
          bottom: false,
          child: Column(
            children: [
              DetailHeader(
                title: 'New invoice',
                subtitle: 'Choose a family, students and billing period',
                onBack: _isPreparingInvoice
                    ? null
                    : () => Navigator.of(context).pop(),
              ),
              Expanded(
                child: ContentSheet.fixed(
                  padding: EdgeInsets.zero,
                  child: Column(
                    children: [
                      Expanded(
                        child: SingleChildScrollView(
                          key: const Key('admin-create-invoice-scroll'),
                          padding: const EdgeInsets.fromLTRB(
                            AppSpacing.screenH,
                            AppSpacing.xl,
                            AppSpacing.screenH,
                            AppSpacing.xxl,
                          ),
                          child: _buildForm(),
                        ),
                      ),
                      _ReviewFooter(
                        isBusy: _isPreparingInvoice,
                        enabled: !_isLoadingParents && !_isLoadingStudents,
                        onReview: _reviewInvoice,
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildForm() {
    if (_isLoadingParents) {
      return const Column(
        children: [
          SkeletonBlock(height: 54),
          SizedBox(height: AppSpacing.md),
          SkeletonBlock(height: 84),
          SizedBox(height: AppSpacing.md),
          SkeletonBlock(height: 84),
        ],
      );
    }

    if (_parentsError != null) {
      return ErrorStateView(
        key: const Key('admin-create-invoice-error'),
        title: "We couldn't load families",
        message: _parentsError,
        onRetry: _loadParents,
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionLabel(title: 'FAMILY'),
        const SizedBox(height: AppSpacing.labelGap),
        if (_selectedParent == null) ...[
          TextField(
            key: const Key('admin-create-invoice-parent-search'),
            controller: _searchController,
            autofocus: true,
            textInputAction: TextInputAction.search,
            decoration: const InputDecoration(
              hintText: 'Search by parent name',
              prefixIcon: Icon(Icons.search_rounded),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          _ParentResults(
            hasQuery: _searchController.text.trim().isNotEmpty,
            parents: _filteredParents,
            onSelected: _selectParent,
          ),
        ] else
          _SelectedParentCard(
            parent: _selectedParent!,
            onChange: _isPreparingInvoice ? null : _changeParent,
          ),
        if (_selectedParent != null) ...[
          const SizedBox(height: AppSpacing.sectionGap),
          SectionLabel(
            title: 'STUDENTS',
            trailing: _parentStudents.isEmpty
                ? null
                : '${_selectedStudentIds.length} selected',
          ),
          const SizedBox(height: AppSpacing.labelGap),
          _buildStudents(),
        ],
        const SizedBox(height: AppSpacing.sectionGap),
        const SectionLabel(title: 'BILLING PERIOD'),
        const SizedBox(height: AppSpacing.labelGap),
        _BillingPeriodFields(
          weeksController: _weeksController,
          dueDate: _selectedDueDate,
          onPickDueDate: _pickDueDate,
          enabled: !_isPreparingInvoice,
        ),
      ],
    );
  }

  Widget _buildStudents() {
    if (_isLoadingStudents) {
      return const Column(
        children: [
          SkeletonBlock(height: 68),
          SizedBox(height: AppSpacing.sm),
          SkeletonBlock(height: 68),
        ],
      );
    }

    if (_studentsError != null) {
      return ErrorStateView(
        key: const Key('admin-create-invoice-students-error'),
        title: "We couldn't load students",
        message: _studentsError,
        onRetry: _selectedParent == null
            ? null
            : () => _selectParent(_selectedParent!),
      );
    }

    if (_parentStudents.isEmpty) {
      return const EmptyStateView(
        key: Key('admin-create-invoice-no-students'),
        icon: Icons.school_outlined,
        title: 'No linked students',
        message: 'This parent has no students available for an invoice.',
      );
    }

    return Column(
      children: [
        for (var index = 0; index < _parentStudents.length; index++) ...[
          _StudentSelectionCard(
            key: Key(
              'admin-create-invoice-student-${_parentStudents[index].id}',
            ),
            student: _parentStudents[index],
            selected: _selectedStudentIds.contains(_parentStudents[index].id),
            sessionsController: _sessionControllers[_parentStudents[index].id]!,
            enabled: !_isPreparingInvoice,
            onChanged: (selected) {
              setState(() {
                if (selected) {
                  if (!_selectedStudentIds
                      .contains(_parentStudents[index].id)) {
                    _selectedStudentIds.add(_parentStudents[index].id);
                  }
                } else {
                  _selectedStudentIds.remove(_parentStudents[index].id);
                }
              });
            },
          ),
          if (index < _parentStudents.length - 1)
            const SizedBox(height: AppSpacing.sm),
        ],
      ],
    );
  }
}

class _ParentResults extends StatelessWidget {
  const _ParentResults({
    required this.hasQuery,
    required this.parents,
    required this.onSelected,
  });

  final bool hasQuery;
  final List<AppUser> parents;
  final ValueChanged<AppUser> onSelected;

  @override
  Widget build(BuildContext context) {
    if (!hasQuery) {
      return const LedgerRowEmpty(
        key: Key('admin-create-invoice-search-hint'),
        message: 'Start typing to find a parent',
      );
    }
    if (parents.isEmpty) {
      return const LedgerRowEmpty(
        key: Key('admin-create-invoice-no-parents'),
        message: 'No matching parents',
      );
    }

    return Container(
      constraints: const BoxConstraints(maxHeight: 280),
      decoration: BoxDecoration(
        border: Border.all(color: AppColors.line),
        borderRadius: BorderRadius.circular(AppRadii.md),
      ),
      clipBehavior: Clip.antiAlias,
      child: ListView.separated(
        shrinkWrap: true,
        padding: EdgeInsets.zero,
        itemCount: parents.length,
        separatorBuilder: (_, __) => const Divider(),
        itemBuilder: (context, index) {
          final parent = parents[index];
          final name = '${parent.firstName} ${parent.lastName}'.trim();
          return ListTile(
            key: Key('admin-create-invoice-parent-${parent.uid}'),
            onTap: () => onSelected(parent),
            title: Text(
              name.isEmpty ? 'Unnamed parent' : name,
              style: AppText.body(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppColors.ink,
              ),
            ),
            subtitle: parent.email.isEmpty
                ? null
                : Text(
                    parent.email,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppText.body(
                      fontSize: 12,
                      color: AppColors.muted,
                    ),
                  ),
            trailing: const Icon(
              Icons.chevron_right_rounded,
              color: AppColors.muted,
            ),
          );
        },
      ),
    );
  }
}

class _SelectedParentCard extends StatelessWidget {
  const _SelectedParentCard({required this.parent, required this.onChange});

  final AppUser parent;
  final VoidCallback? onChange;

  @override
  Widget build(BuildContext context) {
    final name = '${parent.firstName} ${parent.lastName}'.trim();
    final initials = [
      if (parent.firstName.trim().isNotEmpty) parent.firstName.trim()[0],
      if (parent.lastName.trim().isNotEmpty) parent.lastName.trim()[0],
    ].join().toUpperCase();

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: AppColors.blue50,
        borderRadius: BorderRadius.circular(AppRadii.md),
        border: Border.all(color: AppColors.blue100),
      ),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: AppColors.blue100,
              borderRadius: BorderRadius.circular(AppRadii.sm),
            ),
            child: Text(
              initials.isEmpty ? '?' : initials,
              style: AppText.display(fontSize: 13, color: AppColors.navy),
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name.isEmpty ? 'Unnamed parent' : name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.body(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: AppColors.ink,
                  ),
                ),
                if (parent.email.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    parent.email,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppText.body(fontSize: 12, color: AppColors.muted),
                  ),
                ],
              ],
            ),
          ),
          TextButton(
            key: const Key('admin-create-invoice-change-parent'),
            onPressed: onChange,
            child: const Text('Change'),
          ),
        ],
      ),
    );
  }
}

class _StudentSelectionCard extends StatelessWidget {
  const _StudentSelectionCard({
    super.key,
    required this.student,
    required this.selected,
    required this.sessionsController,
    required this.enabled,
    required this.onChanged,
  });

  final Student student;
  final bool selected;
  final TextEditingController sessionsController;
  final bool enabled;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final name = '${student.firstName} ${student.lastName}'.trim();
    return AnimatedContainer(
      duration: AppDurations.fast,
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.sm,
        AppSpacing.xs,
        AppSpacing.md,
        AppSpacing.md,
      ),
      decoration: BoxDecoration(
        color: selected ? AppColors.blue50 : AppColors.paper,
        border: Border.all(
          color: selected ? AppColors.blue : AppColors.line,
        ),
        borderRadius: BorderRadius.circular(AppRadii.md),
      ),
      child: Column(
        children: [
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            value: selected,
            onChanged: enabled ? (value) => onChanged(value ?? false) : null,
            title: Text(
              name.isEmpty ? 'Unnamed student' : name,
              style: AppText.body(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: AppColors.ink,
              ),
            ),
            subtitle: student.grade.trim().isEmpty
                ? null
                : Text(
                    student.grade,
                    style: AppText.body(fontSize: 12, color: AppColors.muted),
                  ),
          ),
          if (selected)
            Padding(
              padding: const EdgeInsets.only(left: 46),
              child: TextField(
                key: Key('admin-create-invoice-sessions-${student.id}'),
                controller: sessionsController,
                enabled: enabled,
                keyboardType: TextInputType.number,
                textInputAction: TextInputAction.next,
                decoration: InputDecoration(
                  labelText: 'Sessions per week for ${student.firstName}',
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _BillingPeriodFields extends StatelessWidget {
  const _BillingPeriodFields({
    required this.weeksController,
    required this.dueDate,
    required this.onPickDueDate,
    required this.enabled,
  });

  final TextEditingController weeksController;
  final DateTime dueDate;
  final VoidCallback onPickDueDate;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final weeks = TextField(
      key: const Key('admin-create-invoice-weeks'),
      controller: weeksController,
      enabled: enabled,
      keyboardType: TextInputType.number,
      textInputAction: TextInputAction.done,
      decoration: const InputDecoration(labelText: 'Number of weeks'),
    );

    final due = InkWell(
      key: const Key('admin-create-invoice-due-date'),
      onTap: enabled ? onPickDueDate : null,
      borderRadius: BorderRadius.circular(AppRadii.sm),
      child: InputDecorator(
        decoration: const InputDecoration(
          labelText: 'Due date',
          suffixIcon: Icon(Icons.calendar_today_outlined, size: 18),
        ),
        child: Text(
          DateFormat('d MMM yyyy').format(dueDate),
          style: AppText.body(fontSize: 14, color: AppColors.ink),
        ),
      ),
    );

    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth < 360) {
          return Column(
            children: [
              weeks,
              const SizedBox(height: AppSpacing.md),
              due,
            ],
          );
        }
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: weeks),
            const SizedBox(width: AppSpacing.md),
            Expanded(child: due),
          ],
        );
      },
    );
  }
}

class _ReviewFooter extends StatelessWidget {
  const _ReviewFooter({
    required this.isBusy,
    required this.enabled,
    required this.onReview,
  });

  final bool isBusy;
  final bool enabled;
  final VoidCallback onReview;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        AppSpacing.md,
        AppSpacing.screenH,
        AppSpacing.md,
      ),
      decoration: const BoxDecoration(
        color: AppColors.paper,
        border: Border(top: BorderSide(color: AppColors.lineSoft)),
      ),
      child: FilledButton.icon(
        key: const Key('admin-create-invoice-review'),
        onPressed: enabled && !isBusy ? onReview : null,
        icon: isBusy
            ? const SizedBox(
                width: 17,
                height: 17,
                child: CircularProgressIndicator(
                  color: Colors.white,
                  strokeWidth: 2,
                ),
              )
            : const Icon(Icons.arrow_forward_rounded, size: 18),
        label: Text(isBusy ? 'Preparing…' : 'Review invoice'),
      ),
    );
  }
}

class _InvoiceDueDateSheet extends StatefulWidget {
  const _InvoiceDueDateSheet({
    required this.initialDate,
    required this.firstDate,
    required this.lastDate,
  });

  final DateTime initialDate;
  final DateTime firstDate;
  final DateTime lastDate;

  @override
  State<_InvoiceDueDateSheet> createState() => _InvoiceDueDateSheetState();
}

class _InvoiceDueDateSheetState extends State<_InvoiceDueDateSheet> {
  late DateTime _selectedDate = widget.initialDate;

  @override
  Widget build(BuildContext context) {
    return AppBottomSheet(
      title: 'Choose due date',
      subtitle: 'Select when payment for this invoice is due.',
      maxHeightFactor: 0.9,
      footer: SheetActions(
        confirmLabel: 'Apply date',
        onConfirm: () => Navigator.of(context).pop(_selectedDate),
        onCancel: () => Navigator.of(context).pop(),
      ),
      child: CalendarDatePicker(
        key: const Key('admin-create-invoice-date-calendar'),
        initialDate: widget.initialDate,
        firstDate: widget.firstDate,
        lastDate: widget.lastDate,
        currentDate: DateTime.now(),
        onDateChanged: (date) => setState(() => _selectedDate = date),
      ),
    );
  }
}
