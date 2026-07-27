import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/connectivity_controller.dart';
import 'package:tenacity/src/ui/components/offline_surfaces.dart';

class OfflineActionGuard {
  const OfflineActionGuard._();

  static const double _offlineBannerClearance = 64;
  static OverlayEntry? _activeOfflineMessage;

  static Future<bool> ensureOnline(
    BuildContext context, {
    required String action,
    bool refresh = true,
  }) async {
    final connectivityController = context.read<ConnectivityController>();
    final isOnline = refresh
        ? await connectivityController.refreshAndCheckOnline()
        : connectivityController.isOnline;
    if (isOnline) return true;

    if (context.mounted) {
      _showOfflineMessage(context, "You're offline. Reconnect to $action.");
    }
    return false;
  }

  static void _showOfflineMessage(BuildContext context, String message) {
    _activeOfflineMessage?.remove();
    _activeOfflineMessage = null;

    final overlay = Overlay.of(context, rootOverlay: true);
    final entry = OverlayEntry(
      builder: (context) => SafeArea(
        child: Align(
          alignment: Alignment.topCenter,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              16,
              _offlineBannerClearance,
              16,
              0,
            ),
            child: OfflineToast(message: message),
          ),
        ),
      ),
    );

    _activeOfflineMessage = entry;
    overlay.insert(entry);

    Future<void>.delayed(const Duration(seconds: 3), () {
      if (_activeOfflineMessage == entry) {
        entry.remove();
        _activeOfflineMessage = null;
      }
    });
  }
}
