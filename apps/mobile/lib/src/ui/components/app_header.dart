import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

/// The navy header at the top of every V3 screen: brand logo, a display-weight
/// greeting, an italic serif subtitle, and a circular avatar that opens the
/// profile. [metrics] renders beneath as a row of evenly-sized tiles.
///
/// Sits directly on the scaffold's [AppColors.ink] background — it draws no
/// background of its own so the header and status bar area read as one surface.
class AppHeader extends StatelessWidget {
  final String title;
  final String? subtitle;
  final String avatarInitial;
  final VoidCallback? onAvatarTap;
  final String avatarSemanticLabel;
  final Key? avatarKey;
  final List<Widget> metrics;

  const AppHeader({
    super.key,
    required this.title,
    required this.avatarInitial,
    this.subtitle,
    this.onAvatarTap,
    this.avatarSemanticLabel = 'Open profile',
    this.avatarKey,
    this.metrics = const [],
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        AppSpacing.sm,
        AppSpacing.screenH,
        AppSpacing.sectionGap,
      ),
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const BrandLogo(),
                    const SizedBox(height: AppSpacing.sm),
                    Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.display(
                        fontSize: 25,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                      ).copyWith(height: 1.12),
                    ),
                    if (subtitle != null) ...[
                      const SizedBox(height: AppSpacing.xs),
                      Text(
                        subtitle!,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: AppText.serif(
                          fontSize: 15,
                          color: AppColors.onInkSubtitle,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              _Avatar(
                initial: avatarInitial,
                onTap: onAvatarTap,
                semanticLabel: avatarSemanticLabel,
                inkWellKey: avatarKey,
              ),
            ],
          ),
          if (metrics.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.md),
            // IntrinsicHeight so every tile matches the tallest. Without it a
            // label that wraps to two lines leaves the shorter tiles floating
            // at a different height.
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (var i = 0; i < metrics.length; i++) ...[
                    if (i > 0) const SizedBox(width: AppSpacing.tileGap),
                    Expanded(child: metrics[i]),
                  ],
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// The white vertical wordmark that opens every navy header.
///
/// Public because not every V3 screen uses [AppHeader] — the billing console
/// has its own headline layout but still leads with the brand — and the asset
/// path should be written once.
class BrandLogo extends StatelessWidget {
  const BrandLogo({super.key});

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      'lib/assets/img/Tenacity-Vertical-Logo-White.png',
      height: 24,
      alignment: Alignment.centerLeft,
      fit: BoxFit.contain,
      excludeFromSemantics: true,
      errorBuilder: (_, __, ___) => Text(
        'TENACITY',
        style: AppText.display(fontSize: 15, color: Colors.white),
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  final String initial;
  final VoidCallback? onTap;
  final String semanticLabel;
  final Key? inkWellKey;

  const _Avatar({
    required this.initial,
    required this.onTap,
    required this.semanticLabel,
    this.inkWellKey,
  });

  @override
  Widget build(BuildContext context) {
    final avatar = Container(
      width: AppSizes.avatar,
      height: AppSizes.avatar,
      decoration: const BoxDecoration(
        color: AppColors.blue,
        shape: BoxShape.circle,
        border: Border.fromBorderSide(
          BorderSide(color: AppColors.onInkAvatarBorder, width: 2),
        ),
      ),
      alignment: Alignment.center,
      child: Text(
        initial,
        style: AppText.display(fontSize: 17, color: Colors.white),
      ),
    );

    if (onTap == null) return avatar;

    return Semantics(
      button: true,
      label: semanticLabel,
      child: InkWell(
        key: inkWellKey,
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: avatar,
      ),
    );
  }
}

/// Derives the single-letter avatar initial from a display name, falling back
/// to [fallback] when the name is empty or has no leading letter.
String avatarInitialFor(String name, {String fallback = '?'}) {
  final trimmed = name.trim();
  if (trimmed.isEmpty) return fallback;
  return trimmed.characters.first.toUpperCase();
}
