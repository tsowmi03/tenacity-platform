import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/announcement_controller.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/helpers/offline_action_guard.dart';
import 'package:tenacity/src/models/announcement_model.dart';
import 'package:tenacity/src/ui/announcement_add_screen.dart';
import 'package:tenacity/src/ui/announcements/announcement_detail_view.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:tenacity/src/utils/error_presenter.dart';

class AnnouncementDetailsScreen extends StatefulWidget {
  final String? announcementId;
  final Announcement? announcement;

  const AnnouncementDetailsScreen({
    super.key,
    this.announcementId,
    this.announcement,
  });

  @override
  State<AnnouncementDetailsScreen> createState() =>
      _AnnouncementDetailsScreenState();
}

class _AnnouncementDetailsScreenState extends State<AnnouncementDetailsScreen> {
  Announcement? _announcement;
  bool _isLoading = false;
  bool _isActing = false;
  bool _didMarkRead = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _announcement = widget.announcement;
    if (_announcement == null && widget.announcementId != null) {
      _load();
    } else if (_announcement == null) {
      _errorMessage = 'No announcement was provided.';
    }
    WidgetsBinding.instance.addPostFrameCallback((_) => _markRead());
  }

  Future<void> _load() async {
    final id = widget.announcementId;
    if (id == null) return;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final value = await context
          .read<AnnouncementsController>()
          .fetchAnnouncementById(id);
      if (!mounted) return;
      setState(() {
        _announcement = value;
        _errorMessage =
            value == null ? 'This announcement is no longer available.' : null;
      });
      await _markRead();
    } catch (error, stackTrace) {
      if (!mounted) return;
      // Sits under the 'Announcement unavailable' heading, so the reason alone.
      final presented = presentError(
        error,
        action: 'load this announcement',
        operation: Operation.read,
        stackTrace: stackTrace,
      );
      setState(() {
        _errorMessage = presented.reason;
      });
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _markRead() async {
    final announcement = _announcement;
    if (_didMarkRead || announcement == null || !mounted) return;

    final authController = context.read<AuthController>();
    final user = authController.currentUser;
    if (user == null || user.readAnnouncements.contains(announcement.id)) {
      _didMarkRead = true;
      return;
    }

    _didMarkRead = true;
    try {
      await authController.markAnnouncementAsRead(announcement.id);
    } catch (_) {
      // Reading the notice must not be blocked by a receipt write. A later
      // open can retry because the local user was not updated on failure.
      _didMarkRead = false;
    }
  }

  Future<void> _openLink(String rawUrl) async {
    final messenger = ScaffoldMessenger.of(context);
    final uri = Uri.tryParse(rawUrl);
    var opened = false;
    try {
      opened = uri != null &&
          await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      opened = false;
    }
    if (!mounted) return;
    if (!opened) {
      messenger.showSnackBar(
        const SnackBar(content: Text('That link could not be opened.')),
      );
    }
  }

  Future<void> _edit() async {
    final current = _announcement;
    if (current == null) return;

    final updated = await Navigator.of(context).push<Announcement>(
      MaterialPageRoute(
        builder: (_) => AnnouncementAddScreen(announcement: current),
      ),
    );
    if (updated != null && mounted) {
      setState(() => _announcement = updated);
    }
  }

  Future<void> _toggleArchive() async {
    final current = _announcement;
    if (current == null) return;

    final willArchive = !current.archived;
    final verb = willArchive ? 'Archive' : 'Restore';
    final confirmed = await showAppConfirmationSheet(
      context: context,
      title: '$verb this announcement?',
      message: willArchive
          ? 'It will disappear from parent and tutor feeds.'
          : 'It will return to the selected audience immediately.',
      confirmLabel: verb,
    );
    if (!confirmed || !mounted) return;

    if (!await OfflineActionGuard.ensureOnline(
      context,
      action: '${willArchive ? 'archive' : 'restore'} this announcement',
    )) {
      return;
    }
    if (!mounted) return;

    setState(() => _isActing = true);
    try {
      final updated =
          await context.read<AnnouncementsController>().setAnnouncementArchived(
                announcement: current,
                archived: willArchive,
              );
      if (!mounted) return;
      setState(() => _announcement = updated);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            willArchive ? 'Announcement archived.' : 'Announcement restored.',
          ),
        ),
      );
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              willArchive
                  ? 'The announcement was not archived.'
                  : 'The announcement was not restored.',
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isActing = false);
    }
  }

  Future<void> _delete() async {
    final current = _announcement;
    if (current == null) return;

    final confirmed = await showAppConfirmationSheet(
      context: context,
      title: 'Delete this announcement?',
      message: '"${current.title}" will be permanently removed. '
          'This cannot be undone.',
      confirmLabel: 'Delete',
      tone: AppConfirmationTone.destructive,
    );
    if (!confirmed || !mounted) return;

    if (!await OfflineActionGuard.ensureOnline(
      context,
      action: 'delete this announcement',
    )) {
      return;
    }
    if (!mounted) return;

    final navigator = Navigator.of(context);
    setState(() => _isActing = true);
    try {
      await context
          .read<AnnouncementsController>()
          .deleteAnnouncement(current.id);
      if (mounted) navigator.pop(true);
    } catch (_) {
      if (!mounted) return;
      setState(() => _isActing = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('The announcement was not deleted.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final announcement = _announcement;
    final isAdmin =
        context.watch<AuthController>().currentUser?.role.toLowerCase() ==
            'admin';

    if (announcement == null) {
      return _AnnouncementDetailState(
        isLoading: _isLoading,
        message: _errorMessage,
        onBack: () => Navigator.of(context).maybePop(),
        onRetry: widget.announcementId == null ? null : _load,
      );
    }

    return Scaffold(
      backgroundColor: AppColors.ink,
      body: IgnorePointer(
        ignoring: _isActing,
        child: AnnouncementDetailView(
          announcement: announcement,
          isAdmin: isAdmin,
          onBack: () => Navigator.of(context).maybePop(),
          onOpenLink: _openLink,
          onEdit: isAdmin && !_isActing ? _edit : null,
          onArchiveToggle: isAdmin && !_isActing ? _toggleArchive : null,
          onDelete: isAdmin && !_isActing ? _delete : null,
        ),
      ),
    );
  }
}

class _AnnouncementDetailState extends StatelessWidget {
  final bool isLoading;
  final String? message;
  final VoidCallback onBack;
  final VoidCallback? onRetry;

  const _AnnouncementDetailState({
    required this.isLoading,
    required this.message,
    required this.onBack,
    required this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.ink,
      body: Material(
        color: AppColors.ink,
        child: SafeArea(
          bottom: false,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.md,
                  AppSpacing.sm,
                  AppSpacing.screenH,
                  AppSpacing.xl,
                ),
                child: Row(
                  children: [
                    IconButton(
                      tooltip: 'Back',
                      onPressed: onBack,
                      color: Colors.white,
                      icon: const Icon(Icons.arrow_back_rounded),
                    ),
                    const SizedBox(width: AppSpacing.xs),
                    Expanded(
                      child: Text(
                        'Announcement',
                        style:
                            AppText.display(fontSize: 25, color: Colors.white),
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: ContentSheet.fixed(
                  // The skeleton is top-aligned like the article it stands in
                  // for; only the error state is centred.
                  child: isLoading
                      ? const ProseSkeleton(key: Key('announcement-loading'))
                      : Center(
                          child: ErrorStateView(
                            title: 'Announcement unavailable',
                            message: message,
                            onRetry: onRetry,
                          ),
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
