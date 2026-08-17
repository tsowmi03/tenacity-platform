import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/components/app_header.dart';
import 'package:tenacity/src/ui/components/content_sheet.dart';
import 'package:tenacity/src/ui/components/state_surfaces.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

/// Loading placeholders for whole screens.
///
/// Every V3 screen is a navy header above a white [ContentSheet], so a screen
/// that is still loading can draw that shell immediately and fill it with
/// [SkeletonBlock]s. A centred spinner cannot: it gives the screen no shape, so
/// the whole layout snaps into place when data lands.
///
/// Each skeleton carries a [Key] so tests can assert the loading window without
/// reaching for widget types.

/// The shell shared by the three role dashboards: brand logo, greeting,
/// subtitle, a row of metric tiles, then a sheet of sections.
///
/// [metricCount] should match the number of [MetricTile]s the real dashboard
/// renders, so the header does not change height when data arrives.
class DashboardSkeleton extends StatelessWidget {
  final int metricCount;

  const DashboardSkeleton({super.key, this.metricCount = 3});

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: AppColors.ink,
      child: SafeArea(
        bottom: false,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.screenH,
                AppSpacing.sm,
                AppSpacing.screenH,
                AppSpacing.sectionGap,
              ),
              child: Column(
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            BrandLogo(),
                            SizedBox(height: AppSpacing.sm),
                            // Matches the 25px display greeting.
                            SkeletonBlock(
                              height: 26,
                              width: 210,
                              radius: AppRadii.pill,
                              color: AppColors.onInkSkeleton,
                            ),
                            SizedBox(height: AppSpacing.xs),
                            SkeletonBlock(
                              height: 15,
                              width: 150,
                              radius: AppRadii.pill,
                              color: AppColors.onInkSkeleton,
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: AppSpacing.md),
                      Container(
                        width: AppSizes.avatar,
                        height: AppSizes.avatar,
                        decoration: const BoxDecoration(
                          color: AppColors.onInkSkeleton,
                          shape: BoxShape.circle,
                        ),
                      ),
                    ],
                  ),
                  if (metricCount > 0) ...[
                    const SizedBox(height: AppSpacing.md),
                    Row(
                      children: [
                        for (var i = 0; i < metricCount; i++) ...[
                          if (i > 0) const SizedBox(width: AppSpacing.tileGap),
                          const Expanded(
                            child: SkeletonBlock(
                              height: 62,
                              radius: AppRadii.tile,
                              color: AppColors.onInkSkeleton,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ],
                ],
              ),
            ),
            const Expanded(
              // Scrolling, not fixed: the placeholder stack is taller than a
              // short viewport (landscape especially), and a fixed sheet would
              // overflow rather than clip gracefully.
              child: ContentSheet(children: [SheetSectionsSkeleton()]),
            ),
          ],
        ),
      ),
    );
  }
}

/// The inside of a [ContentSheet] while it loads: a section label followed by
/// a couple of cards, repeated. Used on its own by screens that own their
/// header but not their sheet.
class SheetSectionsSkeleton extends StatelessWidget {
  final int sections;

  const SheetSectionsSkeleton({super.key, this.sections = 2});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < sections; i++) ...[
          if (i > 0) const SizedBox(height: AppSpacing.sectionGap),
          // Aligned rather than bare: the Column stretches its children, which
          // would otherwise widen this to the full sheet and stop it reading
          // as a section label.
          const Align(
            alignment: Alignment.centerLeft,
            child: SkeletonBlock(height: 12, width: 96, radius: AppRadii.sm),
          ),
          const SizedBox(height: AppSpacing.labelGap),
          const SkeletonBlock(height: 92),
          const SizedBox(height: AppSpacing.md),
          const SkeletonBlock(height: 92),
        ],
      ],
    );
  }
}

/// The timetable shell: a screen title, the week navigator, the seven-day
/// strip, then a sheet of session rows grouped by day.
///
/// The timetable header is taller than [AppHeader], so it gets its own skeleton
/// rather than reusing [DashboardSkeleton].
class TimetableSkeleton extends StatelessWidget {
  const TimetableSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return const ColoredBox(
      color: AppColors.ink,
      child: SafeArea(
        bottom: false,
        child: Column(
          // The week strip below happens to force full width, but the header
          // should not depend on that to stay left-aligned.
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: EdgeInsets.fromLTRB(
                AppSpacing.screenH,
                AppSpacing.sm,
                AppSpacing.screenH,
                AppSpacing.xl,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SkeletonBlock(
                    height: 28,
                    width: 160,
                    radius: AppRadii.pill,
                    color: AppColors.onInkSkeleton,
                  ),
                  SizedBox(height: AppSpacing.lg),
                  SkeletonBlock(
                    height: 40,
                    radius: AppRadii.tile,
                    color: AppColors.onInkSkeleton,
                  ),
                  SizedBox(height: AppSpacing.lg),
                  _WeekStripSkeleton(),
                ],
              ),
            ),
            Expanded(
              child: ContentSheet(
                padding: EdgeInsets.fromLTRB(
                  AppSpacing.screenH,
                  AppSpacing.xxl,
                  AppSpacing.screenH,
                  AppSpacing.xxl,
                ),
                children: [SheetSectionsSkeleton()],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _WeekStripSkeleton extends StatelessWidget {
  const _WeekStripSkeleton();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (var i = 0; i < 7; i++) ...[
          if (i > 0) const SizedBox(width: AppSpacing.xs + AppSpacing.xxs),
          const Expanded(
            child: SkeletonBlock(
              height: 54,
              radius: AppRadii.tile,
              color: AppColors.onInkSkeleton,
            ),
          ),
        ],
      ],
    );
  }
}

/// The billing console shell: brand logo, an eyebrow label, the outstanding
/// total in display type, a summary line, the new-invoice button, then a sheet
/// of invoice rows.
class BillingSkeleton extends StatelessWidget {
  const BillingSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return const ColoredBox(
      color: AppColors.ink,
      child: SafeArea(
        bottom: false,
        child: Column(
          // Nothing in this header forces full width the way a Row of tiles
          // does, so without stretch the whole block centres itself.
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: EdgeInsets.fromLTRB(
                AppSpacing.screenH,
                AppSpacing.sm,
                AppSpacing.screenH,
                AppSpacing.xl,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  BrandLogo(),
                  SizedBox(height: 10),
                  SkeletonBlock(
                    height: 11,
                    width: 128,
                    radius: AppRadii.pill,
                    color: AppColors.onInkSkeleton,
                  ),
                  SizedBox(height: 6),
                  // Stands in for the 42px outstanding total.
                  SkeletonBlock(
                    height: 44,
                    width: 200,
                    radius: AppRadii.sm,
                    color: AppColors.onInkSkeleton,
                  ),
                  SizedBox(height: 6),
                  SkeletonBlock(
                    height: 13,
                    width: 170,
                    radius: AppRadii.pill,
                    color: AppColors.onInkSkeleton,
                  ),
                  SizedBox(height: AppSpacing.md),
                  SkeletonBlock(
                    height: 42,
                    width: 148,
                    radius: AppRadii.pill,
                    color: AppColors.onInkSkeleton,
                  ),
                ],
              ),
            ),
            Expanded(
              child: ContentSheet(children: [ListSkeleton(rows: 5)]),
            ),
          ],
        ),
      ),
    );
  }
}

/// A stack of full-width rows, for screens whose sheet is a plain list rather
/// than labelled sections.
class ListSkeleton extends StatelessWidget {
  final int rows;
  final double rowHeight;

  const ListSkeleton({super.key, this.rows = 4, this.rowHeight = 72});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < rows; i++) ...[
          if (i > 0) const SizedBox(height: AppSpacing.md),
          SkeletonBlock(height: rowHeight),
        ],
      ],
    );
  }
}

/// A conversation of alternating message bubbles.
///
/// Anchored to the bottom, because the thread it stands in for is a reversed
/// list showing the newest message. Bubble widths vary so it does not read as a
/// grid; the exact heights cannot match real messages, but the alignment and
/// anchoring do.
class MessageThreadSkeleton extends StatelessWidget {
  const MessageThreadSkeleton({super.key});

  /// (fromMe, width, height) — a plausible back-and-forth.
  static const _bubbles = [
    (false, 210.0, 38.0),
    (true, 150.0, 38.0),
    (false, 240.0, 56.0),
    (true, 190.0, 38.0),
    (false, 130.0, 38.0),
  ];

  @override
  Widget build(BuildContext context) {
    // Reversed rather than bottom-aligned: it anchors to the newest message
    // like the real thread, and cannot overflow a short viewport.
    return SingleChildScrollView(
      reverse: true,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Column(
        children: [
          for (final (fromMe, width, height) in _bubbles)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.sm),
              child: Align(
                alignment:
                    fromMe ? Alignment.centerRight : Alignment.centerLeft,
                child: SkeletonBlock(
                  height: height,
                  width: width,
                  radius: AppRadii.md,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Article-shaped placeholder — a title block over staggered lines of body
/// text. For screens that load one piece of prose rather than a list.
class ProseSkeleton extends StatelessWidget {
  final int lines;

  const ProseSkeleton({super.key, this.lines = 8});

  @override
  Widget build(BuildContext context) {
    // Scrollable because the announcement screen hands this to a non-scrolling
    // sheet, and eight lines of placeholder do not fit a short viewport.
    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SkeletonBlock(height: 22, width: 240, radius: AppRadii.sm),
          const SizedBox(height: AppSpacing.md),
          const SkeletonBlock(height: 12, width: 130, radius: AppRadii.pill),
          const SizedBox(height: AppSpacing.lg),
          for (var i = 0; i < lines; i++) ...[
            if (i > 0) const SizedBox(height: AppSpacing.sm + AppSpacing.xxs),
            // The last line of a paragraph runs short, so every fourth stops
            // early rather than every line being flush.
            SkeletonBlock(
              height: 11,
              width: i % 4 == 3 ? 180 : null,
              radius: AppRadii.pill,
            ),
          ],
        ],
      ),
    );
  }
}
