import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../../core/models/order_model.dart';

class StatusBadge extends StatelessWidget {
  final String label;
  final Color color;
  final Color bgColor;

  const StatusBadge({
    super.key,
    required this.label,
    required this.color,
    required this.bgColor,
  });

  factory StatusBadge.fromOrderStatus(OrderStatus status) {
    switch (status) {
      case OrderStatus.pending:
        return StatusBadge(
          label: status.displayLabel,
          color: AppColors.warning,
          bgColor: AppColors.warningLight,
        );
      case OrderStatus.clustered:
        return StatusBadge(
          label: status.displayLabel,
          color: AppColors.info,
          bgColor: AppColors.infoLight,
        );
      case OrderStatus.paymentPending:
        return StatusBadge(
          label: status.displayLabel,
          color: AppColors.warning,
          bgColor: AppColors.warningLight,
        );
      case OrderStatus.paid:
        return StatusBadge(
          label: status.displayLabel,
          color: AppColors.primary,
          bgColor: const Color(0xFFDCF2DC),
        );
      case OrderStatus.processing:
        return StatusBadge(
          label: status.displayLabel,
          color: const Color(0xFF92400E),
          bgColor: const Color(0xFFFEF3C7),
        );
      case OrderStatus.outForDelivery:
        return StatusBadge(
          label: 'Dispatched',
          color: const Color(0xFF1D4ED8),
          bgColor: const Color(0xFFDBEAFE),
        );
      case OrderStatus.dispatched:
        return StatusBadge(
          label: 'Dispatched',
          color: AppColors.info,
          bgColor: AppColors.infoLight,
        );
      case OrderStatus.delivered:
        return StatusBadge(
          label: status.displayLabel,
          color: AppColors.success,
          bgColor: AppColors.successLight,
        );
      case OrderStatus.rejected:
      case OrderStatus.failed:
      case OrderStatus.cancelled:
        return StatusBadge(
          label: status.displayLabel,
          color: AppColors.error,
          bgColor: AppColors.errorLight,
        );
    }
  }

  factory StatusBadge.fromClusterStatus(ClusterStatus status) {
    switch (status) {
      case ClusterStatus.forming:
        return StatusBadge(
          label: status.displayLabel,
          color: AppColors.warning,
          bgColor: AppColors.warningLight,
        );
      case ClusterStatus.voting:
        return StatusBadge(
          label: status.displayLabel,
          color: AppColors.info,
          bgColor: AppColors.infoLight,
        );
      case ClusterStatus.payment:
        return StatusBadge(
          label: 'Order Received',
          color: AppColors.primary,
          bgColor: const Color(0xFFDCF2DC),
        );
      case ClusterStatus.processing:
        return StatusBadge(
          label: status.displayLabel,
          color: const Color(0xFF92400E),
          bgColor: const Color(0xFFFEF3C7),
        );
      case ClusterStatus.outForDelivery:
        return StatusBadge(
          label: 'Dispatched',
          color: const Color(0xFF1D4ED8),
          bgColor: const Color(0xFFDBEAFE),
        );
      case ClusterStatus.dispatched:
        return StatusBadge(
          label: 'Dispatched',
          color: AppColors.info,
          bgColor: AppColors.infoLight,
        );
      case ClusterStatus.completed:
        return StatusBadge(
          label: 'Completed',
          color: AppColors.success,
          bgColor: AppColors.successLight,
        );
      case ClusterStatus.failed:
        return StatusBadge(
          label: 'Failed',
          color: AppColors.error,
          bgColor: AppColors.errorLight,
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: color,
        ),
      ),
    );
  }
}
