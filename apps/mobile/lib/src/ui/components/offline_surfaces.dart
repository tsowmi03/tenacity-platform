import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

/// The two ways the app tells someone they have no connection.
///
/// Both float over the screen rather than displacing it, because connectivity
/// comes and goes and content must not jump each time it does. They are
/// deliberately different colours: [OfflineBanner] is an ambient state the
/// person can keep working around, while [OfflineToast] is a specific action
/// that has just been refused.

/// Ambient notice that the device is offline and the screen may be showing
/// saved data. Shown for as long as the connection is down.
class OfflineBanner extends StatelessWidget {
  const OfflineBanner({super.key});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.lg,
          AppSpacing.sm,
          AppSpacing.lg,
          0,
        ),
        child: Align(
          child: _FloatingNotice(
            background: AppColors.warning,
            iconColor: Colors.white,
            message: 'Offline. Showing saved data where available.',
          ),
        ),
      ),
    );
  }
}

/// Transient notice that an action needs a connection. Raised by
/// `OfflineActionGuard` when it turns an action away.
class OfflineToast extends StatelessWidget {
  final String message;

  const OfflineToast({super.key, required this.message});

  @override
  Widget build(BuildContext context) {
    return _FloatingNotice(
      background: AppColors.ink,
      iconColor: AppColors.blue300,
      message: message,
      liveRegion: true,
    );
  }
}

class _FloatingNotice extends StatelessWidget {
  final Color background;
  final Color iconColor;
  final String message;
  final bool liveRegion;

  const _FloatingNotice({
    required this.background,
    required this.iconColor,
    required this.message,
    this.liveRegion = false,
  });

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: liveRegion,
      child: Material(
        color: Colors.transparent,
        child: Container(
          constraints: const BoxConstraints(maxWidth: 420),
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.lg,
            vertical: AppSpacing.md,
          ),
          decoration: BoxDecoration(
            color: background,
            borderRadius: BorderRadius.circular(AppRadii.md),
            boxShadow: AppShadows.md,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.cloud_off_rounded, size: 18, color: iconColor),
              const SizedBox(width: AppSpacing.labelGap),
              Flexible(
                child: Text(
                  message,
                  // Two lines is enough for the longest guard message; beyond
                  // that the notice would start covering the screen it is
                  // reporting on.
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.body(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
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
