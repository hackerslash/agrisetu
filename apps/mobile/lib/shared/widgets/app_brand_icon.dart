import 'package:flutter/material.dart';

class AppBrandIcon extends StatelessWidget {
  static const String assetPath = 'assets/icons/app_icon.png';

  final double size;
  final Color? color;
  final BoxFit fit;
  final EdgeInsetsGeometry padding;

  const AppBrandIcon({
    super.key,
    this.size = 24,
    this.color,
    this.fit = BoxFit.contain,
    this.padding = EdgeInsets.zero,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding,
      child: Align(
        alignment: Alignment.center,
        child: Image.asset(
          assetPath,
          width: size,
          height: size,
          fit: fit,
          color: color,
          colorBlendMode: color != null ? BlendMode.srcIn : null,
          filterQuality: FilterQuality.high,
        ),
      ),
    );
  }
}
