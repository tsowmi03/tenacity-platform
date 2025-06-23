import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/announcement_controller.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/ui/announcement_add_screen.dart';
import 'package:tenacity/src/ui/announcement_details_screen.dart';
import '../models/announcement_model.dart';

class AnnouncementsScreen extends StatefulWidget {
  const AnnouncementsScreen({super.key});

  @override
  State<AnnouncementsScreen> createState() => _AnnouncementsScreenState();
}

class _AnnouncementsScreenState extends State<AnnouncementsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _fetchAnnouncementsBasedOnUser();
    });
  }

  void _fetchAnnouncementsBasedOnUser() {
    final authCtrl = context.read<AuthController>();
    final announcementsCtrl = context.read<AnnouncementsController>();

    final user = authCtrl.currentUser;
    final userRole = user?.role.toLowerCase() ?? 'parent';

    if (userRole == 'admin') {
      announcementsCtrl.loadAnnouncements(onlyActive: true, audienceFilter: []);
    } else {
      announcementsCtrl.loadAnnouncements(
          onlyActive: true, audienceFilter: ['all', userRole]);
    }
  }

  @override
  Widget build(BuildContext context) {
    final announcementsController = context.watch<AnnouncementsController>();
    final authController = context.watch<AuthController>();
    final announcements = announcementsController.announcements;
    final isLoading = announcementsController.isLoading;
    final user = authController.currentUser;
    final isAdmin = (user?.role ?? '').toLowerCase() == 'admin';

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          "Announcements",
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

      // Show FAB only if user is admin
      floatingActionButton: isAdmin
          ? FloatingActionButton(
              onPressed: () {
                // Navigate to a page that has a form for adding an announcement
                Navigator.push(
                  context,
                  MaterialPageRoute(
                      builder: (_) => const AnnouncementAddScreen()),
                );
              },
              backgroundColor: const Color(0xFF1C71AF),
              child: const Icon(Icons.add, color: Colors.white),
            )
          : null,

      body: isLoading
          ? const Center(child: CircularProgressIndicator())
          : announcements.isEmpty
              ? const Center(child: Text('No announcements available'))
              : ListView.builder(
                  itemCount: announcements.length,
                  itemBuilder: (context, index) {
                    final ann = announcements[index];
                    return _buildAnnouncementCard(context,
                        announcement: ann, isAdmin: isAdmin);
                  },
                ),
    );
  }

  Widget _buildAnnouncementCard(
    BuildContext context, {
    required Announcement announcement,
    required bool isAdmin,
  }) {
    final formattedDate =
        DateFormat('dd-MM-yyyy h:mm a').format(announcement.createdAt);

    // If admin => wrap in Dismissible. If not => just a regular card/tile.
    if (isAdmin) {
      return Dismissible(
        key: Key(announcement.id),
        direction: DismissDirection.endToStart,
        background: Container(
          color: Colors.red,
          alignment: Alignment.centerRight,
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: const Icon(Icons.delete, color: Colors.white),
        ),
        confirmDismiss: (direction) async {
          final bool? shouldDelete = await showDialog<bool>(
            context: context,
            builder: (ctx) => AlertDialog(
              content: const Text('Are you sure you want to delete?'),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx, true),
                  child: const Text("Yes"),
                ),
                TextButton(
                  onPressed: () => Navigator.pop(ctx, false),
                  child: const Text("No"),
                ),
              ],
            ),
          );
          return shouldDelete == true;
        },
        onDismissed: (direction) {
          context
              .read<AnnouncementsController>()
              .deleteAnnouncement(announcement.id);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('"${announcement.title}" deleted')),
          );
        },
        child: _buildListTile(context, announcement, formattedDate),
      );
    } else {
      return _buildListTile(context, announcement, formattedDate);
    }
  }

  Widget _buildListTile(
      BuildContext context, Announcement announcement, String formattedDate) {
    // Split formattedDate into time and date
    final dateTime = announcement.createdAt;
    final formattedTime = DateFormat('h:mm a').format(dateTime);
    final formattedDay = DateFormat('dd-MM-yyyy').format(dateTime);

    return Card(
      elevation: 2,
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      child: ListTile(
        leading:
            const Icon(Icons.announcement, color: Color(0xFF1C71AF), size: 30),
        title: Text(
          announcement.title,
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
        subtitle: Text(
          announcement.body,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.center, // Center horizontally
          children: [
            Text(
              formattedTime,
              style: const TextStyle(color: Colors.grey, fontSize: 12),
            ),
            Text(
              formattedDay,
              style: const TextStyle(color: Colors.grey, fontSize: 12),
            ),
          ],
        ),
        onTap: () {
          Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) =>
                  AnnouncementDetailsScreen(announcement: announcement),
            ),
          );
        },
      ),
    );
  }
}
