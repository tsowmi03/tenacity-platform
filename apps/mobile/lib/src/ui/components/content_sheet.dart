import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

/// The white sheet that overlaps the navy header, rounded on its top corners
/// and casting a shadow upward. Every V3 screen is a navy [Scaffold] with a
/// header above one of these.
///
/// Use [ContentSheet] for a scrolling stack of sections — the dashboard case —
/// or [ContentSheet.fixed] for content that manages its own layout. Screens
/// needing builder-based slivers should use [ContentSheet.fixed] with their own
/// scroll view inside, or this class can grow a sliver constructor when one
/// actually needs it.
class ContentSheet extends StatelessWidget {
  final List<Widget>? _children;
  final Widget? _child;
  final Future<void> Function()? onRefresh;
  final EdgeInsetsGeometry padding;
  final ScrollController? controller;
  final Key? scrollKey;

  static const EdgeInsets defaultPadding = EdgeInsets.fromLTRB(
    AppSpacing.screenH,
    AppSpacing.xl,
    AppSpacing.screenH,
    AppSpacing.xxl,
  );

  /// A scrolling sheet whose [children] are laid out in a single column.
  const ContentSheet({
    super.key,
    required List<Widget> children,
    this.onRefresh,
    this.controller,
    this.scrollKey,
    this.padding = defaultPadding,
  })  : _children = children,
        _child = null;

  /// A non-scrolling sheet. The caller is responsible for overflow.
  const ContentSheet.fixed({
    super.key,
    required Widget child,
    this.padding = defaultPadding,
  })  : _child = child,
        _children = null,
        onRefresh = null,
        controller = null,
        scrollKey = null;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.paper,
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(AppRadii.sheet),
        ),
        boxShadow: AppShadows.sheet,
      ),
      clipBehavior: Clip.antiAlias,
      child: Material(
        color: AppColors.paper,
        child: _child != null
            ? Padding(padding: padding, child: _child)
            : _buildScrollView(),
      ),
    );
  }

  Widget _buildScrollView() {
    final scrollView = CustomScrollView(
      key: scrollKey,
      controller: controller,
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        SliverPadding(
          padding: padding,
          sliver: SliverList.list(children: _children!),
        ),
      ],
    );

    if (onRefresh == null) return scrollView;

    return RefreshIndicator(
      color: AppColors.blue,
      onRefresh: onRefresh!,
      child: scrollView,
    );
  }
}
