import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/users_controller.dart';
import 'package:tenacity/src/ui/chat_screen.dart';

class NewChatScreen extends StatefulWidget {
  const NewChatScreen({super.key});

  @override
  NewChatScreenState createState() => NewChatScreenState();
}

class NewChatScreenState extends State<NewChatScreen> {
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    // Optionally, trigger fetchAllUsers here if not already done by provider
    // context.read<UsersController>().fetchAllUsers();
  }

  void _filterContacts(BuildContext context, String query) {
    context.read<UsersController>().filterUsers(query);
  }

  @override
  Widget build(BuildContext context) {
    final usersController = context.watch<UsersController>();
    final authController = context.watch<AuthController>();

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
              onChanged: (query) => _filterContacts(context, query),
            ),
          ),

          // Contacts list
          Expanded(
            child: usersController.isLoading
                ? const Center(child: CircularProgressIndicator())
                : Builder(builder: (context) {
                    // If current user is a parent, filter out contacts who are also parents.
                    final filteredContacts =
                        authController.currentUser?.role.toLowerCase() ==
                                "parent"
                            ? usersController.filteredUsers
                                .where((contact) =>
                                    contact.role.toLowerCase() != "parent")
                                .toList()
                            : usersController.filteredUsers;

                    if (filteredContacts.isEmpty) {
                      return const Center(child: Text('No contacts found.'));
                    }

                    return ListView.builder(
                      itemCount: filteredContacts.length,
                      itemBuilder: (context, index) {
                        final contact = filteredContacts[index];
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
                          title: Text(
                            '${contact.firstName} ${contact.lastName}',
                            style: const TextStyle(fontWeight: FontWeight.bold),
                          ),
                          subtitle: Text(
                            contact.role.isNotEmpty
                                ? '${contact.role[0].toUpperCase()}${contact.role.substring(1).toLowerCase()}'
                                : '',
                          ),
                          onTap: () async {
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => ChatScreen(
                                  chatId: null,
                                  otherUserName:
                                      '${contact.firstName} ${contact.lastName}',
                                  receipientId: contact.uid,
                                ),
                              ),
                            );
                          },
                        );
                      },
                    );
                  }),
          ),
        ],
      ),
    );
  }
}
