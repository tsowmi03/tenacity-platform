import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/announcements/announcement_editor_data.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

class AnnouncementEditorView extends StatefulWidget {
  final AnnouncementDraft initialValue;
  final bool isEditing;
  final bool isSaving;
  final VoidCallback onCancel;
  final Future<void> Function(AnnouncementDraft draft) onSubmit;

  const AnnouncementEditorView({
    super.key,
    required this.initialValue,
    required this.isEditing,
    required this.isSaving,
    required this.onCancel,
    required this.onSubmit,
  });

  @override
  State<AnnouncementEditorView> createState() => _AnnouncementEditorViewState();
}

class _AnnouncementEditorViewState extends State<AnnouncementEditorView> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _titleController;
  late final TextEditingController _bodyController;
  late String _audience;
  late bool _publishImmediately;
  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    _titleController = TextEditingController(text: widget.initialValue.title);
    _bodyController = TextEditingController(text: widget.initialValue.body);
    _audience = widget.initialValue.audience;
    _publishImmediately = !widget.initialValue.archived;
  }

  Future<void> _submit() async {
    if (widget.isSaving ||
        _isSubmitting ||
        !_formKey.currentState!.validate()) {
      return;
    }

    setState(() => _isSubmitting = true);
    try {
      await widget.onSubmit(
        AnnouncementDraft(
          title: _titleController.text.trim(),
          body: _bodyController.text.trim(),
          audience: _audience,
          archived: !_publishImmediately,
        ),
      );
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isBusy = widget.isSaving || _isSubmitting;

    return Material(
      color: AppColors.ink,
      child: SafeArea(
        bottom: false,
        child: Column(
          children: [
            _Header(
              title:
                  widget.isEditing ? 'Edit announcement' : 'New announcement',
              onBack: widget.onCancel,
            ),
            Expanded(
              child: ContentSheet(
                scrollKey: const Key('announcement-editor-scroll'),
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenH,
                  AppSpacing.xxl,
                  AppSpacing.screenH,
                  AppSpacing.xxl,
                ),
                children: [
                  Form(
                    key: _formKey,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _FieldLabel(label: 'TITLE'),
                        const SizedBox(height: AppSpacing.sm),
                        TextFormField(
                          key: const Key('announcement-title-field'),
                          controller: _titleController,
                          enabled: !isBusy,
                          textCapitalization: TextCapitalization.sentences,
                          textInputAction: TextInputAction.next,
                          maxLength: 120,
                          validator: validateAnnouncementTitle,
                          decoration: const InputDecoration(
                            hintText: 'What should people know?',
                            counterText: '',
                          ),
                        ),
                        const SizedBox(height: AppSpacing.xl),
                        _FieldLabel(label: 'ANNOUNCEMENT'),
                        const SizedBox(height: AppSpacing.sm),
                        TextFormField(
                          key: const Key('announcement-body-field'),
                          controller: _bodyController,
                          enabled: !isBusy,
                          textCapitalization: TextCapitalization.sentences,
                          keyboardType: TextInputType.multiline,
                          minLines: 7,
                          maxLines: 14,
                          maxLength: 5000,
                          validator: validateAnnouncementBody,
                          decoration: const InputDecoration(
                            hintText: 'Write the full announcement…',
                            alignLabelWithHint: true,
                          ),
                        ),
                        const SizedBox(height: AppSpacing.xl),
                        _FieldLabel(label: 'AUDIENCE'),
                        const SizedBox(height: AppSpacing.sm),
                        Wrap(
                          spacing: AppSpacing.sm,
                          runSpacing: AppSpacing.sm,
                          children: [
                            for (final audience
                                in announcementAudiences.entries)
                              ChoiceChip(
                                key: Key(
                                  'announcement-audience-${audience.key}',
                                ),
                                label: Text(audience.value),
                                selected: _audience == audience.key,
                                onSelected: isBusy
                                    ? null
                                    : (_) => setState(
                                          () => _audience = audience.key,
                                        ),
                              ),
                          ],
                        ),
                        const SizedBox(height: AppSpacing.xl),
                        _PublishSwitch(
                          value: _publishImmediately,
                          enabled: !isBusy,
                          onChanged: (value) {
                            setState(() => _publishImmediately = value);
                          },
                        ),
                        const SizedBox(height: AppSpacing.xxl),
                        FilledButton(
                          key: const Key('announcement-submit'),
                          onPressed: isBusy ? null : _submit,
                          child: SizedBox(
                            height: 48,
                            child: Center(
                              child: isBusy
                                  ? const SizedBox(
                                      width: 20,
                                      height: 20,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        color: Colors.white,
                                      ),
                                    )
                                  : Text(
                                      widget.isEditing
                                          ? 'Save changes'
                                          : _publishImmediately
                                              ? 'Publish announcement'
                                              : 'Save as archived',
                                    ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    _titleController.dispose();
    _bodyController.dispose();
    super.dispose();
  }
}

class _Header extends StatelessWidget {
  final String title;
  final VoidCallback onBack;

  const _Header({required this.title, required this.onBack});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.md,
        AppSpacing.sm,
        AppSpacing.screenH,
        AppSpacing.xl,
      ),
      child: Row(
        children: [
          IconButton(
            key: const Key('announcement-editor-back'),
            tooltip: 'Back',
            onPressed: onBack,
            color: Colors.white,
            icon: const Icon(Icons.arrow_back_rounded),
          ),
          const SizedBox(width: AppSpacing.xs),
          Expanded(
            child: Text(
              title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppText.display(fontSize: 25, color: Colors.white),
            ),
          ),
        ],
      ),
    );
  }
}

class _FieldLabel extends StatelessWidget {
  final String label;

  const _FieldLabel({required this.label});

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: AppText.body(
        fontSize: 11,
        fontWeight: FontWeight.w700,
        color: AppColors.muted,
      ).copyWith(letterSpacing: AppSizes.sectionLabelTracking),
    );
  }
}

class _PublishSwitch extends StatelessWidget {
  final bool value;
  final bool enabled;
  final ValueChanged<bool> onChanged;

  const _PublishSwitch({
    required this.value,
    required this.enabled,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.blue50,
      borderRadius: BorderRadius.circular(AppRadii.sm),
      child: SwitchListTile.adaptive(
        key: const Key('announcement-publish-switch'),
        value: value,
        onChanged: enabled ? onChanged : null,
        activeTrackColor: AppColors.blue,
        title: Text(
          'Publish immediately',
          style: AppText.body(
            fontSize: 14,
            fontWeight: FontWeight.w700,
            color: AppColors.ink,
          ),
        ),
        subtitle: Text(
          value
              ? 'People in the selected audience can read it now.'
              : 'Keep it archived until it is ready.',
          style: AppText.body(fontSize: 12, color: AppColors.muted),
        ),
      ),
    );
  }
}
