import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/models/parent_model.dart';
import '../controllers/auth_controller.dart';
import '../controllers/profile_controller.dart';
import '../models/student_model.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  bool _isEditingParent = false;

  final TextEditingController _firstNameCtrl = TextEditingController();
  final TextEditingController _lastNameCtrl = TextEditingController();
  final TextEditingController _emailCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      Provider.of<ProfileController>(context, listen: false).loadProfile();
    });
  }

  @override
  void dispose() {
    _firstNameCtrl.dispose();
    _lastNameCtrl.dispose();
    _emailCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final profileController = context.watch<ProfileController>();
    final appUser = profileController.parent;
    final isLoading = profileController.isLoading;
    final userRole = (appUser?.role ?? '').toLowerCase();

    if (appUser != null && !_isEditingParent) {
      _firstNameCtrl.text = appUser.firstName;
      _lastNameCtrl.text = appUser.lastName;
      _emailCtrl.text = appUser.email;
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          "My Profile",
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

      floatingActionButton: (appUser != null && userRole == 'admin')
          ? FloatingActionButton(
              backgroundColor: const Color(0xFF1C71AF),
              onPressed: () {
                if (_isEditingParent) {
                  profileController.updateParent(
                    firstName: _firstNameCtrl.text.trim(),
                    lastName: _lastNameCtrl.text.trim(),
                    email: _emailCtrl.text.trim(),
                  );
                }
                setState(() => _isEditingParent = !_isEditingParent);
              },
              child: Icon(_isEditingParent ? Icons.save : Icons.edit),
            )
          : null,

      body: isLoading
          ? const Center(child: CircularProgressIndicator())
          : (appUser == null)
              ? const Center(child: Text("No user data available."))
              : Column(
                  children: [
                    Expanded(
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 20,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              "${appUser.firstName} ${appUser.lastName}",
                              style: const TextStyle(
                                fontSize: 22,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 8),
                            const Divider(height: 1, thickness: 1),
                            const SizedBox(height: 16),

                            _buildParentInfoSection(appUser, userRole),
                            const SizedBox(height: 24),

                            if (appUser is Parent) ...[
                              Text(
                                "My Students",
                                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                      fontWeight: FontWeight.w600,
                                    ),
                              ),
                              const SizedBox(height: 12),
                              for (final student in profileController.children)
                                _buildStudentCard(context, student),
                            ],
                          ],
                        ),
                      ),
                    ),

                    SafeArea(
                      minimum: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                      child: SizedBox(
                        width: double.infinity,
                        height: 50,
                        child: ElevatedButton.icon(
                          icon: const Icon(Icons.logout, color: Colors.white),
                          label: const Text(
                            "Sign Out",
                            style: TextStyle(color: Colors.white),
                          ),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF1C71AF),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                          ),
                          onPressed: () {
                            Provider.of<AuthController>(context, listen: false).logout();
                          },
                        ),
                      ),
                    ),
                  ],
                ),
    );
  }

  Widget _buildParentInfoSection(dynamic appUser, String userRole) {
    final canEdit = (userRole == 'admin' && _isEditingParent);
    if (!canEdit) {
      return Card(
        elevation: 3,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _readOnlyRow("First Name", appUser.firstName),
              _readOnlyRow("Last Name", appUser.lastName),
              _readOnlyRow("Email", appUser.email),
            ],
          ),
        ),
      );
    }

    return Card(
      elevation: 3,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        child: Column(
          children: [
            TextField(
              controller: _firstNameCtrl,
              decoration: const InputDecoration(labelText: 'First Name'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _lastNameCtrl,
              decoration: const InputDecoration(labelText: 'Last Name'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _emailCtrl,
              decoration: const InputDecoration(labelText: 'Email'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _readOnlyRow(String label, String? value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Text(
        "$label: ${value ?? ''}",
        style: const TextStyle(fontSize: 16),
      ),
    );
  }

  Widget _buildStudentCard(BuildContext context, Student student) {
    return Card(
      elevation: 2,
      margin: const EdgeInsets.symmetric(vertical: 6),
      child: ListTile(
        leading: const Icon(Icons.school, color: Color(0xFF1C71AF)),
        title: Text('${student.firstName} ${student.lastName}'),
        subtitle: Text("Remaining Tokens: ${student.remainingTokens ?? 0}"),
        trailing: _canEditStudents()
            ? IconButton(
                icon: const Icon(Icons.edit),
                onPressed: () => _showEditStudentDialog(context, student),
              )
            : null,
      ),
    );
  }

  bool _canEditStudents() {
    final profileController = context.read<ProfileController>();
    final role = profileController.parent?.role.toLowerCase() ?? '';
    return role == 'admin';
  }

  Future<void> _showEditStudentDialog(BuildContext context, Student student) async {
    final nameCtrl = TextEditingController(text: student.firstName);
    final tokensCtrl = TextEditingController(text: '${student.remainingTokens ?? 0}');

    await showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: const Text("Edit Student"),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameCtrl,
                decoration: const InputDecoration(labelText: 'Name'),
              ),
              TextField(
                controller: tokensCtrl,
                decoration: const InputDecoration(labelText: 'Remaining Tokens'),
                keyboardType: TextInputType.number,
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text("Cancel"),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF1C71AF),
              ),
              onPressed: () {
                final profileCtrl =
                    Provider.of<ProfileController>(context, listen: false);
                final updatedName = nameCtrl.text.trim();
                final updatedTokens = int.tryParse(tokensCtrl.text) ?? 0;

                profileCtrl.updateStudent(
                  student,
                  name: updatedName,
                  remainingTokens: updatedTokens,
                );
                Navigator.of(ctx).pop();
              },
              child: const Text("Save"),
            ),
          ],
        );
      },
    );
  }
}