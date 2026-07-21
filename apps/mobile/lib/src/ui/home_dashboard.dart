import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/announcement_controller.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/chat_controller.dart';
import 'package:tenacity/src/controllers/invoice_controller.dart';
import 'package:tenacity/src/controllers/timetable_controller.dart';
import 'package:tenacity/src/helpers/student_feedback_expandsion_card.dart';
import 'package:tenacity/src/ui/admin_create_invoice_screen.dart';
import 'package:tenacity/src/ui/dashboard/tutor_dashboard_data.dart';
import 'package:tenacity/src/ui/dashboard/tutor_dashboard_view.dart';
import 'package:tenacity/src/ui/home_screen.dart';
import 'package:tenacity/src/ui/profile_screen.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

class HomeDashboard extends StatelessWidget {
  final void Function(DashboardDestination) onCardTapped;

  const HomeDashboard({super.key, required this.onCardTapped});

  @override
  Widget build(BuildContext context) {
    final authController = context.watch<AuthController>();
    final currentUser = authController.currentUser;

    if (currentUser?.role == 'tutor') {
      return _TutorDashboard(
        tutorId: currentUser!.uid,
        tutorName: currentUser.firstName,
        onCardTapped: onCardTapped,
      );
    }

    final timetableController = context.watch<TimetableController>();
    final chatController = context.watch<ChatController>();
    final announcementsController = context.watch<AnnouncementsController>();
    final invoiceController = context.watch<InvoiceController>();

    final userName = currentUser?.firstName ?? "User";

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
              padding:
                  const EdgeInsets.symmetric(horizontal: 20.0, vertical: 15.0),
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
                  IconButton(
                    icon: const Icon(Icons.account_circle_rounded,
                        color: Colors.white, size: 50),
                    tooltip: "Profile",
                    onPressed: () {
                      Navigator.of(context).push(
                        MaterialPageRoute(
                            builder: (_) => const ProfileScreen()),
                      );
                    },
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
      body: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 20.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 1) Next Class
              FutureBuilder<String>(
                future:
                    timetableController.getUpcomingClassTextForUser(context),
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
                      onCardTapped(DashboardDestination.classes);
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
                      onCardTapped(DashboardDestination.messages);
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
                      title: "Announcements",
                      subtitle: "Loading...",
                      onTap: () {},
                    );
                  }
                  if (snapshot.hasError) {
                    return _buildCard(
                      icon: Icons.announcement,
                      title: "Announcements",
                      subtitle: "Error loading",
                      onTap: () {},
                    );
                  }
                  final announcementText =
                      snapshot.data ?? "No announcements yet";
                  return _buildCard(
                    icon: Icons.announcement,
                    title: "Announcements",
                    subtitle: announcementText,
                    onTap: () {
                      onCardTapped(DashboardDestination.announcements);
                    },
                  );
                },
              ),

              if (authController.currentUser?.role == 'parent')
                StudentFeedbackExpansionCard(),

              // 4) Unpaid Invoice
              if (authController.currentUser?.role == 'parent')
                FutureBuilder<bool>(
                  future: invoiceController.hasUnpaidInvoices(currentUser!.uid),
                  builder: (context, snapshot) {
                    if (snapshot.connectionState == ConnectionState.waiting) {
                      return const SizedBox();
                    }
                    if (snapshot.hasError) {
                      return const SizedBox();
                    }
                    if (snapshot.hasData && snapshot.data == true) {
                      return _buildCard(
                        icon: Icons.payment,
                        title: "Unpaid Invoice",
                        subtitle: "You have pending payments",
                        onTap: () {
                          onCardTapped(DashboardDestination.invoices);
                        },
                      );
                    }
                    // If there are no unpaid invoices, display "Invoices paid!"
                    return _buildCard(
                      icon: Icons.check_circle,
                      title: "Invoices paid!",
                      subtitle: "All your invoices are paid.",
                      onTap: () {
                        onCardTapped(DashboardDestination.invoices);
                      },
                    );
                  },
                ),

              if (authController.currentUser?.role == 'admin')
                _buildCard(
                  icon: Icons.payment,
                  title: "Create Invoice",
                  subtitle: "Create an invoice",
                  onTap: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (context) => const AdminCreateInvoiceScreen(),
                      ),
                    );
                  },
                ),
            ],
          ),
        ),
      ),
    );
  }

  /// Helper method to fetch just the 'title' (or combined text) of the latest announcement
  Future<String> _fetchLatestAnnouncementText(
      AnnouncementsController controller) async {
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

class _TutorDashboard extends StatefulWidget {
  final String tutorId;
  final String tutorName;
  final void Function(DashboardDestination) onCardTapped;

  const _TutorDashboard({
    required this.tutorId,
    required this.tutorName,
    required this.onCardTapped,
  });

  @override
  State<_TutorDashboard> createState() => _TutorDashboardState();
}

class _TutorDashboardState extends State<_TutorDashboard> {
  Future<TutorDashboardViewData>? _dashboardFuture;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _dashboardFuture ??= _loadDashboard();
  }

  @override
  void didUpdateWidget(covariant _TutorDashboard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.tutorId != widget.tutorId) {
      _dashboardFuture = _loadDashboard();
    }
  }

  Future<TutorDashboardViewData> _loadDashboard({bool force = false}) async {
    final timetableController = context.read<TimetableController>();
    final chatController = context.read<ChatController>();
    final announcementsController = context.read<AnnouncementsController>();

    final unreadFuture = chatController.getUnreadCount();
    final announcementsFuture = announcementsController.loadAnnouncements(
      onlyActive: true,
      audienceFilter: const ['all', 'tutor'],
      forceReload: force,
    );

    if (force || timetableController.activeTerm == null) {
      await timetableController.loadActiveTerm(silent: true);
    }
    if (force || timetableController.allClasses.isEmpty) {
      await timetableController.loadAllClasses(silent: true);
    }
    final activeTerm = timetableController.activeTerm;
    final expectedAttendanceDocId = activeTerm == null
        ? null
        : '${activeTerm.id}_W${timetableController.currentWeek}';
    if (activeTerm != null &&
        (force ||
            timetableController.loadedAttendanceDocId !=
                expectedAttendanceDocId)) {
      await timetableController.loadAttendanceForWeek(silent: true);
    }

    final unreadMessages = await unreadFuture;
    await announcementsFuture;
    final announcements = announcementsController.announcements;

    return buildTutorDashboardViewData(
      tutorId: widget.tutorId,
      tutorName: widget.tutorName,
      now: DateTime.now(),
      activeTerm: timetableController.activeTerm,
      currentWeek: timetableController.currentWeek,
      classes: timetableController.allClasses,
      attendanceByClass: timetableController.attendanceByClass,
      unreadMessages: unreadMessages,
      latestAnnouncement: announcements.isEmpty ? null : announcements.first,
    );
  }

  Future<void> _refresh() async {
    final future = _loadDashboard(force: true);
    setState(() => _dashboardFuture = future);
    await future;
  }

  void _openClasses() {
    widget.onCardTapped(DashboardDestination.classes);
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<TutorDashboardViewData>(
      future: _dashboardFuture,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return ColoredBox(
            color: AppColors.ink,
            child: SafeArea(
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(
                        Icons.cloud_off_outlined,
                        size: 38,
                        color: Colors.white70,
                      ),
                      const SizedBox(height: 12),
                      Text(
                        'Dashboard unavailable',
                        style: AppText.display(
                          fontSize: 20,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Check your connection and try again.',
                        textAlign: TextAlign.center,
                        style: AppText.body(
                          fontSize: 14,
                          color: Colors.white70,
                        ),
                      ),
                      const SizedBox(height: 18),
                      FilledButton(
                        onPressed: _refresh,
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.blue,
                        ),
                        child: const Text('Try again'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          );
        }

        final data = snapshot.data;
        if (data == null) {
          return const ColoredBox(
            color: AppColors.ink,
            child: SafeArea(
              child: Center(
                child: CircularProgressIndicator(color: AppColors.blue300),
              ),
            ),
          );
        }

        return TutorDashboardView(
          data: data,
          onRefresh: _refresh,
          onOpenClasses: _openClasses,
          onOpenMessages: () =>
              widget.onCardTapped(DashboardDestination.messages),
          onOpenAnnouncements: () =>
              widget.onCardTapped(DashboardDestination.announcements),
          onOpenProfile: () {
            Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const ProfileScreen()),
            );
          },
        );
      },
    );
  }
}
