import 'package:flutter/material.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/parent_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

typedef StudentClassesLoader = Future<List<ClassModel>> Function(
  Student student,
);

class ProfileView extends StatelessWidget {
  final AppUser user;
  final List<Student> children;
  final bool isLoading;
  final bool isSigningOut;
  final String? loadError;
  final String? actionMessage;
  final StudentClassesLoader loadClasses;
  final VoidCallback onBack;
  final VoidCallback onOpenSettings;
  final VoidCallback onEnrolStudent;
  final VoidCallback onSignOut;
  final VoidCallback onRetry;

  const ProfileView({
    super.key,
    required this.user,
    required this.children,
    required this.isLoading,
    required this.isSigningOut,
    required this.loadClasses,
    required this.onBack,
    required this.onOpenSettings,
    required this.onEnrolStudent,
    required this.onSignOut,
    required this.onRetry,
    this.loadError,
    this.actionMessage,
  });

  @override
  Widget build(BuildContext context) {
    final fullName = '${user.firstName} ${user.lastName}'.trim();
    final isParent = user is Parent;

    return Scaffold(
      backgroundColor: AppColors.ink,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            DetailHeader(
              title: fullName.isEmpty ? 'My profile' : fullName,
              subtitle: _roleLabel(user.role),
              onBack: onBack,
              trailing: IconButton(
                key: const Key('profile-settings'),
                tooltip: 'Settings',
                onPressed: onOpenSettings,
                color: Colors.white,
                icon: const Icon(Icons.settings_outlined),
              ),
            ),
            Expanded(
              child: ContentSheet(
                onRefresh: () async => onRetry(),
                children: [
                  if (loadError != null)
                    ErrorStateView(
                      title: 'Profile unavailable',
                      message: loadError,
                      onRetry: onRetry,
                    )
                  else if (isLoading) ...[
                    const SkeletonBlock(height: 92),
                    const SizedBox(height: AppSpacing.sectionGap),
                    const SkeletonBlock(height: 74),
                    const SizedBox(height: AppSpacing.sectionGap),
                    const SkeletonBlock(height: 150),
                  ] else ...[
                    const SectionLabel(title: 'CONTACT'),
                    const SizedBox(height: AppSpacing.labelGap),
                    _ContactCard(user: user),
                    if (isParent) ...[
                      const SizedBox(height: AppSpacing.sectionGap),
                      _TokenCard(tokens: (user as Parent).lessonTokens),
                      const SizedBox(height: AppSpacing.xl),
                      const SectionLabel(title: 'STUDENTS'),
                      const SizedBox(height: AppSpacing.labelGap),
                      if (children.isEmpty)
                        const _NoStudentsCard()
                      else
                        for (final student in children) ...[
                          _StudentCard(
                            key: ValueKey('profile-student-${student.id}'),
                            student: student,
                            classes: loadClasses(student),
                          ),
                          const SizedBox(height: AppSpacing.sm),
                        ],
                      OutlinedButton.icon(
                        key: const Key('profile-enrol-student'),
                        onPressed: onEnrolStudent,
                        icon: const Icon(Icons.person_add_alt_1_rounded),
                        label: const Text('Enrol another student'),
                      ),
                    ],
                    if (actionMessage != null) ...[
                      const SizedBox(height: AppSpacing.lg),
                      _ActionMessage(message: actionMessage!),
                    ],
                    const SizedBox(height: AppSpacing.xl),
                    FilledButton.icon(
                      key: const Key('profile-sign-out'),
                      onPressed: isSigningOut ? null : onSignOut,
                      icon: isSigningOut
                          ? const SizedBox.square(
                              dimension: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Icon(Icons.logout_rounded),
                      label: Text(isSigningOut ? 'Signing out…' : 'Sign out'),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ContactCard extends StatelessWidget {
  final AppUser user;

  const _ContactCard({required this.user});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.paper,
        border: Border.all(color: AppColors.line),
        borderRadius: BorderRadius.circular(AppRadii.md),
      ),
      child: Column(
        children: [
          _InfoRow(
            icon: Icons.mail_outline_rounded,
            label: 'Email',
            value: user.email,
          ),
          const Divider(),
          _InfoRow(
            icon: Icons.phone_outlined,
            label: 'Phone',
            value: user.phone.trim().isEmpty ? 'Not provided' : user.phone,
          ),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: AppColors.blue),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: AppText.body(fontSize: 11, color: AppColors.muted),
                ),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  value,
                  style: AppText.body(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _TokenCard extends StatelessWidget {
  final int tokens;

  const _TokenCard({required this.tokens});

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const Key('profile-tokens'),
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: AppColors.blue50,
        borderRadius: BorderRadius.circular(AppRadii.md),
      ),
      child: Row(
        children: [
          const Icon(Icons.confirmation_number_outlined, color: AppColors.blue),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Text(
              'Lesson tokens',
              style: AppText.body(fontSize: 14, fontWeight: FontWeight.w600),
            ),
          ),
          Text(
            '$tokens',
            style: AppText.display(fontSize: 22, color: AppColors.blue),
          ),
        ],
      ),
    );
  }
}

class _NoStudentsCard extends StatelessWidget {
  const _NoStudentsCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: AppColors.blue50,
        borderRadius: BorderRadius.circular(AppRadii.sm),
      ),
      child: Text(
        'No students are linked to this account yet.',
        style: AppText.body(fontSize: 13, color: AppColors.muted),
      ),
    );
  }
}

class _StudentCard extends StatelessWidget {
  final Student student;
  final Future<List<ClassModel>> classes;

  const _StudentCard({
    super.key,
    required this.student,
    required this.classes,
  });

  @override
  Widget build(BuildContext context) {
    final subjects = student.subjects.map(subjectForDisplay).join(', ');
    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: AppColors.line),
        borderRadius: BorderRadius.circular(AppRadii.md),
      ),
      clipBehavior: Clip.antiAlias,
      child: ExpansionTile(
        leading: const CircleAvatar(
          backgroundColor: AppColors.blue50,
          foregroundColor: AppColors.blue,
          child: Icon(Icons.school_outlined),
        ),
        title: Text(
          '${student.firstName} ${student.lastName}'.trim(),
          style: AppText.body(fontSize: 14, fontWeight: FontWeight.w700),
        ),
        subtitle: Text(
          student.grade,
          style: AppText.body(fontSize: 12, color: AppColors.muted),
        ),
        childrenPadding: const EdgeInsets.fromLTRB(
          AppSpacing.lg,
          0,
          AppSpacing.lg,
          AppSpacing.lg,
        ),
        children: [
          _StudentDetail(
            label: 'Subjects',
            value: subjects.isEmpty ? 'None listed' : subjects,
          ),
          const SizedBox(height: AppSpacing.sm),
          FutureBuilder<List<ClassModel>>(
            future: classes,
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const _StudentDetail(
                  label: 'Classes',
                  value: 'Loading…',
                );
              }
              if (snapshot.hasError) {
                return const _StudentDetail(
                  label: 'Classes',
                  value: 'Could not load classes',
                );
              }
              final classList = snapshot.data ?? const [];
              return _StudentDetail(
                label: 'Classes',
                value: classList.isEmpty
                    ? 'Not enrolled in a class'
                    : classList.map(_classLabel).join('\n'),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _StudentDetail extends StatelessWidget {
  final String label;
  final String value;

  const _StudentDetail({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 70,
          child: Text(
            label,
            style: AppText.body(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: AppColors.muted,
            ),
          ),
        ),
        Expanded(child: Text(value, style: AppText.body(fontSize: 12.5))),
      ],
    );
  }
}

class _ActionMessage extends StatelessWidget {
  final String message;

  const _ActionMessage({required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const Key('profile-action-message'),
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.blue50,
        borderRadius: BorderRadius.circular(AppRadii.sm),
      ),
      child: Text(
        message,
        style: AppText.body(fontSize: 13, color: AppColors.ink),
      ),
    );
  }
}

String _roleLabel(String role) {
  if (role.isEmpty) return 'Tenacity account';
  return '${role[0].toUpperCase()}${role.substring(1)} account';
}

String _classLabel(ClassModel value) {
  final type = value.type.trim();
  final prefix = type.isEmpty ? '' : '$type · ';
  return '$prefix${value.dayOfWeek} ${_formatTime(value.startTime)}';
}

String _formatTime(String value) {
  final parts = value.split(':');
  if (parts.length < 2) return value;
  final hour = int.tryParse(parts[0]);
  if (hour == null) return value;
  final suffix = hour >= 12 ? 'pm' : 'am';
  final displayHour = hour % 12 == 0 ? 12 : hour % 12;
  return '$displayHour:${parts[1]} $suffix';
}

String subjectForDisplay(String code) {
  const subjects = <String, String>{
    'stdmath11': 'Year 11 Standard Maths',
    'advmath11': 'Year 11 Advanced Maths',
    'ex1math11': 'Year 11 Extension 1 Maths',
    'stdmath12': 'Year 12 Standard Maths',
    'advmath12': 'Year 12 Advanced Maths',
    'ex1math12': 'Year 12 Extension 1 Maths',
    'ex2math12': 'Year 12 Extension 2 Maths',
    'stdeng11': 'Year 11 Standard English',
    'adveng11': 'Year 11 Advanced English',
    'ex1eng11': 'Year 11 Extension 1 English',
    'stdeng12': 'Year 12 Standard English',
    'adveng12': 'Year 12 Advanced English',
    'ex1eng12': 'Year 12 Extension 1 English',
    'ex2eng12': 'Year 12 Extension 2 English',
  };
  return subjects[code.toLowerCase()] ?? code;
}
