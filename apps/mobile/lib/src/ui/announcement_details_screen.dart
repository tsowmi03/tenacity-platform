import 'package:flutter/material.dart';
import 'package:flutter_linkify/flutter_linkify.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/announcement_controller.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/announcement_model.dart';

class AnnouncementDetailsScreen extends StatelessWidget {
  final String? announcementId;
  final Announcement? announcement;

  const AnnouncementDetailsScreen({
    super.key,
    this.announcementId,
    this.announcement,
  });

  @override
  Widget build(BuildContext context) {
    final userId = context.read<AuthController>().currentUser?.uid;

    // If an Announcement object was passed directly, just show it
    if (announcement != null) {
      if (userId != null) {
        context
            .read<AnnouncementsController>()
            .markAnnouncementAsRead(userId, announcement!.id);
      }
      return _buildView(context, announcement!);
    }
    // If we only have an ID, fetch it from controller
    else if (announcementId != null) {
      return FutureBuilder<Announcement?>(
        future: context
            .read<AnnouncementsController>()
            .fetchAnnouncementById(announcementId!),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Scaffold(
              body: Center(child: CircularProgressIndicator()),
            );
          } else if (snapshot.hasError) {
            return Scaffold(
              body: Center(child: Text('Error: ${snapshot.error}')),
            );
          } else if (!snapshot.hasData || snapshot.data == null) {
            return const Scaffold(
              body: Center(child: Text('Announcement not found')),
            );
          } else {
            if (userId != null) {
              context
                  .read<AnnouncementsController>()
                  .markAnnouncementAsRead(userId, snapshot.data!.id);
            }
            return _buildView(context, snapshot.data!);
          }
        },
      );
    }
    // No ID, no object => can't display anything
    else {
      return const Scaffold(
        body: Center(child: Text('No announcement provided')),
      );
    }
  }

  Widget _buildView(BuildContext context, Announcement announcement) {
    final dateFormat = DateFormat('dd-MM-yyyy');
    final formattedDate = dateFormat.format(announcement.createdAt);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          announcement.title,
          style: const TextStyle(
              fontWeight: FontWeight.bold, fontSize: 20, color: Colors.white),
        ),
        centerTitle: false,
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
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      backgroundColor: const Color(0xFFF6F9FC),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Card(
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                elevation: 2,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Linkify text to auto-detect links
                      Linkify(
                        onOpen: (link) async {
                          final Uri url = Uri.parse(link.url);
                          if (await canLaunchUrl(url)) {
                            await launchUrl(url,
                                mode: LaunchMode.externalApplication);
                          } else {
                            throw 'Could not launch $url';
                          }
                        },
                        text: announcement.body,
                        style: const TextStyle(fontSize: 16, height: 1.5),
                        linkStyle: const TextStyle(color: Colors.blue),
                      ),
                      const SizedBox(height: 16),
                      Align(
                        alignment: Alignment.centerRight,
                        child: Text(
                          'Posted on: $formattedDate',
                          style: const TextStyle(
                            color: Colors.grey,
                            fontStyle: FontStyle.italic,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
