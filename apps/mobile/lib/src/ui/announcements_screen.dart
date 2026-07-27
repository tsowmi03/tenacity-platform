import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/announcement_controller.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/helpers/offline_action_guard.dart';
import 'package:tenacity/src/models/announcement_model.dart';
import 'package:tenacity/src/ui/announcement_add_screen.dart';
import 'package:tenacity/src/ui/announcement_details_screen.dart';
import 'package:tenacity/src/ui/announcements/announcement_data.dart';
import 'package:tenacity/src/ui/announcements/announcement_list_view.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

class AnnouncementsScreen extends StatefulWidget {
  const AnnouncementsScreen({super.key});

  @override
  State<AnnouncementsScreen> createState() => _AnnouncementsScreenState();
}

class _AnnouncementsScreenState extends State<AnnouncementsScreen> {
  AnnouncementAudienceFilter _audienceFilter = AnnouncementAudienceFilter.all;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load({bool forceReload = false}) async {
    if (!mounted) return;

    final user = context.read<AuthController>().currentUser;
    if (user == null) return;

    final isAdmin = user.role.toLowerCase() == 'admin';
    try {
      await context.read<AnnouncementsController>().loadAnnouncements(
            onlyActive: !isAdmin,
            audienceFilter:
                isAdmin ? const [] : ['all', user.role.toLowerCase()],
            forceReload: forceReload,
          );
    } catch (_) {
      // The controller keeps a user-safe error for the state surface.
    }
  }

  Future<bool> _confirmDelete(Announcement announcement) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete this announcement?'),
        content: Text(
          '"${announcement.title}" will be permanently removed. '
          'This cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            style: TextButton.styleFrom(foregroundColor: AppColors.danger),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return false;
    if (!await OfflineActionGuard.ensureOnline(
      context,
      action: 'delete this announcement',
    )) {
      return false;
    }
    if (!mounted) return false;

    try {
      await context
          .read<AnnouncementsController>()
          .deleteAnnouncement(announcement.id);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('The announcement was not deleted.')),
        );
      }
      return false;
    }

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('"${announcement.title}" deleted')),
      );
    }
    return true;
  }

  void _openAnnouncement(Announcement announcement) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => AnnouncementDetailsScreen(announcement: announcement),
      ),
    );
  }

  Future<void> _openComposer() async {
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const AnnouncementAddScreen()),
    );
    if (mounted) await _load(forceReload: true);
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<AnnouncementsController>();
    final user = context.watch<AuthController>().currentUser;
    final role = user?.role.toLowerCase() ?? 'parent';
    final isAdmin = role == 'admin';

    final data = buildAnnouncementListViewData(
      announcements: controller.announcements,
      role: role,
      readAnnouncementIds: user?.readAnnouncements.toSet() ?? const <String>{},
      audienceFilter: _audienceFilter,
    );

    return Scaffold(
      backgroundColor: AppColors.ink,
      body: AnnouncementListView(
        data: data,
        isLoading: controller.isLoading,
        errorMessage: controller.errorMessage,
        onRefresh: () => _load(forceReload: true),
        onRetry: () => _load(forceReload: true),
        onFilterSelected: (index) {
          setState(() {
            _audienceFilter = AnnouncementAudienceFilter.values[index];
          });
        },
        onOpen: _openAnnouncement,
        onAdd: isAdmin ? _openComposer : null,
        onConfirmDelete: isAdmin ? _confirmDelete : null,
      ),
    );
  }
}
