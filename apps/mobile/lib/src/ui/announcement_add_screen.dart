import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../controllers/announcement_controller.dart';

class AnnouncementAddScreen extends StatefulWidget {
  const AnnouncementAddScreen({super.key});

  @override
  State<AnnouncementAddScreen> createState() => _AnnouncementAddScreenState();
}

class _AnnouncementAddScreenState extends State<AnnouncementAddScreen> {
  final _titleCtrl = TextEditingController();
  final _bodyCtrl = TextEditingController();
  bool _archived = false;
  String _audience = 'all';

  @override
  Widget build(BuildContext context) {
    final announcementsController = context.watch<AnnouncementsController>();
    final isLoading = announcementsController.isLoading;

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          "Add Announcement",
          style: TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
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
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          children: [
            TextField(
              controller: _titleCtrl,
              decoration: InputDecoration(
                labelText: 'Title',
                labelStyle: const TextStyle(fontSize: 16),
                hintText: 'Enter announcement title',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
            ),
            const SizedBox(height: 16),

            TextField(
              controller: _bodyCtrl,
              minLines: 3,
              maxLines: 5,
              decoration: InputDecoration(
                labelText: 'Body',
                labelStyle: const TextStyle(fontSize: 16),
                hintText: 'Enter announcement details',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Archived checkbox
            Row(
              children: [
                Checkbox(
                  value: _archived,
                  onChanged: (checked) {
                    setState(() => _archived = checked ?? false);
                  },
                ),
                const Text('Archived?'),
              ],
            ),
            const SizedBox(height: 16),

            Row(
              children: [
                const Text('Audience:', style: TextStyle(fontSize: 16)),
                const SizedBox(width: 16),
                DropdownButton<String>(
                  value: _audience,
                  items: const [
                    DropdownMenuItem(value: 'all', child: Text('All')),
                    DropdownMenuItem(value: 'admins', child: Text('Admins')),
                    DropdownMenuItem(value: 'tutors', child: Text('Students')),
                    DropdownMenuItem(value: 'parents', child: Text('Parents')),
                  ],
                  onChanged: (value) {
                    setState(() => _audience = value ?? 'all');
                  },
                ),
              ],
            ),
            const SizedBox(height: 32),

            if (isLoading)
              const CircularProgressIndicator()
            else
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF1C71AF),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                  onPressed: () async {
                    final title = _titleCtrl.text.trim();
                    final body = _bodyCtrl.text.trim();

                    if (title.isEmpty || body.isEmpty) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text("Please fill out both Title and Body fields."),
                        ),
                      );
                      return;
                    }

                    await announcementsController.addAnnouncement(
                      title: title,
                      body: body,
                      archived: _archived,
                      audience: _audience,
                    );

                    if (!mounted) return;
                    Navigator.pop(context);
                  },
                  child: const Text(
                    'Add Announcement',
                    style: TextStyle(color: Colors.white, fontSize: 16),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _bodyCtrl.dispose();
    super.dispose();
  }
}