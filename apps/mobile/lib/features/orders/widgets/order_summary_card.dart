import 'package:flutter/material.dart';

import '../../../core/models/order_model.dart';
import '../../../shared/theme/app_theme.dart';
import '../../../shared/widgets/app_brand_icon.dart';
import '../../../shared/widgets/status_badge.dart';

class OrderSummaryCard extends StatelessWidget {
  final Order order;
  final VoidCallback? onTap;
  final String? actionLabel;
  final VoidCallback? onActionTap;
  final bool showChevron;

  const OrderSummaryCard({
    super.key,
    required this.order,
    this.onTap,
    this.actionLabel,
    this.onActionTap,
    this.showChevron = true,
  });

  @override
  Widget build(BuildContext context) {
    final cluster = order.clusterMember?.cluster;
    final hasAction =
        (actionLabel ?? '').trim().isNotEmpty && onActionTap != null;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.inputBackground,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: AppColors.primary.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const AppBrandIcon(
                    color: AppColors.primary,
                    size: 20,
                    padding: EdgeInsets.all(4),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(order.product, style: AppTextStyles.label),
                      Text(
                        '#${order.id.substring(0, 8).toUpperCase()}',
                        style: AppTextStyles.caption,
                      ),
                    ],
                  ),
                ),
                StatusBadge.fromOrderStatus(order.status),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              '${order.quantity.toStringAsFixed(0)} ${order.unit}',
              style:
                  AppTextStyles.body.copyWith(color: AppColors.textSecondary),
            ),
            const SizedBox(height: 4),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Expanded(
                  child: cluster != null
                      ? Text(
                          '${cluster.membersCount} farmers · ${cluster.district ?? ''}',
                          style: AppTextStyles.caption,
                        )
                      : Text('Looking for cluster…',
                          style: AppTextStyles.caption),
                ),
                if (hasAction)
                  TextButton(
                    onPressed: onActionTap,
                    style: TextButton.styleFrom(
                      foregroundColor: AppColors.primary,
                      textStyle: AppTextStyles.bodySmall.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      minimumSize: const Size(0, 30),
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    child: Text(actionLabel!),
                  )
                else if (showChevron)
                  const Icon(
                    Icons.arrow_forward_ios,
                    size: 12,
                    color: AppColors.textMuted,
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
