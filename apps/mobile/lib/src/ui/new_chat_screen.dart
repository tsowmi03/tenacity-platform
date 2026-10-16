import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/chat_controller.dart';
import 'package:tenacity/src/controllers/users_controller.dart';
import 'package:tenacity/src/models/chat_model.dart';
import 'package:tenacity/src/ui/chat_screen.dart';
import 'package:tenacity/src/ui/messaging/new_chat_data.dart';
import 'package:tenacity/src/ui/messaging/new_chat_view.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';
import 'package:tenacity/src/utils/error_presenter.dart';

/// Chooses who to start a conversation with. Reached from the inbox's `+`.
class NewChatScreen extends StatefulWidget {
  const NewChatScreen({super.key});

  @override
  NewChatScreenState createState() => NewChatScreenState();
}

class NewChatScreenState extends State<NewChatScreen> {
  String _searchQuery = '';

  /// Picking people for a group rather than opening a one-to-one thread.
  bool _pickingGroup = false;

  /// Who is ticked, in the order they were ticked — which is the order the
  /// group's label names them in.
  final Map<String, ContactRowData> _picked = {};

  bool _creatingGroup = false;

  // Held here, not on the controller. UsersController.filterUsers mutates a
  // list shared with the admin user list, so a query typed here used to
  // survive the screen and re-filter both.
  void _search(String query) => setState(() => _searchQuery = query);

  void _select(ContactRowData contact) {
    if (_pickingGroup) {
      _toggle(contact);
    } else {
      _openThread(contact);
    }
  }

  void _toggle(ContactRowData contact) {
    if (_creatingGroup) return;
    if (_picked.containsKey(contact.uid)) {
      setState(() => _picked.remove(contact.uid));
      return;
    }
    if (_picked.length >= maxGroupPicks) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('A group can have up to 32 people, including you.'),
        ),
      );
      return;
    }
    setState(() => _picked[contact.uid] = contact);
  }

  void _startPickingGroup() => setState(() => _pickingGroup = true);

  void _stopPickingGroup() {
    if (_creatingGroup) return;
    setState(() {
      _pickingGroup = false;
      _picked.clear();
    });
  }

  void _openThread(ContactRowData contact) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ChatScreen(
          chatId: null,
          otherUserName: contact.name,
          receipientId: contact.uid,
        ),
      ),
    );
  }

  Future<void> _createGroup() async {
    if (_creatingGroup || _picked.length < minGroupPicks) return;
    setState(() => _creatingGroup = true);

    final picked = _picked.values.toList();
    try {
      final chatId = await context
          .read<ChatController>()
          .createGroupChat(picked.map((contact) => contact.uid).toList());
      if (!mounted) return;
      // Replaces the picker rather than stacking on it, so back from the new
      // group lands in the inbox and not in a half-finished selection.
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => ChatScreen(
            chatId: chatId,
            isGroup: true,
            otherUserName: formatGroupLabel(
              picked.map((contact) => contact.firstName).toList(),
            ),
          ),
        ),
      );
    } catch (error, stackTrace) {
      if (!mounted) return;
      setState(() => _creatingGroup = false);
      final presented = presentError(
        error,
        action: 'start this group',
        stackTrace: stackTrace,
      );
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(presented.message)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final usersController = context.watch<UsersController>();
    final currentUser = context.watch<AuthController>().currentUser;

    final sections = buildContactSections(
      users: usersController.allUsers,
      studentsByParentId: usersController.parentStudents,
      currentUserRole: currentUser?.role,
      currentUserId: currentUser?.uid ?? '',
      query: _searchQuery,
    );

    return PopScope(
      // Back while picking leaves picking, not the screen — the same as the
      // header's back button.
      canPop: !_pickingGroup,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _stopPickingGroup();
      },
      child: Scaffold(
        backgroundColor: AppColors.ink,
        body: NewChatView(
          sections: sections,
          isLoading: usersController.isLoading,
          errorMessage: usersController.errorMessage,
          hasQuery: _searchQuery.trim().isNotEmpty,
          onSearchChanged: _search,
          onSelect: _select,
          onBack: _pickingGroup
              ? _stopPickingGroup
              : () => Navigator.of(context).pop(),
          onRetry: () => context.read<UsersController>().fetchAllUsers(),
          canStartGroup: canStartGroupChat(currentUser?.role),
          isPickingGroup: _pickingGroup,
          selectedIds: _picked.keys.toSet(),
          isCreatingGroup: _creatingGroup,
          onStartGroup: _startPickingGroup,
          onCreateGroup: _createGroup,
        ),
      ),
    );
  }
}
