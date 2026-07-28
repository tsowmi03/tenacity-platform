import 'package:flutter/material.dart';
import 'package:tenacity/src/models/invoice_model.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';
import 'package:tenacity/src/ui/users/admin/admin_person_data.dart';

/// The admin record for one person: contact details, lesson tokens, children
/// and their enrolments, invoices, and the destructive account actions.
///
/// Presentation only. Every mutation is a callback, so editing tokens,
/// unenrolling a student and removing an account stay in the screen and go
/// through the same services — and the same offline guards and confirmations —
/// as before.
class AdminPersonView extends StatelessWidget {
  final AdminPersonViewData data;
  final bool isBusy;
  final VoidCallback onBack;
  final VoidCallback onEditTokens;
  final VoidCallback onMessage;
  final void Function(AdminPersonStudent student) onUnenrol;
  final void Function(AdminPersonInvoice invoice) onOpenInvoice;
  final VoidCallback onRemoveAccount;
  final Future<void> Function() onRefresh;

  const AdminPersonView({
    super.key,
    required this.data,
    required this.isBusy,
    required this.onBack,
    required this.onEditTokens,
    required this.onMessage,
    required this.onUnenrol,
    required this.onOpenInvoice,
    required this.onRemoveAccount,
    required this.onRefresh,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.ink,
      child: SafeArea(
        bottom: false,
        child: Column(
          children: [
            DetailHeader(
              title: data.name,
              subtitle: data.roleLabel,
              onBack: onBack,
            ),
            Expanded(
              child: ContentSheet(
                scrollKey: const Key('admin-person-scroll'),
                onRefresh: onRefresh,
                children: [
                  const SectionLabel(title: 'CONTACT'),
                  const SizedBox(height: AppSpacing.labelGap),
                  _Field(
                    key: const Key('admin-person-email'),
                    icon: Icons.mail_outline_rounded,
                    label:
                        data.email.isEmpty ? 'No email on record' : data.email,
                  ),
                  if (data.phone.isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.sm),
                    _Field(
                      key: const Key('admin-person-phone'),
                      icon: Icons.phone_outlined,
                      label: data.phone,
                    ),
                  ],
                  const SizedBox(height: AppSpacing.sm),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: PillButton(
                      key: const Key('admin-person-message'),
                      label: 'Message',
                      onPressed: onMessage,
                    ),
                  ),
                  if (data.canEditTokens) ...[
                    const SizedBox(height: AppSpacing.sectionGap),
                    SectionLabel(
                      title: 'LESSON TOKENS',
                      actionLabel: isBusy ? null : 'Edit',
                      onAction: isBusy ? null : onEditTokens,
                    ),
                    const SizedBox(height: AppSpacing.labelGap),
                    _TokenCard(
                      key: const Key('admin-person-tokens'),
                      tokens: data.lessonTokens ?? 0,
                    ),
                  ],
                  if (data.isParent) ...[
                    const SizedBox(height: AppSpacing.sectionGap),
                    const SectionLabel(title: 'STUDENTS'),
                    const SizedBox(height: AppSpacing.labelGap),
                    if (data.isLoadingStudents)
                      const SkeletonBlock(
                        key: Key('admin-person-students-loading'),
                        height: 64,
                      )
                    else if (data.students.isEmpty)
                      const LedgerRowEmpty(
                        key: Key('admin-person-no-students'),
                        message: 'No students linked',
                      )
                    else
                      for (final student in data.students) ...[
                        _StudentTile(
                          key: Key('admin-person-student-${student.id}'),
                          student: student,
                          isBusy: isBusy,
                          onUnenrol: () => onUnenrol(student),
                        ),
                        const SizedBox(height: AppSpacing.sm),
                      ],
                    const SizedBox(height: AppSpacing.sectionGap),
                    const SectionLabel(title: 'INVOICES'),
                    const SizedBox(height: AppSpacing.labelGap),
                    if (data.invoices.isEmpty)
                      const LedgerRowEmpty(
                        key: Key('admin-person-no-invoices'),
                        message: 'No invoices yet',
                      )
                    else
                      for (final invoice in data.invoices) ...[
                        _InvoiceRow(
                          key: Key('admin-person-invoice-${invoice.id}'),
                          invoice: invoice,
                          onTap: () => onOpenInvoice(invoice),
                        ),
                        const SizedBox(height: AppSpacing.sm),
                      ],
                  ],
                  const SizedBox(height: AppSpacing.sectionGap),
                  _DangerZone(
                    label: data.removeLabel,
                    isBusy: isBusy,
                    onRemove: onRemoveAccount,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Field extends StatelessWidget {
  final IconData icon;
  final String label;

  const _Field({super.key, required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 18, color: AppColors.muted),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppText.body(fontSize: 14, color: AppColors.ink),
          ),
        ),
      ],
    );
  }
}

class _TokenCard extends StatelessWidget {
  final int tokens;

  const _TokenCard({super.key, required this.tokens});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: 18,
        vertical: AppSpacing.md,
      ),
      decoration: BoxDecoration(
        color: AppColors.blue50,
        borderRadius: BorderRadius.circular(AppRadii.md),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.baseline,
        textBaseline: TextBaseline.alphabetic,
        children: [
          Text(
            '$tokens',
            style: AppText.display(
              fontSize: 28,
              fontWeight: FontWeight.w700,
              color: AppColors.ink,
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Text(
            tokens == 1 ? 'lesson token' : 'lesson tokens',
            style: AppText.body(fontSize: 13.5, color: AppColors.muted),
          ),
        ],
      ),
    );
  }
}

class _StudentTile extends StatelessWidget {
  final AdminPersonStudent student;
  final bool isBusy;
  final VoidCallback onUnenrol;

  const _StudentTile({
    super.key,
    required this.student,
    required this.isBusy,
    required this.onUnenrol,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: AppColors.line),
        borderRadius: BorderRadius.circular(AppRadii.md),
      ),
      clipBehavior: Clip.antiAlias,
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          tilePadding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.lg,
            vertical: 2,
          ),
          childrenPadding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            0,
            AppSpacing.lg,
            AppSpacing.md,
          ),
          leading: Container(
            width: 38,
            height: 38,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: AppColors.blue100,
              borderRadius: BorderRadius.circular(13),
            ),
            child: Text(
              student.initials,
              style: AppText.display(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: AppColors.navy,
              ),
            ),
          ),
          title: Text(
            student.name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppText.body(
              fontSize: 14.5,
              fontWeight: FontWeight.w700,
              color: AppColors.ink,
            ),
          ),
          subtitle: student.subtitle.isEmpty
              ? null
              : Text(
                  student.subtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.body(fontSize: 12, color: AppColors.muted),
                ),
          children: [
            for (final enrolment in student.enrolments)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        enrolment.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppText.body(
                          fontSize: 13,
                          color: AppColors.ink,
                        ),
                      ),
                    ),
                    Text(
                      enrolment.whenLabel,
                      style: AppText.body(fontSize: 12, color: AppColors.muted),
                    ),
                  ],
                ),
              ),
            if (student.enrolments.isEmpty)
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'Not enrolled in any class',
                  style: AppText.body(fontSize: 13, color: AppColors.muted),
                ),
              ),
            const SizedBox(height: AppSpacing.sm),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                key: Key('admin-person-unenrol-${student.id}'),
                onPressed: isBusy ? null : onUnenrol,
                style: TextButton.styleFrom(
                  foregroundColor: AppColors.danger,
                  padding: EdgeInsets.zero,
                ),
                child: Text(
                  'Unenrol ${student.name.split(' ').first}',
                  style: AppText.body(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: isBusy ? AppColors.disabled : AppColors.danger,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _InvoiceRow extends StatelessWidget {
  final AdminPersonInvoice invoice;
  final VoidCallback onTap;

  const _InvoiceRow({super.key, required this.invoice, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final tone = invoice.status == InvoiceStatus.paid
        ? StatusTone.success
        : invoice.isOverdue
            ? StatusTone.danger
            : StatusTone.info;

    // Deliberately not LedgerRow: it reserves a leading time column, which an
    // invoice has nothing to put in, leaving an empty gutter before the row.
    return Material(
      color: AppColors.paper,
      shape: RoundedRectangleBorder(
        side: const BorderSide(color: AppColors.line),
        borderRadius: BorderRadius.circular(AppRadii.md),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.lg,
            vertical: AppSpacing.md,
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      invoice.reference,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.body(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: AppColors.ink,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${invoice.amountLabel} \u00b7 ${invoice.dateLabel}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.body(
                        fontSize: 12,
                        color: AppColors.muted,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              StatusPill(
                label: invoice.statusLabel,
                tone: tone,
                size: StatusPillSize.compact,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DangerZone extends StatelessWidget {
  final String label;
  final bool isBusy;
  final VoidCallback onRemove;

  const _DangerZone({
    required this.label,
    required this.isBusy,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionLabel(title: 'DANGER ZONE'),
        const SizedBox(height: AppSpacing.labelGap),
        OutlinedButton(
          key: const Key('admin-person-remove'),
          onPressed: isBusy ? null : onRemove,
          style: OutlinedButton.styleFrom(
            foregroundColor: AppColors.danger,
            side: BorderSide(
              color: isBusy ? AppColors.disabled : AppColors.danger,
            ),
            padding: const EdgeInsets.symmetric(vertical: 14),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(AppRadii.md),
            ),
          ),
          child: Text(
            label,
            style: AppText.body(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: isBusy ? AppColors.disabled : AppColors.danger,
            ),
          ),
        ),
      ],
    );
  }
}
