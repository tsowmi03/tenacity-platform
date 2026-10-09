import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/components/app_bottom_sheet.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

/// The refer-a-friend surfaces (MOB-51). Presentation only: what to do on
/// Share comes from `ReferralController`.

const referralHeadline = "Know a family who'd love Tenacity?";
const referralOffer = r'You both get $10/hr off for a term.';

/// The pop-up raised at a good moment.
class ReferralSheet extends StatelessWidget {
  final VoidCallback onShare;
  final VoidCallback onNotNow;

  const ReferralSheet({
    super.key,
    required this.onShare,
    required this.onNotNow,
  });

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: referralHeadline,
      namesRoute: true,
      scopesRoute: true,
      explicitChildNodes: true,
      child: AppBottomSheet(
        title: referralHeadline,
        footer: Row(
          children: [
            Expanded(
              child: OutlinedButton(
                key: const Key('referral-sheet-not-now'),
                onPressed: onNotNow,
                child: const Text('Not now'),
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: FilledButton.icon(
                key: const Key('referral-sheet-share'),
                onPressed: onShare,
                icon: const Icon(Icons.ios_share_rounded),
                label: const Text('Share my link'),
              ),
            ),
          ],
        ),
        child: Text(
          '$referralOffer Share your link with friends, and when they enrol '
          'we\'ll take it off both families\' invoices.',
          key: const Key('referral-sheet-message'),
          style: AppText.body(fontSize: 14, color: AppColors.ink)
              .copyWith(height: 1.45),
        ),
      ),
    );
  }
}

/// Always on the parent dashboard and not dismissible: the entry point that
/// means pop-ups can stay rare.
class ReferralCard extends StatelessWidget {
  final VoidCallback onShare;
  final bool isSharing;

  const ReferralCard(
      {super.key, required this.onShare, this.isSharing = false});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.blue50,
      borderRadius: BorderRadius.circular(AppRadii.md),
      child: InkWell(
        key: const Key('referral-card'),
        borderRadius: BorderRadius.circular(AppRadii.md),
        onTap: isSharing ? null : onShare,
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Row(
            children: [
              const Icon(Icons.card_giftcard_rounded, color: AppColors.blue),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Refer a friend',
                      style: AppText.body(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: AppColors.ink,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xxs),
                    Text(
                      referralOffer,
                      style: AppText.body(fontSize: 13, color: AppColors.muted),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              isSharing
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.ios_share_rounded, color: AppColors.blue),
            ],
          ),
        ),
      ),
    );
  }
}

/// The "Refer a friend" row on the parent's Profile.
class ReferralProfileRow extends StatelessWidget {
  final VoidCallback onShare;

  const ReferralProfileRow({super.key, required this.onShare});

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      key: const Key('profile-refer-friend'),
      onPressed: onShare,
      icon: const Icon(Icons.card_giftcard_rounded),
      label: const Text(r'Refer a friend ($10/hr off each)'),
    );
  }
}
