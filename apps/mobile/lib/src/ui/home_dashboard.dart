import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/announcement_controller.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/chat_controller.dart';
import 'package:tenacity/src/controllers/timetable_controller.dart';

class HomeDashboard extends StatelessWidget {
  final void Function(int) onCardTapped;

  const HomeDashboard({super.key, required this.onCardTapped});

  @override
  Widget build(BuildContext context) {
    final authController = context.watch<AuthController>();
    final timetableController = context.watch<TimetableController>();
    final chatController = context.watch<ChatController>();
    final announcementsController = context.watch<AnnouncementsController>();

    final currentUser = authController.currentUser;
    final userName = currentUser?.firstName ?? "User";

    // Ignore invoice logic for now. 
    final hasUnpaidInvoices = true;

    return Scaffold(
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(106),
        child: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              colors: [Color(0xFF1C71AF), Color(0xFF1B3F71)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
          ),
          child: SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 15.0),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        "Dashboard",
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 26,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        "Welcome, $userName!",
                        style: const TextStyle(
                          color: Colors.white70,
                          fontSize: 20,
                          fontWeight: FontWeight.w400,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
      body: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 20.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 1) Next Class
            FutureBuilder<String>(
              future: timetableController.getUpcomingClassTextForParent(context),
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return _buildCard(
                    icon: Icons.school,
                    title: "Next Class",
                    subtitle: "Loading...",
                    onTap: () {},
                  );
                }
                if (snapshot.hasError) {
                  return _buildCard(
                    icon: Icons.school,
                    title: "Next Class",
                    subtitle: "Error loading",
                    onTap: () {},
                  );
                }
                final nextClassLabel = snapshot.data ?? "No upcoming class";
                return _buildCard(
                  icon: Icons.school,
                  title: "Next Class",
                  subtitle: nextClassLabel,
                  onTap: () {
                    onCardTapped(1);
                  },
                );
              },
            ),

            // 2) Unread Messages
            FutureBuilder<int>(
              future: chatController.getUnreadCount(),
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return _buildCard(
                    icon: Icons.message,
                    title: "Unread Messages",
                    subtitle: "Loading...",
                    onTap: () {},
                  );
                }
                if (snapshot.hasError) {
                  return _buildCard(
                    icon: Icons.message,
                    title: "Unread Messages",
                    subtitle: "Error loading",
                    onTap: () {},
                  );
                }
                final unreadCount = snapshot.data ?? 0;
                final messageSubtitle = "$unreadCount new messages";
                return _buildCard(
                  icon: Icons.message,
                  title: "Unread Messages",
                  subtitle: messageSubtitle,
                  onTap: () {
                    onCardTapped(3);
                  },
                );
              },
            ),

            // 3) Latest Announcement
            FutureBuilder<String>(
              future: _fetchLatestAnnouncementText(announcementsController),
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return _buildCard(
                    icon: Icons.announcement,
                    title: "Latest Announcement",
                    subtitle: "Loading...",
                    onTap: () {},
                  );
                }
                if (snapshot.hasError) {
                  return _buildCard(
                    icon: Icons.announcement,
                    title: "Latest Announcement",
                    subtitle: "Error loading",
                    onTap: () {},
                  );
                }
                final announcementText = snapshot.data ?? "No announcements yet";
                return _buildCard(
                  icon: Icons.announcement,
                  title: "Latest Announcement",
                  subtitle: announcementText,
                  onTap: () {
                    onCardTapped(2);
                  },
                );
              },
            ),

            // 4) Unpaid Invoice (Placeholder)
            if (hasUnpaidInvoices)
              _buildCard(
                icon: Icons.payment,
                title: "Unpaid Invoice",
                subtitle: "You have pending payments",
                onTap: () {
                  onCardTapped(4);
                },
              ),
          ],
        ),
      ),
    );
  }

  /// Helper method to fetch just the 'title' (or combined text) of the latest announcement
  Future<String> _fetchLatestAnnouncementText(AnnouncementsController controller) async {
    final latest = await controller.fetchSingleLatest();
    if (latest == null) {
      return "No announcements found";
    }
    // Combine title/body or just do title
    return latest.title; // e.g. "Holiday break next week!"
  }

  Widget _buildCard({
    required IconData icon,
    required String title,
    required String subtitle,
    VoidCallback? onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Card(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        margin: const EdgeInsets.symmetric(vertical: 10),
        elevation: 3,
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Row(
            children: [
              Icon(icon, size: 36, color: const Color(0xFF1C71AF)),
              const SizedBox(width: 20),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontSize: 18, 
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        fontSize: 14, 
                        color: Colors.black54,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.arrow_forward_ios, size: 16, color: Colors.grey),
            ],
          ),
        ),
      ),
    );
  }
}
