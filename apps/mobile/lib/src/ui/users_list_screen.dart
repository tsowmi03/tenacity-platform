import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/users_controller.dart';
import 'package:tenacity/src/ui/user_details_screen.dart';

class UsersScreen extends StatefulWidget {
  const UsersScreen({super.key});

  @override
  State<UsersScreen> createState() => _UsersScreenState();
}

class _UsersScreenState extends State<UsersScreen> {
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<UsersController>().fetchAllUsers();
    });
  }

  void _onSearchChanged(String query) {
    context.read<UsersController>().filterUsers(query);
  }

  @override
  Widget build(BuildContext context) {
    final usersController = context.watch<UsersController>();

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          "All Users",
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
                hintText: 'Search users...',
                prefixIcon: const Icon(Icons.search, color: Colors.grey),
                filled: true,
                fillColor: Colors.white,
                contentPadding: const EdgeInsets.symmetric(vertical: 12),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(30),
                  borderSide: BorderSide.none,
                ),
              ),
              onChanged: _onSearchChanged,
            ),
          ),
          // User list
          Expanded(
            child: usersController.isLoading
                ? const Center(child: CircularProgressIndicator())
                : usersController.errorMessage != null
                    ? Center(child: Text(usersController.errorMessage!))
                    : usersController.filteredUsers.isEmpty
                        ? const Center(child: Text('No users found.'))
                        : ListView.builder(
                            itemCount: usersController.filteredUsers.length,
                            itemBuilder: (context, index) {
                              final user = usersController.filteredUsers[index];
                              return ListTile(
                                leading: CircleAvatar(
                                  backgroundColor:
                                      Theme.of(context).primaryColorDark,
                                  child: Text(
                                    user.firstName.isNotEmpty
                                        ? user.firstName[0].toUpperCase()
                                        : '?',
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ),
                                title: Text(
                                  '${user.firstName} ${user.lastName}',
                                  style: const TextStyle(
                                      fontWeight: FontWeight.bold),
                                ),
                                subtitle: Text(
                                  user.role.isNotEmpty
                                      ? '${user.role[0].toUpperCase()}${user.role.substring(1).toLowerCase()}'
                                      : '',
                                ),
                                onTap: () {
                                  Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                        builder: (_) =>
                                            UserDetailScreen(user: user),
                                      ));
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
