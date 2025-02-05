import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/announcement_controller.dart';
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
      context.read<AnnouncementsController>().loadAnnouncements();
    });
  }

  @override
  Widget build(BuildContext context) {
    final announcementsController = context.watch<AnnouncementsController>();
    final announcements = announcementsController.announcements;
    final isLoading = announcementsController.isLoading;

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

      body: isLoading
          ? const Center(child: CircularProgressIndicator())
          : announcements.isEmpty
              ? const Center(child: Text('No announcements available'))
              : ListView.builder(
                  itemCount: announcements.length,
                  itemBuilder: (context, index) {
                    final ann = announcements[index];
                    return _buildAnnouncementCard(ann);
                  },
                ),
    );
  }

  Widget _buildAnnouncementCard(Announcement announcement) {
    final formattedDate = DateFormat('dd-MM-yyyy HH:mm').format(announcement.createdAt);

    return Card(
      elevation: 2,
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      child: ListTile(
        leading: const Icon(Icons.announcement, color: Color(0xFF1C71AF), size: 30),
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
          // If you want a details page, navigate to it:
          // Navigator.of(context).push(MaterialPageRoute(
          //   builder: (_) => AnnouncementDetailsScreen(announcement: announcement),
          // ));
        },
      ),
    );
  }
}
