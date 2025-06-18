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

  // We store the filtered list of chats here.
  List<Chat> _filteredChats = [];

  // A map of chatId -> otherUserName
  final Map<String, String> _chatParticipantNames = {};

  @override
  void initState() {
    super.initState();

    // Wait until the widget is built to access context.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final controller = context.read<ChatController>();

      // Whenever the ChatController’s chats change, update our local cache.
      controller.addListener(() {
        _populateUserNames(controller.chats);
      });

      controller.loadChats(); // Start loading chats
    });
  }

  /// Fetch and store the “other user” name for each chat, then filter them.
  Future<void> _populateUserNames(List<Chat> allChats) async {
    final authController = context.read<AuthController>();
    final currentUserId = authController.currentUser?.uid;
    if (currentUserId == null) return;

    final futures = allChats.map((chat) async {
      final participantsWithoutMe =
          chat.participants.where((id) => id != currentUserId).toList();

      if (participantsWithoutMe.isEmpty) {
        _chatParticipantNames[chat.id] = "Unknown";
        return;
      }

      final otherUserId = participantsWithoutMe.first;
      final name = await authController.fetchUserNameById(otherUserId);
      _chatParticipantNames[chat.id] = name;
    });

    await Future.wait(futures);
    _filterChats(allChats); // Re-filter after updating names
  }

  /// Filter chats by the other user’s name (cached in _chatParticipantNames).
  void _filterChats(List<Chat> allChats) {
    setState(() {
      if (_searchQuery.isEmpty) {
        _filteredChats = allChats;
      } else {
        final lowerQuery = _searchQuery.toLowerCase();
        _filteredChats = allChats.where((chat) {
          final participantName =
              _chatParticipantNames[chat.id]?.toLowerCase() ?? "";
          return participantName.contains(lowerQuery);
        }).toList();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final chatController = context.watch<ChatController>();
    final authController = context.watch<AuthController>();
    final user = authController.currentUser;

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
                hintText: "Search a user...",
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
                _filterChats(chatController.chats);
              },
            ),
          ),
          Expanded(
            child: _filteredChats.isEmpty
                ? const Center(child: Text("No messages found"))
                : ListView.builder(
                    itemCount: _filteredChats.length,
                    itemBuilder: (context, index) {
                      final chat = _filteredChats[index];
                      final otherUserName =
                          _chatParticipantNames[chat.id] ?? "Unknown User";

                      return _buildChatTile(
                        chat,
                        user?.uid ?? "",
                        otherUserName,
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
        child: const Icon(
          Icons.add_comment,
          color: Colors.white,
        ),
      ),
    );
  }

  Widget _buildChatTile(Chat chat, String currentUserId, String otherUserName) {
    final formattedTime = DateFormat('h:mm a').format(chat.updatedAt.toDate());
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
            otherUserName.isNotEmpty ? otherUserName[0].toUpperCase() : "?",
            style: const TextStyle(
                color: Colors.white, fontWeight: FontWeight.bold),
          ),
        ),
        title: Text(
          otherUserName,
          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
        ),
        subtitle: Text(
          chat.lastMessage == "[Attachment]"
              ? 'Sent an attachment.'
              : chat.lastMessage,
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
              builder: (_) =>
                  ChatScreen(chatId: chat.id, otherUserName: otherUserName),
            ),
          );
        },
      ),
    );
  }
}
