// new_chat_screen.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/chat_controller.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/services/user_service.dart';
import 'package:tenacity/src/ui/chat_screen.dart';

class NewChatScreen extends StatefulWidget {
  const NewChatScreen({Key? key}) : super(key: key);

  @override
  _NewChatScreenState createState() => _NewChatScreenState();
}

class _NewChatScreenState extends State<NewChatScreen> {
  final UserService _userService = UserService();

  Future<List<AppUser>> _fetchContacts(String currentUserId, String currentUserRole) async {
    return await _userService.getContactsForUser(
      currentUserId: currentUserId,
      currentUserRole: currentUserRole,
    );
  }

  @override
  Widget build(BuildContext context) {
    final authController = context.watch<AuthController>();
    final currentUser = authController.currentUser;
    final chatController = context.watch<ChatController>();

    if (currentUser == null) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Start New Chat'),
      ),
      body: FutureBuilder<List<AppUser>>(
        future: _fetchContacts(currentUser.uid, currentUser.role),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          } else if (snapshot.hasError) {
            return Center(child: Text('Error: ${snapshot.error}'));
          } else if (!snapshot.hasData || snapshot.data!.isEmpty) {
            return const Center(child: Text('No contacts available.'));
          }

          List<AppUser> contacts = snapshot.data!;
          return ListView.builder(
            itemCount: contacts.length,
            itemBuilder: (context, index) {
              final contact = contacts[index];
              return ListTile(
                title: Text('${contact.firstName} ${contact.lastName}'),
                subtitle: Text(contact.role),
                onTap: () async {
                  try {
                    // Create or retrieve an existing chat.
                    final chatId = await chatController.createChatWithUser(contact.uid);
                    // Navigate to the ChatScreen.
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => ChatScreen(
                          chatId: chatId,
                          otherUserName: '${contact.firstName} ${contact.lastName}',
                        ),
                      ),
                    );
                  } catch (e) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Error starting chat: $e')),
                    );
                  }
                },
              );
            },
          );
        },
      ),
    );
  }
}
