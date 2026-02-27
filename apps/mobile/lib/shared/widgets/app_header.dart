import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../theme/app_theme.dart';

class AppHeader extends StatelessWidget implements PreferredSizeWidget {
  final String title;
  final bool showBack;
  final Widget? trailing;
  final Color backgroundColor;
  final Color foregroundColor;
  final VoidCallback? onBack;

  const AppHeader({
    super.key,
    required this.title,
    this.showBack = true,
    this.trailing,
    this.backgroundColor = AppColors.primary,
    this.foregroundColor = AppColors.surface,
    this.onBack,
  });

  @override
  Size get preferredSize => const Size.fromHeight(80);

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness:
            backgroundColor == AppColors.primary ? Brightness.light : Brightness.dark,
      ),
      child: Container(
        height: preferredSize.height + MediaQuery.of(context).padding.top,
        color: backgroundColor,
        padding: EdgeInsets.only(top: MediaQuery.of(context).padding.top),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              if (showBack)
                GestureDetector(
                  onTap: onBack ?? () => Navigator.of(context).pop(),
                  child: Icon(Icons.arrow_back, color: foregroundColor, size: 24),
                )
              else
                const SizedBox(width: 24),
              Text(
                title,
                style: AppTextStyles.h3.copyWith(color: foregroundColor),
              ),
              trailing ?? const SizedBox(width: 24),
            ],
          ),
        ),
      ),
    );
  }
}
