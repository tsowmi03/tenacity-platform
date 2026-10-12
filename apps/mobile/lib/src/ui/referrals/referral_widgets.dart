import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

/// The refer-a-friend surfaces (MOB-51). Presentation only: what to do on
/// Copy comes from `ReferralController`.

const referralHeadline = "Know a family who'd love Tenacity?";

/// The pop-up raised at a good moment. The dashboard card in sheet form: the
/// same blue, rings, headline and white button, so the two read as one offer.
class ReferralSheet extends StatelessWidget {
  final VoidCallback onCopy;
  final VoidCallback onNotNow;

  const ReferralSheet({
    super.key,
    required this.onCopy,
    required this.onNotNow,
  });

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: referralHeadline,
      namesRoute: true,
      scopesRoute: true,
      explicitChildNodes: true,
      child: Material(
        key: const Key('referral-sheet'),
        color: AppColors.blue,
        borderRadius: const BorderRadius.vertical(
          top: Radius.circular(AppRadii.sheet),
        ),
        clipBehavior: Clip.antiAlias,
        child: SafeArea(
          top: false,
          child: Stack(
            children: [
              const _OfferDecoration(),
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenH,
                  AppSpacing.sm,
                  AppSpacing.screenH,
                  AppSpacing.lg,
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Center(
                      child: Container(
                        width: 38,
                        height: 4,
                        decoration: BoxDecoration(
                          color: AppColors.onInkMuted,
                          borderRadius: BorderRadius.circular(AppRadii.pill),
                        ),
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xxl),
                    const _OfferText(headlineSize: 30),
                    const SizedBox(height: AppSpacing.xxl),
                    SizedBox(
                      width: double.infinity,
                      child: Material(
                        color: Colors.white,
                        shape: const StadiumBorder(),
                        clipBehavior: Clip.antiAlias,
                        child: InkWell(
                          key: const Key('referral-sheet-copy'),
                          onTap: onCopy,
                          child: const Padding(
                            padding:
                                EdgeInsets.symmetric(vertical: AppSpacing.lg),
                            child: _CopyLabel(),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    SizedBox(
                      width: double.infinity,
                      child: TextButton(
                        key: const Key('referral-sheet-not-now'),
                        onPressed: onNotNow,
                        style: TextButton.styleFrom(
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(
                            vertical: AppSpacing.md,
                          ),
                        ),
                        child: Text(
                          'Not now',
                          style: AppText.body(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The offer, as of 12 Oct 2026: $100 off the referrer's next term for every
/// family they refer; the new family's first lesson is free. The headline leads
/// with the parent's own saving; the friend's comes second.
const referralCardHeadline = r'Get $100 off your fees';
const referralCardBody = "Know a family who'd love Tenacity? When they join, "
    r"you'll get $100 off your next term, and their first lesson is free.";

/// Always on the parent dashboard and not dismissible: the entry point that
/// means pop-ups can stay rare. Deliberately the one solid-blue block on a
/// page of pale cards, so it reads as an offer rather than another update.
class ReferralCard extends StatelessWidget {
  final VoidCallback onCopy;
  final bool isCopying;

  /// Swaps the call to action for "Link copied" for a moment after a tap.
  final bool justCopied;

  const ReferralCard({
    super.key,
    required this.onCopy,
    this.isCopying = false,
    this.justCopied = false,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.blue,
      borderRadius: BorderRadius.circular(AppRadii.lg),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        key: const Key('referral-card'),
        onTap: isCopying ? null : onCopy,
        child: Stack(
          children: [
            const _OfferDecoration(),
            Padding(
              padding: const EdgeInsets.all(AppSpacing.xl),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const _OfferText(headlineSize: 26),
                  const SizedBox(height: AppSpacing.lg),
                  _CopyButton(isCopying: isCopying, justCopied: justCopied),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The rings and gift icon in the top corner of the card and the sheet:
/// enough to lift them off the page without competing with the headline.
class _OfferDecoration extends StatelessWidget {
  const _OfferDecoration();

  @override
  Widget build(BuildContext context) {
    return const Positioned(
      top: 0,
      right: 0,
      child: SizedBox(
        width: 120,
        height: 100,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Positioned(
              top: -36,
              right: -28,
              child: _Ring(size: 132, color: AppColors.onInkSurface),
            ),
            Positioned(
              top: 18,
              right: 22,
              child: Icon(
                Icons.card_giftcard_rounded,
                size: 40,
                color: AppColors.onInkMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// "REFER A FRIEND", the headline and the offer, in white on blue.
class _OfferText extends StatelessWidget {
  final double headlineSize;

  const _OfferText({required this.headlineSize});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'REFER A FRIEND',
          style: AppText.body(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: Colors.white,
          ).copyWith(letterSpacing: AppSizes.sectionLabelTracking),
        ),
        const SizedBox(height: AppSpacing.sm),
        Padding(
          // Clear of the gift icon in the corner.
          padding: const EdgeInsets.only(right: 56),
          child: Text(
            referralCardHeadline,
            style: AppText.display(fontSize: headlineSize, color: Colors.white),
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          referralCardBody,
          key: const Key('referral-offer-body'),
          // Solid white: on this blue it is 5.2:1, where any tint of it falls
          // under the 4.5:1 minimum for body text.
          style: AppText.body(fontSize: 14, color: Colors.white)
              .copyWith(height: 1.45),
        ),
      ],
    );
  }
}

/// The white call to action. Not a button of its own: the whole card is the
/// tap target, so a near-miss still copies.
class _CopyButton extends StatelessWidget {
  final bool isCopying;
  final bool justCopied;

  const _CopyButton({required this.isCopying, required this.justCopied});

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
          isCopying
              ? const SizedBox.square(
                  dimension: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: AppColors.blue,
                  ),
                )
              : Icon(
                  justCopied ? Icons.check_rounded : Icons.copy_rounded,
                  size: 18,
                  color: AppColors.blue,
                ),
          const SizedBox(width: AppSpacing.sm),
          Text(
            justCopied ? 'Link copied' : 'Copy my link',
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

/// The sheet's full-width button label: larger than the card's pill.
class _CopyLabel extends StatelessWidget {
  const _CopyLabel();

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const Icon(Icons.copy_rounded, size: 20, color: AppColors.blue),
        const SizedBox(width: AppSpacing.sm),
        Text(
          'Copy my link',
          style: AppText.body(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: AppColors.blue,
          ),
        ),
      ],
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
  final VoidCallback onCopy;

  const ReferralProfileRow({super.key, required this.onCopy});

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      key: const Key('profile-refer-friend'),
      onPressed: onCopy,
      icon: const Icon(Icons.card_giftcard_rounded),
      label: const Text(r'Refer a friend, get $100 off'),
    );
  }
}
