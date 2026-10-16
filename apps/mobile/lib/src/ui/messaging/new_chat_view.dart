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
///
/// Staff also get a "New group" row (MOB-54). It switches the same list into
/// picking mode, where a tap ticks a person rather than opening a thread, and
/// a button at the foot starts the group. Tapping a person outside that mode
/// still opens a one-to-one thread in one tap, exactly as before.
class NewChatView extends StatelessWidget {
  final List<ContactSection> sections;
  final bool isLoading;
  final String? errorMessage;
  final bool hasQuery;
  final ValueChanged<String> onSearchChanged;

  /// A person was tapped: opens their thread, or in picking mode ticks them.
  /// The screen decides which, since it owns the mode.
  final ValueChanged<ContactRowData> onSelect;
  final VoidCallback onBack;
  final VoidCallback onRetry;

  /// Whether to offer the "New group" row. Staff only.
  final bool canStartGroup;

  /// True while the list is picking people for a group.
  final bool isPickingGroup;
  final Set<String> selectedIds;

  /// True while the group is being created on the server.
  final bool isCreatingGroup;
  final VoidCallback? onStartGroup;
  final VoidCallback? onCreateGroup;

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
    this.canStartGroup = false,
    this.isPickingGroup = false,
    this.selectedIds = const {},
    this.isCreatingGroup = false,
    this.onStartGroup,
    this.onCreateGroup,
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
              isPickingGroup: isPickingGroup,
              selectedCount: selectedIds.length,
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
                child: Column(
                  children: [
                    Expanded(child: _body()),
                    if (isPickingGroup)
                      _CreateGroupBar(
                        selectedCount: selectedIds.length,
                        isBusy: isCreatingGroup,
                        onCreate: onCreateGroup,
                      ),
                  ],
                ),
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

    final showGroupRow = canStartGroup && !isPickingGroup;
    final offset = showGroupRow ? 1 : 0;

    return ListView.builder(
      key: const Key('new-chat-list'),
      padding: EdgeInsets.zero,
      itemCount: sections.length + offset,
      itemBuilder: (context, index) {
        if (showGroupRow && index == 0) {
          return Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.xl),
            child: _NewGroupRow(onTap: onStartGroup),
          );
        }
        final sectionIndex = index - offset;
        final section = sections[sectionIndex];
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (sectionIndex > 0) const SizedBox(height: AppSpacing.xxl),
            SectionLabel(title: section.title),
            const SizedBox(height: AppSpacing.xs),
            for (var i = 0; i < section.contacts.length; i++)
              _ContactRow(
                contact: section.contacts[i],
                showDivider: i < section.contacts.length - 1,
                selection: isPickingGroup
                    ? (selectedIds.contains(section.contacts[i].uid)
                        ? _RowSelection.selected
                        : _RowSelection.unselected)
                    : _RowSelection.none,
                onTap: () => onSelect(section.contacts[i]),
              ),
          ],
        );
      },
    );
  }
}

/// The way into picking people for a group, above the contact sections.
class _NewGroupRow extends StatelessWidget {
  final VoidCallback? onTap;

  const _NewGroupRow({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.paper,
      child: InkWell(
        key: const Key('new-group-row'),
        onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(
            minHeight: AppSizes.minTouchTarget,
          ),
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
          child: Row(
            children: [
              Container(
                width: AppSizes.avatar,
                height: AppSizes.avatar,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppColors.blue,
                  borderRadius: BorderRadius.circular(AppRadii.tile),
                ),
                child: const Icon(
                  Icons.group_add_rounded,
                  color: Colors.white,
                  size: 22,
                ),
              ),
              const SizedBox(width: 13),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'New group',
                      style: AppText.body(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: AppColors.ink,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xxs),
                    Text(
                      'Message several people at once',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.body(
                        fontSize: 12.5,
                        color: AppColors.muted,
                      ),
                    ),
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

/// The foot of the list while picking: what the group will be, and the button
/// that starts it.
class _CreateGroupBar extends StatelessWidget {
  final int selectedCount;
  final bool isBusy;
  final VoidCallback? onCreate;

  const _CreateGroupBar({
    required this.selectedCount,
    required this.isBusy,
    required this.onCreate,
  });

  @override
  Widget build(BuildContext context) {
    final ready = selectedCount >= minGroupPicks;
    final bottomInset = MediaQuery.of(context).padding.bottom;

    return Container(
      decoration: const BoxDecoration(
        color: AppColors.paper,
        border: Border(top: BorderSide(color: AppColors.lineSoft)),
      ),
      padding: EdgeInsets.only(
        top: AppSpacing.md,
        bottom: AppSpacing.md + bottomInset,
      ),
      child: SizedBox(
        width: double.infinity,
        child: FilledButton(
          key: const Key('create-group'),
          onPressed: ready && !isBusy ? onCreate : null,
          child: isBusy
              ? const SizedBox(
                  width: AppSpacing.lg,
                  height: AppSpacing.lg,
                  // Muted, not white: the button is disabled while busy, so
                  // it draws on the light disabled fill rather than navy.
                  child: CircularProgressIndicator(
                    color: AppColors.muted,
                    strokeWidth: 2,
                  ),
                )
              : Text(ready ? 'Create group' : 'Pick at least 2 people'),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  final int contactCount;
  final bool isLoading;
  final bool isPickingGroup;
  final int selectedCount;
  final VoidCallback onBack;
  final ValueChanged<String> onSearchChanged;

  const _Header({
    required this.contactCount,
    required this.isLoading,
    required this.isPickingGroup,
    required this.selectedCount,
    required this.onBack,
    required this.onSearchChanged,
  });

  @override
  Widget build(BuildContext context) {
    final subtitle = isPickingGroup
        ? (selectedCount == 0 ? 'Pick who to add' : '$selectedCount selected')
        : isLoading
            ? 'Loading contacts…'
            : contactCount == 1
                ? '1 contact'
                : '$contactCount contacts';

    return Column(
      children: [
        // DetailHeader carries its own padding — the back button needs to sit
        // further left than the screen gutter to line its glyph up with it.
        DetailHeader(
          title: isPickingGroup ? 'New group' : 'New message',
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

/// Whether a row is part of a group being picked, and if so whether it is in.
enum _RowSelection { none, unselected, selected }

class _ContactRow extends StatelessWidget {
  final ContactRowData contact;
  final bool showDivider;
  final _RowSelection selection;
  final VoidCallback onTap;

  const _ContactRow({
    required this.contact,
    required this.showDivider,
    required this.onTap,
    this.selection = _RowSelection.none,
  });

  @override
  Widget build(BuildContext context) {
    final trailing = switch (selection) {
      _RowSelection.none => const Icon(
          Icons.chevron_right_rounded,
          size: AppSpacing.xl,
          color: AppColors.disabled,
        ),
      _RowSelection.unselected => const Icon(
          Icons.radio_button_unchecked_rounded,
          key: Key('contact-unselected'),
          size: 24,
          color: AppColors.disabled,
        ),
      _RowSelection.selected => const Icon(
          Icons.check_circle_rounded,
          key: Key('contact-selected'),
          size: 24,
          color: AppColors.blue,
        ),
    };

    return Semantics(
      selected: selection == _RowSelection.selected,
      child: Material(
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
                trailing,
              ],
            ),
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
