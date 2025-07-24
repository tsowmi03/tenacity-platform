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

                      // --- Account Deletion Section ---
                      const SizedBox(height: 32),
                      Divider(),
                      Center(
                        child: TextButton.icon(
                          icon: const Icon(Icons.delete_forever,
                              color: Colors.red),
                          label: const Text(
                            "Delete Account",
                            style: TextStyle(
                                color: Colors.red, fontWeight: FontWeight.bold),
                          ),
                          onPressed: () async {
                            debugPrint(
                                '[SettingsScreen] Delete Account button pressed');
                            final confirmed = await showDialog<bool>(
                              context: context,
                              builder: (ctx) {
                                debugPrint(
                                    '[SettingsScreen] Showing first confirmation dialog');
                                return AlertDialog(
                                  title: const Text("Delete Account?"),
                                  content: Column(
                                    mainAxisSize: MainAxisSize.min,
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      const Text(
                                        "This action is irreversible. All your data will be permanently deleted.",
                                        style: TextStyle(
                                            fontWeight: FontWeight.bold),
                                      ),
                                      const SizedBox(height: 12),
                                      const Text(
                                        "Your students will be unenroled from all classes, and yours and their data will be permanently deleted. Your login credentials will also be revoked.",
                                        style: TextStyle(color: Colors.red),
                                      ),
                                      const SizedBox(height: 16),
                                      const Text(
                                          "Are you sure you want to continue?"),
                                    ],
                                  ),
                                  actions: [
                                    TextButton(
                                      child: const Text("Cancel"),
                                      onPressed: () {
                                        debugPrint(
                                            '[SettingsScreen] First confirmation dialog: Cancel pressed');
                                        Navigator.pop(ctx, false);
                                      },
                                    ),
                                    ElevatedButton(
                                      style: ElevatedButton.styleFrom(
                                        backgroundColor: Colors.red,
                                      ),
                                      child: const Text("Delete",
                                          style: TextStyle(
                                            color: Colors.white,
                                          )),
                                      onPressed: () {
                                        debugPrint(
                                            '[SettingsScreen] First confirmation dialog: Delete pressed');
                                        Navigator.pop(ctx, true);
                                      },
                                    ),
                                  ],
                                );
                              },
                            );
                            debugPrint(
                                '[SettingsScreen] First confirmation result: $confirmed');
                            if (confirmed == true) {
                              // Double confirmation dialog
                              final doubleConfirmed = await showDialog<bool>(
                                context: context,
                                builder: (ctx) {
                                  debugPrint(
                                      '[SettingsScreen] Showing double confirmation dialog');
                                  return AlertDialog(
                                    title:
                                        const Text("Are you absolutely sure?"),
                                    content: const Text(
                                      "This is your last chance to cancel. Your account and all associated data will be permanently deleted and cannot be recovered.",
                                      style: TextStyle(color: Colors.red),
                                    ),
                                    actions: [
                                      TextButton(
                                        child: const Text("Cancel"),
                                        onPressed: () {
                                          debugPrint(
                                              '[SettingsScreen] Double confirmation dialog: Cancel pressed');
                                          Navigator.pop(ctx, false);
                                        },
                                      ),
                                      ElevatedButton(
                                        style: ElevatedButton.styleFrom(
                                          backgroundColor: Colors.red,
                                        ),
                                        child: const Text("Yes, Delete Forever",
                                            style:
                                                TextStyle(color: Colors.white)),
                                        onPressed: () {
                                          debugPrint(
                                              '[SettingsScreen] Double confirmation dialog: Yes, Delete Forever pressed');
                                          Navigator.pop(ctx, true);
                                        },
                                      ),
                                    ],
                                  );
                                },
                              );
                              debugPrint(
                                  '[SettingsScreen] Double confirmation result: $doubleConfirmed');
                              if (doubleConfirmed == true) {
                                debugPrint(
                                    '[SettingsScreen] User confirmed account deletion. Showing loading dialog.');
                                // Show loading dialog
                                showDialog(
                                  context: context,
                                  barrierDismissible: false,
                                  builder: (ctx) => const Center(
                                      child: CircularProgressIndicator()),
                                );
                                try {
                                  final authController =
                                      Provider.of<AuthController>(context,
                                          listen: false);
                                  debugPrint(
                                      '[SettingsScreen] Calling deleteCurrentAccount()');
                                  await authController.deleteCurrentAccount();
                                  debugPrint(
                                      '[SettingsScreen] Account deleted. Logging out.');
                                  await authController.logout();
                                  debugPrint(
                                      '[SettingsScreen] Navigating to login screen.');
                                  Navigator.of(context)
                                    ..pop() // Remove loading dialog
                                    ..pop(); // Pop settings screen
                                  Navigator.of(context).pushNamedAndRemoveUntil(
                                      '/login', (route) => false);
                                } catch (e) {
                                  debugPrint(
                                      '[SettingsScreen] Error during account deletion: $e');
                                  Navigator.of(context)
                                      .pop(); // Remove loading dialog
                                  showDialog(
                                    context: context,
                                    builder: (ctx) => AlertDialog(
                                      title: const Text("Error"),
                                      content:
                                          Text("Failed to delete account: $e"),
                                      actions: [
                                        TextButton(
                                          child: const Text("OK"),
                                          onPressed: () {
                                            debugPrint(
                                                '[SettingsScreen] Error dialog dismissed');
                                            Navigator.pop(ctx);
                                          },
                                        ),
                                      ],
                                    ),
                                  );
                                }
                              } else {
                                debugPrint(
                                    '[SettingsScreen] User cancelled at double confirmation dialog.');
                              }
                            } else {
                              debugPrint(
                                  '[SettingsScreen] User cancelled at first confirmation dialog.');
                            }
                          },
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
