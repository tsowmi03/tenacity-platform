import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

/// One item in [AppBottomNavigation].
class AppNavItem {
  final String label;
  final IconData icon;
  final IconData activeIcon;
  final bool showBadge;

  const AppNavItem({
    required this.label,
    required this.icon,
    required this.activeIcon,
    this.showBadge = false,
  });
}

/// The V3 bottom bar: white, hairline top border, blue for the selected tab.
///
/// Admin carries six destinations, which is past Material's comfortable limit,
/// so labels are small and the bar is always [BottomNavigationBarType.fixed] —
/// without that, Material switches to shifting behaviour and hides the labels
/// of unselected tabs.
class AppBottomNavigation extends StatelessWidget {
  final List<AppNavItem> items;
  final int currentIndex;
  final ValueChanged<int> onSelected;

  const AppBottomNavigation({
    super.key,
    required this.items,
    required this.currentIndex,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        color: AppColors.paper,
        border: Border(top: BorderSide(color: AppColors.line)),
      ),
      child: BottomNavigationBar(
        currentIndex: currentIndex,
        onTap: onSelected,
        type: BottomNavigationBarType.fixed,
        backgroundColor: AppColors.paper,
        elevation: 0,
        selectedItemColor: AppColors.blue,
        unselectedItemColor: AppColors.muted,
        selectedFontSize: 10,
        unselectedFontSize: 10,
        selectedLabelStyle:
            AppText.body(fontSize: 10, fontWeight: FontWeight.w700),
        unselectedLabelStyle:
            AppText.body(fontSize: 10, fontWeight: FontWeight.w600),
        items: [
          for (final item in items)
            BottomNavigationBarItem(
              label: item.label,
              icon: _NavIcon(icon: item.icon, showBadge: item.showBadge),
              activeIcon:
                  _NavIcon(icon: item.activeIcon, showBadge: item.showBadge),
            ),
        ],
      ),
    );
  }
}

class _NavIcon extends StatelessWidget {
  final IconData icon;
  final bool showBadge;

  const _NavIcon({required this.icon, required this.showBadge});

  @override
  Widget build(BuildContext context) {
    if (!showBadge) return Icon(icon, size: AppSizes.navIcon);

    return Stack(
      clipBehavior: Clip.none,
      children: [
        Icon(icon, size: AppSizes.navIcon),
        Positioned(
          right: -2,
          top: -2,
          child: Container(
            width: 10,
            height: 10,
            decoration: BoxDecoration(
              color: AppColors.unread,
              shape: BoxShape.circle,
              border: Border.all(color: AppColors.paper, width: 1.5),
            ),
          ),
        ),
      ],
    );
  }
}
