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
              child: Column(
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
            ),
          ),
        ),
      ),
      body: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 20.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildCard(Icons.calendar_today, "Next Class", nextClass),
            _buildCard(Icons.message, "Unread Messages", "$unreadMessages new messages"),
            _buildCard(Icons.announcement, "Latest Announcement", latestAnnouncement),
            if (hasUnpaidInvoices)
              _buildCard(Icons.payment, "Unpaid Invoice", "You have pending payments"),
          ],
        ),
      ),
    );
  }

  Widget _buildCard(IconData icon, String title, String subtitle) {
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
              Icon(icon, size: 36, color: const Color(0xFF1C71AF)),
              const SizedBox(width: 20),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      subtitle,
                      style: const TextStyle(fontSize: 14, color: Colors.black54),
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