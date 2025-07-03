import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/change_password_screen.dart';
import 'package:tenacity/src/ui/edit_profile_screen.dart';
import 'package:tenacity/src/ui/terms_screen.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool pushNotifications = true;
  bool emailNotifications = true;
  String selectedTheme = 'Light';

  // Notification toggles
  bool spotOpenedNotif = true;
  bool lessonReminderNotif = true;

  // User role (for demo, set manually; in production, load from user profile)
  String userRole = 'parent'; // Change to 'tutor' or 'admin' to test hiding

  @override
  void initState() {
    super.initState();
    // TODO: Load user role and notification settings from Firestore/user profile
  }

  void _updateNotificationSetting(String key, bool value) async {
    setState(() {
      if (key == "spotOpened") spotOpenedNotif = value;
      if (key == "lessonReminder") lessonReminderNotif = value;
    });
    // TODO: Save to Firestore/user settings
    // await FirebaseFirestore.instance.collection('userSettings').doc(userId).set({key: value}, SetOptions(merge: true));
  }

  @override
  Widget build(BuildContext context) {
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
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Only show notification toggles for parents
            if (userRole == 'parent') ...[
              Text(
                "Notifications",
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
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
                    SwitchListTile(
                      title: const Text("Spot Opened"),
                      subtitle: const Text(
                          "Get notified when a spot frees up in a class"),
                      value: spotOpenedNotif,
                      activeColor: Theme.of(context).primaryColor,
                      onChanged: (val) =>
                          _updateNotificationSetting("spotOpened", val),
                    ),
                    const Divider(height: 1),
                    SwitchListTile(
                      title: const Text("Lesson Reminder"),
                      subtitle:
                          const Text("Get reminders for your child's lessons"),
                      value: lessonReminderNotif,
                      activeColor: Theme.of(context).primaryColor,
                      onChanged: (val) =>
                          _updateNotificationSetting("lessonReminder", val),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
            ],

            // Account Settings
            Text(
              "Account",
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
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
                            builder: (_) => const ChangePasswordScreen()),
                      );
                    },
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.edit, color: Color(0xFF1C71AF)),
                    title: const Text("Edit Profile"),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(builder: (_) => EditProfileScreen()),
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
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
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
  }
}
