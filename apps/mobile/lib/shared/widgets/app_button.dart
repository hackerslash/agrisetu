import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

enum ButtonVariant { primary, secondary, outline, ghost }

class AppButton extends StatelessWidget {
  final String text;
  final VoidCallback? onPressed;
  final ButtonVariant variant;
  final bool isLoading;
  final bool fullWidth;
  final double height;
  final IconData? icon;
  final Widget? child;

  const AppButton({
    super.key,
    required this.text,
    this.onPressed,
    this.variant = ButtonVariant.primary,
    this.isLoading = false,
    this.fullWidth = true,
    this.height = 56,
    this.icon,
    this.child,
  });

  @override
  Widget build(BuildContext context) {
    final content = isLoading
        ? SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(
              strokeWidth: 2.5,
              valueColor: AlwaysStoppedAnimation(
                variant == ButtonVariant.primary ? AppColors.surface : AppColors.primary,
              ),
            ),
          )
        : child ??
            Row(
              mainAxisSize: MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (icon != null) ...[
                  Icon(icon, size: 20, color: _textColor),
                  const SizedBox(width: 8),
                ],
                Text(text, style: AppTextStyles.button.copyWith(color: _textColor)),
              ],
            );

    final btn = SizedBox(
      height: height,
      width: fullWidth ? double.infinity : null,
      child: _buildButton(content),
    );

    return btn;
  }

  Color get _textColor {
    switch (variant) {
      case ButtonVariant.primary:
        return AppColors.surface;
      case ButtonVariant.secondary:
        return AppColors.textPrimary;
      case ButtonVariant.outline:
        return AppColors.primary;
      case ButtonVariant.ghost:
        return AppColors.primary;
    }
  }

  Color get _bgColor {
    switch (variant) {
      case ButtonVariant.primary:
        return AppColors.primary;
      case ButtonVariant.secondary:
        return AppColors.inputBackground;
      case ButtonVariant.outline:
        return Colors.transparent;
      case ButtonVariant.ghost:
        return Colors.transparent;
    }
  }

  Widget _buildButton(Widget content) {
    if (variant == ButtonVariant.outline) {
      return OutlinedButton(
        onPressed: isLoading ? null : onPressed,
        style: OutlinedButton.styleFrom(
          backgroundColor: Colors.transparent,
          foregroundColor: AppColors.primary,
          side: const BorderSide(color: AppColors.primary, width: 1.5),
          shape: const StadiumBorder(),
          padding: EdgeInsets.zero,
        ),
        child: content,
      );
    }

    return ElevatedButton(
      onPressed: isLoading ? null : onPressed,
      style: ElevatedButton.styleFrom(
        backgroundColor: _bgColor,
        foregroundColor: _textColor,
        shape: const StadiumBorder(),
        elevation: 0,
        padding: EdgeInsets.zero,
      ),
      child: content,
    );
  }
}
