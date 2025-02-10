// new_chat_screen.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/chat_controller.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/services/user_service.dart';
import 'package:tenacity/src/ui/chat_screen.dart';

class NewChatScreen extends StatefulWidget {
  const NewChatScreen({super.key});

  @override
  NewChatScreenState createState() => NewChatScreenState();
}

class NewChatScreenState extends State<NewChatScreen> {
  final UserService _userService = UserService();
  final TextEditingController _searchController = TextEditingController();
  List<AppUser> _allContacts = [];
  List<AppUser> _filteredContacts = [];
  bool _isLoadingContacts = true;

  @override
  void initState() {
    super.initState();
    _loadContacts();
  }

  Future<void> _loadContacts() async {
    final authController = context.read<AuthController>();
    final currentUser = authController.currentUser;
    if (currentUser == null) return;

    try {
      _allContacts = await _userService.getContactsForUser(
        currentUserId: currentUser.uid,
        currentUserRole: currentUser.role,
      );
      setState(() {
        _filteredContacts = _allContacts; // initially show all
        _isLoadingContacts = false;
      });
    } catch (e) {
      setState(() {
        _isLoadingContacts = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to load contacts: $e')),
      );
    }
  }

  void _filterContacts(String query) {
    setState(() {
      _filteredContacts = _allContacts
          .where((contact) {
            final fullName = '${contact.firstName} ${contact.lastName}'.toLowerCase();
            return fullName.contains(query.toLowerCase());
          })
          .toList();
    });
  }

  @override
  Widget build(BuildContext context) {
    final chatController = context.watch<ChatController>();
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          "Start New Chat",
          style: TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
        ),
        iconTheme: const IconThemeData(color: Colors.white),
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
      body: Column(
        children: [
          // Search bar
          Padding(
            padding: const EdgeInsets.all(10),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search contacts...',
                prefixIcon: const Icon(Icons.search, color: Colors.grey),
                filled: true,
                fillColor: Colors.white,
                contentPadding: const EdgeInsets.symmetric(vertical: 12),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(30),
                  borderSide: BorderSide.none,
                ),
              ),
              onChanged: (query) => _filterContacts(query),
            ),
          ),

          // Contacts list
          Expanded(
            child: _isLoadingContacts
                ? const Center(child: CircularProgressIndicator())
                : _filteredContacts.isEmpty
                    ? const Center(child: Text('No contacts found.'))
                    : ListView.builder(
                        itemCount: _filteredContacts.length,
                        itemBuilder: (context, index) {
                          final contact = _filteredContacts[index];
                          return ListTile(
                            leading: CircleAvatar(
                              backgroundColor: Theme.of(context).primaryColorDark,
                              child: Text(
                                contact.firstName.isNotEmpty
                                    ? contact.firstName[0].toUpperCase()
                                    : '?',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                            title: Text('${contact.firstName} ${contact.lastName}', style: const TextStyle(fontWeight: FontWeight.bold),),
                            subtitle: Text(contact.role.toUpperCase()),
                            onTap: () async {
                              try {
                                final chatId = await chatController
                                    .createChatWithUser(contact.uid);

                                // Instead of pushing normally, use pushReplacement
                                // so the user does NOT come back to this screen on Back.
                                Navigator.pushReplacement(
                                  context,
                                  MaterialPageRoute(
                                    builder: (_) => ChatScreen(
                                      chatId: chatId,
                                      otherUserName:
                                          '${contact.firstName} ${contact.lastName}',
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
                      ),
          ),
        ],
      ),
    );
  }
}
