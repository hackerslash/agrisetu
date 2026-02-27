import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class ClusterProgressBar extends StatelessWidget {
  final double value; // 0.0 to 1.0
  final Color backgroundColor;
  final Color foregroundColor;
  final double height;

  const ClusterProgressBar({
    super.key,
    required this.value,
    this.backgroundColor = AppColors.border,
    this.foregroundColor = AppColors.primary,
    this.height = 8,
  });

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(height / 2),
      child: LinearProgressIndicator(
        value: value.clamp(0.0, 1.0),
        backgroundColor: backgroundColor,
        valueColor: AlwaysStoppedAnimation(foregroundColor),
        minHeight: height,
      ),
    );
  }
}
