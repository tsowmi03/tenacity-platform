import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/chat_controller.dart';
import 'package:tenacity/src/controllers/users_controller.dart';
import 'package:tenacity/src/models/chat_model.dart';
import 'package:tenacity/src/services/chat_service.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/messaging/group_details_data.dart';
import 'package:tenacity/src/ui/messaging/group_details_view.dart';
import 'package:tenacity/src/ui/messaging/new_chat_data.dart';
import 'package:tenacity/src/ui/messaging/new_chat_view.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';
import 'package:tenacity/src/utils/error_presenter.dart';

/// A group's members and settings, opened from the thread header (MOB-70).
///
/// Pops with `true` when the user leaves the group, so the thread behind it
/// closes as well.
class GroupDetailsScreen extends StatefulWidget {
  final String chatId;

  const GroupDetailsScreen({super.key, required this.chatId});

  @override
  State<GroupDetailsScreen> createState() => _GroupDetailsScreenState();
}

class _GroupDetailsScreenState extends State<GroupDetailsScreen> {
  late final ChatController _controller = context.read<ChatController>();
  late final Stream<Chat?> _chat = _controller.watchChat(widget.chatId);

  GroupChatAccess _access = GroupChatAccess.none;
  bool _isBusy = false;

  @override
  void initState() {
    super.initState();
    unawaited(_loadAccess());
  }

  /// Without an answer the controls stay hidden and the member list still
  /// works, so a failure here is not worth interrupting anyone over.
  Future<void> _loadAccess() async {
    try {
      final access = await _controller.fetchGroupChatAccess(widget.chatId);
      if (mounted) setState(() => _access = access);
    } catch (error, stackTrace) {
      logHandledError(
        error,
        whileTryingTo: 'load group permissions',
        stackTrace: stackTrace,
      );
    }
  }

  Future<bool> _run(String action, Future<void> Function() work) async {
    if (_isBusy) return false;
    setState(() => _isBusy = true);
    try {
      await work();
      return true;
    } catch (error, stackTrace) {
      if (mounted) {
        final presented = presentError(
          error,
          action: action,
          stackTrace: stackTrace,
        );
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(presented.message)),
        );
      }
      return false;
    } finally {
      if (mounted) setState(() => _isBusy = false);
    }
  }

  Future<void> _rename(Chat chat) async {
    final name = await showAppBottomSheet<String>(
      context: context,
      builder: (_) => _RenameGroupSheet(initialName: chat.name ?? ''),
    );
    if (name == null || !mounted) return;
    await _run(
      'rename this group',
      () => _controller.renameGroupChat(widget.chatId, name),
    );
  }

  Future<void> _addMembers(Chat chat) async {
    final picked = await Navigator.of(context).push<List<String>>(
      MaterialPageRoute(builder: (_) => AddGroupMembersScreen(chat: chat)),
    );
    if (picked == null || picked.isEmpty || !mounted) return;
    final added = await _run(
      'add people to this group',
      () => _controller.addGroupChatMembers(widget.chatId, picked),
    );
    // Adding an admin hands control of the members to admins.
    if (added) unawaited(_loadAccess());
  }

  Future<void> _remove(GroupMemberRowData member) async {
    final confirmed = await showAppConfirmationSheet(
      context: context,
      title: 'Remove ${member.name}?',
      message: 'They will no longer see this group or get its messages.',
      confirmLabel: 'Remove',
      tone: AppConfirmationTone.destructive,
    );
    if (!confirmed || !mounted) return;
    final removed = await _run(
      'remove this person',
      () => _controller.removeGroupChatMember(widget.chatId, member.uid),
    );
    // Removing the last admin hands control back to the tutors.
    if (removed) unawaited(_loadAccess());
  }

  Future<void> _leave() async {
    final confirmed = await showAppConfirmationSheet(
      context: context,
      title: 'Leave this group?',
      message: 'You will no longer see this group or get its messages.',
      confirmLabel: 'Leave',
      tone: AppConfirmationTone.destructive,
    );
    if (!confirmed || !mounted) return;
    final left = await _run(
      'leave this group',
      () => _controller.leaveGroupChat(widget.chatId),
    );
    if (left && mounted) Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.ink,
      body: StreamBuilder<Chat?>(
        stream: _chat,
        builder: (context, snapshot) {
          final chat = snapshot.data;
          if (chat == null || !chat.participants.contains(_controller.userId)) {
            return _Unavailable(
              isLoading: !snapshot.hasError &&
                  snapshot.connectionState == ConnectionState.waiting,
              onBack: () => Navigator.of(context).pop(),
            );
          }

          final viewerId = _controller.userId;
          return GroupDetailsView(
            title: chat.groupLabel(viewerId),
            groupName: chat.name,
            members: buildGroupMemberRows(
              chat: chat,
              viewerId: viewerId,
              canManageMembers: _access.canManageMembers,
            ),
            canRename: _access.canRename,
            canAddMembers:
                _access.canManageMembers && remainingGroupPlaces(chat) > 0,
            isBusy: _isBusy,
            onBack: () => Navigator.of(context).pop(),
            onRename: () => unawaited(_rename(chat)),
            onAddMembers: () => unawaited(_addMembers(chat)),
            onRemove: (member) => unawaited(_remove(member)),
            onLeave: () => unawaited(_leave()),
          );
        },
      ),
    );
  }
}

class _Unavailable extends StatelessWidget {
  final bool isLoading;
  final VoidCallback onBack;

  const _Unavailable({required this.isLoading, required this.onBack});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.ink,
      child: SafeArea(
        bottom: false,
        child: Column(
          children: [
            DetailHeader(title: 'Group', onBack: onBack),
            Expanded(
              child: ContentSheet.fixed(
                child: isLoading
                    ? const Center(child: CircularProgressIndicator())
                    : const EmptyStateView(
                        icon: Icons.groups_rounded,
                        title: 'This group is not available',
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RenameGroupSheet extends StatefulWidget {
  final String initialName;

  const _RenameGroupSheet({required this.initialName});

  @override
  State<_RenameGroupSheet> createState() => _RenameGroupSheetState();
}

class _RenameGroupSheetState extends State<_RenameGroupSheet> {
  late final TextEditingController _name =
      TextEditingController(text: widget.initialName);

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AppBottomSheet(
      title: 'Group name',
      footer: SheetActions(
        confirmLabel: 'Save',
        onCancel: () => Navigator.of(context).pop(),
        onConfirm: () => Navigator.of(context).pop(_name.text),
      ),
      child: TextField(
        key: const Key('group-name-field'),
        controller: _name,
        autofocus: true,
        maxLength: maxGroupNameLength,
        textCapitalization: TextCapitalization.sentences,
        decoration: const InputDecoration(
          hintText: 'Name this group',
          helperText: 'Leave blank to use people\'s names.',
        ),
      ),
    );
  }
}

/// Picks people to add to [chat], and pops with their ids.
class AddGroupMembersScreen extends StatefulWidget {
  final Chat chat;

  const AddGroupMembersScreen({super.key, required this.chat});

  @override
  State<AddGroupMembersScreen> createState() => _AddGroupMembersScreenState();
}

class _AddGroupMembersScreenState extends State<AddGroupMembersScreen> {
  String _query = '';
  final Set<String> _picked = {};

  void _toggle(ContactRowData contact) {
    if (_picked.contains(contact.uid)) {
      setState(() => _picked.remove(contact.uid));
      return;
    }
    if (_picked.length >= remainingGroupPlaces(widget.chat)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('A group can have up to 32 people.')),
      );
      return;
    }
    setState(() => _picked.add(contact.uid));
  }

  @override
  Widget build(BuildContext context) {
    final users = context.watch<UsersController>();
    final currentUser = context.watch<AuthController>().currentUser;

    final sections = buildContactSections(
      users: users.allUsers
          .where((user) => !widget.chat.participants.contains(user.uid))
          .toList(),
      studentsByParentId: users.parentStudents,
      currentUserRole: currentUser?.role,
      currentUserId: currentUser?.uid ?? '',
      query: _query,
    );

    return Scaffold(
      backgroundColor: AppColors.ink,
      body: NewChatView(
        sections: sections,
        isLoading: users.isLoading,
        errorMessage: users.errorMessage,
        hasQuery: _query.trim().isNotEmpty,
        onSearchChanged: (query) => setState(() => _query = query),
        onSelect: _toggle,
        onBack: () => Navigator.of(context).pop(),
        onRetry: () => context.read<UsersController>().fetchAllUsers(),
        isPickingGroup: true,
        selectedIds: _picked,
        onCreateGroup: () => Navigator.of(context).pop(_picked.toList()),
        pickingTitle: 'Add people',
        minPicks: 1,
        submitLabel: 'Add to group',
        needMorePicksLabel: 'Pick at least 1 person',
      ),
    );
  }
}
