import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/users_controller.dart';
import 'package:tenacity/src/ui/chat_screen.dart';
import 'package:tenacity/src/ui/messaging/new_chat_data.dart';
import 'package:tenacity/src/ui/messaging/new_chat_view.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

/// Chooses who to start a conversation with. Reached from the inbox's `+`.
class NewChatScreen extends StatefulWidget {
  const NewChatScreen({super.key});

  @override
  NewChatScreenState createState() => NewChatScreenState();
}

class NewChatScreenState extends State<NewChatScreen> {
  String _searchQuery = '';

  void _search(String query) {
    // The controller owns the filter because it also matches a parent's
    // students by name, which this screen has no data for. The query is kept
    // here only to tell "no contacts" from "no matches".
    setState(() => _searchQuery = query);
    context.read<UsersController>().filterUsers(query);
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

  @override
  Widget build(BuildContext context) {
    final usersController = context.watch<UsersController>();
    final currentUser = context.watch<AuthController>().currentUser;

    final sections = buildContactSections(
      users: usersController.filteredUsers,
      currentUserRole: currentUser?.role,
      currentUserId: currentUser?.uid ?? '',
    );

    return Scaffold(
      backgroundColor: AppColors.ink,
      body: NewChatView(
        sections: sections,
        isLoading: usersController.isLoading,
        errorMessage: usersController.errorMessage,
        hasQuery: _searchQuery.trim().isNotEmpty,
        onSearchChanged: _search,
        onSelect: _openThread,
        onBack: () => Navigator.of(context).pop(),
        onRetry: () => context.read<UsersController>().fetchAllUsers(),
      ),
    );
  }
}
