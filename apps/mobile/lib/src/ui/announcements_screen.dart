import 'dart:developer'; // Add this for log()
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
    log('[AnnouncementsScreen] initState');
    WidgetsBinding.instance.addPostFrameCallback((_) {
      log('[AnnouncementsScreen] addPostFrameCallback: fetching announcements');
      _fetchAnnouncementsBasedOnUser();
    });
  }

  void _fetchAnnouncementsBasedOnUser() {
    log('[AnnouncementsScreen] _fetchAnnouncementsBasedOnUser called');
    final authCtrl = context.read<AuthController>();
    final announcementsCtrl = context.read<AnnouncementsController>();

    final user = authCtrl.currentUser;
    final userRole = user?.role.toLowerCase() ?? 'parent';
    log('[AnnouncementsScreen] userRole: $userRole');

    if (userRole == 'admin') {
      log('[AnnouncementsScreen] loading all announcements for admin');
      announcementsCtrl.loadAnnouncements(onlyActive: true, audienceFilter: []);
    } else {
      log('[AnnouncementsScreen] loading announcements for role: $userRole');
      announcementsCtrl.loadAnnouncements(
          onlyActive: true, audienceFilter: ['all', userRole]);
    }
  }

  @override
  Widget build(BuildContext context) {
    log('[AnnouncementsScreen] build called');
    final announcementsController = context.watch<AnnouncementsController>();
    final authController = context.watch<AuthController>();
    final announcements = announcementsController.announcements;
    final isLoading = announcementsController.isLoading;
    final user = authController.currentUser;
    final isAdmin = (user?.role ?? '').toLowerCase() == 'admin';

    log('[AnnouncementsScreen] isLoading: $isLoading, isAdmin: $isAdmin, announcements.length: ${announcements.length}');

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
      floatingActionButton: isAdmin
          ? FloatingActionButton(
              onPressed: () {
                log('[AnnouncementsScreen] FAB pressed');
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
                    log('[AnnouncementsScreen] building card for announcement at index $index');
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

    log('[AnnouncementsScreen] _buildAnnouncementCard: id=${announcement.id}, isAdmin=$isAdmin');

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
          log('[AnnouncementsScreen] confirmDismiss for id=${announcement.id}');
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
          log('[AnnouncementsScreen] confirmDismiss result: $shouldDelete');
          return shouldDelete == true;
        },
        onDismissed: (direction) {
          log('[AnnouncementsScreen] onDismissed for id=${announcement.id}');
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
    log('[AnnouncementsScreen] _buildListTile: id=${announcement.id}');
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
        trailing: Text(
          formattedDate,
          style: const TextStyle(color: Colors.grey, fontSize: 12),
        ),
        onTap: () {
          log('[AnnouncementsScreen] ListTile tapped: id=${announcement.id}');
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
