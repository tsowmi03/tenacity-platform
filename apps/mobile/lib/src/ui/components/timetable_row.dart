import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

/// A booked class on a timetable: an outlined card with a thick coloured edge
/// on its leading side, a time column, the class and who is attending, and a
/// status pill.
///
/// Distinct from `LedgerRow`, which is the filled variant used for the single
/// "today" row on a dashboard. This one repeats down a list, so it is outlined
/// rather than filled and carries its state in the edge colour as well as the
/// pill.
class TimetableRow extends StatelessWidget {
  final String time;
  final String? duration;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;

  /// The leading edge colour, carrying the session's state at a glance.
  final Color accent;

  /// Dims the row for a session that is no longer going ahead.
  final bool muted;

  const TimetableRow({
    super.key,
    required this.time,
    required this.title,
    this.duration,
    this.subtitle,
    this.trailing,
    this.onTap,
    this.accent = AppColors.blue,
    this.muted = false,
  });

  @override
  Widget build(BuildContext context) {
    final titleColour = muted ? AppColors.muted : AppColors.ink;

    final content = Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        15,
        AppSpacing.lg,
        15,
      ),
      child: Row(
        children: [
          SizedBox(
            width: 46,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  time,
                  style: AppText.display(fontSize: 16, color: titleColour)
                      .copyWith(height: 1.15),
                ),
                if (duration != null)
                  Text(
                    duration!,
                    style: AppText.body(fontSize: 11, color: AppColors.muted),
                  ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.sectionGap),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.body(
                    fontSize: 14.5,
                    fontWeight: FontWeight.w700,
                    color: titleColour,
                  ),
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: AppSpacing.xxs),
                  Text(
                    subtitle!,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: AppText.body(
                      fontSize: 12.5,
                      color: AppColors.muted,
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (trailing != null) ...[
            const SizedBox(width: AppSpacing.labelGap),
            trailing!,
          ],
        ],
      ),
    );

    // Flutter rejects a borderRadius on a Border whose sides differ in colour,
    // so the accent edge is a sibling bar inside a uniformly bordered, clipped
    // container rather than a thick left BorderSide.
    return Container(
      decoration: BoxDecoration(
        color: AppColors.paper,
        border: Border.all(color: AppColors.line),
        borderRadius: BorderRadius.circular(AppRadii.sm),
      ),
      clipBehavior: Clip.antiAlias,
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(width: 4, color: accent),
            Expanded(
              child: Material(
                color: AppColors.paper,
                child: onTap == null
                    ? content
                    : InkWell(onTap: onTap, child: content),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The dashed outline button that closes a timetable — "Book a one-off class".
///
/// Dashed rather than solid because it adds something rather than acting on
/// what is already listed.
class DashedActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback? onPressed;

  const DashedActionButton({
    super.key,
    required this.label,
    this.icon = Icons.add_rounded,
    this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null;
    final colour = enabled ? AppColors.blue : AppColors.disabled;

    return Semantics(
      button: true,
      enabled: enabled,
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(AppRadii.sm),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onPressed,
          child: CustomPaint(
            painter: _DashedBorderPainter(
              color: enabled ? AppColors.line : AppColors.lineSoft,
              radius: AppRadii.sm,
            ),
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.sectionGap),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(icon, size: 15, color: colour),
                  const SizedBox(width: AppSpacing.sm),
                  Flexible(
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.body(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: colour,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Flutter has no dashed border, so the rounded rectangle is walked with a path
/// metric and drawn in alternating on/off runs.
class _DashedBorderPainter extends CustomPainter {
  static const _dashLength = 5.0;
  static const _gapLength = 4.0;
  static const _strokeWidth = 1.5;

  final Color color;
  final double radius;

  const _DashedBorderPainter({required this.color, required this.radius});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = _strokeWidth
      ..style = PaintingStyle.stroke;

    final path = Path()
      ..addRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(
            _strokeWidth / 2,
            _strokeWidth / 2,
            size.width - _strokeWidth,
            size.height - _strokeWidth,
          ),
          Radius.circular(radius),
        ),
      );

    for (final metric in path.computeMetrics()) {
      var distance = 0.0;
      while (distance < metric.length) {
        final next = distance + _dashLength;
        canvas.drawPath(
          metric.extractPath(distance, next.clamp(0, metric.length)),
          paint,
        );
        distance = next + _gapLength;
      }
    }
  }

  @override
  bool shouldRepaint(_DashedBorderPainter oldDelegate) =>
      oldDelegate.color != color || oldDelegate.radius != radius;
}
