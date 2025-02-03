import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

class AnnouncementsScreen extends StatelessWidget {
  const AnnouncementsScreen({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final bool isAdmin = true; // Placeholder (change as needed)

    // ✅ Placeholder announcements (Static Data)
    final List<Map<String, dynamic>> announcements = [
      {
        "id": "1",
        "title": "Holiday Schedule Update",
        "body": "Classes will resume on July 15 after the winter break.",
        "date": DateTime(2025, 1, 20, 14, 30),
      },
      {
        "id": "2",
        "title": "New Tutoring Slots Available",
        "body": "We’ve added new tutoring slots for Year 10 and 11 students.",
        "date": DateTime(2025, 1, 18, 10, 0),
      },
      {
        "id": "3",
        "title": "Important Payment Reminder",
        "body": "Please ensure your invoices are paid before the end of the month.",
        "date": DateTime(2025, 1, 15, 9, 45),
      },
    ];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Announcements'),
        centerTitle: true,
      ),
      body: announcements.isEmpty
          ? const Center(child: Text('No announcements available'))
          : ListView.separated(
              separatorBuilder: (context, index) => const Divider(),
              itemCount: announcements.length,
              itemBuilder: (context, index) {
                final announcement = announcements[index];
                final formattedDate = DateFormat('yyyy-MM-dd HH:mm').format(announcement["date"]);

                return isAdmin
                    ? Dismissible(
                        key: Key(announcement["id"]),
                        direction: DismissDirection.endToStart,
                        background: Container(
                          color: Colors.red,
                          alignment: Alignment.centerRight,
                          padding: const EdgeInsets.symmetric(horizontal: 20),
                          child: const Icon(Icons.delete, color: Colors.white),
                        ),
                        onDismissed: (direction) {
                          // Placeholder: No delete function yet
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('Announcement "${announcement["title"]}" deleted')),
                          );
                        },
                        child: _buildAnnouncementTile(announcement, formattedDate, context),
                      )
                    : _buildAnnouncementTile(announcement, formattedDate, context);
              },
            ),
      floatingActionButton: isAdmin
          ? FloatingActionButton(
              onPressed: () {
                // Navigator.push(
                //   context,
                //   MaterialPageRoute(builder: (context) => const AnnouncementAddView()),
                // );
              },
              backgroundColor: Theme.of(context).primaryColor,
              child: const Icon(Icons.add, color: Colors.white),
            )
          : null,
    );
  }

  Widget _buildAnnouncementTile(Map<String, dynamic> announcement, String formattedDate, BuildContext context) {
    return ListTile(
      leading: const Icon(Icons.announcement, size: 36),
      title: Text(
        announcement["title"],
        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
      ),
      subtitle: Text(
        announcement["body"],
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
      ),
      trailing: Text(
        formattedDate,
        style: const TextStyle(color: Colors.grey, fontSize: 12),
      ),
      onTap: () {
        // Navigator.push(
        //   context,
        //   MaterialPageRoute(
        //     builder: (context) => AnnouncementDetailsView(announcement: announcement),
        //   ),
        // );
      },
    );
  }
}