import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

/// Shown inside a content sheet when a section has nothing to display and that
/// is a normal outcome, not a failure.
class EmptyStateView extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? message;
  final String? actionLabel;
  final VoidCallback? onAction;

  const EmptyStateView({
    super.key,
    required this.title,
    this.icon = Icons.inbox_outlined,
    this.message,
    this.actionLabel,
    this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.xxl,
        vertical: 40,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 40, color: AppColors.disabled),
          const SizedBox(height: AppSpacing.md),
          Text(
            title,
            textAlign: TextAlign.center,
            style: AppText.body(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: AppColors.ink,
            ),
          ),
          if (message != null) ...[
            const SizedBox(height: AppSpacing.xs + AppSpacing.xxs),
            Text(
              message!,
              textAlign: TextAlign.center,
              style: AppText.body(fontSize: 13, color: AppColors.muted)
                  .copyWith(height: 1.45),
            ),
          ],
          if (actionLabel != null) ...[
            const SizedBox(height: AppSpacing.lg),
            TextButton(onPressed: onAction, child: Text(actionLabel!)),
          ],
        ],
      ),
    );
  }
}

/// Shown when loading failed and retrying is the sensible next step. Distinct
/// from [EmptyStateView] so users can tell "nothing here" from "we couldn't
/// load it".
class ErrorStateView extends StatelessWidget {
  final String title;
  final String? message;
  final VoidCallback? onRetry;

  const ErrorStateView({
    super.key,
    this.title = 'Something went wrong',
    this.message,
    this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.xxl,
        vertical: 40,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.error_outline_rounded,
            size: 40,
            color: AppColors.danger,
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            title,
            textAlign: TextAlign.center,
            style: AppText.body(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: AppColors.ink,
            ),
          ),
          if (message != null) ...[
            const SizedBox(height: AppSpacing.xs + AppSpacing.xxs),
            Text(
              message!,
              textAlign: TextAlign.center,
              style: AppText.body(fontSize: 13, color: AppColors.muted)
                  .copyWith(height: 1.45),
            ),
          ],
          if (onRetry != null) ...[
            const SizedBox(height: AppSpacing.lg),
            OutlinedButton(onPressed: onRetry, child: const Text('Try again')),
          ],
        ],
      ),
    );
  }
}

/// A neutral block standing in for content that has not arrived yet. Preferred
/// over a spinner inside a sheet, so the layout does not jump when data lands.
class SkeletonBlock extends StatelessWidget {
  final double height;
  final double? width;
  final double radius;

  /// Defaults to [AppColors.skeleton], which is meant for the white sheet. Pass
  /// [AppColors.onInkSkeleton] for placeholders on the navy header.
  final Color color;

  const SkeletonBlock({
    super.key,
    this.height = 60,
    this.width,
    this.radius = AppRadii.sm,
    this.color = AppColors.skeleton,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      height: height,
      width: width,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(radius),
      ),
    );
  }
}
