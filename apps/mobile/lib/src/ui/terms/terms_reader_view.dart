import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:tenacity/src/models/terms_and_conditions_model.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/terms/terms_data.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

class TermsReaderView extends StatefulWidget {
  final TermsAndConditions terms;
  final bool requireAcceptance;
  final String? previousVersion;
  final bool isAccepting;
  final String? actionErrorMessage;
  final VoidCallback? onBack;
  final VoidCallback? onDecline;
  final Future<void> Function()? onAccept;
  final ValueChanged<String> onOpenLink;

  const TermsReaderView({
    super.key,
    required this.terms,
    required this.requireAcceptance,
    required this.isAccepting,
    required this.onOpenLink,
    this.previousVersion,
    this.actionErrorMessage,
    this.onBack,
    this.onDecline,
    this.onAccept,
  });

  @override
  State<TermsReaderView> createState() => _TermsReaderViewState();
}

class _TermsReaderViewState extends State<TermsReaderView> {
  final ScrollController _scrollController = ScrollController();
  double _scrollProgress = 0;
  bool _hasReachedEnd = false;
  bool _isSubmitting = false;

  bool get _isBusy => widget.isAccepting || _isSubmitting;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_syncScrollState);
    WidgetsBinding.instance.addPostFrameCallback((_) => _syncScrollState());
  }

  @override
  void didUpdateWidget(covariant TermsReaderView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.terms.version != widget.terms.version ||
        oldWidget.terms.content != widget.terms.content) {
      _hasReachedEnd = false;
      _scrollProgress = 0;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || !_scrollController.hasClients) return;
        _scrollController.jumpTo(0);
        _syncScrollState();
      });
    }
  }

  void _syncScrollState() {
    if (!mounted ||
        !_scrollController.hasClients ||
        !_scrollController.position.hasContentDimensions) {
      return;
    }

    final max = _scrollController.position.maxScrollExtent;
    final offset = _scrollController.offset.clamp(0.0, max);
    final progress = max <= 10 ? 1.0 : (offset / max).clamp(0.0, 1.0);
    final reachedEnd = max <= 10 || offset >= max - 10;

    if (progress == _scrollProgress && reachedEnd == _hasReachedEnd) return;
    setState(() {
      _scrollProgress = progress;
      _hasReachedEnd = reachedEnd;
    });
  }

  Future<void> _accept() async {
    if (!_hasReachedEnd || _isBusy || widget.onAccept == null) return;

    setState(() => _isSubmitting = true);
    try {
      await widget.onAccept!();
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final changes = termsChangesSince(
      widget.terms.changelog,
      widget.previousVersion,
    );

    return Scaffold(
      backgroundColor: AppColors.ink,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            _TermsHeader(
              requireAcceptance: widget.requireAcceptance,
              title: widget.terms.title,
              version: widget.terms.version,
              onBack: widget.onBack,
            ),
            Expanded(
              child: ContentSheet.fixed(
                padding: EdgeInsets.zero,
                child: Column(
                  children: [
                    _ProgressHeader(
                      progress: _scrollProgress,
                      hasReachedEnd: _hasReachedEnd,
                      requireAcceptance: widget.requireAcceptance,
                    ),
                    Expanded(
                      child: SingleChildScrollView(
                        key: const Key('terms-scroll'),
                        controller: _scrollController,
                        padding: const EdgeInsets.fromLTRB(
                          AppSpacing.screenH,
                          AppSpacing.lg,
                          AppSpacing.screenH,
                          AppSpacing.xxl,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            if (changes.isNotEmpty) ...[
                              _TermsUpdatedCard(
                                previousVersion: widget.previousVersion!,
                                changes: changes,
                              ),
                              const SizedBox(height: AppSpacing.xl),
                            ],
                            MarkdownBody(
                              key: const Key('terms-markdown'),
                              data: widget.terms.content,
                              selectable: true,
                              onTapLink: (_, href, __) {
                                if (href != null) widget.onOpenLink(href);
                              },
                              styleSheet: _markdownStyleSheet(),
                            ),
                            const SizedBox(height: AppSpacing.xl),
                            _DocumentEnd(version: widget.terms.version),
                          ],
                        ),
                      ),
                    ),
                    if (widget.requireAcceptance)
                      _AcceptanceFooter(
                        canAccept: _hasReachedEnd,
                        isBusy: _isBusy,
                        errorMessage: widget.actionErrorMessage,
                        onDecline: widget.onDecline,
                        onAccept: _accept,
                      ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  MarkdownStyleSheet _markdownStyleSheet() {
    return MarkdownStyleSheet(
      h1: AppText.display(fontSize: 25, color: AppColors.ink)
          .copyWith(height: 1.18),
      h2: AppText.display(fontSize: 20, color: AppColors.ink)
          .copyWith(height: 1.24),
      h3: AppText.body(
        fontSize: 16,
        fontWeight: FontWeight.w700,
        color: AppColors.ink,
      ),
      p: AppText.body(fontSize: 14, color: AppColors.text)
          .copyWith(height: 1.65),
      listBullet: AppText.body(fontSize: 14, color: AppColors.blue),
      a: AppText.body(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        color: AppColors.blue,
      ).copyWith(decoration: TextDecoration.underline),
      blockquote: AppText.serif(fontSize: 15, color: AppColors.text)
          .copyWith(height: 1.55),
      blockquoteDecoration: BoxDecoration(
        color: AppColors.blue50,
        border: const Border(
          left: BorderSide(color: AppColors.blue, width: 3),
        ),
        borderRadius: BorderRadius.circular(AppRadii.sm),
      ),
      blockquotePadding: const EdgeInsets.all(AppSpacing.lg),
      horizontalRuleDecoration: const BoxDecoration(
        border: Border(top: BorderSide(color: AppColors.line)),
      ),
      code: AppText.body(fontSize: 13, color: AppColors.ink).copyWith(
        backgroundColor: AppColors.blue50,
      ),
    );
  }

  @override
  void dispose() {
    _scrollController.removeListener(_syncScrollState);
    _scrollController.dispose();
    super.dispose();
  }
}

class _TermsHeader extends StatelessWidget {
  final bool requireAcceptance;
  final String title;
  final String version;
  final VoidCallback? onBack;

  const _TermsHeader({
    required this.requireAcceptance,
    required this.title,
    required this.version,
    required this.onBack,
  });

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
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!requireAcceptance) ...[
            IconButton(
              key: const Key('terms-back'),
              tooltip: 'Back',
              onPressed: onBack,
              color: Colors.white,
              icon: const Icon(Icons.arrow_back_rounded),
            ),
            const SizedBox(width: AppSpacing.xs),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.display(fontSize: 25, color: Colors.white)
                      .copyWith(height: 1.12),
                ),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  requireAcceptance
                      ? 'Please review the full document to continue'
                      : 'The agreement currently in effect',
                  style: AppText.serif(
                    fontSize: 14,
                    color: AppColors.onInkSubtitle,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Container(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.md,
              vertical: 7,
            ),
            decoration: BoxDecoration(
              color: AppColors.onInkSurface,
              borderRadius: BorderRadius.circular(AppRadii.pill),
              border: Border.all(color: AppColors.onInkBorder),
            ),
            child: Text(
              'v$version',
              style: AppText.body(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ProgressHeader extends StatelessWidget {
  final double progress;
  final bool hasReachedEnd;
  final bool requireAcceptance;

  const _ProgressHeader({
    required this.progress,
    required this.hasReachedEnd,
    required this.requireAcceptance,
  });

  @override
  Widget build(BuildContext context) {
    final percent = (progress * 100).round();
    return Container(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        AppSpacing.lg,
        AppSpacing.screenH,
        AppSpacing.md,
      ),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.lineSoft)),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  requireAcceptance
                      ? hasReachedEnd
                          ? 'Ready to accept'
                          : 'Review progress'
                      : 'Terms document',
                  style: AppText.body(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: hasReachedEnd ? AppColors.success : AppColors.ink,
                  ),
                ),
              ),
              Text(
                '$percent%',
                key: const Key('terms-progress-label'),
                style: AppText.body(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: AppColors.muted,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          ClipRRect(
            borderRadius: BorderRadius.circular(AppRadii.pill),
            child: LinearProgressIndicator(
              key: const Key('terms-progress'),
              value: progress,
              minHeight: 5,
              color: hasReachedEnd ? AppColors.success : AppColors.blue,
              backgroundColor: AppColors.skeleton,
            ),
          ),
        ],
      ),
    );
  }
}

class _TermsUpdatedCard extends StatelessWidget {
  final String previousVersion;
  final List<TermsChangeLog> changes;

  const _TermsUpdatedCard({
    required this.previousVersion,
    required this.changes,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const Key('terms-updated-card'),
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: AppColors.blue50,
        borderRadius: BorderRadius.circular(AppRadii.sm),
        border: Border.all(color: AppColors.blue100),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.new_releases_outlined,
                color: AppColors.blue,
                size: 20,
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  'What changed since v$previousVersion',
                  style: AppText.body(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: AppColors.ink,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          for (var index = 0; index < changes.length; index++) ...[
            if (index > 0) const SizedBox(height: AppSpacing.md),
            Text(
              [
                'v${changes[index].version}',
                termsChangeDateLabel(changes[index].date),
              ].where((part) => part.isNotEmpty).join(' · '),
              style: AppText.body(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: AppColors.blue600,
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              changes[index].changes,
              style: AppText.body(fontSize: 13, color: AppColors.text)
                  .copyWith(height: 1.45),
            ),
          ],
        ],
      ),
    );
  }
}

class _DocumentEnd extends StatelessWidget {
  final String version;

  const _DocumentEnd({required this.version});

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'End of terms version $version',
      child: Row(
        children: [
          const Expanded(child: Divider(color: AppColors.line)),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
            child: Text(
              'END · v$version',
              style: AppText.body(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: AppColors.muted,
              ).copyWith(letterSpacing: 0.8),
            ),
          ),
          const Expanded(child: Divider(color: AppColors.line)),
        ],
      ),
    );
  }
}

class _AcceptanceFooter extends StatelessWidget {
  final bool canAccept;
  final bool isBusy;
  final String? errorMessage;
  final VoidCallback? onDecline;
  final VoidCallback onAccept;

  const _AcceptanceFooter({
    required this.canAccept,
    required this.isBusy,
    required this.errorMessage,
    required this.onDecline,
    required this.onAccept,
  });

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenH,
          AppSpacing.md,
          AppSpacing.screenH,
          AppSpacing.lg,
        ),
        decoration: const BoxDecoration(
          color: AppColors.paper,
          border: Border(top: BorderSide(color: AppColors.line)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (errorMessage != null) ...[
              Container(
                key: const Key('terms-action-error'),
                padding: const EdgeInsets.all(AppSpacing.md),
                decoration: BoxDecoration(
                  color: AppColors.danger.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(AppRadii.sm),
                ),
                child: Text(
                  errorMessage!,
                  textAlign: TextAlign.center,
                  style: AppText.body(fontSize: 12, color: AppColors.danger),
                ),
              ),
              const SizedBox(height: AppSpacing.md),
            ],
            Text(
              canAccept
                  ? 'You have reached the end of the document.'
                  : 'Scroll to the end before accepting.',
              textAlign: TextAlign.center,
              style: AppText.body(fontSize: 11.5, color: AppColors.muted),
            ),
            const SizedBox(height: AppSpacing.sm),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    key: const Key('terms-decline'),
                    onPressed: isBusy ? null : onDecline,
                    child: const Text('Decline'),
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  flex: 2,
                  child: FilledButton(
                    key: const Key('terms-accept'),
                    onPressed: canAccept && !isBusy ? onAccept : null,
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
                            : const Text('Accept & continue'),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class TermsGateStateView extends StatelessWidget {
  final bool isLoading;
  final String? errorMessage;
  final bool requireAcceptance;
  final VoidCallback? onBack;
  final VoidCallback? onRetry;

  const TermsGateStateView({
    super.key,
    required this.isLoading,
    required this.errorMessage,
    required this.requireAcceptance,
    this.onBack,
    this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.ink,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            _TermsHeader(
              requireAcceptance: requireAcceptance,
              title: 'Terms & conditions',
              version: '—',
              onBack: onBack,
            ),
            Expanded(
              child: ContentSheet.fixed(
                child: Center(
                  child: isLoading
                      ? const _TermsLoading()
                      : ErrorStateView(
                          title: 'Terms could not be loaded',
                          message: errorMessage ??
                              'Check your connection and try again.',
                          onRetry: onRetry,
                        ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TermsLoading extends StatelessWidget {
  const _TermsLoading();

  @override
  Widget build(BuildContext context) {
    return const Column(
      key: Key('terms-loading'),
      mainAxisSize: MainAxisSize.min,
      children: [
        SkeletonBlock(height: 18, width: 160),
        SizedBox(height: AppSpacing.md),
        SkeletonBlock(height: 12, width: 230),
        SizedBox(height: AppSpacing.xl),
        SkeletonBlock(height: 110),
      ],
    );
  }
}
