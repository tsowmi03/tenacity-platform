import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/connectivity_controller.dart';

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
        return Center(
          child: Text(
            connectivityController.isOffline
                ? offlineEmptyMessage
                : emptyMessage,
          ),
        );
      },
    );
  }
}
