import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/messaging/new_chat_data.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';
import 'package:tenacity/src/widgets/offline_cached_data_notice.dart';

/// The contact picker behind the inbox's `+` button.
///
/// No reference design exists for this screen — the design files only include
/// the inbox — so it extends the established language: the navy header and
/// search field the inbox already uses, over a white sheet of identity rows.
class NewChatView extends StatelessWidget {
  final List<ContactSection> sections;
  final bool isLoading;
  final String? errorMessage;
  final bool hasQuery;
  final ValueChanged<String> onSearchChanged;
  final ValueChanged<ContactRowData> onSelect;
  final VoidCallback onBack;
  final VoidCallback onRetry;

  const NewChatView({
    super.key,
    required this.sections,
    required this.isLoading,
    required this.errorMessage,
    required this.hasQuery,
    required this.onSearchChanged,
    required this.onSelect,
    required this.onBack,
    required this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.ink,
      child: SafeArea(
        bottom: false,
        child: Column(
          children: [
            _Header(
              contactCount: contactCount(sections),
              isLoading: isLoading,
              onBack: onBack,
              onSearchChanged: onSearchChanged,
            ),
            Expanded(
              child: ContentSheet.fixed(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenH,
                  AppSpacing.xl,
                  AppSpacing.screenH,
                  0,
                ),
                child: _body(),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _body() {
    if (isLoading && sections.isEmpty) return const _LoadingContacts();

    if (errorMessage != null && sections.isEmpty) {
      return ErrorStateView(
        title: 'Contacts could not be loaded',
        message: errorMessage,
        onRetry: onRetry,
      );
    }

    if (sections.isEmpty) {
      // A search that matches nobody is not the same as having no contacts.
      return hasQuery
          ? const EmptyStateView(
              icon: Icons.search_off_rounded,
              title: 'No matching contacts',
              message: 'Try a different name.',
            )
          : const OfflineAwareEmptyState(
              emptyMessage: 'No contacts available',
              offlineEmptyMessage: 'No saved contacts available offline.',
            );
    }

    return ListView.builder(
      key: const Key('new-chat-list'),
      padding: EdgeInsets.zero,
      itemCount: sections.length,
      itemBuilder: (context, index) {
        final section = sections[index];
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (index > 0) const SizedBox(height: AppSpacing.xxl),
            SectionLabel(title: section.title),
            const SizedBox(height: AppSpacing.xs),
            for (var i = 0; i < section.contacts.length; i++)
              _ContactRow(
                contact: section.contacts[i],
                showDivider: i < section.contacts.length - 1,
                onTap: () => onSelect(section.contacts[i]),
              ),
          ],
        );
      },
    );
  }
}

class _Header extends StatelessWidget {
  final int contactCount;
  final bool isLoading;
  final VoidCallback onBack;
  final ValueChanged<String> onSearchChanged;

  const _Header({
    required this.contactCount,
    required this.isLoading,
    required this.onBack,
    required this.onSearchChanged,
  });

  @override
  Widget build(BuildContext context) {
    final subtitle = isLoading
        ? 'Loading contacts…'
        : contactCount == 1
            ? '1 contact'
            : '$contactCount contacts';

    return Column(
      children: [
        // DetailHeader carries its own padding — the back button needs to sit
        // further left than the screen gutter to line its glyph up with it.
        DetailHeader(
          title: 'New message',
          subtitle: subtitle,
          onBack: onBack,
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenH,
            0,
            AppSpacing.screenH,
            AppSpacing.xl,
          ),
          child: SearchField(
            hintText: 'Search by name…',
            onChanged: onSearchChanged,
          ),
        ),
      ],
    );
  }
}

class _ContactRow extends StatelessWidget {
  final ContactRowData contact;
  final bool showDivider;
  final VoidCallback onTap;

  const _ContactRow({
    required this.contact,
    required this.showDivider,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.paper,
      child: InkWell(
        onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(
            minHeight: AppSizes.minTouchTarget,
          ),
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
          decoration: BoxDecoration(
            border: showDivider
                ? const Border(bottom: BorderSide(color: AppColors.lineSoft))
                : null,
          ),
          child: Row(
            children: [
              Container(
                width: AppSizes.avatar,
                height: AppSizes.avatar,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppColors.blue100,
                  borderRadius: BorderRadius.circular(AppRadii.tile),
                ),
                child: Text(
                  contact.initials,
                  style: AppText.display(fontSize: 15, color: AppColors.navy),
                ),
              ),
              const SizedBox(width: 13),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      contact.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.body(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: AppColors.ink,
                      ),
                    ),
                    if (contact.roleLabel.isNotEmpty) ...[
                      const SizedBox(height: AppSpacing.xxs),
                      Text(
                        contact.roleLabel,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppText.body(
                          fontSize: 12.5,
                          color: AppColors.muted,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              const Icon(
                Icons.chevron_right_rounded,
                size: AppSpacing.xl,
                color: AppColors.disabled,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _LoadingContacts extends StatelessWidget {
  const _LoadingContacts();

  @override
  Widget build(BuildContext context) {
    return const Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SkeletonBlock(height: 11, width: 110, radius: AppRadii.pill),
        SizedBox(height: AppSpacing.lg),
        SkeletonBlock(height: 56),
        SizedBox(height: AppSpacing.md),
        SkeletonBlock(height: 56),
        SizedBox(height: AppSpacing.md),
        SkeletonBlock(height: 56),
      ],
    );
  }
}
