import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/connectivity_controller.dart';
import 'package:tenacity/src/ui/components/offline_surfaces.dart';

/// Layers the ambient offline notice over the whole app. It is stacked rather
/// than inserted above the child so nothing reflows when the connection drops.
class OfflineModeBanner extends StatelessWidget {
  const OfflineModeBanner({
    super.key,
    required this.child,
  });

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Consumer<ConnectivityController>(
      builder: (context, connectivityController, _) {
        if (!connectivityController.isOffline) {
          return child;
        }

        return Stack(
          children: [
            child,
            const Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: OfflineBanner(),
            ),
          ],
        );
      },
    );
  }
}
