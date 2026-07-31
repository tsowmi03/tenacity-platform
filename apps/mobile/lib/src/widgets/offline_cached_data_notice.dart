import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/connectivity_controller.dart';
import 'package:tenacity/src/ui/components/state_surfaces.dart';

/// An empty section that says *why* it is empty. Offline, "nothing here" is
/// usually "nothing we could reach", and telling someone their invoices are
/// gone when the connection is simply down is the wrong message.
class OfflineAwareEmptyState extends StatelessWidget {
  const OfflineAwareEmptyState({
    super.key,
    required this.emptyMessage,
    this.offlineEmptyMessage = 'No saved data available offline.',
  });

  final String emptyMessage;
  final String offlineEmptyMessage;

  @override
  Widget build(BuildContext context) {
    return Consumer<ConnectivityController>(
      builder: (context, connectivityController, _) {
        final isOffline = connectivityController.isOffline;

        return EmptyStateView(
          icon: isOffline ? Icons.cloud_off_rounded : Icons.inbox_outlined,
          title: isOffline ? offlineEmptyMessage : emptyMessage,
          message: isOffline ? 'Reconnect to load anything newer.' : null,
        );
      },
    );
  }
}
