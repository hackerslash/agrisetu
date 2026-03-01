import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import '../theme/app_theme.dart';

class AppHeader extends StatelessWidget implements PreferredSizeWidget {
  static const double _toolbarHeight = 72;

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
  Size get preferredSize => const Size.fromHeight(_toolbarHeight);

  @override
  Widget build(BuildContext context) {
    final statusBarTop = MediaQuery.paddingOf(context).top;
    void handleBack() {
      if (onBack != null) {
        onBack!();
        return;
      }
      if (context.canPop()) {
        context.pop();
        return;
      }
      context.go('/home');
    }

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness:
            backgroundColor == AppColors.primary ? Brightness.light : Brightness.dark,
      ),
      child: Container(
        height: preferredSize.height + statusBarTop,
        color: backgroundColor,
        padding: EdgeInsets.only(top: statusBarTop),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: SizedBox(
            height: preferredSize.height,
            child: Row(
              children: [
                SizedBox(
                  width: 40,
                  height: 40,
                  child: showBack
                      ? IconButton(
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints.tightFor(
                            width: 40,
                            height: 40,
                          ),
                          onPressed: handleBack,
                          icon: Icon(
                            Icons.arrow_back,
                            color: foregroundColor,
                            size: 24,
                          ),
                        )
                      : const SizedBox.shrink(),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: AppTextStyles.h3.copyWith(color: foregroundColor),
                  ),
                ),
                const SizedBox(width: 12),
                ConstrainedBox(
                  constraints: const BoxConstraints(
                    minWidth: 40,
                    minHeight: 40,
                  ),
                  child: Align(
                    alignment: Alignment.centerRight,
                    child: trailing ?? const SizedBox(width: 24, height: 24),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
