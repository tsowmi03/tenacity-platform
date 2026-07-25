import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

/// A pill-group filter that sits on the navy header — `All · Ella · Max` on the
/// parent timetable, `Parents · Students · Tutors` on the admin directory.
///
/// The selected segment is a solid white pill; the rest are translucent. Built
/// for a dark background; on a light surface use Material's own chips instead.
///
/// Segments are laid out in a horizontal scroll view so a family with several
/// children does not overflow the header.
class SegmentedFilter extends StatelessWidget {
  final List<String> segments;
  final int selectedIndex;
  final ValueChanged<int> onSelected;

  const SegmentedFilter({
    super.key,
    required this.segments,
    required this.selectedIndex,
    required this.onSelected,
  }) : assert(segments.length > 0, 'A filter needs at least one segment.');

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: AppColors.onInkSurface,
        border: Border.all(color: AppColors.onInkBorder),
        borderRadius: BorderRadius.circular(AppRadii.pill),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (var i = 0; i < segments.length; i++)
              _Segment(
                label: segments[i],
                selected: i == selectedIndex,
                onTap: () => onSelected(i),
              ),
          ],
        ),
      ),
    );
  }
}

class _Segment extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _Segment({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      child: Material(
        color: selected ? Colors.white : Colors.transparent,
        borderRadius: BorderRadius.circular(AppRadii.pill),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.sectionGap,
              vertical: 6,
            ),
            child: Text(
              label,
              style: AppText.body(
                fontSize: 12,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
                color: selected ? AppColors.ink : AppColors.onInkMuted,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
