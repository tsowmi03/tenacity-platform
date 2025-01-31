import 'package:flutter/material.dart';

class HomeDashboard extends StatelessWidget {
  const HomeDashboard({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    // Placeholder data
    final String userName = "John Doe";
    final bool hasUnpaidInvoices = true;
    final int unreadMessages = 2;
    final String nextClass = "Maths (Tomorrow @ 4PM)";
    final String latestAnnouncement = "Holiday break next week!";

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Dashboard',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
        backgroundColor: Theme.of(context).primaryColorDark,
        elevation: 0,
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              "Welcome, $userName!",
              style: const TextStyle(fontSize: 26, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 20),
            _buildCard(Icons.calendar_today, "Next Class", nextClass, context),
            _buildCard(Icons.message, "Unread Messages", "$unreadMessages new messages", context),
            _buildCard(Icons.announcement, "Latest Announcement", latestAnnouncement, context),
            if (hasUnpaidInvoices) _buildCard(Icons.payment, "Unpaid Invoice", "You have pending payments", context),
          ],
        ),
      ),
    );
  }

  Widget _buildCard(IconData icon, String title, String subtitle, BuildContext context) {
    return GestureDetector(
      onTap: () {}, // TODO: Add navigation functionality later
      child: Card(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        margin: const EdgeInsets.symmetric(vertical: 10),
        elevation: 3,
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Row(
            children: [
              Icon(icon, size: 40, color: Theme.of(context).primaryColorDark),
              const SizedBox(width: 20),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 5),
                    Text(
                      subtitle,
                      style: const TextStyle(fontSize: 15, color: Colors.black54),
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