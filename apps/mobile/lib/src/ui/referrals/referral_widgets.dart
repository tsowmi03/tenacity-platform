import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/components/app_bottom_sheet.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

/// The refer-a-friend surfaces (MOB-51). Presentation only: what to do on
/// Share comes from `ReferralController`.

const referralHeadline = "Know a family who'd love Tenacity?";

/// The offer, as of 10 Oct 2026: a flat $100 off a term for each family.
const referralOffer = r'You both get $100 off a term.';

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
          r'Send them your link. When they join, they get $100 off a term, '
          r'and so do you.',
          key: const Key('referral-sheet-message'),
          style: AppText.body(fontSize: 14, color: AppColors.ink)
              .copyWith(height: 1.45),
        ),
      ),
    );
  }
}

/// Headline on the dashboard card: the offer is a flat $100 off a term for
/// each family, so it is exact as well as short.
const referralCardHeadline = r'Give $100, get $100';
const referralCardBody = "Know a family who'd love Tenacity? Send them your "
    r"link. When they join, you'll each get $100 off a term.";

/// Always on the parent dashboard and not dismissible: the entry point that
/// means pop-ups can stay rare. Deliberately the one solid-blue block on a
/// page of pale cards, so it reads as an offer rather than another update.
class ReferralCard extends StatelessWidget {
  final VoidCallback onShare;
  final bool isSharing;

  const ReferralCard(
      {super.key, required this.onShare, this.isSharing = false});

  static const _bodyColor = Color(0xD9FFFFFF); // white @ 85%

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.blue,
      borderRadius: BorderRadius.circular(AppRadii.lg),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        key: const Key('referral-card'),
        onTap: isSharing ? null : onShare,
        child: Stack(
          children: [
            // Two soft rings in the corner: enough to lift the card off the
            // page without competing with the headline.
            const Positioned(
              top: -36,
              right: -28,
              child: _Ring(size: 132, color: AppColors.onInkSurface),
            ),
            const Positioned(
              top: 18,
              right: 22,
              child: Icon(
                Icons.card_giftcard_rounded,
                size: 40,
                color: AppColors.onInkMuted,
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(AppSpacing.xl),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'REFER A FRIEND',
                    style: AppText.body(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: AppColors.blue100,
                    ).copyWith(letterSpacing: AppSizes.sectionLabelTracking),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Padding(
                    // Clear of the gift icon in the corner.
                    padding: const EdgeInsets.only(right: 56),
                    child: Text(
                      referralCardHeadline,
                      style: AppText.display(fontSize: 26, color: Colors.white),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    referralCardBody,
                    style: AppText.body(fontSize: 14, color: _bodyColor)
                        .copyWith(height: 1.45),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  _ShareButton(isSharing: isSharing),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The white call to action. Not a button of its own: the whole card is the
/// tap target, so a near-miss still shares.
class _ShareButton extends StatelessWidget {
  final bool isSharing;

  const _ShareButton({required this.isSharing});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.lg,
        vertical: AppSpacing.md,
      ),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppRadii.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          isSharing
              ? const SizedBox.square(
                  dimension: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: AppColors.blue,
                  ),
                )
              : const Icon(
                  Icons.ios_share_rounded,
                  size: 18,
                  color: AppColors.blue,
                ),
          const SizedBox(width: AppSpacing.sm),
          Text(
            'Share my link',
            style: AppText.body(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: AppColors.blue,
            ),
          ),
        ],
      ),
    );
  }
}

class _Ring extends StatelessWidget {
  final double size;
  final Color color;

  const _Ring({required this.size, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: color, width: 22),
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
      label: const Text(r'Refer a friend, get $100 off'),
    );
  }
}
