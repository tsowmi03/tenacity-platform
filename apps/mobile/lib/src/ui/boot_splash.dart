import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

/// What the app shows while it works out where to send the user.
///
/// Boot has to answer two questions before it can route — who is signed in,
/// and whether they still owe us an acceptance of the current terms — and both
/// answers arrive from the network. Until they do, the app must show something
/// that commits to neither destination. Rendering the terms gate during that
/// window told every returning user they were about to be asked to accept
/// something, and then replaced it with their dashboard (MOB-29).
class AppBootSplash extends StatelessWidget {
  const AppBootSplash({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const Key('app-boot-splash'),
      backgroundColor: AppColors.ink,
      body: SafeArea(
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Image.asset(
                'lib/assets/img/Tenacity-Vertical-Logo-White.png',
                height: 64,
                fit: BoxFit.contain,
                excludeFromSemantics: true,
                errorBuilder: (_, __, ___) => Text(
                  'TENACITY',
                  style: AppText.display(fontSize: 26, color: Colors.white),
                ),
              ),
              const SizedBox(height: AppSpacing.xxl),
              const SizedBox(
                height: 22,
                width: 22,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: AppColors.onInkMuted,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
