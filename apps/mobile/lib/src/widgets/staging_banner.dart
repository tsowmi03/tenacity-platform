import 'package:flutter/material.dart';
import 'package:tenacity/src/config/app_environment.dart';

/// Corner ribbon marking a non-production build.
///
/// Composed into `MaterialApp.builder` alongside `OfflineModeBanner`, so it is
/// visible on every screen. In production it returns [child] untouched and
/// costs nothing.
class StagingBanner extends StatelessWidget {
  const StagingBanner({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final label = AppEnvironment.bannerLabel;
    if (label == null) return child;

    return Banner(
      message: label,
      location: BannerLocation.topEnd,
      color: Colors.deepOrange,
      child: child,
    );
  }
}
