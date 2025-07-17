import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/settings_controller.dart';
import 'package:tenacity/src/ui/change_password_screen.dart';
import 'package:tenacity/src/ui/edit_profile_screen.dart';
import 'package:tenacity/src/ui/terms_screen.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late SettingsController _settingsController;
  String? userRole;
  String? userId;

  @override
  void initState() {
    super.initState();
    // Delay to ensure context is available
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final authController =
          Provider.of<AuthController>(context, listen: false);
      final user = authController.currentUser;
      if (user != null) {
        setState(() {
          userRole = user.role;
          userId = user.uid;
        });
        _settingsController =
            Provider.of<SettingsController>(context, listen: false);
        await _settingsController.loadSettings(user.uid);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<SettingsController>(
      builder: (context, settings, _) {
        return Scaffold(
          appBar: AppBar(
            iconTheme: const IconThemeData(color: Colors.white),
            title: const Text(
              "Settings",
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
          backgroundColor: Theme.of(context).colorScheme.surface,
          body: userRole == null || userId == null
              ? const Center(child: CircularProgressIndicator())
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Only show notification toggles for parents
                      if (userRole == 'parent') ...[
                        Text(
                          "Notifications",
                          style:
                              Theme.of(context).textTheme.titleMedium?.copyWith(
                                    fontWeight: FontWeight.w600,
                                    fontSize: 20,
                                  ),
                        ),
                        const SizedBox(height: 12),
                        if (settings.errorMessage != null)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 8.0),
                            child: Text(
                              settings.errorMessage!,
                              style: const TextStyle(color: Colors.red),
                            ),
                          ),
                        Card(
                          elevation: 2,
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12)),
                          child: settings.isLoading
                              ? const Padding(
                                  padding: EdgeInsets.all(24.0),
                                  child: Center(
                                      child: CircularProgressIndicator()),
                                )
                              : Column(
                                  children: [
                                    SwitchListTile(
                                      title: const Text("Spot Opened"),
                                      subtitle: const Text(
                                          "Get notified when a spot frees up in a class"),
                                      value: settings.spotOpenedNotif,
                                      activeColor:
                                          Theme.of(context).primaryColor,
                                      onChanged: (val) {
                                        settings.updateSetting(
                                            userId!, "spotOpened", val);
                                      },
                                    ),
                                    const Divider(height: 1),
                                    SwitchListTile(
                                      title: const Text("Lesson Reminder"),
                                      subtitle: const Text(
                                          "Get reminders for your child's lessons"),
                                      value: settings.lessonReminderNotif,
                                      activeColor:
                                          Theme.of(context).primaryColor,
                                      onChanged: (val) {
                                        settings.updateSetting(
                                            userId!, "lessonReminder", val);
                                      },
                                    ),
                                  ],
                                ),
                        ),
                        const SizedBox(height: 24),
                      ],

                      // Account Settings
                      Text(
                        "Account",
                        style:
                            Theme.of(context).textTheme.titleMedium?.copyWith(
                                  fontWeight: FontWeight.w600,
                                  fontSize: 20,
                                ),
                      ),
                      const SizedBox(height: 12),
                      Card(
                        elevation: 2,
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12)),
                        child: Column(
                          children: [
                            ListTile(
                              leading: const Icon(Icons.lock_outline,
                                  color: Color(0xFF1C71AF)),
                              title: const Text("Change Password"),
                              trailing: const Icon(Icons.chevron_right),
                              onTap: () {
                                Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                      builder: (_) =>
                                          const ChangePasswordScreen()),
                                );
                              },
                            ),
                            const Divider(height: 1),
                            ListTile(
                              leading: const Icon(Icons.edit,
                                  color: Color(0xFF1C71AF)),
                              title: const Text("Edit Profile"),
                              trailing: const Icon(Icons.chevron_right),
                              onTap: () {
                                Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                      builder: (_) => EditProfileScreen()),
                                );
                              },
                            ),
                          ],
                        ),
                      ),

                      const SizedBox(height: 24),

                      // Legal
                      Text(
                        "Legal",
                        style:
                            Theme.of(context).textTheme.titleMedium?.copyWith(
                                  fontWeight: FontWeight.w600,
                                  fontSize: 20,
                                ),
                      ),
                      const SizedBox(height: 12),
                      Card(
                        elevation: 2,
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12)),
                        child: Column(
                          children: [
                            ListTile(
                              leading: const Icon(Icons.description_outlined,
                                  color: Color(0xFF1C71AF)),
                              title: const Text("Terms of Service"),
                              trailing: const Icon(Icons.chevron_right),
                              onTap: () {
                                Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                      builder: (_) => TermsScreen(
                                            requireAcceptance: false,
                                          )),
                                );
                              },
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
        );
      },
    );
  }
}
