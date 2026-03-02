import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../theme/app_theme.dart';
import '../../l10n/app_localizations.dart';

class MainScaffold extends StatelessWidget {
  final Widget child;

  const MainScaffold({super.key, required this.child});

  int _locationIndex(String location) {
    if (location.startsWith('/home')) return 0;
    if (location.startsWith('/orders')) return 1;
    // index 2 is voice (FAB) - no route tab
    if (location.startsWith('/clusters')) return 3;
    if (location.startsWith('/profile')) return 4;
    return 0;
  }

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;
    final currentIndex = _locationIndex(location);

    return Scaffold(
      body: child,
      bottomNavigationBar: _AgriBottomNav(
        currentIndex: currentIndex,
        onTap: (index) {
          switch (index) {
            case 0:
              context.go('/home');
            case 1:
              context.go('/orders');
            case 3:
              context.go('/clusters');
            case 4:
              context.go('/profile');
          }
        },
        onVoiceTap: () => context.push('/voice'),
      ),
    );
  }
}

class _AgriBottomNav extends StatelessWidget {
  final int currentIndex;
  final ValueChanged<int> onTap;
  final VoidCallback onVoiceTap;

  const _AgriBottomNav({
    required this.currentIndex,
    required this.onTap,
    required this.onVoiceTap,
  });

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).padding.bottom;
    const voiceFabSize = 72.0;
    final navHeight = 60.0 + bottomInset;

    return Container(
      height: navHeight,
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: const Border(top: BorderSide(color: AppColors.border)),
      ),
      child: Stack(
        clipBehavior: Clip.none,
        alignment: Alignment.topCenter,
        children: [
          Align(
            alignment: Alignment.bottomCenter,
            child: Padding(
              padding: EdgeInsets.fromLTRB(
                10,
                8,
                10,
                bottomInset > 0 ? bottomInset + 4 : 8,
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Center(
                      child: _NavItem(
                        icon: Icons.home_outlined,
                        activeIcon: Icons.home,
                        label: AppLocalizations.of(context)!.navHome,
                        isActive: currentIndex == 0,
                        onTap: () => onTap(0),
                      ),
                    ),
                  ),
                  Expanded(
                    child: Center(
                      child: _NavItem(
                        icon: Icons.receipt_long_outlined,
                        activeIcon: Icons.receipt_long,
                        label: AppLocalizations.of(context)!.navOrders,
                        isActive: currentIndex == 1,
                        onTap: () => onTap(1),
                      ),
                    ),
                  ),
                  SizedBox(width: voiceFabSize + 20),
                  Expanded(
                    child: Center(
                      child: _NavItem(
                        icon: Icons.people_outline,
                        activeIcon: Icons.people,
                        label: AppLocalizations.of(context)!.navClusters,
                        isActive: currentIndex == 3,
                        onTap: () => onTap(3),
                      ),
                    ),
                  ),
                  Expanded(
                    child: Center(
                      child: _NavItem(
                        icon: Icons.person_outline,
                        activeIcon: Icons.person,
                        label: AppLocalizations.of(context)!.navProfile,
                        isActive: currentIndex == 4,
                        onTap: () => onTap(4),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          Positioned(
            top: -(voiceFabSize / 2) + 10,
            child: _VoiceFab(
              onTap: onVoiceTap,
              size: voiceFabSize,
            ),
          ),
        ],
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  final IconData icon;
  final IconData activeIcon;
  final String label;
  final bool isActive;
  final VoidCallback onTap;

  const _NavItem({
    required this.icon,
    required this.activeIcon,
    required this.label,
    required this.isActive,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: 58,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              isActive ? activeIcon : icon,
              color: isActive ? AppColors.primary : AppColors.textMuted,
              size: 23,
            ),
            const SizedBox(height: 3),
            Text(
              label,
              style: TextStyle(
                fontSize: 10,
                fontWeight: isActive ? FontWeight.w600 : FontWeight.w400,
                color: isActive ? AppColors.primary : AppColors.textMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _VoiceFab extends StatelessWidget {
  final VoidCallback onTap;
  final double size;

  const _VoiceFab({
    required this.onTap,
    required this.size,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        GestureDetector(
          onTap: onTap,
          child: Container(
            width: size,
            height: size,
            decoration: const BoxDecoration(
              color: AppColors.primary,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: Color(0x332C5F2D),
                  blurRadius: 12,
                  offset: Offset(0, 4),
                ),
              ],
            ),
            child: Icon(
              Icons.mic,
              color: AppColors.surface,
              size: size * 0.45,
            ),
          ),
        ),
      ],
    );
  }
}
