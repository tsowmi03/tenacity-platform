import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/connectivity_controller.dart';

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
            child: Material(
              color: Colors.transparent,
              child: Container(
                constraints: const BoxConstraints(maxWidth: 560),
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  color: Colors.red,
                  borderRadius: BorderRadius.circular(8),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x33000000),
                      blurRadius: 12,
                      offset: Offset(0, 4),
                    ),
                  ],
                ),
                child: Text(
                  message,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
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
