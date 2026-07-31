import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/announcement_controller.dart';
import 'package:tenacity/src/helpers/offline_action_guard.dart';
import 'package:tenacity/src/models/announcement_model.dart';
import 'package:tenacity/src/ui/announcements/announcement_editor_data.dart';
import 'package:tenacity/src/ui/announcements/announcement_editor_view.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

class AnnouncementAddScreen extends StatelessWidget {
  final Announcement? announcement;

  const AnnouncementAddScreen({super.key, this.announcement});

  Future<void> _save(
    BuildContext context,
    AnnouncementDraft draft,
  ) async {
    final controller = context.read<AnnouncementsController>();
    final navigator = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final isEditing = announcement != null;

    if (!await OfflineActionGuard.ensureOnline(
      context,
      action: isEditing ? 'save this announcement' : 'create an announcement',
    )) {
      return;
    }
    if (!context.mounted) return;

    try {
      final saved = isEditing
          ? await controller.updateAnnouncement(
              announcement: announcement!,
              title: draft.title,
              body: draft.body,
              archived: draft.archived,
              audience: draft.audience,
            )
          : await controller.addAnnouncement(
              title: draft.title,
              body: draft.body,
              archived: draft.archived,
              audience: draft.audience,
            );

      if (!context.mounted) return;
      navigator.pop(saved);
    } catch (_) {
      if (!context.mounted) return;
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            isEditing
                ? 'The announcement could not be saved.'
                : 'The announcement could not be created.',
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final isSaving = context.watch<AnnouncementsController>().isLoading;
    final value = announcement;

    return Scaffold(
      backgroundColor: AppColors.ink,
      body: AnnouncementEditorView(
        initialValue: AnnouncementDraft(
          title: value?.title ?? '',
          body: value?.body ?? '',
          audience: value?.audience ?? 'all',
          archived: value?.archived ?? false,
        ),
        isEditing: value != null,
        isSaving: isSaving,
        onCancel: () => Navigator.of(context).maybePop(),
        onSubmit: (draft) => _save(context, draft),
      ),
    );
  }
}
