import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/chat_controller.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/models/chat_model.dart';
import 'package:tenacity/src/ui/chat_screen.dart';
import 'package:tenacity/src/ui/new_chat_screen.dart';

class InboxScreen extends StatefulWidget {
  const InboxScreen({super.key});

  @override
  State<InboxScreen> createState() => _InboxScreenState();
}

class _InboxScreenState extends State<InboxScreen> {
  String _searchQuery = "";

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ChatController>().loadChats();
    });
  }

  @override
  Widget build(BuildContext context) {
    final chatController = context.watch<ChatController>();
    final authController = context.watch<AuthController>();
    final user = authController.currentUser;
    final chats = chatController.chats;

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          "Messages",
          style: TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
        ),
        elevation: 0,
        flexibleSpace: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              colors: [Color(0xFF1C71AF), Color(0xFF1B3F71)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
          ),
        ),
      ),
      backgroundColor: const Color(0xFFF6F9FC),
      body: Column(
        children: [
          // Search Bar
          Padding(
            padding: const EdgeInsets.all(10),
            child: TextField(
              decoration: InputDecoration(
                hintText: "Search messages...",
                prefixIcon: Icon(Icons.search, color: Colors.grey[600]),
                filled: true,
                fillColor: Colors.white,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(30),
                  borderSide: BorderSide.none,
                ),
                contentPadding: const EdgeInsets.symmetric(vertical: 12),
              ),
              onChanged: (query) {
                setState(() => _searchQuery = query);
              },
            ),
          ),
          // Chat list display
          Expanded(
            child: chats.isEmpty
                ? const Center(child: Text("No messages found"))
                : ListView.builder(
                    itemCount: chats.length,
                    itemBuilder: (context, index) {
                      final chat = chats[index];
                      final otherUserId =
                          chat.participants.firstWhere((id) => id != user?.uid);
                      return FutureBuilder<String>(
                        future: Provider.of<AuthController>(context, listen: false)
                            .fetchUserNameById(otherUserId),
                        builder: (context, snapshot) {
                          final otherUserName = snapshot.data ?? "Unknown User";
                          return _buildChatTile(chat, user?.uid ?? "", otherUserName);
                        },
                      );
                    },
                  ),
          ),
        ],
      ),
      // Floating Action Button to start a new chat
      floatingActionButton: FloatingActionButton(
        backgroundColor: Theme.of(context).primaryColorDark,
        onPressed: () {
          Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const NewChatScreen()),
          );
        },
        child: const Icon(Icons.add_comment, color: Colors.white,),
      ),
    );
  }

  Widget _buildChatTile(Chat chat, String currentUserId, String otherUserName) {
    final formattedTime =
        DateFormat('hh:mm a').format(chat.updatedAt.toDate());
    final unreadMessages = chat.unreadCounts[currentUserId] ?? 0;
    final hasUnreadMessages = unreadMessages > 0;

    return Dismissible(
      key: Key(chat.id),
      direction: DismissDirection.endToStart,
      background: Container(
        color: Colors.red,
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: const Icon(Icons.delete, color: Colors.white),
      ),
      confirmDismiss: (direction) async {
        return await showDialog(
          context: context,
          builder: (ctx) => AlertDialog(
            content: const Text("Are you sure you want to delete this chat?"),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(false),
                child: const Text("No"),
              ),
              TextButton(
                onPressed: () {
                  context.read<ChatController>().deleteChatForUser(chat.id);
                  Navigator.of(ctx).pop(true);
                },
                child: const Text("Yes"),
              ),
            ],
          ),
        );
      },
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: const Color(0xFF1C71AF),
          child: Text(
            otherUserName[0].toUpperCase(),
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
          ),
        ),
        title: Text(
          otherUserName,
          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
        ),
        subtitle: Text(
          chat.lastMessage,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            color: hasUnreadMessages ? Colors.black : Colors.grey[600],
            fontWeight: hasUnreadMessages ? FontWeight.bold : FontWeight.normal,
          ),
        ),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              formattedTime,
              style: TextStyle(color: Colors.grey[500], fontSize: 12),
            ),
            if (hasUnreadMessages)
              Container(
                margin: const EdgeInsets.only(top: 4),
                padding: const EdgeInsets.all(6),
                decoration: const BoxDecoration(
                  color: Colors.red,
                  shape: BoxShape.circle,
                ),
                child: Text(
                  unreadMessages.toString(),
                  style: const TextStyle(color: Colors.white, fontSize: 12),
                ),
              ),
          ],
        ),
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => ChatScreen(chatId: chat.id, otherUserName: otherUserName),
            ),
          );
        },
      ),
    );
  }
}
