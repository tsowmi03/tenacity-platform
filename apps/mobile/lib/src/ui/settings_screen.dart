import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/change_password_screen.dart';
import 'package:tenacity/src/ui/edit_profile_screen.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool pushNotifications = true;
  bool emailNotifications = true;
  String selectedTheme = 'Light';

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
      backgroundColor: const Color(0xFFF6F9FC),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // // Notifications Section
            // Text(
            //   "Notifications",
            //   style: Theme.of(context).textTheme.titleMedium?.copyWith(
            //         fontWeight: FontWeight.w600,
            //         fontSize: 20,
            //       ),
            // ),
            // const SizedBox(height: 12),
            // Card(
            //   elevation: 2,
            //   shape: RoundedRectangleBorder(
            //       borderRadius: BorderRadius.circular(12)),
            //   child: Column(
            //     children: [
            //       SwitchListTile(
            //         title: const Text("Push Notifications"),
            //         subtitle:
            //             const Text("Receive lesson reminders and updates"),
            //         value: pushNotifications,
            //         activeColor: const Color(0xFF1C71AF),
            //         onChanged: (value) {
            //           setState(() {
            //             pushNotifications = value;
            //           });
            //         },
            //       ),
            //       const Divider(height: 1),
            //       SwitchListTile(
            //         title: const Text("Email Notifications"),
            //         subtitle:
            //             const Text("Receive emails about important updates"),
            //         value: emailNotifications,
            //         activeColor: const Color(0xFF1C71AF),
            //         onChanged: (value) {
            //           setState(() {
            //             emailNotifications = value;
            //           });
            //         },
            //       ),
            //     ],
            //   ),
            // ),

            // const SizedBox(height: 24),

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

            // Help & Support
            Text(
              "Help & Support",
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
                    leading: const Icon(Icons.help_outline,
                        color: Color(0xFF1C71AF)),
                    title: const Text("FAQs"),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () {
                      // Navigate to FAQs
                    },
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.contact_support_outlined,
                        color: Color(0xFF1C71AF)),
                    title: const Text("Contact Support"),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () {
                      // Open contact support options
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
                    leading: const Icon(Icons.privacy_tip_outlined,
                        color: Color(0xFF1C71AF)),
                    title: const Text("Privacy Policy"),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () {
                      // Open privacy policy
                    },
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.description_outlined,
                        color: Color(0xFF1C71AF)),
                    title: const Text("Terms of Service"),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () {
                      // Open terms of service
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
